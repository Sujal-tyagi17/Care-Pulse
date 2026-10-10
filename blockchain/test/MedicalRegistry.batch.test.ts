import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import type { Signer } from "ethers";
import type { MedicalRegistry } from "../typechain-types";

const PRESCRIPTION = 0;
const CERTIFICATE = 2;
const LEAF_ENCODING = ["bytes32", "uint8", "address"];

enum Check {
  VALID,
  UNKNOWN_BATCH,
  NOT_IN_BATCH,
  SIGNER_NOT_REGISTERED,
  DOCTOR_SUSPENDED_AT_ANCHOR_TIME,
  SIGNATURE_EXPIRED_BEFORE_ANCHOR,
}

const hashOf = (s: string) => ethers.sha256(ethers.toUtf8Bytes(s));

async function domain(registry: MedicalRegistry) {
  const { chainId } = await ethers.provider.getNetwork();
  return { name: "CarePulse MedicalRegistry", version: "1", chainId, verifyingContract: await registry.getAddress() };
}

async function signAnchor(registry: MedicalRegistry, signer: Signer, recordHash: string, recordType: number, deadline: bigint) {
  return signer.signTypedData(
    await domain(registry),
    { AnchorRecord: [{ name: "recordHash", type: "bytes32" }, { name: "recordType", type: "uint8" }, { name: "deadline", type: "uint256" }] },
    { recordHash, recordType, deadline }
  );
}

async function signRevoke(registry: MedicalRegistry, signer: Signer, recordHash: string, deadline: bigint) {
  return signer.signTypedData(
    await domain(registry),
    { RevokeRecord: [{ name: "recordHash", type: "bytes32" }, { name: "deadline", type: "uint256" }] },
    { recordHash, deadline }
  );
}

