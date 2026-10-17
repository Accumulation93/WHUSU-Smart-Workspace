// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write

const sharedModule = Object.freeze({
  input: '选择文件来源', output: '选择文件操作', choose: '选择文件',
  chat: '微信聊天文件', album: '相册', camera: '拍照', browse: '浏览本地文件',
  preview: '预览文件', share: '转发微信', systemShare: '系统分享', save: '保存到本地',
  cancel: '取消', unavailable: '当前设备不支持此方式', failed: '文件操作失败，请重试',
  invalid: '文件格式、大小或数量不符合要求', downloadStarted: '已发起下载',
  previewUnavailable: '此文件格式不支持直接预览，请选择保存后打开',
  openMenu: '打开菜单',
  documentMenuHint: '当前微信不支持直接另存为。可打开文档，在右上角菜单中使用当前设备提供的保存或其他应用打开选项；若菜单没有这些选项，则此设备暂不可用。'
});

export default sharedModule;
