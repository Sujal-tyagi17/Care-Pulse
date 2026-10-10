import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { Signer } from "ethers";
import type { MedicalRegistry } from "../typechain-types";

const PRESCRIPTION = 0;
const CERTIFICATE = 2;

async function signAnchor(
  registry: MedicalRegistry,
  signer: Signer,
  recordHash: string,
  recordType: number,
  deadline: bigint
) {
  const { chainId } = await ethers.provider.getNetwork();
  return signer.signTypedData(
    {
      name: "CarePulse MedicalRegistry",
      version: "1",
      chainId,
      verifyingContract: await registry.getAddress(),
    },
    {
      AnchorRecord: [
        { name: "recordHash", type: "bytes32" },
        { name: "recordType", type: "uint8" },
        { name: "deadline", type: "uint256" },
      ],
    },
    { recordHash, recordType, deadline }
  );
}

async function signRevoke(registry: MedicalRegistry, signer: Signer, recordHash: string, deadline: bigint) {
  const { chainId } = await ethers.provider.getNetwork();
  return signer.signTypedData(
    { name: "CarePulse MedicalRegistry", version: "1", chainId, verifyingContract: await registry.getAddress() },
    {
      RevokeRecord: [
        { name: "recordHash", type: "bytes32" },
        { name: "deadline", type: "uint256" },
      ],
    },
    { recordHash, deadline }
  );
}

const hashOf = (s: string) => ethers.sha256(ethers.toUtf8Bytes(s));

