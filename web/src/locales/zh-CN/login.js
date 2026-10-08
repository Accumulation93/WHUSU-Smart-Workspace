/**
 * 登录页文案。
 *
 * 取值照抄小程序 miniprogram/locales/zh-CN/main.js 的 login 对象；
 * 小程序登录页以微信为默认入口，网页端只保留口令登录，因此标题与说明
 * 使用小程序里"口令登录"那一支的原话（passwordLogin / passwordNote）。
 */
export default Object.freeze({
  navigationTitle: '登录 - WHUSU智慧工作台',
  appName: 'WHUSU智慧工作台',
  organizationName: '武汉大学学生会',
  title: '口令登录',
  subtitle: '登录后选择组织与工作角色',
  formTitle: '登录',
  formHint: '使用已设置的口令登录',
  studentIdLabel: '学号',
  studentIdPlaceholder: '请输入学号',
  passphraseLabel: '口令',
  passphrasePlaceholder: '请输入口令',
  submit: '登录',
  submitting: '登录',
  missingStudentId: '请输入学号',
  missingPassphrase: '请输入口令',
  passwordRequired: '请输入学号和口令',
  failed: '登录信息不正确',
  frozen: '账号已被冻结，登录后可查看处理方式',
  unavailable: '暂时无法登录',
  expiredNotice: '请重新登录'
});
