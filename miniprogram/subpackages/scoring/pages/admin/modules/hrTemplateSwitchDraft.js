// 服务端建议只预填草稿；查看窗口不写入资料，用户仍需预检并确认应用。
const displayCopy = require('../../../../../locales/zh-CN/hrTemplateFieldDisplay');

function buildSwitchSources(sourceFields, targetFields, emptyLabel, formatSuggestion) {
  const claims = new Map();
  sourceFields.forEach((source) => {
    const id = source.suggestedTargetId;
    if (id) claims.set(id, (claims.get(id) || 0) + 1);
  });
  return sourceFields.map((source) => {
    const targetOptions = [{ id: '', label: emptyLabel, displayLabel: emptyLabel }].concat(targetFields.filter((target) =>
      (source.compatibleTargetIds || []).indexOf(target.id) >= 0).map((target) => Object.assign({}, target, {
      displayLabel: displayCopy.targetLabel(target.label, displayCopy.types[target.type] || displayCopy.unknownType)
    })));
    const sameNameTargets = targetFields.filter((target) => String(target.label || '').trim().toLowerCase()
      === String(source.label || '').trim().toLowerCase());
    const changedTarget = sameNameTargets.length === 1 && sameNameTargets[0].type !== source.type
      && targetOptions.some((target) => target.id === sameNameTargets[0].id) ? sameNameTargets[0] : null;
    const suggestedIndex = targetOptions.findIndex((target) => target.id === source.suggestedTargetId
      && target.id && target.type === source.type);
    const suggestedTarget = suggestedIndex > 0 ? targetOptions[suggestedIndex] : null;
    const exactLegacy = suggestedTarget && String(source.label || '').trim().toLowerCase()
      === String(suggestedTarget.label || '').trim().toLowerCase();
    const canDefault = source.suggestedDefault === true || (source.suggestedDefault == null && exactLegacy);
    const targetIndex = suggestedIndex > 0 && canDefault
      && claims.get(source.suggestedTargetId) === 1 ? suggestedIndex : 0;
    return Object.assign({}, source, {
      typeLabel: displayCopy.types[source.type] || displayCopy.unknownType,
      action: targetIndex ? 'map' : 'hide',
      actionIndex: targetIndex ? 1 : 0,
      targetTemplateFieldId: targetOptions[targetIndex].id,
      targetIndex,
      targetOptions,
      suggestionText: changedTarget && !targetIndex
        ? displayCopy.typeChanged(changedTarget.label, displayCopy.types[changedTarget.type] || displayCopy.unknownType)
        : (suggestedIndex > 0 ? formatSuggestion(targetOptions[suggestedIndex].label) : '')
    });
  });
}

module.exports = { buildSwitchSources };