describe("MedicalRegistry", () => {
  async function deployFixture() {
    const [hospital, doctor, otherDoctor, relayer, attacker] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("MedicalRegistry");
    const registry = await Registry.deploy(hospital.address);

    await registry.registerDoctor(doctor.address, "Dr. Ananya Rao", "Cardiology", hashOf("MCI-12345"));

    const deadline = BigInt(await time.latest()) + 3600n;
    const recordHash = hashOf("salt|prescription: Amoxicillin 500mg");
    return { registry, hospital, doctor, otherDoctor, relayer, attacker, deadline, recordHash };
  }

  describe("Doctor registry", () => {
    it("registers a doctor and exposes their details", async () => {
      const { registry, doctor } = await loadFixture(deployFixture);
      const d = await registry.getDoctor(doctor.address);
      expect(d.registered).to.equal(true);
      expect(d.active).to.equal(true);
      expect(d.name).to.equal("Dr. Ananya Rao");
      expect(d.specialization).to.equal("Cardiology");
      expect(await registry.doctorCount()).to.equal(1n);
      expect(await registry.doctorAt(0)).to.equal(doctor.address);
    });

    it("emits DoctorRegistered", async () => {
      const { registry, otherDoctor } = await loadFixture(deployFixture);
      await expect(registry.registerDoctor(otherDoctor.address, "Dr. B", "ENT", ethers.ZeroHash))
        .to.emit(registry, "DoctorRegistered")
        .withArgs(otherDoctor.address, "Dr. B", "ENT", ethers.ZeroHash);
    });

    it("only the hospital (owner) can register or suspend doctors", async () => {
      const { registry, attacker, doctor } = await loadFixture(deployFixture);
      await expect(
        registry.connect(attacker).registerDoctor(attacker.address, "Fake", "None", ethers.ZeroHash)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      await expect(registry.connect(attacker).setDoctorActive(doctor.address, false)).to.be.revertedWithCustomError(
        registry,
        "OwnableUnauthorizedAccount"
      );
    });

    it("rejects duplicate and zero-address registrations", async () => {
      const { registry, doctor } = await loadFixture(deployFixture);
      await expect(registry.registerDoctor(doctor.address, "x", "y", ethers.ZeroHash)).to.be.revertedWithCustomError(
        registry,
        "DoctorAlreadyRegistered"
      );
      await expect(registry.registerDoctor(ethers.ZeroAddress, "x", "y", ethers.ZeroHash)).to.be.revertedWithCustomError(
        registry,
        "ZeroAddress"
      );
    });
  });

  describe("Anchoring", () => {
    it("anchors a record signed by a registered doctor, submitted by a relayer", async () => {
      const { registry, doctor, relayer, deadline, recordHash } = await loadFixture(deployFixture);
      const sig = await signAnchor(registry, doctor, recordHash, PRESCRIPTION, deadline);

      await expect(registry.connect(relayer).anchorRecord(recordHash, PRESCRIPTION, deadline, sig))
        .to.emit(registry, "RecordAnchored")
        .withArgs(recordHash, doctor.address, PRESCRIPTION, (v: bigint) => v > 0n);

      const v = await registry.verifyRecord(recordHash);
      expect(v.exists).to.equal(true);
      expect(v.revoked).to.equal(false);
      expect(v.doctor).to.equal(doctor.address);
      expect(v.doctorName).to.equal("Dr. Ananya Rao");
      expect(v.doctorCurrentlyActive).to.equal(true);
      expect(v.recordType).to.equal(BigInt(PRESCRIPTION));
      expect(await registry.totalRecords()).to.equal(1n);
    });

    it("supports other record types", async () => {
      const { registry, doctor, deadline } = await loadFixture(deployFixture);
      const h = hashOf("certificate");
      const sig = await signAnchor(registry, doctor, h, CERTIFICATE, deadline);
      await registry.anchorRecord(h, CERTIFICATE, deadline, sig);
      expect((await registry.verifyRecord(h)).recordType).to.equal(BigInt(CERTIFICATE));
    });

    it("rejects signatures from unregistered wallets (forged prescriptions)", async () => {
      const { registry, attacker, deadline, recordHash } = await loadFixture(deployFixture);
      const sig = await signAnchor(registry, attacker, recordHash, PRESCRIPTION, deadline);
      await expect(registry.anchorRecord(recordHash, PRESCRIPTION, deadline, sig))
        .to.be.revertedWithCustomError(registry, "DoctorNotRegistered")
        .withArgs(attacker.address);
    });

    it("rejects records from a suspended doctor", async () => {
      const { registry, doctor, deadline, recordHash } = await loadFixture(deployFixture);
      await registry.setDoctorActive(doctor.address, false);
      const sig = await signAnchor(registry, doctor, recordHash, PRESCRIPTION, deadline);
      await expect(registry.anchorRecord(recordHash, PRESCRIPTION, deadline, sig)).to.be.revertedWithCustomError(
        registry,
        "DoctorNotActive"
      );
    });

    it("keeps earlier records valid after a doctor is suspended", async () => {
      const { registry, doctor, deadline, recordHash } = await loadFixture(deployFixture);
      const sig = await signAnchor(registry, doctor, recordHash, PRESCRIPTION, deadline);
      await registry.anchorRecord(recordHash, PRESCRIPTION, deadline, sig);
      await registry.setDoctorActive(doctor.address, false);
      const v = await registry.verifyRecord(recordHash);
      expect(v.exists).to.equal(true);
      expect(v.revoked).to.equal(false);
      expect(v.doctorCurrentlyActive).to.equal(false);
    });

    it("rejects a signature whose fields were tampered with", async () => {
      const { registry, doctor, deadline, recordHash } = await loadFixture(deployFixture);
      const sig = await signAnchor(registry, doctor, recordHash, PRESCRIPTION, deadline);
      // Same signature, different hash: recovers a different (unregistered) address.
      await expect(
        registry.anchorRecord(hashOf("altered dosage"), PRESCRIPTION, deadline, sig)
      ).to.be.revertedWithCustomError(registry, "DoctorNotRegistered");
      // Same signature, different record type.
      await expect(registry.anchorRecord(recordHash, CERTIFICATE, deadline, sig)).to.be.revertedWithCustomError(
        registry,
        "DoctorNotRegistered"
      );
    });

    it("rejects expired signatures", async () => {
      const { registry, doctor, deadline, recordHash } = await loadFixture(deployFixture);
      const sig = await signAnchor(registry, doctor, recordHash, PRESCRIPTION, deadline);
      await time.increaseTo(deadline + 1n);
      await expect(registry.anchorRecord(recordHash, PRESCRIPTION, deadline, sig)).to.be.revertedWithCustomError(
        registry,
        "SignatureExpired"
      );
    });

    it("prevents anchoring the same record twice", async () => {
      const { registry, doctor, deadline, recordHash } = await loadFixture(deployFixture);
      const sig = await signAnchor(registry, doctor, recordHash, PRESCRIPTION, deadline);
      await registry.anchorRecord(recordHash, PRESCRIPTION, deadline, sig);
      await expect(registry.anchorRecord(recordHash, PRESCRIPTION, deadline, sig)).to.be.revertedWithCustomError(
        registry,
        "RecordAlreadyAnchored"
      );
    });

    it("rejects an empty hash", async () => {
      const { registry, doctor, deadline } = await loadFixture(deployFixture);
      const sig = await signAnchor(registry, doctor, ethers.ZeroHash, PRESCRIPTION, deadline);
      await expect(registry.anchorRecord(ethers.ZeroHash, PRESCRIPTION, deadline, sig)).to.be.revertedWithCustomError(
        registry,
        "EmptyRecordHash"
      );
    });

    it("rejects signatures made for another deployment (domain separation)", async () => {
      const { registry, doctor, deadline, recordHash, hospital } = await loadFixture(deployFixture);
      const other = await (await ethers.getContractFactory("MedicalRegistry")).deploy(hospital.address);
      await other.registerDoctor(doctor.address, "Dr. Ananya Rao", "Cardiology", ethers.ZeroHash);
      const sigForFirst = await signAnchor(registry, doctor, recordHash, PRESCRIPTION, deadline);
      await expect(other.anchorRecord(recordHash, PRESCRIPTION, deadline, sigForFirst)).to.be.revertedWithCustomError(
        other,
        "DoctorNotRegistered"
      );
    });
  });

  describe("Verification and revocation", () => {
    it("reports unknown records as non-existent", async () => {
      const { registry } = await loadFixture(deployFixture);
      const v = await registry.verifyRecord(hashOf("never anchored"));
      expect(v.exists).to.equal(false);
      expect(v.doctor).to.equal(ethers.ZeroAddress);
    });

    it("lets the issuing doctor revoke via signature", async () => {
      const { registry, doctor, relayer, deadline, recordHash } = await loadFixture(deployFixture);
      await registry.anchorRecord(recordHash, PRESCRIPTION, deadline, await signAnchor(registry, doctor, recordHash, PRESCRIPTION, deadline));
      const rsig = await signRevoke(registry, doctor, recordHash, deadline);
      await expect(registry.connect(relayer).revokeRecord(recordHash, deadline, rsig))
        .to.emit(registry, "RecordRevoked")
        .withArgs(recordHash, doctor.address, (v: bigint) => v > 0n);
      expect((await registry.verifyRecord(recordHash)).revoked).to.equal(true);
    });

    it("does not let another doctor revoke someone else's record", async () => {
      const { registry, doctor, otherDoctor, deadline, recordHash } = await loadFixture(deployFixture);
      await registry.registerDoctor(otherDoctor.address, "Dr. B", "ENT", ethers.ZeroHash);
      await registry.anchorRecord(recordHash, PRESCRIPTION, deadline, await signAnchor(registry, doctor, recordHash, PRESCRIPTION, deadline));
      const rsig = await signRevoke(registry, otherDoctor, recordHash, deadline);
      await expect(registry.revokeRecord(recordHash, deadline, rsig)).to.be.revertedWithCustomError(
        registry,
        "NotRecordIssuer"
      );
    });

    it("lets the hospital revoke, but only once, and only existing records", async () => {
      const { registry, doctor, attacker, deadline, recordHash } = await loadFixture(deployFixture);
      await expect(registry.adminRevokeRecord(recordHash)).to.be.revertedWithCustomError(registry, "RecordNotFound");
      await registry.anchorRecord(recordHash, PRESCRIPTION, deadline, await signAnchor(registry, doctor, recordHash, PRESCRIPTION, deadline));
      await expect(registry.connect(attacker).adminRevokeRecord(recordHash)).to.be.revertedWithCustomError(
        registry,
        "OwnableUnauthorizedAccount"
      );
      await registry.adminRevokeRecord(recordHash);
      await expect(registry.adminRevokeRecord(recordHash)).to.be.revertedWithCustomError(
        registry,
        "RecordAlreadyRevoked"
      );
    });
  });

  describe("Ownership", () => {
    it("transfers hospital ownership in two steps", async () => {
      const { registry, otherDoctor } = await loadFixture(deployFixture);
      await registry.transferOwnership(otherDoctor.address);
      expect(await registry.owner()).to.not.equal(otherDoctor.address);
      await registry.connect(otherDoctor).acceptOwnership();
      expect(await registry.owner()).to.equal(otherDoctor.address);
    });
  });
});
