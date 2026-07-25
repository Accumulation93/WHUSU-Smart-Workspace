/**
 * Audit Hash Chain Utility
 *
 * Provides cryptographic functions for the audit signature verification chain:
 * - File hashing (SHA-256)
 * - Signature data hash computation
 * - Full chain verification across rounds and files
 */

const crypto = require('crypto');

/**
 * Compute SHA-256 hash of a buffer.
 * @param {Buffer} buffer - File content buffer
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hashFile(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Compute a canonical signature data hash.
 *
 * The canonical string binds all signature metadata into a single hash,
 * creating a tamper-evident record. Any change to any field produces a
 * different hash.
 *
 * @param {Object} params
 * @param {string} params.id - Signature record ID
 * @param {string} params.stepId - Step record ID
 * @param {string} params.signerHrId - Signer's HR ID
 * @param {number} params.positionX - X position (fraction 0-1)
 * @param {number} params.positionY - Y position (fraction 0-1)
 * @param {number} params.page - Page number (for PDF files, defaults to 1)
 * @param {number} params.size - Signature/stamp scale multiplier
 * @param {number} params.rotation - Signature/stamp rotation degrees
 * @param {number} params.round - Round number
 * @param {string|null} params.previousSignatureHash - Previous signature hash in chain
 * @param {string} params.documentHash - Document hash at signing time
 * @param {string} params.signedAt - ISO 8601 timestamp of signing
 * @returns {string} Hex-encoded SHA-256 hash
 */
