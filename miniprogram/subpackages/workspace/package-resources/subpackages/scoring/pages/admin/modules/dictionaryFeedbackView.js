'use strict';

const personnelCopy = require('../../../../../locales/zh-CN/adminPersonnel');

function normalizeUsageItems(usages) {
  const labels = personnelCopy.dictionaryUsageCategories;
  return (Array.isArray(usages) ? usages : []).map((usage) => {
    const category = String(usage && usage.category || '').trim();
    const count = Math.max(0, Number(usage && usage.count) || 0);
    return {
      category,
      label: labels[category] || labels.unknown,
      count,
      countText: personnelCopy.dictionaryUsageCount(count)
    };
  }).filter((usage) => usage.count > 0);
}

module.exports = {
  normalizeUsageItems
};
