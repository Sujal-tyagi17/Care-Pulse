// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

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
    }

    struct Record {
        address doctor;
        uint64 issuedAt;
        RecordType recordType;
        bool revoked;
        uint64 revokedAt;
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
            specialization: specialization
        });
        _doctorList.push(doctor);

        emit DoctorRegistered(doctor, name, specialization, credentialHash);
    }

    /// @notice Suspend or reinstate a doctor. Records issued while active stay valid.
    function setDoctorActive(address doctor, bool active) external onlyOwner {
        if (!_doctors[doctor].registered) revert DoctorNotRegistered(doctor);
        _doctors[doctor].active = active;
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

    /// @notice Hospital admin can revoke any record (e.g. fraud investigation).
    function adminRevokeRecord(bytes32 recordHash) external onlyOwner {
        Record storage r = _requireLiveRecord(recordHash);
        _revoke(r, recordHash, msg.sender);
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
        return (true, r.revoked, r.doctor, d.name, d.specialization, d.active, r.issuedAt, r.recordType);
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
