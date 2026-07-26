const { safeString } = require('../../utils/helpers');

const QUERY_CHUNK_SIZE = 500;

function splitIntoChunks(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeHrRows(rows) {
  return (rows || []).map((item) => ({
    id: safeString(item.id),
    name: safeString(item.name),
    studentId: safeString(item.student_id || item.studentId)
  })).filter((item) => item.id);
}

async function resolveHrBindingStates(rows, orgId, model) {
  const bindingModel = model || require('../models/userInfo');
  const normalizedRows = normalizeHrRows(rows);
  const states = new Map();
  if (!normalizedRows.length || !orgId) return states;

  normalizedRows.forEach((item) => {
    states.set(item.id, {
      status: 'unbound',
      userInfoId: '',
      boundOpenid: ''
    });
  });

  const hrIds = normalizedRows.map((item) => item.id);
  for (const idChunk of splitIntoChunks(hrIds, QUERY_CHUNK_SIZE)) {
    const bindings = await bindingModel.listByHrIdsInOrg(idChunk, orgId);
    bindings.forEach((binding) => {
      const hrId = safeString(binding.hr_id);
      if (!states.has(hrId)) return;
      states.set(hrId, {
        status: 'bound',
        userInfoId: safeString(binding.id),
        boundOpenid: safeString(binding.openid)
      });
    });
  }

  const unboundRows = normalizedRows.filter((item) => {
    const state = states.get(item.id);
    return state && state.status === 'unbound' && item.studentId && item.name;
  });
  const studentIds = [...new Set(unboundRows.map((item) => item.studentId))];
  const externallyBoundIdentityKeys = new Set();

  for (const studentIdChunk of splitIntoChunks(studentIds, QUERY_CHUNK_SIZE)) {
    const externalBindings = await bindingModel.listBoundIdentitiesOutsideOrg(studentIdChunk, orgId);
    externalBindings.forEach((binding) => {
      const studentId = safeString(binding.student_id);
      const name = safeString(binding.name);
      if (studentId && name) externallyBoundIdentityKeys.add(`${studentId}\u0000${name}`);
    });
  }

  unboundRows.forEach((item) => {
    if (!externallyBoundIdentityKeys.has(`${item.studentId}\u0000${item.name}`)) return;
    states.set(item.id, {
      status: 'pending_activation',
      userInfoId: '',
      boundOpenid: ''
    });
  });

  return states;
}

module.exports = {
  resolveHrBindingStates
};
