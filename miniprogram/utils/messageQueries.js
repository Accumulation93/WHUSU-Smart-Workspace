'use strict';
const orgSession = require('./orgSession');
const entries = new Map();
let owner = '';
let generation = 0;

function invalidate() { generation += 1; entries.clear(); }

function load(name, data) {
  data = data || {};
  const snapshot = orgSession.getSnapshot();
  const currentOwner = JSON.stringify([snapshot.token, snapshot.orgId, snapshot.contextId, snapshot.role, snapshot.version]);
  if (owner !== currentOwner) { invalidate(); owner = currentOwner; }
  const query = Object.assign({}, data);
  delete query.refresh;
  const key = name + ':' + JSON.stringify(query);
  const now = Date.now();
  const existing = entries.get(key);
  if (existing && (existing.pending || (!data.refresh && existing.expiresAt > now))) {
    return existing.promise.then(value => JSON.parse(JSON.stringify(value)));
  }
  const version = generation;
  const entry = { pending: true, expiresAt: now + 5000 };
  entry.promise = require('./api').callFunction({ name: name, data: data }).then(function(result) {
    entry.pending = false;
    if (version !== generation || !orgSession.isCurrent(snapshot) || result.status !== 'success' || result.partial) {
      if (entries.get(key) === entry) entries.delete(key);
    }
    return result;
  }, function(error) {
    if (entries.get(key) === entry) entries.delete(key);
    throw error;
  });
  if (entries.size >= 32) entries.delete(entries.keys().next().value);
  entries.set(key, entry);
  return entry.promise.then(value => JSON.parse(JSON.stringify(value)));
}

module.exports = { load: load, invalidate: invalidate };
