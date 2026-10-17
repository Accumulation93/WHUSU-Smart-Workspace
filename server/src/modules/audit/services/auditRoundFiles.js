'use strict';

const fs = require('fs');
const { generateId } = require('../../../utils/helpers');
const fileModel = require('../models/auditSubmissionFile');
const { readStoredAuditFile, resolveStoredAuditFilePath, detectMime } = require('../utils/fileSecurity');
const { createAuditFileCommit } = require('./auditFileCommitCoordinator');
const copy = require('../../../locales/zh-CN/auditSigning');

function unavailable() {
  const error = new Error(copy.originalRequired);
  error.status = 'original_required';
  return error;
}

// 原件只能来自明确保存的来源，或该文件最早且没有旧协议前缀的签署输入。
function resolveOriginal(file, facts) {
  let source;
  if (file.original_file_path && file.original_file_hash && file.original_file_size != null) {
    source = { file_path: file.original_file_path, file_hash: file.original_file_hash, file_size: file.original_file_size };
  } else {
    const first = facts.evidence.find(row => String(row.file_id) === String(file.id));
    if (first) {
      if (Number(first.legacy_prefix)) throw unavailable();
      source = { file_path: first.input_file_path, file_hash: first.input_digest };
      const candidate = resolveStoredAuditFilePath(source);
      if (!candidate) throw unavailable();
      try { source.file_size = fs.statSync(candidate).size; } catch (_) { throw unavailable(); }
    } else {
      if (facts.signatures.some(row => String(row.file_id) === String(file.id))) throw unavailable();
      source = file;
    }
  }
  const result = readStoredAuditFile(source);
  if (result.status !== 'success') throw unavailable();
  const mimeType = detectMime(result.buffer);
  if (!mimeType) throw unavailable();
  return { buffer: result.buffer, filePath: result.filePath, fileHash: result.actualHash, mimeType };
}

async function prepareRoundFiles(submissionId, orgId, conn) {
  const allFiles = await fileModel.getAllBySubmissionId(submissionId, conn, true);
  const files = allFiles.filter(file => Number(file.is_current) === 1);
  if (!files.length) throw unavailable();
  const facts = await fileModel.getOriginalRecoveryFacts(submissionId, conn);
  const entries = files.map(file => {
    const original = resolveOriginal(file, facts);
    return { fileId: generateId(), orgId, oldPath: original.filePath, buffer: original.buffer,
      fileHash: original.fileHash, mimeType: original.mimeType, source: file, original };
  });
  const commit = createAuditFileCommit(entries);
  return {
    stage: () => commit.stage(),
    rollback: () => commit.rollback(),
    finalize: () => commit.finalize(),
    async persist(round) {
      await fileModel.markCurrentAsHistorical(submissionId, conn);
      for (const entry of entries) {
        const metadata = commit.metadataFor(entry.fileId);
        await fileModel.create(entry.fileId, { ...metadata, submissionId, fileName: entry.source.file_name,
          sortOrder: entry.source.sort_order, revisionRound: round,
          originalFilePath: entry.original.filePath, originalFileHash: entry.original.fileHash,
          originalFileSize: entry.original.buffer.length }, conn);
      }
    }
  };
}

module.exports = { resolveOriginal, prepareRoundFiles };
