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
  assert.match(script, /flock -n/);
  assert.match(script, /pull --ff-only/);
  assert.match(script, /worktree add --detach/);
  assert.match(script, /deploymentDatabase\.js" restore/);
  assert.match(script, /pm2 startOrReload/);
  assert.match(script, /\/var\/lib\/whusu-smart-workspace-deploy\/maintenance\.flag/);
  assert.match(script, /worktree repair/);
  assert.match(script, /ln -sfn "\$SHARED_DIR\/server\.env"/);
  assert.match(script, /pm2 delete redsu-scoring/);
  assert.match(script, /install -m 755/);
  assert.doesNotMatch(script, /require\(['"]dotenv['"]\)/);
  assert.doesNotMatch(script, /git reset --hard/);
  assert.match(entrypoint, /git -C "\$REPO_DIR" show/);
  assert.match(entrypoint, /bash -n/);
  assert.match(tmuxSetup, /whusu-smart-workspace-collab/);
  assert.match(tmuxSetup, /whusu-smart-workspace-notification-worker/);
}

testMigrationDiscoveryAndLedger();
testDatabaseCommandsDoNotExposePassword();
testDeploymentScriptContract();
console.log('自动部署、迁移账本与数据库快照契约测试通过');
