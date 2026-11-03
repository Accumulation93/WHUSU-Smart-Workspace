'use strict';

/**
 * 登录子应用的用户可见文案（共享语言库，唯一来源）。
 *
 * 小程序与网页都从这里取文案：网页侧由 scripts/sync-shared-modules.js 生成 ES 模块副本，
 * 小程序侧生成同名 CommonJS 副本，副本不一致时检查直接失败。
 * 修改文案只能改本文件，改完运行 node scripts/sync-shared-modules.js --write。
 */

const common = require('./common');

module.exports = Object.freeze({
  navigationTitle: '登录 - WHUSU智慧工作台',
  messages: Object.freeze({
    pageOpenFailed: '页面打开失败，请重试',
    passwordRequired: '请输入学号和口令',
    passwordStudentIdRequired: '请输入学号',
    passwordPassphraseRequired: '请输入口令',
    loginInvalid: '登录信息不正确',
    relogin: '登录已失效，请重新登录',
    loginUnavailable: '暂时无法登录',
    profileRequired: '请选择组织，并填写姓名和学号',
    submitFailed: '提交失败，请重试',
    verificationRequired: '请输入个人认证码',
    verificationInvalid: '认证码未通过验证，请检查后重试',
    recoveryRequired: '请输入恢复码或恢复口令',
    recoveryInvalid: '恢复信息未通过验证，请检查后重试',
    recoveryCode: '账号恢复码',
    recoveryPassphrase: '恢复口令'
  }),
  view: Object.freeze({
    appName: common.brandName,
    organizationName: common.organizationName,
    wechatLogin: '微信登录',
    loginSubtitle: '登录后进入工作台，可切换组织与工作角色',
    loginHint: '登录提示',
    loginTitle: '登录',
    useOwnWechat: '请使用本人微信登录',
    passwordLogin: '口令登录',
    titleVerify: '输入个人认证码',
    titleRecoveryVerify: '验证恢复信息',
    titleRecoveryRotated: '妥善保管新恢复码',
    titleRecoveryPending: '等待管理员审核',
    titleRecovery: '更换微信',
    titleClaim: '身份认证',
    closeWithIcon: '关闭',
    recoveryStartNote: '提交后，系统会显示当前可用的恢复方式；无法自助恢复时，可等待管理员审核。',
    claimStartNote: '选择组织并填写姓名、学号，再输入管理员提供的个人认证码。',
    organization: '所属组织',
    chooseOrganization: '请选择组织',
    name: '姓名',
    namePlaceholder: '请输入姓名',
    studentId: '学号',
    studentIdPlaceholder: '请输入学号',
    continueAction: '继续',
    claimUnavailable: '暂未开放认证',
    submitRecovery: '提交恢复请求',
    changeWechat: '更换微信',
    backToClaim: '返回身份认证',
    passwordNote: '使用已设置的口令登录',
    passphrase: '口令',
    passphrasePlaceholder: '请输入口令',
    loginAction: '登录',
    titlePasswordBinding: '绑定当前微信',
    passwordBindingNote: '已通过口令登录。是否为该账号绑定当前微信，方便下次登录？也可以跳过。',
    passwordBindingBlockedNote: '当前微信已绑定其他账号，无法绑定。你仍可使用已登录的账号进入工作台。',
    bindPasswordWechat: '绑定当前微信',
    skipPasswordBinding: '暂不绑定',
    enterAfterTemporaryLogin: '进入工作台',
    backToWechat: '返回微信登录',
    verificationNote: '请向所属组织的管理员获取个人认证码，并在有效期内使用。',
    verificationCode: '个人认证码',
    verificationPlaceholder: '请输入 12 位认证码',
    finishClaim: '完成身份认证',
    backToProfile: '返回修改信息',
    recoveryNote: '没有可用的恢复方式时，请等待管理员审核。审核通过后，再用当前微信登录。',
    recoveryMethod: '恢复方式',
    recoveryPlaceholder: '请输入恢复码或恢复口令',
    confirmWechatChange: '确认更换微信',
    waitForReview: '等待管理员审核',
    rotatedRecoveryNote: '请保存新的恢复码。关闭后不再显示。',
    copyRecoveryCode: '复制恢复码',
    finish: '完成',
    recoveryPendingNote: '恢复申请已提交。请等待管理员审核，审核通过后用当前微信重新登录。',
    close: common.actions.close
  })
});
