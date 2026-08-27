'use strict';

module.exports = Object.freeze({
  codes: Object.freeze({
    uploadQuotaBusy: 'upload_quota_busy',
    uploadAccountQuotaExceeded: 'upload_account_quota_exceeded',
    uploadGlobalQuotaExceeded: 'upload_global_quota_exceeded',
    uploadQuotaUnavailable: 'upload_quota_unavailable',
    sharedRateLimitStoreRequired: 'shared_rate_limit_store_required'
  }),
  passphraseLengthInvalid: '登录口令须为 12 至 128 个字符',
  uploadAccountQuotaExceeded: '当前账号的待提交文件过多，请完成提交或稍后再试',
  uploadGlobalQuotaExceeded: '当前待提交文件较多，请稍后再试',
  uploadQuotaBusy: '文件上传服务繁忙，请稍后再试',
  uploadQuotaUnavailable: '文件暂时无法上传，请稍后再试',
  rateLimitUnavailable: '当前操作暂不可用，请稍后再试'
});
