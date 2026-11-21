'use strict';

module.exports = {
  notificationTitle: '考核结果已公示',
  notificationDescription: '「{0}」的考核结果已公示。',
  notPublished: '考核结果尚未公示',
  noViewPermission: '无权查看考核结果',
  ownScope: '仅查看本人考核结果',
  awardSelection: {
    savedCount: '已指定 {saved} 人',
    savedOverCount: '超出名额 {extra} 人',
    selectMore: '请再选 {missing} 人。',
    selectFewer: '请取消选择 {extra} 人。',
    saveTooFew: '本组需指定 {required} 人，请再选 {missing} 人。',
    saveTooMany: '本组需指定 {required} 人，请取消选择 {extra} 人。',
    saveOverMaximum: '本组最多指定 {required} 人，请取消选择 {extra} 人。',
    saveAlreadyAssigned: '所选成员中有人已在其他组，请取消重复选择。',
    saveCandidateChanged: '部分所选成员已不符合评优条件，请重新选择。',
    saveRulesChanged: '评优规则已更新，请重新加载名单后再选择。',
    savePublicationClosed: '这份评优名单已关闭，暂时无法修改。',
    saveNoPermission: '当前岗位无权修改这份评优名单。',
    saveFailed: '评优名单未能保存，请重试。',
    saveResultUnknown: '无法确认名单是否已保存，请先重新加载。',
    savedListDiffers: '重新加载的名单与本次选择不同，请核对后再保存。',
    savedNotRefreshed: '名单已保存，暂未刷新，请重新加载。'
  }
};
