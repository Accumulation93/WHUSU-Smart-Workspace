'use strict';
module.exports = {
  deletionCleanup: '印章岗位授权',
  configure: '配置可用人', title: '选择印章可用岗位',
  scope: '仅当前组织使用。按部门、身份类别或职能组筛选后，选择具体人员岗位；其他岗位不能使用。',
  empty: '尚未配置可用人，暂无人可用', legacy: '旧类别授权已停用，请重新选择人员岗位',
  inactive: '已失效', loadingFailed: '印章加载失败，请重试', candidatesFailed: '可用岗位加载失败，请重试',
  saveFailed: '可用人保存失败，请重试', saved: '可用人已保存', retry: '重新加载',
  invalidRemoved: '已失效的岗位不会继续授权。确认后将移除这些岗位。',
  imageUnsupported: '图片格式不支持，请上传 PNG、JPG、WebP、GIF 或 BMP 格式的印章图片。',
  imageUnsupportedToast: '格式不支持',
  imageTooLarge: '印章图片不能超过 2MB，请压缩或裁剪后重新上传。',
  imageTooLargeToast: '图片过大',
  imageReadFailed: '图片读取失败，请重新选择。',
  imageReadFailedToast: '读取失败',
  count: count => '已授权 ' + count + ' 个岗位', editorContext: name => '印章：' + name
};
