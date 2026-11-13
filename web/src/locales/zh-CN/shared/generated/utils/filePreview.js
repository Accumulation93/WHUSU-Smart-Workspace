// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

const sharedModule = Object.freeze({
  copy_03d69a9d28: '请重新选择文件',
  copy_0c28c344e7: '未命名文件',
  copy_2f0c925c1b: '请切换到有权查看该文件的工作角色',
  copy_4a80a9d00d: '请选择有效文件',
  copy_535998c496: '请重新打开文件',
  copy_8807a41511: '文件暂时无法打开，请稍后重试',
  copy_8efe5e6dfd: '请检查网络后重试',
  copy_9f1e38ec09: '文件已失效',
  copy_b10d64a68c: '登录已失效，请重新登录',
  copy_b8ede9c6ec: '未取得文件内容，请返回后重新打开',
  copy_fc99c4cc7b: '正在加载文件',
  copy_fee4566726: '文件信息',
  fileIntegrityFailure: '文件内容校验失败，暂时无法打开',
  fileWriteFailed: (name, size) => `文件未能准备好，暂时无法预览或保存。请重试。\n\n文件名：${name}\n文件大小：${size}`,
  fileSizeUnknown: '暂未确认'
});

export default sharedModule;
