'use strict';

// 将已经获准展示的条件引用解析为事实；不生成句子，也不公开未解析编号。
function conditionFacts(conditions, maps) {
  const source = maps || {};
  function names(value, directory) {
    const ids = Array.isArray(value) ? value : String(value || '').split(',');
    const keys = ids.map(id => String(id).trim()).filter(Boolean);
    const found = keys.map(id => directory && directory[id]).filter(value => typeof value === 'string' && value);
    return { values: found, unresolved: keys.length !== found.length };
  }
  return (Array.isArray(conditions) ? conditions : []).map(condition => {
    const item = condition || {};
    const people = names(item.personHrIds, source.hrMap);
    const departments = names(item.specificDepartmentId, source.deptMap);
    const identities = names(item.specificIdentityId, source.identityMap);
    const groups = names(item.specificWorkGroupId, source.wgMap);
    const natureIds = item.natureIds == null ? null : Array.isArray(item.natureIds) ? item.natureIds : [];
    const natures = names(natureIds, source.natureMap);
    return {
      natureIds,
      natureNames: natures.values,
      conditionType: String(item.conditionType || ''),
      personNames: people.values,
      departmentScope: String(item.departmentScope || ''),
      departmentNames: departments.values,
      identityScope: String(item.identityScope || ''),
      identityNames: identities.values,
      workGroupScope: String(item.workGroupScope || ''),
      workGroupNames: groups.values,
      unresolved: people.unresolved || departments.unresolved || identities.unresolved || groups.unresolved || natures.unresolved || (natureIds !== null && !natureIds.length)
    };
  });
}

module.exports = { conditionFacts };
