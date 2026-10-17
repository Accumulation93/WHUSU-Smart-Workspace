// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write

const sharedModule = Object.freeze({
  input: '选择文件来源', output: '选择文件操作', choose: '选择文件',
  chat: '微信聊天文件', album: '相册', camera: '拍照', browse: '浏览本地文件',
  preview: '预览文件', share: '转发微信', systemShare: '系统分享', save: '保存到本地',
  cancel: '取消', unavailable: '当前设备不支持此方式', failed: '文件操作失败，请重试',
  invalid: '文件格式、大小或数量不符合要求', downloadStarted: '已发起下载',
  previewUnavailable: '此文件格式不支持直接预览，请选择保存后打开'
});

export default sharedModule;
