'use strict';
module.exports = {
  deletionCleanup: '印章使用授权',
  configure: '设置印章使用范围', title: '选择可以用章的工作角色',
  scope: '只有选中的工作角色可以使用此印章。同一个人的其他工作角色需另行授权。',
  empty: '尚未选择可以用章的工作角色', legacy: '原先按身份类别的授权已停用。请重新选择可以用章的工作角色。',
  inactive: '已失效', loadingFailed: '印章加载失败，请重试', candidatesFailed: '未能加载可授权的工作角色，请重试。',
  saveFailed: '用章授权未能保存，请重试。', saved: '用章授权已保存', retry: '重新加载',
  invalidRemoved: '以下工作角色已失效。确认后将移除它们的用章授权。',
  imageUnsupported: '图片格式不支持，请上传 PNG、JPG、WebP、GIF 或 BMP 格式的印章图片。',
  imageReading: '正在读取印章图片',
  imageUnsupportedToast: '格式不支持',
  imageTooLarge: '印章图片超过 2 MiB，请压缩或裁剪后重新上传。',
  imageTooLargeToast: '图片过大',
  imageReadFailed: '图片读取失败，请重新选择',
  imageReadFailedToast: '读取失败',
  count: count => `已授权 ${count} 个工作角色`, editorContext: name => `印章：${name}`
};
