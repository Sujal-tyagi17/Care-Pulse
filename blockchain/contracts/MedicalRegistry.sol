// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title MedicalRegistry
 * @notice Tamper-evidence layer for CarePulse medical records.
 *
 * Design principles:
 *  - NO patient data ever touches the chain. Only a salted SHA-256 fingerprint of a
 *    record is stored, so the chain proves *integrity* and *authorship* without
 *    revealing *content*. The salt prevents brute-forcing low-entropy records
 *    (e.g. "Paracetamol 500mg twice daily") back from the hash.
 *  - The hospital (contract owner) maintains a registry of verified doctor wallets.
 *  - A record is only accepted if it carries a valid EIP-712 signature from an
 *    active, registered doctor. Anyone may relay (submit) the signed record and pay
 *    gas — authority comes from the doctor's signature, not from msg.sender.
 *  - Anyone (pharmacy, insurer, employer) can verify a record independently,
 *    without trusting the hospital's servers.
 *
 * Two anchoring modes share the same doctor signatures:
 *  - Single: one transaction per record (`anchorRecord`), checked on submission.
 *  - Batched: many records in one transaction as a Merkle root (`anchorBatch`).
 *    The doctor signature and Merkle proof are checked at verification time
 *    (`verifyBatchedRecord`), which costs nothing because it is a view call.
 * Each batch also checkpoints the head of the hospital's hash-chained audit log,
 * making the whole off-chain history tamper-evident without publishing any event.
 */
