'use strict';
const assert = require('node:assert/strict');
const express = require('express');
// HTTP 边界测试不连接数据库，事务与持久化另由隔离数据库测试验证。
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
const model = require('../src/core/models/contactDirectory');
const access = require('../src/core/services/adminOrganizationAccess');
const permissions = require('../src/core/services/adminPermissions');
async function main() {
  const calls = [];
  access.requireAdminOrganizationPermission = async (req, orgId, keys, connection) => {
    calls.push({orgId,keys,connection});
    if (req.authContext.role !== 'admin' || req.headers['x-test-grant'] !== 'yes') throw new access.AdminOrganizationAccessError('permission_denied','denied');
  };
  model.configuration = async (orgId, authorize) => { await authorize('transaction'); return {rules:[],people:[],fields:[]}; };
  model.save = async (body,orgId,authorize) => { await authorize('transaction'); return {id:'saved',version:1,name:body.name}; };
  model.batch = async (body,orgId,authorize) => { await authorize('transaction'); return {count:body.rules.length}; };
  model.read = async actor => { calls.push({actor}); return {groups:[]}; };
  const app=express();app.use(express.json());
  app.use((req,res,next)=>{req.authAccount={id:'account',personId:'authenticated-person'};req.authContext={personId:'authenticated-person',contextId:'current-context',organizationId:'current-org',role:req.headers['x-test-role']||'user',assignmentId:'current-assignment'};next();});
  app.use('/api',require('../src/core/routes/contactDirectory'));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  async function post(name,body={},headers={}) { const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/'+name,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});return {code:response.status,body:await response.json()}; }
  try {
    assert.equal((await post('getContactDirectory',{personId:'other',organizationId:'other',assignmentId:'other'})).body.status,'success');
    assert.equal(calls[0].actor.personId,'authenticated-person');assert.equal(calls[0].actor.assignmentId,'current-assignment');
    for(const name of ['getContactDirectoryConfiguration','saveContactDirectoryRule','batchContactDirectoryRules']) {
      assert.equal((await post(name,{},{})).code,403);
      assert.equal((await post(name,{}, {'x-test-role':'admin'})).code,403);
    }
    assert.equal((await post('saveContactDirectoryRule',{name:'规则',organizationId:'other'},{'x-test-role':'admin','x-test-grant':'yes'})).body.rule.id,'saved');
    assert(calls.filter(item=>item.orgId).every(item=>item.orgId==='current-org'&&item.keys[0]==='hr.directory.manage'&&item.connection==='transaction'));
    const rule=permissions.ROUTE_RULES.get('/saveContactDirectoryRule');assert.deepEqual(rule.anyOf,['hr.directory.manage']);assert.equal(rule.allowUserRole,false);
    console.log('PASS 通讯录 HTTP 入口普通用户/未授权管理员拒绝、事务复核和客户端身份替换无效');
  } finally { await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