describe("MedicalRegistry — Merkle batches & audit checkpoints", () => {
  async function fixture() {
    const [hospital, doctorA, doctorB, outsider] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("MedicalRegistry")).deploy(hospital.address);
    await registry.registerDoctor(doctorA.address, "Dr. A", "Cardiology", ethers.ZeroHash);
    await registry.registerDoctor(doctorB.address, "Dr. B", "General Medicine", ethers.ZeroHash);
    const deadline = BigInt(await time.latest()) + 7n * 86400n;

    // 5 records from two doctors, mixed types
    const records = await Promise.all(
      [
        [doctorA, PRESCRIPTION],
        [doctorB, PRESCRIPTION],
        [doctorA, CERTIFICATE],
        [doctorB, CERTIFICATE],
        [doctorA, PRESCRIPTION],
      ].map(async ([doc, type], i) => {
        const recordHash = hashOf(`record-${i}`);
        const d = doc as Signer;
        return {
          recordHash,
          type: type as number,
          doctor: await d.getAddress(),
          signer: d,
          signature: await signAnchor(registry, d, recordHash, type as number, deadline),
        };
      })
    );
    const tree = StandardMerkleTree.of(
      records.map((r) => [r.recordHash, r.type, r.doctor]),
      LEAF_ENCODING
    );
    const auditHead = hashOf("audit-entry-42");
    return { registry, hospital, doctorA, doctorB, outsider, deadline, records, tree, auditHead };
  }

  async function anchoredFixture() {
    const f = await fixture();
    await f.registry.anchorBatch(f.tree.root, f.records.length, f.auditHead, 42);
    return f;
  }

  const proofFor = (tree: StandardMerkleTree<any[]>, i: number) => tree.getProof(i);

  it("leaf encoding matches OpenZeppelin StandardMerkleTree", async () => {
    const { registry, records, tree } = await loadFixture(fixture);
    for (const [i, r] of records.entries()) {
      expect(await registry.batchLeaf(r.recordHash, r.type, r.doctor)).to.equal(tree.leafHash([r.recordHash, r.type, r.doctor]));
      expect(i).to.be.lessThan(records.length);
    }
  });

  it("anchors a batch with an audit checkpoint in one transaction", async () => {
    const { registry, tree, records, auditHead } = await loadFixture(fixture);
    await expect(registry.anchorBatch(tree.root, records.length, auditHead, 42))
      .to.emit(registry, "BatchAnchored")
      .withArgs(0, tree.root, records.length, auditHead, 42, (v: bigint) => v > 0n);
    const b = await registry.getBatch(0);
    expect(b.root).to.equal(tree.root);
    expect(b.auditHead).to.equal(auditHead);
    expect(b.auditSeq).to.equal(42n);
    expect(await registry.batchCount()).to.equal(1n);
    expect(await registry.totalBatchedRecords()).to.equal(5n);
  });

  it("verifies every record in the batch", async () => {
    const { registry, records, tree, deadline } = await loadFixture(anchoredFixture);
    for (const [i, r] of records.entries()) {
      const v = await registry.verifyBatchedRecord(r.recordHash, r.type, deadline, r.signature, 0, proofFor(tree, i));
      expect(v.check).to.equal(Check.VALID);
      expect(v.doctor).to.equal(r.doctor);
      expect(v.revoked).to.equal(false);
    }
    const v = await registry.verifyBatchedRecord(records[0].recordHash, PRESCRIPTION, deadline, records[0].signature, 0, proofFor(tree, 0));
    expect(v.doctorName).to.equal("Dr. A");
  });

  it("detects a tampered record, wrong type, wrong proof, unknown batch and garbage signature", async () => {
    const { registry, records, tree, deadline } = await loadFixture(anchoredFixture);
    const r = records[0];
    const p = proofFor(tree, 0);
    const forged = hashOf("altered dosage");
    // Content changed: the doctor's signature now recovers someone else and the leaf isn't in the tree
    expect((await registry.verifyBatchedRecord(forged, r.type, deadline, r.signature, 0, p)).check).to.equal(Check.NOT_IN_BATCH);
    expect((await registry.verifyBatchedRecord(r.recordHash, CERTIFICATE, deadline, r.signature, 0, p)).check).to.equal(Check.NOT_IN_BATCH);
    expect((await registry.verifyBatchedRecord(r.recordHash, r.type, deadline, r.signature, 0, proofFor(tree, 1))).check).to.equal(Check.NOT_IN_BATCH);
    expect((await registry.verifyBatchedRecord(r.recordHash, r.type, deadline, r.signature, 7, p)).check).to.equal(Check.UNKNOWN_BATCH);
    expect((await registry.verifyBatchedRecord(r.recordHash, r.type, deadline, "0x1234", 0, p)).check).to.equal(Check.NOT_IN_BATCH);
  });

  it("rejects a record signed by someone who is not a registered doctor, even if the hospital batches it", async () => {
    const { registry, outsider, deadline } = await loadFixture(fixture);
    const h = hashOf("fake prescription");
    const sig = await signAnchor(registry, outsider, h, PRESCRIPTION, deadline);
    const tree = StandardMerkleTree.of([[h, PRESCRIPTION, outsider.address], [hashOf("pad"), PRESCRIPTION, outsider.address]], LEAF_ENCODING);
    await registry.anchorBatch(tree.root, 2, ethers.ZeroHash, 0);
    const v = await registry.verifyBatchedRecord(h, PRESCRIPTION, deadline, sig, 0, tree.getProof(0));
    expect(v.check).to.equal(Check.SIGNER_NOT_REGISTERED);
  });

  it("the hospital cannot attribute a record to a doctor who never signed it", async () => {
    const { registry, doctorA, hospital, deadline } = await loadFixture(fixture);
    const h = hashOf("forged by insider");
    // Hospital signs with its own key but puts doctor A in the leaf
    const sig = await signAnchor(registry, hospital, h, PRESCRIPTION, deadline);
    const tree = StandardMerkleTree.of([[h, PRESCRIPTION, doctorA.address], [hashOf("pad"), PRESCRIPTION, doctorA.address]], LEAF_ENCODING);
    await registry.anchorBatch(tree.root, 2, ethers.ZeroHash, 0);
    expect((await registry.verifyBatchedRecord(h, PRESCRIPTION, deadline, sig, 0, tree.getProof(0))).check).to.equal(Check.NOT_IN_BATCH);
  });

  it("records from a doctor suspended before the batch are rejected; earlier batches stay valid", async () => {
    const { registry, records, tree, deadline, doctorA, auditHead } = await loadFixture(anchoredFixture);
    await time.increase(60);
    await registry.setDoctorActive(doctorA.address, false);
    // Earlier batch: still valid
    const before = await registry.verifyBatchedRecord(records[0].recordHash, PRESCRIPTION, deadline, records[0].signature, 0, proofFor(tree, 0));
    expect(before.check).to.equal(Check.VALID);
    expect(before.doctorCurrentlyActive).to.equal(false);
    // Same records batched again after suspension: rejected for doctor A
    await time.increase(60);
    await registry.anchorBatch(tree.root, records.length, auditHead, 43);
    const after = await registry.verifyBatchedRecord(records[0].recordHash, PRESCRIPTION, deadline, records[0].signature, 1, proofFor(tree, 0));
    expect(after.check).to.equal(Check.DOCTOR_SUSPENDED_AT_ANCHOR_TIME);
    // Reinstated doctor is fine again
    await registry.setDoctorActive(doctorA.address, true);
    expect(
      (await registry.verifyBatchedRecord(records[0].recordHash, PRESCRIPTION, deadline, records[0].signature, 1, proofFor(tree, 0))).check
    ).to.equal(Check.VALID);
  });

  it("flags signatures whose deadline passed before anchoring", async () => {
    const { registry, doctorA } = await loadFixture(fixture);
    const shortDeadline = BigInt(await time.latest()) + 10n;
    const h = hashOf("late");
    const sig = await signAnchor(registry, doctorA, h, PRESCRIPTION, shortDeadline);
    const tree = StandardMerkleTree.of([[h, PRESCRIPTION, doctorA.address], [hashOf("pad"), PRESCRIPTION, doctorA.address]], LEAF_ENCODING);
    await time.increase(100);
    await registry.anchorBatch(tree.root, 2, ethers.ZeroHash, 0);
    expect((await registry.verifyBatchedRecord(h, PRESCRIPTION, shortDeadline, sig, 0, tree.getProof(0))).check).to.equal(
      Check.SIGNATURE_EXPIRED_BEFORE_ANCHOR
    );
  });

  it("the issuing doctor can revoke a batched record; others cannot", async () => {
    const { registry, records, tree, deadline, doctorB } = await loadFixture(anchoredFixture);
    const r = records[0]; // doctor A
    const p = proofFor(tree, 0);
    await expect(
      registry.revokeBatchedRecord(r.recordHash, r.type, r.doctor, 0, p, deadline, await signRevoke(registry, doctorB, r.recordHash, deadline))
    ).to.be.revertedWithCustomError(registry, "NotRecordIssuer");
    await expect(
      registry.revokeBatchedRecord(r.recordHash, r.type, r.doctor, 0, proofFor(tree, 1), deadline, await signRevoke(registry, r.signer, r.recordHash, deadline))
    ).to.be.revertedWithCustomError(registry, "InvalidProof");

    await expect(
      registry.revokeBatchedRecord(r.recordHash, r.type, r.doctor, 0, p, deadline, await signRevoke(registry, r.signer, r.recordHash, deadline))
    ).to.emit(registry, "RecordRevoked");
    const v = await registry.verifyBatchedRecord(r.recordHash, r.type, deadline, r.signature, 0, p);
    expect(v.check).to.equal(Check.VALID);
    expect(v.revoked).to.equal(true);
    expect(await registry.batchedRevokedAt(r.recordHash)).to.be.greaterThan(0n);
    await expect(
      registry.revokeBatchedRecord(r.recordHash, r.type, r.doctor, 0, p, deadline, await signRevoke(registry, r.signer, r.recordHash, deadline))
    ).to.be.revertedWithCustomError(registry, "RecordAlreadyRevoked");
  });

  it("hospital can revoke a batched record directly", async () => {
    const { registry, records, tree, deadline } = await loadFixture(anchoredFixture);
    await registry.adminRevokeRecord(records[2].recordHash);
    expect((await registry.verifyBatchedRecord(records[2].recordHash, CERTIFICATE, deadline, records[2].signature, 0, proofFor(tree, 2))).revoked).to.equal(true);
    await expect(registry.adminRevokeRecord(records[2].recordHash)).to.be.revertedWithCustomError(registry, "RecordAlreadyRevoked");
  });

  it("supports audit-only checkpoints and enforces a monotonic audit sequence", async () => {
    const { registry, auditHead } = await loadFixture(fixture);
    await registry.anchorBatch(ethers.ZeroHash, 0, auditHead, 10);
    await registry.anchorBatch(ethers.ZeroHash, 0, hashOf("same-seq-new-head?"), 10);
    await expect(registry.anchorBatch(ethers.ZeroHash, 0, auditHead, 9))
      .to.be.revertedWithCustomError(registry, "AuditSequenceWentBackwards")
      .withArgs(10, 9);
    await expect(registry.anchorBatch(ethers.ZeroHash, 0, ethers.ZeroHash, 11)).to.be.revertedWithCustomError(registry, "InvalidBatch");
    await expect(registry.anchorBatch(ethers.ZeroHash, 3, auditHead, 11)).to.be.revertedWithCustomError(registry, "InvalidBatch");
    await expect(registry.anchorBatch(hashOf("root"), 0, auditHead, 11)).to.be.revertedWithCustomError(registry, "InvalidBatch");
  });

  it("only the hospital can anchor batches", async () => {
    const { registry, tree, outsider } = await loadFixture(fixture);
    await expect(registry.connect(outsider).anchorBatch(tree.root, 5, ethers.ZeroHash, 0)).to.be.revertedWithCustomError(
      registry,
      "OwnableUnauthorizedAccount"
    );
  });

  it("a batch of 50 costs about the same as anchoring 1 record singly", async () => {
    const { registry, doctorA, deadline } = await loadFixture(fixture);
    const h = hashOf("single");
    const singleTx = await registry.anchorRecord(h, PRESCRIPTION, deadline, await signAnchor(registry, doctorA, h, PRESCRIPTION, deadline));
    const singleGas = (await singleTx.wait())!.gasUsed;

    const leaves = Array.from({ length: 50 }, (_, i) => [hashOf(`bulk-${i}`), PRESCRIPTION, doctorA.address]);
    const tree = StandardMerkleTree.of(leaves, LEAF_ENCODING);
    const batchGas = (await (await registry.anchorBatch(tree.root, 50, hashOf("audit"), 1)).wait())!.gasUsed;

    console.log(`      gas: single record ${singleGas}, batch of 50 ${batchGas} (${(Number(singleGas * 50n) / Number(batchGas)).toFixed(0)}x cheaper per record)`);
    expect(batchGas).to.be.lessThan(singleGas * 2n);
  });
});