contract MedicalRegistry is Ownable2Step, EIP712 {
    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    enum RecordType {
        PRESCRIPTION,
        CLINICAL_SUMMARY,
        MEDICAL_CERTIFICATE
    }

    struct Doctor {
        bool registered;
        bool active;
        uint64 registeredAt;
        bytes32 credentialHash; // hash of licence / registration number (kept off-chain)
        string name;
        string specialization;
        uint64 suspendedAt; // last suspension time, 0 while active
    }

    struct Record {
        address doctor;
        uint64 issuedAt;
        RecordType recordType;
        bool revoked;
        uint64 revokedAt;
    }

    struct Batch {
        bytes32 root; // Merkle root of records (0 for an audit-only checkpoint)
        bytes32 auditHead; // hash of the latest audit-log entry covered
        uint64 auditSeq; // sequence number of that entry
        uint64 anchoredAt;
        uint32 leafCount;
    }

    /// @dev Result codes for verifyBatchedRecord, so callers can show *why* a check failed.
    enum BatchCheck {
        VALID,
        UNKNOWN_BATCH,
        NOT_IN_BATCH, // proof doesn't match the root: record or signer altered
        SIGNER_NOT_REGISTERED,
        DOCTOR_SUSPENDED_AT_ANCHOR_TIME,
        SIGNATURE_EXPIRED_BEFORE_ANCHOR
    }

    struct BatchedVerification {
        BatchCheck check;
        bool revoked;
        address doctor;
        string doctorName;
        string doctorSpecialization;
        bool doctorCurrentlyActive;
        uint64 anchoredAt;
    }

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    bytes32 public constant ANCHOR_TYPEHASH =
        keccak256("AnchorRecord(bytes32 recordHash,uint8 recordType,uint256 deadline)");
    bytes32 public constant REVOKE_TYPEHASH =
        keccak256("RevokeRecord(bytes32 recordHash,uint256 deadline)");

    mapping(address => Doctor) private _doctors;
    address[] private _doctorList;

    mapping(bytes32 => Record) private _records;
    uint256 public totalRecords;

    Batch[] private _batches;
    uint256 public totalBatchedRecords;
    mapping(bytes32 => uint64) private _batchedRevokedAt;

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    event DoctorRegistered(address indexed doctor, string name, string specialization, bytes32 credentialHash);
    event DoctorStatusChanged(address indexed doctor, bool active);
    event RecordAnchored(
        bytes32 indexed recordHash,
        address indexed doctor,
        RecordType recordType,
        uint64 issuedAt
    );
    event RecordRevoked(bytes32 indexed recordHash, address indexed revokedBy, uint64 revokedAt);
    event BatchAnchored(
        uint256 indexed batchId,
        bytes32 indexed root,
        uint32 leafCount,
        bytes32 auditHead,
        uint64 auditSeq,
        uint64 anchoredAt
    );

    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------

    error ZeroAddress();
    error EmptyRecordHash();
    error DoctorAlreadyRegistered(address doctor);
    error DoctorNotRegistered(address doctor);
    error DoctorNotActive(address doctor);
    error RecordAlreadyAnchored(bytes32 recordHash);
    error RecordNotFound(bytes32 recordHash);
    error RecordAlreadyRevoked(bytes32 recordHash);
    error SignatureExpired(uint256 deadline);
    error NotRecordIssuer(address signer, address issuer);
    error InvalidBatch();
    error AuditSequenceWentBackwards(uint64 previous, uint64 provided);
    error InvalidProof();

    constructor(address initialOwner) Ownable(initialOwner) EIP712("CarePulse MedicalRegistry", "1") {}

    // ------------------------------------------------------------------
    // Doctor registry (hospital admin)
    // ------------------------------------------------------------------

    function registerDoctor(
        address doctor,
        string calldata name,
        string calldata specialization,
        bytes32 credentialHash
    ) external onlyOwner {
        if (doctor == address(0)) revert ZeroAddress();
        if (_doctors[doctor].registered) revert DoctorAlreadyRegistered(doctor);

        _doctors[doctor] = Doctor({
            registered: true,
            active: true,
            registeredAt: uint64(block.timestamp),
            credentialHash: credentialHash,
            name: name,
            specialization: specialization,
            suspendedAt: 0
        });
        _doctorList.push(doctor);

        emit DoctorRegistered(doctor, name, specialization, credentialHash);
    }

    /// @notice Suspend or reinstate a doctor. Records issued while active stay valid.
    function setDoctorActive(address doctor, bool active) external onlyOwner {
        if (!_doctors[doctor].registered) revert DoctorNotRegistered(doctor);
        _doctors[doctor].active = active;
        _doctors[doctor].suspendedAt = active ? 0 : uint64(block.timestamp);
        emit DoctorStatusChanged(doctor, active);
    }

    // ------------------------------------------------------------------
    // Record anchoring
    // ------------------------------------------------------------------

    /**
     * @notice Anchor a record fingerprint, authorised by the issuing doctor's EIP-712 signature.
     * @param recordHash Salted SHA-256 fingerprint of the canonical record.
     * @param recordType Kind of record (prescription, summary, certificate).
     * @param deadline   Unix time after which the signature can no longer be submitted.
     * @param signature  Doctor's signature over AnchorRecord(recordHash, recordType, deadline).
     * @return doctor    The recovered, verified issuing doctor.
     */
    function anchorRecord(
        bytes32 recordHash,
        RecordType recordType,
        uint256 deadline,
        bytes calldata signature
    ) external returns (address doctor) {
        if (recordHash == bytes32(0)) revert EmptyRecordHash();
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        if (_records[recordHash].doctor != address(0)) revert RecordAlreadyAnchored(recordHash);

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(ANCHOR_TYPEHASH, recordHash, uint8(recordType), deadline))
        );
        doctor = ECDSA.recover(digest, signature);

        Doctor storage d = _doctors[doctor];
        if (!d.registered) revert DoctorNotRegistered(doctor);
        if (!d.active) revert DoctorNotActive(doctor);

        uint64 nowTs = uint64(block.timestamp);
        _records[recordHash] = Record({
            doctor: doctor,
            issuedAt: nowTs,
            recordType: recordType,
            revoked: false,
            revokedAt: 0
        });
        unchecked {
            totalRecords++;
        }

        emit RecordAnchored(recordHash, doctor, recordType, nowTs);
    }

    /// @notice Revoke a record using the issuing doctor's signature (e.g. a prescription issued in error).
    function revokeRecord(bytes32 recordHash, uint256 deadline, bytes calldata signature) external {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        Record storage r = _requireLiveRecord(recordHash);

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(REVOKE_TYPEHASH, recordHash, deadline)));
        address signer = ECDSA.recover(digest, signature);
        if (signer != r.doctor) revert NotRecordIssuer(signer, r.doctor);

        _revoke(r, recordHash, signer);
    }

    /// @notice Hospital admin can revoke any record, single or batched (e.g. fraud investigation).
    function adminRevokeRecord(bytes32 recordHash) external onlyOwner {
        if (_records[recordHash].doctor != address(0)) {
            Record storage r = _requireLiveRecord(recordHash);
            _revoke(r, recordHash, msg.sender);
            return;
        }
        if (recordHash == bytes32(0)) revert EmptyRecordHash();
        if (_batchedRevokedAt[recordHash] != 0) revert RecordAlreadyRevoked(recordHash);
        uint64 nowTs = uint64(block.timestamp);
        _batchedRevokedAt[recordHash] = nowTs;
        emit RecordRevoked(recordHash, msg.sender, nowTs);
    }

    // ------------------------------------------------------------------
    // Batched anchoring (Merkle roots + audit-log checkpoints)
    // ------------------------------------------------------------------

    /**
     * @notice Anchor a Merkle root of doctor-signed records and checkpoint the audit log.
     * @dev Only the hospital may submit batches. It cannot forge records through this:
     *      every leaf commits to the signing doctor, and verification re-checks that
     *      doctor's EIP-712 signature against the registry.
     * @param root      Merkle root (OpenZeppelin StandardMerkleTree) or 0 for audit-only.
     * @param leafCount Number of records in the tree (0 iff root is 0).
     * @param auditHead Hash of the latest audit-log entry included in this checkpoint.
     * @param auditSeq  Sequence number of that entry; must never decrease.
     */
    function anchorBatch(bytes32 root, uint32 leafCount, bytes32 auditHead, uint64 auditSeq)
        external
        onlyOwner
        returns (uint256 batchId)
    {
        if ((root == bytes32(0)) != (leafCount == 0)) revert InvalidBatch();
        if (root == bytes32(0) && auditHead == bytes32(0)) revert InvalidBatch();
        uint256 n = _batches.length;
        if (n > 0 && auditSeq < _batches[n - 1].auditSeq) {
            revert AuditSequenceWentBackwards(_batches[n - 1].auditSeq, auditSeq);
        }

        uint64 nowTs = uint64(block.timestamp);
        _batches.push(Batch({root: root, auditHead: auditHead, auditSeq: auditSeq, anchoredAt: nowTs, leafCount: leafCount}));
        unchecked {
            totalBatchedRecords += leafCount;
        }
        batchId = n;
        emit BatchAnchored(batchId, root, leafCount, auditHead, auditSeq, nowTs);
    }

    /// @notice Leaf encoding, identical to OpenZeppelin StandardMerkleTree(["bytes32","uint8","address"]).
    function batchLeaf(bytes32 recordHash, RecordType recordType, address doctor) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(recordHash, uint8(recordType), doctor))));
    }

    /**
     * @notice Verify a batched record: Merkle membership, the doctor's signature, and that the
     *         doctor was registered and not suspended when the batch was anchored.
     * @param deadline  Deadline the doctor signed in AnchorRecord (must not precede anchoring).
     * @param signature Doctor's EIP-712 AnchorRecord signature (same one used for single mode).
     */
    function verifyBatchedRecord(
        bytes32 recordHash,
        RecordType recordType,
        uint256 deadline,
        bytes calldata signature,
        uint256 batchId,
        bytes32[] calldata proof
    ) external view returns (BatchedVerification memory v) {
        v.revoked = _batchedRevokedAt[recordHash] != 0;
        if (batchId >= _batches.length) {
            v.check = BatchCheck.UNKNOWN_BATCH;
            return v;
        }
        v.anchoredAt = _batches[batchId].anchoredAt;
        v.doctor = _recoverAnchorSigner(recordHash, recordType, deadline, signature);
        if (v.doctor == address(0) || !_inBatch(batchId, proof, batchLeaf(recordHash, recordType, v.doctor))) {
            v.check = BatchCheck.NOT_IN_BATCH;
            return v;
        }
        _fillDoctorChecks(v, deadline);
    }

    /// @notice Revoke a batched record using the issuing doctor's RevokeRecord signature.
    function revokeBatchedRecord(
        bytes32 recordHash,
        RecordType recordType,
        address doctor,
        uint256 batchId,
        bytes32[] calldata proof,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        if (batchId >= _batches.length) revert InvalidBatch();
        if (!_inBatch(batchId, proof, batchLeaf(recordHash, recordType, doctor))) revert InvalidProof();
        if (_batchedRevokedAt[recordHash] != 0) revert RecordAlreadyRevoked(recordHash);

        address signer = ECDSA.recover(
            _hashTypedDataV4(keccak256(abi.encode(REVOKE_TYPEHASH, recordHash, deadline))),
            signature
        );
        if (signer != doctor) revert NotRecordIssuer(signer, doctor);

        _batchedRevokedAt[recordHash] = uint64(block.timestamp);
        emit RecordRevoked(recordHash, signer, uint64(block.timestamp));
    }

    function batchCount() external view returns (uint256) {
        return _batches.length;
    }

    function getBatch(uint256 batchId) external view returns (Batch memory) {
        return _batches[batchId];
    }

    function batchedRevokedAt(bytes32 recordHash) external view returns (uint64) {
        return _batchedRevokedAt[recordHash];
    }

    // ------------------------------------------------------------------
    // Public verification (no trust in the hospital required)
    // ------------------------------------------------------------------

    function verifyRecord(bytes32 recordHash)
        external
        view
        returns (
            bool exists,
            bool revoked,
            address doctor,
            string memory doctorName,
            string memory doctorSpecialization,
            bool doctorCurrentlyActive,
            uint64 issuedAt,
            RecordType recordType
        )
    {
        Record storage r = _records[recordHash];
        if (r.doctor == address(0)) {
            return (false, false, address(0), "", "", false, 0, RecordType.PRESCRIPTION);
        }
        Doctor storage d = _doctors[r.doctor];
        bool isRevoked = r.revoked || _batchedRevokedAt[recordHash] != 0;
        return (true, isRevoked, r.doctor, d.name, d.specialization, d.active, r.issuedAt, r.recordType);
    }

    function getDoctor(address doctor) external view returns (Doctor memory) {
        return _doctors[doctor];
    }

    function isActiveDoctor(address doctor) external view returns (bool) {
        return _doctors[doctor].active;
    }

    function doctorCount() external view returns (uint256) {
        return _doctorList.length;
    }

    function doctorAt(uint256 index) external view returns (address) {
        return _doctorList[index];
    }

    /// @notice EIP-712 domain separator, exposed so off-chain signers can sanity-check their domain.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    function _recoverAnchorSigner(bytes32 recordHash, RecordType recordType, uint256 deadline, bytes calldata signature)
        private
        view
        returns (address signer)
    {
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(ANCHOR_TYPEHASH, recordHash, uint8(recordType), deadline))
        );
        ECDSA.RecoverError err;
        (signer, err, ) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError) signer = address(0);
    }

    function _inBatch(uint256 batchId, bytes32[] calldata proof, bytes32 leaf) private view returns (bool) {
        bytes32 root = _batches[batchId].root;
        return root != bytes32(0) && MerkleProof.verifyCalldata(proof, root, leaf);
    }

    function _fillDoctorChecks(BatchedVerification memory v, uint256 deadline) private view {
        Doctor storage d = _doctors[v.doctor];
        v.doctorName = d.name;
        v.doctorSpecialization = d.specialization;
        v.doctorCurrentlyActive = d.active;
        if (!d.registered || d.registeredAt > v.anchoredAt) {
            v.check = BatchCheck.SIGNER_NOT_REGISTERED;
        } else if (!d.active && d.suspendedAt <= v.anchoredAt) {
            v.check = BatchCheck.DOCTOR_SUSPENDED_AT_ANCHOR_TIME;
        } else if (deadline < v.anchoredAt) {
            v.check = BatchCheck.SIGNATURE_EXPIRED_BEFORE_ANCHOR;
        } else {
            v.check = BatchCheck.VALID;
        }
    }

    function _requireLiveRecord(bytes32 recordHash) private view returns (Record storage r) {
        r = _records[recordHash];
        if (r.doctor == address(0)) revert RecordNotFound(recordHash);
        if (r.revoked) revert RecordAlreadyRevoked(recordHash);
    }

    function _revoke(Record storage r, bytes32 recordHash, address by) private {
        uint64 nowTs = uint64(block.timestamp);
        r.revoked = true;
        r.revokedAt = nowTs;
        emit RecordRevoked(recordHash, by, nowTs);
    }
}
