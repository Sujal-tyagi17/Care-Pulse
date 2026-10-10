/**
 * Integration test: server blockchain core <-> real MedicalRegistry contract.
 *
 * Requires a local chain:   cd blockchain && npx hardhat node
 * and compiled artifacts:   cd blockchain && npx hardhat compile
 * Run:                      npm run test:blockchain   (from server/)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContractFactory, JsonRpcProvider, Wallet, sha256, toUtf8Bytes } from 'ethers';
import {
  RegistryClient,
  canonicalize,
  hashRecord,
  newSalt,
  signAnchor,
  signRevoke,
  sha256Hex,
  deriveDoctorWallet,
  buildBatchTree,
  RecordTypeName
} from '../src/blockchain/core.js';
import { GENESIS_HASH, computeEntryHash, findChainBreak, AuditEntryFields } from '../src/blockchain/audit-chain.js';
import { canonicalize as clientCanonicalize, sha256Hex as clientSha256 } from '../../client/src/blockchain/canonical.js';

const RPC = process.env.BLOCKCHAIN_TEST_RPC || 'http://127.0.0.1:8545';
// Hardhat's well-known default account #0 (local development only).
const OWNER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const here = path.dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(
  fs.readFileSync(path.resolve(here, '../../blockchain/artifacts/contracts/MedicalRegistry.sol/MedicalRegistry.json'), 'utf8')
);

let passed = 0;
async function step(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✔ ${name}`);
}

async function expectRevert(promise: Promise<unknown>, errorName: string) {
  await assert.rejects(promise, (err: Error) => {
    assert.match(err.message, new RegExp(errorName), `expected ${errorName}, got: ${err.message}`);
    return true;
  });
}

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const { chainId } = await provider.getNetwork();
  const owner = new Wallet(OWNER_KEY, provider);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, owner);
  const deployed = await factory.deploy(owner.address);
  await deployed.waitForDeployment();
  const contractAddress = await deployed.getAddress();
  console.log(`MedicalRegistry deployed at ${contractAddress} (chain ${chainId})\n`);

  const chain = new RegistryClient({
    rpcUrl: RPC,
    contractAddress,
    chainId: Number(chainId),
    relayerPrivateKey: OWNER_KEY,
    doctorKeySecret: 'integration-test-doctor-secret'
  });

  const doctorId = 'doctor-user-uuid-1';
  const doctor = chain.doctorWallet(doctorId);

  await step('canonical JSON is key-order independent and matches the browser implementation', async () => {
    const a = { b: 1, a: { d: [3, { y: 'x', x: 'y' }], c: null }, s: 'naïve ✓ "quoted"' };
    const b = { s: 'naïve ✓ "quoted"', a: { c: null, d: [3, { x: 'y', y: 'x' }] }, b: 1 };
    assert.equal(canonicalize(a), canonicalize(b));
    assert.equal(canonicalize(a), clientCanonicalize(a));
    assert.equal(sha256Hex(canonicalize(a)), sha256(toUtf8Bytes(canonicalize(a))));
    assert.equal(sha256Hex(canonicalize(a)), await clientSha256(canonicalize(a)));
  });

  await step('doctor wallets are deterministic per doctor and distinct across doctors', () => {
    assert.equal(deriveDoctorWallet('integration-test-doctor-secret', doctorId).address, doctor.address);
    assert.notEqual(chain.doctorWallet('doctor-user-uuid-2').address, doctor.address);
    assert.throws(() => deriveDoctorWallet('short', doctorId));
  });

  const payload = {
    schema: 'carepulse.prescription.v1',
    recordType: 'PRESCRIPTION',
    salt: newSalt(),
    patient: { name: 'Test Patient' },
    medications: [{ medicineName: 'Amoxicillin', dosage: '500mg', frequency: 'Twice daily', durationDays: 5, instructions: 'After meals' }]
  };
  const { canonical, recordHash } = hashRecord(payload);
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  await step('unregistered doctor cannot anchor (decoded custom error)', async () => {
    const sig = await signAnchor(doctor, chain.domain, recordHash, 'PRESCRIPTION', deadline);
    await expectRevert(chain.anchor(recordHash, 'PRESCRIPTION', deadline, sig), 'DoctorNotRegistered');
  });

  await step('hospital registers the doctor on-chain', async () => {
    const { txHash } = await chain.registerDoctor(doctor.address, 'Dr. Test', 'Cardiology', sha256Hex('credential'));
    assert.match(txHash, /^0x[0-9a-f]{64}$/);
    const d = await chain.getDoctor(doctor.address);
    assert.equal(d.registered, true);
    assert.equal(d.name, 'Dr. Test');
  });

  await step('signed prescription is anchored and verifies', async () => {
    const sig = await signAnchor(doctor, chain.domain, recordHash, 'PRESCRIPTION', deadline);
    const { blockNumber } = await chain.anchor(recordHash, 'PRESCRIPTION', deadline, sig);
    assert.ok(blockNumber > 0);
    const v = await chain.verify(recordHash);
    assert.equal(v.exists, true);
    assert.equal(v.revoked, false);
    assert.equal(v.doctor, doctor.address);
    assert.equal(v.doctorName, 'Dr. Test');
    assert.equal(v.recordType, 'PRESCRIPTION');
  });

  await step('a single changed character produces an unknown fingerprint (tamper detection)', async () => {
    const tampered = JSON.parse(canonical);
    tampered.medications[0].dosage = '5000mg';
    const v = await chain.verify(hashRecord(tampered).recordHash);
    assert.equal(v.exists, false);
  });

  await step('re-anchoring the same record is rejected', async () => {
    const sig = await signAnchor(doctor, chain.domain, recordHash, 'PRESCRIPTION', deadline);
    await expectRevert(chain.anchor(recordHash, 'PRESCRIPTION', deadline, sig), 'RecordAlreadyAnchored');
  });

  await step('relayer nonce stays consistent across concurrent sends', async () => {
    const hashes = [1, 2, 3, 4].map((i) => hashRecord({ i, salt: newSalt() }).recordHash);
    const results = await Promise.all(
      hashes.map(async (h) => chain.anchor(h, 'MEDICAL_CERTIFICATE', deadline, await signAnchor(doctor, chain.domain, h, 'MEDICAL_CERTIFICATE', deadline)))
    );
    assert.equal(new Set(results.map((r) => r.txHash)).size, 4);
    for (const h of hashes) assert.equal((await chain.verify(h)).recordType, 'MEDICAL_CERTIFICATE');
  });

  await step('doctor-signed revocation marks the record revoked', async () => {
    const rsig = await signRevoke(doctor, chain.domain, recordHash, deadline);
    await chain.revoke(recordHash, deadline, rsig);
    assert.equal((await chain.verify(recordHash)).revoked, true);
  });

  await step('suspended doctor can no longer anchor', async () => {
    await chain.setDoctorActive(doctor.address, false);
    const h = hashRecord({ after: 'suspension', salt: newSalt() }).recordHash;
    await expectRevert(chain.anchor(h, 'PRESCRIPTION', deadline, await signAnchor(doctor, chain.domain, h, 'PRESCRIPTION', deadline)), 'DoctorNotActive');
    await chain.setDoctorActive(doctor.address, true);
  });

  await step('status() reports relayer, ownership and counts', async () => {
    const s = await chain.status();
    assert.equal(s.relayerIsOwner, true);
    assert.equal(s.registeredDoctors, 1);
    assert.equal(s.totalRecords, 5);
  });

  // ---------------- Merkle batches ----------------
  const doctor2 = chain.doctorWallet('doctor-user-uuid-2');
  await chain.registerDoctor(doctor2.address, 'Dr. Second', 'General Medicine', sha256Hex('cred-2'));
  const batchRecords = await Promise.all(
    Array.from({ length: 7 }, async (_, i) => {
      const signer = i % 2 ? doctor2 : doctor;
      const recordType: RecordTypeName = i % 3 === 0 ? 'MEDICAL_CERTIFICATE' : 'PRESCRIPTION';
      const { recordHash } = hashRecord({ batch: i, salt: newSalt() });
      return { recordHash, recordType, doctor: signer.address, signature: await signAnchor(signer, chain.domain, recordHash, recordType, deadline) };
    })
  );
  const tree = buildBatchTree(batchRecords);
  let batchId = -1;

  await step('server-built Merkle tree anchors in one transaction with an audit checkpoint', async () => {
    const res = await chain.anchorBatch(tree.root, batchRecords.length, sha256Hex('audit-head'), 12);
    batchId = res.batchId;
    assert.equal(batchId, 0);
    const b = await chain.getBatch(batchId);
    assert.equal(b.root, tree.root);
    assert.equal(b.leafCount, 7);
    assert.equal(b.auditSeq, 12);
    assert.equal(await chain.batchCount(), 1);
  });

  await step('every batched record verifies with its proof and doctor signature', async () => {
    for (const [i, r] of batchRecords.entries()) {
      const v = await chain.verifyBatched(r.recordHash, r.recordType, deadline, r.signature, batchId, tree.proofs[i]);
      assert.equal(v.batchCheck, 'VALID', `record ${i}`);
      assert.equal(v.exists, true);
      assert.equal(v.doctor, r.doctor);
      assert.equal(v.mode, 'BATCH');
    }
  });

  await step('altered record, swapped proof or wrong type fail batched verification', async () => {
    const r = batchRecords[1];
    const altered = await chain.verifyBatched(hashRecord({ forged: true }).recordHash, r.recordType, deadline, r.signature, batchId, tree.proofs[1]);
    assert.equal(altered.batchCheck, 'NOT_IN_BATCH');
    assert.equal((await chain.verifyBatched(r.recordHash, r.recordType, deadline, r.signature, batchId, tree.proofs[2])).batchCheck, 'NOT_IN_BATCH');
    assert.equal((await chain.verifyBatched(r.recordHash, 'MEDICAL_CERTIFICATE', deadline, r.signature, batchId, tree.proofs[1])).batchCheck, 'NOT_IN_BATCH');
    assert.equal((await chain.verifyBatched(r.recordHash, r.recordType, deadline, r.signature, 99, tree.proofs[1])).batchCheck, 'UNKNOWN_BATCH');
  });

  await step('a one-record batch works (empty proof)', async () => {
    const { recordHash } = hashRecord({ solo: true, salt: newSalt() });
    const sig = await signAnchor(doctor, chain.domain, recordHash, 'PRESCRIPTION', deadline);
    const t = buildBatchTree([{ recordHash, recordType: 'PRESCRIPTION', doctor: doctor.address }]);
    assert.deepEqual(t.proofs[0], []);
    const { batchId: id } = await chain.anchorBatch(t.root, 1, sha256Hex('audit-head'), 12);
    assert.equal((await chain.verifyBatched(recordHash, 'PRESCRIPTION', deadline, sig, id, t.proofs[0])).batchCheck, 'VALID');
  });

  await step('doctor-signed revocation of a batched record', async () => {
    const r = batchRecords[3];
    const signer = chain.doctorWallet('doctor-user-uuid-2'); // record 3 is odd → doctor2
    const rsig = await signRevoke(signer, chain.domain, r.recordHash, deadline);
    await chain.revokeBatched(r.recordHash, r.recordType, r.doctor, batchId, tree.proofs[3], deadline, rsig);
    const v = await chain.verifyBatched(r.recordHash, r.recordType, deadline, r.signature, batchId, tree.proofs[3]);
    assert.equal(v.revoked, true);
    await expectRevert(
      chain.revokeBatched(r.recordHash, r.recordType, r.doctor, batchId, tree.proofs[3], deadline, rsig),
      'RecordAlreadyRevoked'
    );
  });

  await step('audit sequence cannot go backwards on-chain', async () => {
    await expectRevert(chain.anchorBatch('0x' + '0'.repeat(64), 0, sha256Hex('old-head'), 5), 'AuditSequenceWentBackwards');
  });

  // ---------------- Audit hash chain ----------------
  const entries: Array<AuditEntryFields & { entryHash: string }> = [];
  for (let seq = 1; seq <= 6; seq++) {
    const fields: AuditEntryFields = {
      seq,
      prevHash: entries.length ? entries[entries.length - 1].entryHash : GENESIS_HASH,
      eventType: seq % 2 ? 'APPOINTMENT_BOOKED' : 'APPOINTMENT_CANCELLED',
      entityType: 'APPOINTMENT',
      entityId: `apt-${seq}`,
      actorId: 'user-1',
      actorRole: 'PATIENT',
      data: canonicalize({ n: seq }),
      occurredAt: new Date(1_700_000_000_000 + seq * 1000).toISOString()
    };
    entries.push({ ...fields, entryHash: computeEntryHash(fields) });
  }

  await step('intact audit chain verifies, also when checked in chunks', () => {
    assert.equal(findChainBreak(entries).break, null);
    const first = findChainBreak(entries.slice(0, 3));
    assert.equal(findChainBreak(entries.slice(3), first.lastHash, first.nextSeq).break, null);
  });

  await step('editing, deleting or re-hashing audit history is detected', () => {
    const edited = entries.map((e) => ({ ...e }));
    edited[2].eventType = 'APPOINTMENT_CANCELLED';
    assert.deepEqual(findChainBreak(edited).break, { seq: 3, reason: 'HASH_MISMATCH' });

    const deleted = entries.filter((e) => e.seq !== 4);
    assert.deepEqual(findChainBreak(deleted).break, { seq: 4, reason: 'SEQUENCE_GAP' });

    // Attacker rewrites entry 2 AND recomputes every later hash: the chain looks valid…
    const rewritten = entries.map((e) => ({ ...e }));
    rewritten[1].data = canonicalize({ n: 999 });
    for (let i = 1; i < rewritten.length; i++) {
      rewritten[i].prevHash = rewritten[i - 1].entryHash;
      rewritten[i].entryHash = computeEntryHash(rewritten[i]);
    }
    assert.equal(findChainBreak(rewritten).break, null);
    // …but no longer matches the head anchored on-chain, which is how the server catches it.
    assert.notEqual(rewritten[5].entryHash, entries[5].entryHash);
  });

  await step('audit checkpoint read back from the chain matches the local head', async () => {
    const head = entries[5];
    const { batchId: id } = await chain.anchorBatch('0x' + '0'.repeat(64), 0, head.entryHash, 12 + head.seq);
    const onChain = await chain.getBatch(id);
    assert.equal(onChain.auditHead, head.entryHash);
    assert.equal(onChain.leafCount, 0);
  });

  console.log(`\n${passed} passing`);
}

main().catch((err) => {
  console.error('\n✘ Integration test failed:', err);
  process.exit(1);
});
