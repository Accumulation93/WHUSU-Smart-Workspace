'use strict';
module.exports = {
  deletionCleanup: '印章岗位授权',
  configure: '配置可用岗位', title: '选择印章可用岗位',
  scope: '选择可以使用印章的具体岗位；同一个人的其他岗位不会同时获得授权。',
  empty: '尚未配置可用岗位', legacy: '原有类别授权已停用，请重新选择可用岗位。',
  inactive: '已失效', loadingFailed: '印章加载失败，请重试', candidatesFailed: '可用岗位加载失败，请重试',
  saveFailed: '可用岗位未能保存，请重试', saved: '可用岗位已保存', retry: '重新加载',
  invalidRemoved: '以下岗位已失效，不能继续使用印章。确认后将移除这些岗位的印章授权。',
  imageUnsupported: '图片格式不支持，请上传 PNG、JPG、WebP、GIF 或 BMP 格式的印章图片。',
  imageReading: '正在读取印章图片',
  imageUnsupportedToast: '格式不支持',
  imageTooLarge: '印章图片超过 2 MiB，请压缩或裁剪后重新上传。',
  imageTooLargeToast: '图片过大',
  imageReadFailed: '图片读取失败，请重新选择。',
  imageReadFailedToast: '读取失败',
  count: count => '已授权 ' + count + ' 个岗位', editorContext: name => '印章：' + name
};
