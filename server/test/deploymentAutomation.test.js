const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const migrationTools = require('../scripts/runDeploymentMigrations');
const databaseTools = require('../scripts/deploymentDatabase');

function testMigrationDiscoveryAndLedger() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-smart-workspace-migrations-'));
  fs.writeFileSync(path.join(directory, '20260717010101_add_table.sql'), 'CREATE TABLE IF NOT EXISTS demo (id INT);\n');
  fs.writeFileSync(path.join(directory, '20260717010202_drop_table.sql'), 'DROP TABLE IF EXISTS legacy_demo;\n');
  const migrations = migrationTools.discoverMigrations(directory);
  assert.strictEqual(migrations.length, 2);
  assert.strictEqual(migrations[0].destructive, false);
  assert.strictEqual(migrations[1].destructive, true);
  const plan = migrationTools.buildPlan(migrations, new Map([[migrations[0].name, migrations[0].checksum]]));
  assert.strictEqual(plan.pendingCount, 1);
  assert.strictEqual(plan.destructive, true);
  assert.throws(
    () => migrationTools.buildPlan(migrations, new Map([[migrations[0].name, '0'.repeat(64)]])),
    /校验和发生变化/
  );
  fs.rmSync(directory, { recursive: true, force: true });
}

function testDatabaseCommandsDoNotExposePassword() {
  const config = { host: '127.0.0.1', port: 3306, user: 'workspace_test', password: 'secret', database: 'whusu_smart_workspace' };
  const dump = databaseTools.dumpArguments(config);
  const restore = databaseTools.mysqlArguments(config);
  assert.ok(dump.includes('--databases'));
  assert.ok(dump.includes('--add-drop-database'));
  assert.ok(dump.includes('--protocol=TCP'));
  assert.ok(restore.includes('--protocol=TCP'));
  assert.ok(!dump.join(' ').includes(config.password));
  assert.ok(!restore.join(' ').includes(config.password));
}

function testDeploymentScriptContract() {
  const script = fs.readFileSync(path.resolve(__dirname, '../scripts/deployProduction.sh'), 'utf8');
  const entrypoint = fs.readFileSync(path.resolve(__dirname, '../scripts/deployEntrypoint.sh'), 'utf8');
  const tmuxSetup = fs.readFileSync(path.resolve(__dirname, '../scripts/setupCollabSession.sh'), 'utf8');
  const ecosystem = fs.readFileSync(path.resolve(__dirname, '../ecosystem.config.js'), 'utf8');
  const remoteCollab = fs.readFileSync(path.resolve(__dirname, '../../scripts/remote-collab.ps1'), 'utf8');
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8');
  assert.match(script, /flock -n/);
  assert.match(script, /pull --ff-only/);
  assert.match(script, /git_with_timeout/);
  assert.match(script, /worktree add --detach/);
  assert.match(script, /deploymentDatabase\.js" restore/);
  assert.match(script, /pm2 startOrReload/);
  assert.match(script, /\/var\/lib\/whusu-smart-workspace-deploy\/maintenance\.flag/);
  assert.match(script, /ln -sfn "\$SHARED_DIR\/server\.env"/);
  assert.match(script, /ln -s "\$SHARED_DIR\/uploads"/);
  assert.match(script, /migrateAuditUploads\.js/);
  assert.match(script, /AUDIT_UPLOAD_DIR="\$SHARED_DIR\/uploads\/audit"/);
  assert.match(script, /pm2 delete whusu-smart-workspace-backup/);
  assert.match(script, /pm2 start "\$NEW_RELEASE\/server\/ecosystem\.config\.js" --only whusu-smart-workspace-backup --update-env/);
  assert.match(script, /pm2 stop whusu-smart-workspace-backup/);
  assert.match(script, /WHUSU_SMART_WORKSPACE_DEPLOY_BRANCH:-main/);
  assert.match(script, /install -m 755/);
  assert.doesNotMatch(script, /require\(['"]dotenv['"]\)/);
  assert.doesNotMatch(script, /git reset --hard/);
  assert.match(entrypoint, /git -C "\$REPO_DIR" show/);
  assert.match(entrypoint, /timeout --signal=TERM/);
  assert.match(entrypoint, /bash -n/);
  assert.match(entrypoint, /WHUSU_SMART_WORKSPACE_DEPLOY_BRANCH:-main/);
  assert.match(tmuxSetup, /whusu-smart-workspace-collab/);
  assert.match(tmuxSetup, /whusu-smart-workspace-notification-worker/);
  assert.match(ecosystem, /name: 'whusu-smart-workspace-backup'[\s\S]*cwd: serverRoot/);
  assert.match(ecosystem, /name: 'whusu-smart-workspace-api'[\s\S]*DB_POOL_LIMIT: '20'/);
  assert.match(ecosystem, /name: 'whusu-smart-workspace-notification-worker'[\s\S]*DB_POOL_LIMIT: '10'/);
  assert.match(remoteCollab, /Replace\("`r`n", "`n"\)\.Replace\("`r", "`n"\)/);
  assert.match(remoteCollab, /actions\/runs\?branch=main&event=push/);
  assert.doesNotMatch(remoteCollab, /branch=feature%2Faudit/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow, /github\.ref == 'refs\/heads\/feature\/audit'/);
  assert.match(workflow, /env WHUSU_SMART_WORKSPACE_DEPLOY_BRANCH=main timeout/);
}

testMigrationDiscoveryAndLedger();
testDatabaseCommandsDoNotExposePassword();
testDeploymentScriptContract();
console.log('自动部署、迁移账本与数据库快照契约测试通过');
