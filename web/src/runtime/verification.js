import verificationCopy from '@/locales/zh-CN/auditVerification.js';
import { session } from './session.js';

/**
 * 验签结果整理与报告交接。
 *
 * 与小程序 `utils/auditVerification.js`、`utils/auditVerificationReport.js` 保持同一套口径：
 * 状态文案、相关审核记录整理、按文件哈希重新核对某一条申请，以及一次性报告交接。
 * 两者只是宿主不同：小程序把报告放在 globalData，网页放在这个模块的内存里。
 */

const REPORT_TTL_MS = 60000;

let pendingReport = null;

function currentContextId() {
  const context = session.context || {};
  return context.contextId || '';
}

/** 把服务端返回的验签结果整理成页面直接可渲染的形状。 */
export function presentVerificationResponse(response) {
  const result = response || {};
  const selectedSubmissionId = String(result.submissionId || '');
  const matches = (Array.isArray(result.matches) ? result.matches : []).map((item) => {
    const status = String(item.status || '');
    // 状态标签只允许蓝、绿、橙、天蓝四色：已通过为绿，审核中为橙，其余为天蓝。
    const statusClass = status === 'approved'
      ? 'chip-green'
      : status === 'in_progress'
        ? 'chip-orange'
        : 'chip-sky';
    return Object.assign({}, item, {
      titleText: String(item.title || '') || verificationCopy.text.untitledSubmission,
      statusText: verificationCopy.text.status[status] || verificationCopy.text.unknownStatus,
      statusClass,
      isSelected: String(item.submissionId || '') === selectedSubmissionId,
      matchingFiles: Array.isArray(item.matchingFiles) ? item.matchingFiles : []
    });
  });
  return Object.assign({}, result, {
    verificationJson: JSON.stringify({
      verificationVersion: result.verificationVersion,
      verificationSource: result.verificationSource,
      verificationScope: result.verificationScope,
      overallStatus: result.overallStatus,
      files: result.files
    }),
    matches,
    matchCount: matches.length,
    matchCountText: verificationCopy.format.matchCount(matches.length)
  });
}

/** 已按文件哈希验出结果后，再点开某一条相关审核记录时使用的参数。 */
export function buildMatchVerificationParams(result, submissionId, fileBase64) {
  const fileHash = String((result && result.verifyByFileHash) || '');
  const selectedSubmissionId = String(submissionId || '');
  if (!fileHash || !selectedSubmissionId) return null;
  const params = { fileHash, submissionId: selectedSubmissionId };
  if (fileBase64) params.fileBase64 = fileBase64;
  return params;
}

/**
 * 一次性交接完整报告：只放在内存里，过期或工作角色变化后立即失效，
 * 不写入地址栏，也不写入浏览器持久化存储。
 */
export function openVerificationReport(result) {
  pendingReport = {
    json: JSON.stringify(result),
    contextId: currentContextId(),
    expires: Date.now() + REPORT_TTL_MS
  };
}

export function takeVerificationReport() {
  const value = pendingReport;
  pendingReport = null;
  if (!value) return '';
  if (value.expires < Date.now()) return '';
  if (value.contextId !== currentContextId()) return '';
  return value.json;
}
