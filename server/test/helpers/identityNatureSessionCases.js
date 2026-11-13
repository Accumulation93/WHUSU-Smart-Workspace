'use strict';

const assert = require('node:assert/strict');

module.exports = async function identityNatureSessionCases(connection) {
  const identity = require('../../src/core/models/unifiedIdentity');
  const authorization = require('../../src/core/models/authorizationIdentity');
  const org = 'nature-session-org';
  const person = 'nature-session-person';
  const account = 'nature-session-account';
  const membership = 'nature-session-membership';
  const category = 'nature-session-category';
  const department = 'nature-session-department';
  await connection.query('INSERT INTO organizations(id,name) VALUES (?,?)', [org, org]);
  await connection.query('INSERT INTO identity_nature_rollouts(org_id,enabled) VALUES (?,1)', [org]);
  await connection.query('INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES (?,?,?,?)', [person, person, person, person]);
  await connection.query('INSERT INTO accounts(id,person_id) VALUES (?,?)', [account, person]);
  await connection.query('INSERT INTO hr_info(id,name,student_id,org_id) VALUES (?,?,?,?)', ['nature-session-hr', person, person, org]);
  await connection.query('INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES (?,?,?,?)', [membership, person, org, 'nature-session-hr']);
  await connection.query('INSERT INTO departments(id,name,org_id) VALUES (?,?,?)', [department, department, org]);
  await connection.query('INSERT INTO identities(id,name,org_id) VALUES (?,?,?)', [category, category, org]);
  await connection.query('INSERT INTO assignment_natures(org_id,id,name) VALUES (?,?,?),(?,?,?)', [org, 'staff', 'staff', org, 'liaison', 'liaison']);
  await connection.query('INSERT INTO identity_nature_links(org_id,identity_id,nature_id) VALUES (?,?,?),(?,?,?)', [org, category, 'staff', org, category, 'liaison']);
  await connection.query(`INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id,status)
    VALUES (?,?,?,?,?,?,?),(?,?,?,?,?,?,?),(?,?,?,?,?,?,?)`, [
    'nature-session-staff', membership, org, 'staff', department, category, 'active',
    'nature-session-liaison', membership, org, 'liaison', department, category, 'active',
    'nature-session-inactive', membership, org, 'staff', department, category, 'inactive'
  ]);
  await connection.query('INSERT INTO admin_grants(id,person_id,org_id,admin_level) VALUES (?,?,?,?)', ['nature-session-admin', person, org, 'admin']);
  const contexts = () => identity.listContexts(account, connection);
  const before = await contexts();
  assert.equal(before.filter(item => item.identityType === 'assignment').length, 2);
  assert.equal(before.filter(item => item.identityType === 'membership').length, 0);
  const selected = before.find(item => item.assignmentId === 'nature-session-staff');
  await connection.query(`INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,
    organization_id,role,token_version,binding_mode,expires_at) VALUES (?,?,?,?,?,?,?,?,1,'temporary',UTC_TIMESTAMP()+INTERVAL 1 DAY)`,
  ['nature-session', account, '', selected.contextId, 'assignment', selected.assignmentId, org, 'user']);
  const reference = { accountId: account, personId: person, sessionId: 'nature-session', contextId: selected.contextId, organizationId: org };
  assert.equal((await identity.loadSession('nature-session')).context.assignmentId, selected.assignmentId);
  assert.equal((await authorization.loadActor(connection, reference)).assignment.id, selected.assignmentId);

  await connection.query('DELETE FROM identity_nature_links WHERE org_id=? AND identity_id=? AND nature_id=?', [org, category, 'staff']);
  assert.equal(await identity.loadSession('nature-session'), null);
  assert.equal(await authorization.loadActor(connection, reference), null);
  const partiallyAvailable = await contexts();
  assert.deepEqual(partiallyAvailable.filter(item => item.identityType === 'assignment').map(item => item.assignmentId), ['nature-session-liaison']);
  assert.equal(partiallyAvailable.filter(item => item.identityType === 'admin').length, 1);
  await connection.beginTransaction();
  try {
    await assert.rejects(identity.lockActiveBusinessSubjects(connection, [{ personId: person, organizationId: org, assignmentId: selected.assignmentId }]), { code: 'assignment_not_found' });
  } finally { await connection.rollback(); }

  await connection.query('DELETE FROM identity_nature_links WHERE org_id=? AND identity_id=?', [org, category]);
  const pending = await contexts();
  assert.equal(pending.filter(item => item.identityType === 'assignment').length, 0);
  assert.equal(pending.filter(item => item.identityType === 'membership').length, 1);
  assert.equal(pending.filter(item => item.identityType === 'admin').length, 1);
  const membershipContext = pending.find(item => item.identityType === 'membership');
  await connection.query('UPDATE auth_sessions SET context_id=?,context_type=?,context_subject_id=? WHERE id=?',
    [membershipContext.contextId, 'membership', membership, 'nature-session']);
  const membershipActor = await authorization.loadActor(connection, { ...reference, contextId: membershipContext.contextId });
  assert.equal(membershipActor.assignment, null);
  assert.equal(membershipActor.isSuper, false);

  await connection.query('INSERT INTO identity_nature_links(org_id,identity_id,nature_id) VALUES (?,?,?)', [org, category, 'staff']);
  const recovered = await contexts();
  assert.deepEqual(recovered.filter(item => item.identityType === 'assignment').map(item => item.assignmentId), ['nature-session-staff']);
  assert.equal(await identity.loadSession('nature-session'), null);
  const [rows] = await connection.query('SELECT id,status FROM membership_assignments WHERE org_id=? ORDER BY id', [org]);
  assert.equal(rows.length, 3);
  assert.equal(rows.find(item => item.id === 'nature-session-inactive').status, 'inactive');
  await connection.query("UPDATE accounts SET status='frozen' WHERE id=?", [account]);
  assert.deepEqual(await contexts(), []);
};
