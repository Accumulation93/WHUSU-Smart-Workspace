// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

const sharedModule = Object.freeze({
  choose: '选择',
  cancelSelection: '取消',
  close: '关闭',
  confirm: '确认',
  retry: '重试',
  selectedTitle: '已选工作角色',
  selectedPersonTitle: '已选人员',
  expandSelected: '展开',
  collapseSelected: '收起',
  candidateTitle: '可选工作角色',
  candidatePersonTitle: '可选人员',
  department: '部门',
  identity: '身份类别',
  workGroup: '职能组',
  all: '全部',
  searchPlaceholder: '搜索姓名或工作角色',
  loading: '正在加载候选人员…',
  empty: '暂无可选人员',
  noMatch: '没有符合筛选条件的人员',
  noSelection: '尚未选择；确认后将清空原有选择。',
  loadingAssignments: '正在加载可选工作角色',
  emptyAssignments: '暂无可选的工作角色',
  noMatchingAssignments: '没有工作角色符合筛选条件',
  unnamed: '未命名人员',
  assignmentUnavailable: '暂时无法获取工作角色信息',
  selectedPeopleCount: function(count) {
    return '已选 ' + Number(count || 0) + ' 人';
  },
  selectedAssignmentCount: function(count) {
    return '已选 ' + Number(count || 0) + ' 个工作角色';
  },
  selectedCount: function(count) {
    return '已选 ' + Number(count || 0) + ' 项';
  }
});

export default sharedModule;
