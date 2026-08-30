const localeCopy = require('../../../locales/zh-CN/generated/modules/audit/utils/hashChain');
/**
 * Audit Hash Chain Utility
 *
 * Provides cryptographic functions for the audit signature verification chain:
 * - File hashing (SHA-256)
 * - Signature data hash computation
 * - Full chain verification across rounds and files
 */

const crypto = require('crypto');

const SIGNATURE_HASH_VERSION_V2 = 2;

function safeCanonicalValue(value) {
  return value == null ? '' : String(value);
}

function canonicalizeSignerContext(snapshot) {
  let source = snapshot;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch (_) { source = null; }
  }
  source = source && typeof source === 'object' ? source : {};
  return {
    contextId: safeCanonicalValue(source.contextId),
    organizationId: safeCanonicalValue(source.organizationId),
    personId: safeCanonicalValue(source.personId),
    membershipId: safeCanonicalValue(source.membershipId),
    assignmentId: safeCanonicalValue(source.assignmentId),
    assignmentNature: safeCanonicalValue(source.assignmentNature),
    assignmentLabel: safeCanonicalValue(source.assignmentLabel),
    departmentId: safeCanonicalValue(source.departmentId),
    department: safeCanonicalValue(source.department),
    identityCategoryId: safeCanonicalValue(source.identityCategoryId),
    identityCategory: safeCanonicalValue(source.identityCategory),
    workGroupId: safeCanonicalValue(source.workGroupId),
    workGroup: safeCanonicalValue(source.workGroup)
  };
}

