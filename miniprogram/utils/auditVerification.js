const verificationCopy = require('../locales/zh-CN/auditVerification');

function presentVerificationResponse(response) {
  const result = response || {};
  const selectedSubmissionId = String(result.submissionId || '');
  const matches = (Array.isArray(result.matches) ? result.matches : []).map((item) => {
    const status = String(item.status || '');
    const statusClass = status === 'approved'
      ? 'verification-match-status--success'
      : status === 'rejected'
        ? 'verification-match-status--danger'
        : status === 'in_progress'
          ? 'verification-match-status--warning'
          : 'verification-match-status--muted';
    return Object.assign({}, item, {
      titleText: String(item.title || '') || verificationCopy.text.untitledSubmission,
      statusText: verificationCopy.text.status[status] || verificationCopy.text.unknownStatus,
      statusClass,
      isSelected: String(item.submissionId || '') === selectedSubmissionId,
      matchingFiles: Array.isArray(item.matchingFiles) ? item.matchingFiles : []
    });
  });
  return Object.assign({}, result, {
    matches,
    matchCount: matches.length,
    matchCountText: verificationCopy.format.matchCount(matches.length)
  });
}

function buildMatchVerificationParams(result, submissionId) {
  const fileHash = String(result && result.verifyByFileHash || '');
  const selectedSubmissionId = String(submissionId || '');
  if (!fileHash || !selectedSubmissionId) return null;
  return { fileHash, submissionId: selectedSubmissionId };
}

module.exports = { verificationCopy, presentVerificationResponse, buildMatchVerificationParams };
