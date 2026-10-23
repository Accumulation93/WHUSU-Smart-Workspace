// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';
const sharedModule = Object.freeze({
  either: '签名或盖章', eitherRequired: '请至少添加签名或印章',
  signedOrStamped: '已签名或盖章',
  originalRequired: '无法读取签署前原件，请编辑申请并重新上传附件后提交。',
  title: '签署文件', padTitle: '手写签名', browse: '浏览', move: '移动', pen: '画笔',
  erase: '橡皮擦', undo: '撤销', redo: '重做', clear: '清空书写',
  black: '黑色', blue: '蓝色', red: '红色', custom: '自定义颜色', color: '笔迹颜色',
  hex: '颜色值', redChannel: '红', greenChannel: '绿', blueChannel: '蓝',
  thin: '细', medium: '中', thick: '粗', width: '笔宽', eraserWidth: '橡皮擦大小',
  fit: '适合页面', zoomIn: '放大', zoomOut: '缩小', page: '页码',
  objects: '签名与印章', signature: '签名', stamp: '印章', addInk: '直接书写',
  confirm: '确认并返回', cancel: '取消', retry: '重新加载', loading: '正在加载文件',
  failed: '文件加载失败，请重试', stale: '该步骤已变化，请返回查看',
  empty: '请先写下内容', clearTitle: '清空本步骤书写', clearBody: '清空当前附件本步骤的书写？文件正文和已有签章会保留。',
  unavailable: '当前文件暂不支持直接签署', exportFailed: '书写图片生成失败，请重试',
  tooLarge: '书写图片不能超过 2MB，请减少书写内容',
  stampLoading: '正在加载可用印章', stampEmpty: '暂无可用印章', stampFailed: '印章加载失败，请重试',
  imageLoading: '正在加载印章图片', imageFailed: '印章图片加载失败，请重试',
  processing: '处理中', future: '未到达', stopped: '已终止', withdrawn: '已撤回',
  roundTitle: '第 {0} 轮', roundStates: { approved: '已通过', rejected: '已驳回', withdrawn: '已撤回', in_progress: '处理中', pending: '待提交', draft: '草稿', stopped: '已终止' },
  layers: '图层', stroke: '笔迹', layerUp: '上移一层', layerDown: '下移一层',
  history: '撤回前记录', showHistory: '查看撤回前记录', hideHistory: '收起历史记录',
  actorUnknown: '历史处理人未记录', assignmentUnknown: '历史岗位信息缺失',
  details: '详细检查', digest: '技术信息', certificates: '证书信息', summary: '验证结果',
  back: '返回', size: '大小', rotation: '旋转', pendingRead: '操作已完成，请重新加载结果',
  colorInvalid: '请输入六位颜色值', signAgain: '继续书写', remove: '移除',
  draftLost: '书写草稿已失效，请重新打开签署页面',
  saveTemplate: '保存签名', rewrite: '重新书写', signatureLoading: '正在加载个人签名',
  newSignature: '新建签名', saveToLibrary: '同时保存到签名库', recolor: '修改所选签名颜色',
  signatureFailed: '个人签名加载失败，请重试', signatureEmpty: '暂无个人签名',
  sourceFailure: '文件来源核实失败', externalFailure: '第三方认可核实失败', more: '加载更多'
});

export default sharedModule;
