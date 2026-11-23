// 服务端建议只预填草稿；查看窗口不写入资料，用户仍需预检并确认应用。
const displayCopy = require('../../../../../locales/zh-CN/hrTemplateFieldDisplay');

function buildSwitchSources(sourceFields, targetFields, emptyLabel, formatSuggestion) {
  const drafts = sourceFields.map((source) => {
    const targetOptions = [{ id: '', label: emptyLabel, displayLabel: emptyLabel }].concat(targetFields.filter((target) =>
      (source.compatibleTargetIds || []).indexOf(target.id) >= 0).map((target) => Object.assign({}, target, {
      displayLabel: displayCopy.targetLabel(target.label, displayCopy.types[target.type] || displayCopy.unknownType)
    })));
    const incompatible = targetOptions.length === 1;
    const sameNameTargets = targetFields.filter((target) => String(target.label || '').trim().toLowerCase()
      === String(source.label || '').trim().toLowerCase());
    const sameNameTarget = sameNameTargets.length === 1 && targetOptions.some((target) => target.id === sameNameTargets[0].id)
      ? sameNameTargets[0] : null;
    const suggestedIndex = targetOptions.findIndex((target) => target.id && target.id === source.suggestedTargetId);
    const sameNameIndex = sameNameTarget ? targetOptions.findIndex((target) => target.id === sameNameTarget.id) : 0;
    const recommendedIndex = suggestedIndex > 0 ? suggestedIndex : (sameNameIndex > 0 ? sameNameIndex : 0);
    return {
      source,
      typeLabel: displayCopy.types[source.type] || displayCopy.unknownType,
      incompatible,
      changedTarget: sameNameTarget && sameNameTarget.type !== source.type ? sameNameTarget : null,
      recommendedIndex,
      targetOptions,
      targetTemplateFieldId: ''
    };
  });

  const claims = new Map();
  drafts.forEach((draft) => {
    if (draft.recommendedIndex > 0) {
      const targetId = draft.targetOptions[draft.recommendedIndex].id;
      claims.set(targetId, (claims.get(targetId) || 0) + 1);
    }
  });

  return drafts.map((draft) => {
    const targetId = draft.recommendedIndex > 0 ? draft.targetOptions[draft.recommendedIndex].id : '';
    const defaultMove = !draft.incompatible && draft.recommendedIndex > 0 && claims.get(targetId) === 1;
    const targetIndex = defaultMove ? draft.recommendedIndex : 0;
    const target = targetIndex > 0 ? draft.targetOptions[targetIndex] : null;
    const changedType = draft.changedTarget
      ? displayCopy.types[draft.changedTarget.type] || displayCopy.unknownType : '';
    return Object.assign({}, draft.source, {
      typeLabel: draft.typeLabel,
      incompatible: draft.incompatible,
      moveToNew: defaultMove,
      moveToNewBeforeDelete: defaultMove,
      markForDelete: false,
      recommendedIndex: draft.recommendedIndex,
      action: defaultMove ? 'map' : 'hide',
      actionIndex: defaultMove ? 1 : 0,
      targetTemplateFieldId: target ? target.id : '',
      targetIndex,
      targetOptions: draft.targetOptions,
      suggestionText: draft.incompatible
        ? displayCopy.noCompatibleTarget
        : (draft.changedTarget
          ? (defaultMove
            ? displayCopy.typeAutoMapped(draft.changedTarget.label, changedType)
            : displayCopy.typeChanged(draft.changedTarget.label, changedType))
          : (targetIndex > 0 ? formatSuggestion(draft.targetOptions[targetIndex].label) : ''))
    });
  });
}

module.exports = { buildSwitchSources };
