'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
let pool;
const cutover = require('../src/core/models/identityNatureCutover');
const { verifyRuntime } = require('./authorizationDeployment');

async function main() {
  const fs = require('node:fs');
  const lock = path.join(process.env.WHUSU_SMART_WORKSPACE_DEPLOY_DIR || '/home/ubuntu/whusu-smart-workspace-deploy', 'deploy.lock');
  if (process.platform !== 'linux' || fs.realpathSync('/proc/self/fd/9') !== fs.realpathSync(lock)) throw Error('authorization_deployment_lock_required');
  const orgId = process.argv[2];
  if (!orgId || !/^[A-Za-z0-9_-]{1,64}$/.test(orgId)) throw new Error('organization_required');
  if (process.argv[3] !== '--enable-after-rollout') throw new Error('rollout_confirmation_required');
  pool = require('../src/config/db');
  const model = require('../src/core/models/identityNature');
  const result = await cutover.activate(pool, orgId, {
    compatibleSha: process.argv[4], fallbackSha: process.argv[5]
  }, verifyRuntime, model.finalize);
  process.stdout.write(JSON.stringify({ organizationId: orgId, ...result }) + '\n');
}

main().catch(error => { process.stderr.write(String(error.code || error.message) + '\n'); process.exitCode = 1; })
  .finally(() => pool && pool.end());
