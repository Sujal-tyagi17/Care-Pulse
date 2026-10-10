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
  deriveDoctorWallet
} from '../src/blockchain/core.js';
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

  console.log(`\n${passed} passing`);
}

main().catch((err) => {
  console.error('\n✘ Integration test failed:', err);
  process.exit(1);
});
