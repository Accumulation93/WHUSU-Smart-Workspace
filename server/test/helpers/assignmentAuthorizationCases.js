'use strict';

const assert = require('node:assert/strict');
const express = require('express');

module.exports = async function assignmentAuthorizationCases(db) {
  const context = (await require('../../src/core/models/unifiedIdentity').listContexts('dir-account', db))
    .find(item => item.assignmentId === 'dir-assignment');
  await db.query(`INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES ('job-target','岗位测试','JOB-TARGET','JOB-TARGET');
    INSERT INTO hr_info(id,name,student_id,org_id) VALUES ('job-target-hr','岗位测试','JOB-TARGET','dir-auth');
    INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES ('job-target-member','job-target','dir-auth','job-target-hr');
    INSERT INTO departments(id,name,org_id) VALUES ('job-other-dept','其他部门','dir-auth');
    INSERT INTO identities(id,name,org_id) VALUES ('job-other-identity','其他身份','dir-auth')`);
  const app = express(); app.use(express.json());
  app.use((req, res, next) => {
    req.authAccount = { id: 'dir-account', personId: 'dir-person' };
    req.authContext = context; req.authSession = { id: 'venue-review-session' };
    req.logger = { error(message, detail) { throw new Error(message + ':' + JSON.stringify(detail)); } };
    require('../../src/utils/orgContext').orgStorage.run('dir-auth', next);
  });
  app.use('/api', require('../../src/middleware/adminPermission').adminPermissionMiddleware);
  app.use('/api', (req, _res, next) => {
    if (req.path === '/listPersonIdentities') assert(req.unifiedAuthorization, '岗位回读必须经过新授权入口');
    next();
  });
  app.use('/api', require('../../src/core/routes/hr'));
  app.use('/api', require('../../src/core/routes/authorization'));
  const listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  async function call(name, body) {
    return (await fetch('http://127.0.0.1:' + listener.address().port + '/api/' + name, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    })).json();
  }
  const policy = { id: 'assignment-maintenance', organizationId: 'dir-auth', effect: 'allow', enabled: true,
    subjects: [{ kind: 'assignments', ids: ['dir-assignment'] }],
    capabilities: ['hr.assignments.create', 'hr.assignments.update', 'hr.assignments.delete'],
    scopes: [{ kind: 'assignmentScope', dimensions: { departmentId: ['dir-department'] } }], fields: null };
  const input = { hrId: 'job-target-hr', organizationId: 'dir-auth', assignmentNature: 'staff',
    departmentId: 'dir-department', identityCategoryId: 'dir-identity', workGroupId: '' };
  try {
    assert.equal((await call('saveMembershipAssignment', input)).status, 'forbidden');
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('assignment-maintenance','dir-auth','指定部门岗位维护',?)", [JSON.stringify(policy)]);
    const created = await call('saveMembershipAssignment', input);
    assert.equal(created.status, 'success', JSON.stringify(created));
    const id = created.id;
    assert.equal((await db.query('SELECT department_id FROM membership_assignments WHERE id=?', [id]))[0][0].department_id, 'dir-department');
    const changed = await call('saveMembershipAssignment', { ...input, id, identityCategoryId: 'job-other-identity' });
    assert.equal(changed.status, 'success', JSON.stringify(changed));
    assert.equal((await db.query('SELECT identity_id FROM membership_assignments WHERE id=?', [id]))[0][0].identity_id, 'job-other-identity');
    assert.equal((await call('saveMembershipAssignment', { ...input, id, departmentId: 'job-other-dept' })).status, 'forbidden');
    assert.equal((await db.query('SELECT department_id FROM membership_assignments WHERE id=?', [id]))[0][0].department_id, 'dir-department');
    assert.equal((await call('saveMembershipAssignment', { ...input, id, organizationId: 'org' })).status, 'forbidden');
    const naturePolicy = { ...policy, id: 'assignment-nature-inline', capabilities: ['hr.assignmentNatures.create'], scopes: [{ kind: 'organization' }] };
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('assignment-nature-inline','dir-auth','填写岗位时新增性质',?)", [JSON.stringify(naturePolicy)]);
    const nature = await call('saveAssignmentNature', { name: '项目专项岗位' });
    assert.equal(nature.status, 'success', JSON.stringify(nature));
    const createOnlyDirectory = await call('listAssignmentNatures', {});
    assert.equal(createOnlyDirectory.status, 'success', JSON.stringify(createOnlyDirectory));
    assert.equal(createOnlyDirectory.canCreate, true);
    assert.deepEqual(createOnlyDirectory.list, [], '只有新增权不能顺带读取现有性质目录');
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='assignment-nature-inline'", [JSON.stringify({
      ...naturePolicy, capabilities: ['hr.assignmentNatures.create', 'hr.assignmentNatures.read']
    })]);
    const natureDirectory = await call('listAssignmentNatures', {});
    assert.equal(natureDirectory.status, 'success', JSON.stringify(natureDirectory));
    assert(natureDirectory.list.some(item => item.id === nature.nature.id && item.name === '项目专项岗位'));
    const natureAssignment = await call('saveMembershipAssignment', { ...input, id, assignmentNature: nature.nature.id });
    assert.equal(natureAssignment.status, 'success', JSON.stringify(natureAssignment));
    const [[savedNature]] = await db.query(`SELECT a.assignment_kind,n.name FROM membership_assignments a
      JOIN assignment_natures n ON n.org_id=a.org_id AND n.id=a.assignment_kind WHERE a.id=?`, [id]);
    assert.equal(savedNature.assignment_kind, nature.nature.id);
    assert.equal(savedNature.name, '项目专项岗位');
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('assignment-readback','dir-auth','岗位详情回读',?)", [JSON.stringify({
      ...policy, id: 'assignment-readback', capabilities: ['hr.people.read'], fields: ['name', 'assignments']
    })]);
    const reopened = await call('listPersonIdentities', { hrId: input.hrId, organizationId: input.organizationId });
    assert.equal(reopened.status, 'success', JSON.stringify(reopened));
    assert(JSON.stringify(reopened).includes(nature.nature.id), '重新打开岗位详情必须包含刚选用的新性质');
    await db.query("DELETE FROM authorization_rules WHERE id='assignment-nature-inline'");
    assert.equal((await call('saveAssignmentNature', { name: '已撤权性质' })).status, 'authorization_forbidden');
    assert.equal((await db.query("SELECT COUNT(*) AS total FROM assignment_natures WHERE org_id='dir-auth' AND name='已撤权性质'"))[0][0].total, 0);
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='assignment-maintenance'", [JSON.stringify({ ...policy, fields: ['workGroupId'] })]);
    assert.equal((await call('saveMembershipAssignment', { ...input, id })).status, 'forbidden');
    await db.query("DELETE FROM authorization_rules WHERE id IN ('assignment-maintenance','assignment-nature-inline')");
    assert.equal((await call('deleteMembershipAssignment', { id, organizationId: 'dir-auth' })).status, 'forbidden');
    assert.equal((await db.query('SELECT status FROM membership_assignments WHERE id=?', [id]))[0][0].status, 'active');
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('assignment-maintenance','dir-auth','指定部门岗位维护',?)", [JSON.stringify(policy)]);
    assert.equal((await call('deleteMembershipAssignment', { id, organizationId: 'dir-auth' })).status, 'success');
    assert.equal((await db.query('SELECT status FROM membership_assignments WHERE id=?', [id]))[0][0].status, 'revoked');
  } finally {
    await new Promise(resolve => listener.close(resolve));
    await db.query("DELETE FROM authorization_rules WHERE id IN ('assignment-maintenance','assignment-nature-inline','assignment-readback')");
  }
};