function computeSignatureHash({ id, stepId, signerHrId, positionX, positionY, page, size, rotation, round, previousSignatureHash, documentHash, signedAt }) {
  const canonical = [
    id,
    stepId,
    signerHrId,
    String(positionX),
    String(positionY),
    String(page || 1),
    String(size == null ? 1 : size),
    String(rotation == null ? 0 : rotation),
    String(round),
    previousSignatureHash || '',
    documentHash,
    signedAt
  ].join('|');

  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function computeLegacySignatureHash({ id, stepId, signerHrId, positionX, positionY, page, round, previousSignatureHash, documentHash, signedAt }) {
  const canonical = [
    id,
    stepId,
    signerHrId,
    String(positionX),
    String(positionY),
    String(page || 1),
    String(round),
    previousSignatureHash || '',
    documentHash,
    signedAt
  ].join('|');

  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Verify an entire signature chain for a submission.
 *
 * Groups signatures by (file_id, round), sorts by signed_at within each group,
 * and verifies:
 *   1. Each signature's previous_signature_hash links correctly to the prior signature
 *   2. Each signature's signature_data_hash recomputes to the stored value
 *   3. The document hash at signing time is consistent (caller must provide current file hashes)
 *
 * @param {Array} signatures - Array of signature records, each with:
 *   { id, step_id, file_id, signer_hr_id, position_x, position_y, round,
 *     previous_signature_hash, document_hash_at_signing, signature_data_hash, signed_at }
 * @param {Object<string, string>} currentFileHashes - Map of file_id → current SHA-256 hash
 * @returns {Object} Verification result
 */
function verifySignatureChain(signatures, currentFileHashes = {}) {
  if (!signatures || !signatures.length) {
    return { valid: true, totalSignatures: 0, rounds: {}, files: [], message: '暂无签名记录' };
  }

  // Group by file_id, then by round
  const groups = new Map(); // key: `${file_id}::${round}`
  for (const sig of signatures) {
    const key = `${sig.file_id}::${sig.round}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(sig);
  }

  const roundResults = {}; // roundNumber → { signatures, valid, brokenAt }
  const fileResults = new Map(); // file_id → { fileId, fileName, hashVerified }
  let overallValid = true;

  for (const [key, sigs] of groups) {
    const [fileId, roundStr] = key.split('::');
    const round = parseInt(roundStr, 10);

    // Sort by signed_at ascending
    sigs.sort((a, b) => {
      const timeDiff = new Date(a.signed_at).getTime() - new Date(b.signed_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      return String(a.id).localeCompare(String(b.id));
    });

    let chainValid = true;
    let brokenAt = null;

    for (let i = 0; i < sigs.length; i++) {
      const current = sigs[i];
      const previous = i > 0 ? sigs[i - 1] : null;

      // 1. Check previous hash link
      const expectedPrev = previous ? previous.signature_data_hash : null;
      if (current.previous_signature_hash !== (expectedPrev || null)) {
        chainValid = false;
        brokenAt = current.id;
        overallValid = false;
        break;
      }

      // 2. Re-compute hash and compare
      const computedHash = computeSignatureHash({
        id: current.id,
        stepId: current.step_id,
        signerHrId: current.signer_hr_id,
        positionX: parseFloat(current.position_x) || 0,
        positionY: parseFloat(current.position_y) || 0,
        page: current.page || 1,
        size: parseFloat(current.signature_size) || 1,
        rotation: parseFloat(current.rotation_degrees) || 0,
        round: current.round,
        previousSignatureHash: current.previous_signature_hash,
        documentHash: current.document_hash_at_signing,
        signedAt: typeof current.signed_at === 'string' ? current.signed_at : new Date(current.signed_at).toISOString()
      });
      const legacyHash = computeLegacySignatureHash({
        id: current.id,
        stepId: current.step_id,
        signerHrId: current.signer_hr_id,
        positionX: parseFloat(current.position_x) || 0,
        positionY: parseFloat(current.position_y) || 0,
        page: current.page || 1,
        round: current.round,
        previousSignatureHash: current.previous_signature_hash,
        documentHash: current.document_hash_at_signing,
        signedAt: typeof current.signed_at === 'string' ? current.signed_at : new Date(current.signed_at).toISOString()
      });

      if (computedHash !== current.signature_data_hash && legacyHash !== current.signature_data_hash) {
        chainValid = false;
        brokenAt = current.id;
        overallValid = false;
        break;
      }
    }

    // Track round results
    if (!roundResults[round]) {
      roundResults[round] = { signatures: 0, valid: true, brokenAt: null };
    }
    roundResults[round].signatures += sigs.length;
    if (!chainValid) {
      roundResults[round].valid = false;
      roundResults[round].brokenAt = brokenAt;
    }

    // Track file hash verification
    const currentHash = currentFileHashes[fileId] || null;
    const lastSig = sigs[sigs.length - 1];
    const existingFileResult = fileResults.get(fileId);
    const existingTime = existingFileResult ? new Date(existingFileResult.signedAt).getTime() : -1;
    const lastSigTime = new Date(lastSig.signed_at).getTime();
    if (!existingFileResult || lastSigTime > existingTime ||
        (lastSigTime === existingTime && String(lastSig.id).localeCompare(String(existingFileResult.signatureId)) > 0)) {
      fileResults.set(fileId, {
        fileId,
        signatureId: lastSig.id,
        signedAt: lastSig.signed_at,
        hashVerified: !currentHash ? null : currentHash === lastSig.document_hash_at_signing,
        documentHashAtLastSigning: lastSig.document_hash_at_signing,
        currentHash: currentHash || null
      });
    }
  }

  for (const result of fileResults.values()) {
    if (result.hashVerified === false) overallValid = false;
  }

  return {
    valid: overallValid,
    totalSignatures: signatures.length,
    rounds: roundResults,
    files: Array.from(fileResults.values())
  };
}

/**
 * Build the canonical string for a signature (for transparency / debugging).
 * @param {Object} sig - Signature record
 * @returns {string} Canonical representation
 */
function buildCanonicalString(sig) {
  return [
    sig.id,
    sig.step_id,
    sig.signer_hr_id,
    String(sig.position_x),
    String(sig.position_y),
    String(sig.page || 1),
    String(sig.signature_size == null ? 1 : sig.signature_size),
    String(sig.rotation_degrees == null ? 0 : sig.rotation_degrees),
    String(sig.round),
    sig.previous_signature_hash || '',
    sig.document_hash_at_signing,
    typeof sig.signed_at === 'string' ? sig.signed_at : new Date(sig.signed_at).toISOString()
  ].join('|');
}

module.exports = {
  hashFile,
  computeSignatureHash,
  computeLegacySignatureHash,
  verifySignatureChain,
  buildCanonicalString
};