function computeMaterialImageHash(imageData) {
  if (typeof imageData !== 'string' || !imageData.trim()) return '';
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(imageData.trim());
  if (!match) return '';
  const buffer = Buffer.from(match[1].replace(/[\r\n]/g, ''), 'base64');
  if (!buffer.length) return '';
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

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

/**
 * 第二版签署链哈希同时绑定材料类型、材料图像摘要、授权印章、岗位与处理快照。
 * 快照必须先投影到固定字段，避免 MySQL JSON 键顺序改变导致验签失败。
 */
function computeSignatureHashV2({
  id,
  stepId,
  signerHrId,
  signatureType,
  materialImageHash,
  stampId,
  signerAssignmentId,
  signerContextSnapshot,
  positionX,
  positionY,
  page,
  size,
  rotation,
  round,
  previousSignatureHash,
  documentHash,
  signedAt
}) {
  const canonical = [
    'v2',
    safeCanonicalValue(id),
    safeCanonicalValue(stepId),
    safeCanonicalValue(signerHrId),
    safeCanonicalValue(signatureType),
    safeCanonicalValue(materialImageHash),
    safeCanonicalValue(stampId),
    safeCanonicalValue(signerAssignmentId),
    JSON.stringify(canonicalizeSignerContext(signerContextSnapshot)),
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

function stableSignatureOrder(signatures) {
  return signatures.slice().sort((a, b) => {
    const timeDiff = new Date(a.signed_at).getTime() - new Date(b.signed_at).getTime();
    if (timeDiff !== 0) return timeDiff;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * 同一次审批生成的多条记录会共享 signed_at，不能再用随机 ID 推断链顺序。
 * 这里直接沿 previous_signature_hash 拓扑还原唯一链；多根、分叉或断链全部失败关闭。
 */
function orderSignatureGroupByLinks(signatures) {
  const source = Array.isArray(signatures) ? signatures.slice() : [];
  if (!source.length) return { valid: true, ordered: [], brokenAt: null };
  const roots = source.filter((item) => !item.previous_signature_hash);
  if (roots.length !== 1) {
    return { valid: false, ordered: stableSignatureOrder(source), brokenAt: roots[0] ? roots[0].id : source[0].id };
  }
  const ordered = [roots[0]];
  const visited = new Set([String(roots[0].id)]);
  while (ordered.length < source.length) {
    const previous = ordered[ordered.length - 1];
    const candidates = source.filter((item) => (
      !visited.has(String(item.id))
      && item.previous_signature_hash === previous.signature_data_hash
    ));
    if (candidates.length !== 1) {
      const remaining = source.find((item) => !visited.has(String(item.id)));
      return { valid: false, ordered: ordered.concat(stableSignatureOrder(source.filter((item) => !visited.has(String(item.id))))), brokenAt: remaining ? remaining.id : previous.id };
    }
    ordered.push(candidates[0]);
    visited.add(String(candidates[0].id));
  }
  return { valid: true, ordered, brokenAt: null };
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
function verifySignatureChain(signatures, currentFileHashes = {}, options = {}) {
  const requiredFileIds = new Set((Array.isArray(options.requiredFileIds) ? options.requiredFileIds : [])
    .map((id) => String(id || '').trim()).filter(Boolean));
  const sourceSignatures = Array.isArray(signatures) ? signatures : [];
  if (!sourceSignatures.length && !requiredFileIds.size) {
    return { valid: true, totalSignatures: 0, rounds: {}, files: [], message: localeCopy.copy_98b6dd82d7 };
  }

  // Group by file_id, then by round
  const groups = new Map(); // key: `${file_id}::${round}`
  for (const sig of sourceSignatures) {
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

    const chainOrder = orderSignatureGroupByLinks(sigs);
    const orderedSigs = chainOrder.ordered;
    let chainValid = chainOrder.valid;
    let brokenAt = chainOrder.brokenAt;
    if (!chainValid) overallValid = false;

    for (let i = 0; chainValid && i < orderedSigs.length; i++) {
      const current = orderedSigs[i];
      const previous = i > 0 ? orderedSigs[i - 1] : null;

      // 1. Check previous hash link
      const expectedPrev = previous ? previous.signature_data_hash : null;
      if (current.previous_signature_hash !== (expectedPrev || null)) {
        chainValid = false;
        brokenAt = current.id;
        overallValid = false;
        break;
      }

      // 2. Re-compute hash and compare
      const signedAt = typeof current.signed_at === 'string'
        ? current.signed_at
        : new Date(current.signed_at).toISOString();
      const hashVersion = Number(current.hash_version || 1);
      const computedHash = hashVersion >= SIGNATURE_HASH_VERSION_V2
        ? computeSignatureHashV2({
          id: current.id,
          stepId: current.step_id,
          signerHrId: current.signer_hr_id,
          signatureType: current.signature_type,
          materialImageHash: current.material_image_hash,
          stampId: current.stamp_id,
          signerAssignmentId: current.signer_assignment_id,
          signerContextSnapshot: current.signer_context_snapshot,
          positionX: parseFloat(current.position_x) || 0,
          positionY: parseFloat(current.position_y) || 0,
          page: current.page || 1,
          size: parseFloat(current.signature_size) || 1,
          rotation: parseFloat(current.rotation_degrees) || 0,
          round: current.round,
          previousSignatureHash: current.previous_signature_hash,
          documentHash: current.document_hash_at_signing,
          signedAt
        })
        : computeSignatureHash({
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
          signedAt
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

      const hashMatches = hashVersion >= SIGNATURE_HASH_VERSION_V2
        ? computedHash === current.signature_data_hash
        : (computedHash === current.signature_data_hash || legacyHash === current.signature_data_hash);
      if (!hashMatches) {
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
    roundResults[round].signatures += orderedSigs.length;
    if (!chainValid) {
      roundResults[round].valid = false;
      roundResults[round].brokenAt = brokenAt;
    }

    // Track file hash verification
    const currentHash = currentFileHashes[fileId] || null;
    const lastSig = orderedSigs[orderedSigs.length - 1];
    const existingFileResult = fileResults.get(fileId);
    const existingRound = existingFileResult ? Number(existingFileResult.round || 0) : -1;
    const existingTime = existingFileResult ? new Date(existingFileResult.signedAt).getTime() : -1;
    const lastSigTime = new Date(lastSig.signed_at).getTime();
    if (!existingFileResult || round > existingRound || (round === existingRound && lastSigTime > existingTime) ||
        (round === existingRound && lastSigTime === existingTime && String(lastSig.id).localeCompare(String(existingFileResult.signatureId)) > 0)) {
      fileResults.set(fileId, {
        fileId,
        round,
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

  for (const fileId of requiredFileIds) {
    if (fileResults.has(fileId)) {
      if (!currentFileHashes[fileId]) {
        const fileResult = fileResults.get(fileId);
        fileResult.hashVerified = false;
        fileResult.currentFileMissing = true;
        overallValid = false;
      }
      continue;
    }
    fileResults.set(fileId, {
      fileId,
      signatureId: null,
      signedAt: null,
      hashVerified: false,
      missingSignatureRecord: true,
      documentHashAtLastSigning: null,
      currentHash: currentFileHashes[fileId] || null
    });
    overallValid = false;
  }

  return {
    valid: overallValid,
    totalSignatures: sourceSignatures.length,
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
  SIGNATURE_HASH_VERSION_V2,
  canonicalizeSignerContext,
  computeMaterialImageHash,
  hashFile,
  computeSignatureHash,
  computeSignatureHashV2,
  computeLegacySignatureHash,
  orderSignatureGroupByLinks,
  verifySignatureChain,
  buildCanonicalString
};
