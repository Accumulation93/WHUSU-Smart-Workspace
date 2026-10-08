import copy from '@/locales/zh-CN/index.js';
import { formatListTime } from './dateTime.js';
import { WEB_CLIENT_VERSION } from './version.js';

/**
 * 审核审批模块的展示规则与文件处理。
 *
 * 状态值、动作类型与时间格式都按服务端下发的原始值解释，展示文字统一来自语言资源。
 * 附件上传沿用小程序的做法：文件转成 base64 放进 JSON 提交，服务端返回临时文件标识后再随申请提交。
 */

export const MAX_AUDIT_FILE_BYTES = 10 * 1024 * 1024;

const STATUS_TONES = Object.freeze({
  draft: 'chip-sky',
  pending: 'chip-blue',
  in_progress: 'chip-sky',
  rejected: 'chip-orange',
  approved: 'chip-green',
  withdrawn: 'chip-orange'
});

export function formatTemplate(template, values) {
  return String(template || '').replace(/\{(\d+)\}/g, function replace(_, index) {
    const value = values && values[Number(index)];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function statusLabel(status) {
  return copy.audit.statusLabels[status] || '';
}

export function statusTone(status) {
  return STATUS_TONES[status] || 'chip-blue';
}

export function stepStatusLabel(status) {
  return copy.audit.stepStatusLabels[status] || '';
}

export function actionLabel(actionType) {
  return copy.audit.actionLabels[actionType] || '';
}

export function listTimeText(row) {
  if (!row) return '';
  return formatListTime(
    row.updatedAt || row.createdAt,
    row.updatedAtReviewStatus || row.createdAtReviewStatus
  );
}

export function detailTimeText(value, reviewStatus) {
  return formatListTime(value, reviewStatus);
}

/** 审批标签：草稿与已撤回不需要继续处理，其余按待处理显示。 */
export function needsAttention(row) {
  return Boolean(row && row.status !== 'approved' && row.status !== 'withdrawn' && row.status !== 'draft');
}

/**
 * 读取本地文件并转成不含前缀的 base64。
 * 浏览器不能像小程序那样直接给出 base64，只能读成 ArrayBuffer 再手工编码。
 */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('file_read_failed'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : '');
    };
    reader.readAsDataURL(file);
  });
}

/** 按服务端下发的文件名下载附件；凭证在 Cookie 里，浏览器自动携带。 */
export async function downloadAuditFile(fileId, fileName) {
  const response = await fetch('/api/downloadAuditFile?fileId=' + encodeURIComponent(fileId), {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      'X-Client-Type': 'web',
      'X-Client-Version': WEB_CLIENT_VERSION
    }
  });
  if (!response.ok) throw new Error('download_failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || '';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
