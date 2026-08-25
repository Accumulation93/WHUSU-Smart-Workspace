'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const serverTime = require('../src/utils/dateTime');
const miniProgramTime = require('../../miniprogram/utils/dateTime');
const timeAudit = require('../../scripts/time-system-audit');
const sourceCatalog = require('../scripts/utcTimeSourceCatalog');
const preflight = require('../scripts/preflightUtcTimeMigration');
const migrationTools = require('../scripts/runDeploymentMigrations');

const root = path.resolve(__dirname, '../..');
const migrationPath = path.join(root, 'server/db/deploy/20260823190000_utc_time_normalization.sql');
const securityMigrationPath = path.join(
  root,
  'server/db/deploy/20260825233000_server_security_hardening.sql'
);
const venueLegacyMigrationPath = path.join(
  root,
  'server/db/deploy/20260825234500_venue_legacy_person_assignment.sql'
);
const unprovenTimeReclassificationMigrationPath = path.join(
  root,
  'server/db/deploy/20260826093000_reclassify_unproven_user_visible_times.sql'
);

function writeFixture(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function testServerFormatting() {
  const absolute = '2026-12-31T16:30:45.123Z';
  assert.strictEqual(serverTime.formatListTime(absolute, 8), '2027-01-01 00:30');
  assert.strictEqual(serverTime.formatDetailTime(absolute, 8), '2027-01-01 00:30:45');
  assert.strictEqual(serverTime.formatDetailTime(absolute, -12), '2026-12-31 04:30:45');
  assert.strictEqual(serverTime.formatDetailTime(absolute, 0), '2026-12-31 16:30:45');
  assert.strictEqual(serverTime.formatDetailTime(absolute, 12), '2027-01-01 04:30:45');
  assert.strictEqual(serverTime.formatAbsoluteDate(absolute, 8), '2027-01-01');
  assert.strictEqual(serverTime.formatDateOnly('2026-08-23'), '2026-08-23');
  assert.strictEqual(serverTime.formatDateOnly('2026-02-30'), '');
  assert.strictEqual(serverTime.formatDateOnly('2026-08-23T00:00:00Z'), '');
  assert.strictEqual(serverTime.formatClockTime('09:05:30'), '09:05');
  assert.strictEqual(serverTime.toIsoUtc('2026-08-23 11:10:16.000'), '2026-08-23T11:10:16.000Z');
  assert.strictEqual(serverTime.toMysqlUtc('2026-08-23T11:10:16.045Z'), '2026-08-23 11:10:16.045');
  assert.strictEqual(
    serverTime.parseSystemDateTime('2026-08-24 00:30', 8).toISOString(),
    '2026-08-23T16:30:00.000Z'
  );
  assert.strictEqual(
    serverTime.systemDateTimeToMysqlUtc('2026-08-24 00:30', 8),
    '2026-08-23 16:30:00.000'
  );
}

function testMiniProgramFormatting() {
  const stored = {};
  global.wx = {
    getStorageSync(key) { return stored[key]; },
    setStorageSync(key, value) { stored[key] = value; },
    removeStorageSync(key) { delete stored[key]; }
  };
  miniProgramTime.clearSystemTimezoneConfig();
  miniProgramTime.setSystemTimezoneConfig(8, 7);
  assert.deepStrictEqual(miniProgramTime.getSystemTimezoneConfig(), {
    offset: 8,
    version: '7',
    reviewRequired: false,
    reviewVersion: ''
  });
  assert.strictEqual(miniProgramTime.formatListTime('2026-12-31T16:30:45.123Z'), '2027-01-01 00:30');
  assert.strictEqual(miniProgramTime.formatListTime('2027-01-01 00:30:45.123'), '2027-01-01 08:30');
  assert.strictEqual(miniProgramTime.formatDetailTime('2026-12-31T16:30:45.123Z', -12), '2026-12-31 04:30:45');
  assert.strictEqual(miniProgramTime.formatAbsoluteDate('2026-12-31T16:30:45.123Z', 12), '2027-01-01');
  assert.strictEqual(miniProgramTime.formatDateOnly('2026-08-23'), '2026-08-23');
  assert.strictEqual(miniProgramTime.formatDateOnly('2026-02-30'), '');
  assert.strictEqual(miniProgramTime.formatClockTime('23:59:59'), '23:59');
  assert.deepStrictEqual(
    miniProgramTime.splitSystemDateTime('2026-08-23T16:30:00.000Z', 8),
    { date: '2026-08-24', time: '00:30' }
  );
  assert.strictEqual(
    miniProgramTime.systemDateTimeToIsoUtc('2026-08-24', '00:30', 8),
    '2026-08-23T16:30:00.000Z'
  );
  const crossDateInstant = '2026-01-01T00:30:00.000Z';
  assert.strictEqual(miniProgramTime.getSystemDate(crossDateInstant, 8), '2026-01-01');
  assert.strictEqual(miniProgramTime.getSystemMinuteOfDay(crossDateInstant, 8), 8 * 60 + 30);
  assert.strictEqual(miniProgramTime.getSystemWeekStart(crossDateInstant, 8), '2025-12-29');
  assert.strictEqual(miniProgramTime.getSystemDate(crossDateInstant, -12), '2025-12-31');
  assert.strictEqual(miniProgramTime.getSystemMinuteOfDay(crossDateInstant, -12), 12 * 60 + 30);
  assert.strictEqual(miniProgramTime.getSystemWeekStart(crossDateInstant, -12), '2025-12-29');
  assert.strictEqual(miniProgramTime.addDateDays('2025-12-29', 7), '2026-01-05');
  assert.strictEqual(
    miniProgramTime.systemDateTimeToTimestamp('2026-01-01', '08:30', 8),
    Date.parse(crossDateInstant)
  );
  miniProgramTime.setSystemTimezoneConfig(8, 7, true, 'review-1');
  assert.strictEqual(
    miniProgramTime.formatListTime('2026-12-31T16:30:45.123Z'),
    '2027-01-01 00:30'
  );
  assert.strictEqual(
    miniProgramTime.formatListTime('2026-12-31T16:30:45.123Z', { reviewStatus: 'review_required' }),
    '2027-01-01 00:30 · 历史时区待核对'
  );
  miniProgramTime.setSystemTimezoneConfig(8, 7, false, 'review-2');
  delete global.wx;
}

function testAuditScanner() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-time-audit-'));
  try {
    writeFixture(
      path.join(fixtureRoot, 'miniprogram/pages/sample/sample.wxml'),
      [
        '<view wx:if="{{a > b}}">{{item.createdAt}}</view>',
        '<text>{{item.inviteExpiresAt}}</text>',
        '<text>{{item.claimStartsAt}}</text>',
        '<text>{{item.snapshotStartedAt}}</text>',
        '<text>{{item.valueUpdatedAt}}</text>',
        '<text>{{item.lockedUntil}}</text>',
        '<text>{{item.createdAtText}}</text>',
        '<text>{{item.bookingDate}}</text>',
        '<text>{{item.dailyStartTime}}</text>',
        '<text>{{item.durationMinutes}}</text>',
        '<text>{{localeCopy.hrMembershipLeftAt}}</text>'
      ].join('')
    );
    writeFixture(
      path.join(fixtureRoot, 'miniprogram/pages/sample/sample.js'),
      "// 2026-01-01T00:00:00.000Z\nconst now = new Date(); const minute = now.getHours() * 60 + now.getMinutes(); const text = now.toLocaleString(); const raw = '2026-08-23T11:10:16.000Z';\n"
    );
    writeFixture(
      path.join(fixtureRoot, 'miniprogram/utils/dateTime.js'),
      "function allowed(date) { return date.getFullYear() + date.getMonth() + date.getDate(); }\n"
    );
    writeFixture(
      path.join(fixtureRoot, 'server/src/sample.js'),
      "const sqlTime = new Date().toISOString().slice(0, 19).replace('T', ' ');\n"
    );
    writeFixture(
      path.join(fixtureRoot, 'server/backup.js'),
      [
        "const backupName = new Date().toISOString().substring(0, 19).replace('T', ' ');",
        "const dbTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');"
      ].join('\n') + '\n'
    );
    writeFixture(
      path.join(fixtureRoot, 'server/scripts/writeDatabase.mjs'),
      "const storedTime = new Date().toISOString().split('T')[0];\n"
    );
    writeFixture(
      path.join(fixtureRoot, 'server/test/ignored.js'),
      "const ignoredTestTime = new Date().toISOString().slice(0, 19);\n"
    );
    writeFixture(
      path.join(fixtureRoot, 'server/node_modules/ignored.js'),
      "const ignoredDependencyTime = new Date().toISOString().slice(0, 19);\n"
    );
    const findings = timeAudit.scanRepository(fixtureRoot);
    const rawTimeFindings = findings.filter((item) => item.rule === 'wxml-raw-absolute-time');
    const manualUtcFindings = findings.filter((item) => item.rule === 'manual-utc-sql-text');
    assert.strictEqual(rawTimeFindings.length, 6);
    ['createdAt', 'inviteExpiresAt', 'claimStartsAt', 'snapshotStartedAt', 'valueUpdatedAt', 'lockedUntil']
      .forEach((fieldName) => {
        assert.ok(rawTimeFindings.some((item) => item.detail.includes(fieldName)));
      });
    assert.ok(findings.some((item) => item.rule === 'device-locale-time'));
    assert.strictEqual(findings.filter((item) => item.rule === 'device-local-date-getter').length, 2);
    assert.strictEqual(
      findings.some((item) => item.rule === 'device-local-date-getter' && item.file === 'miniprogram/utils/dateTime.js'),
      false
    );
    assert.ok(findings.some((item) => item.rule === 'ui-iso-literal'));
    assert.strictEqual(manualUtcFindings.length, 3);
    assert.ok(manualUtcFindings.some((item) => item.file === 'server/backup.js'));
    assert.ok(manualUtcFindings.some((item) => item.file === 'server/scripts/writeDatabase.mjs'));
    assert.strictEqual(manualUtcFindings.some((item) => item.file.includes('/test/')), false);
    assert.strictEqual(manualUtcFindings.some((item) => item.file.includes('/node_modules/')), false);
    assert.strictEqual(findings.filter((item) => item.rule === 'ui-iso-literal').length, 1);
    assert.strictEqual(
      findings.filter((item) => /createdAtText|bookingDate|dailyStartTime|durationMinutes|hrMembershipLeftAt/.test(item.detail)).length,
      0
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function testSourceClassificationAndMigrationContract() {
  assert.strictEqual(
    sourceCatalog.classifyColumn('auth_sessions', 'expires_at').migrationAction,
    'record_review'
  );
  assert.strictEqual(
    sourceCatalog.classifyColumn('auth_sessions', 'created_at', {
      columnDefault: 'CURRENT_TIMESTAMP'
    }).migrationAction,
    'record_review',
    '用户可见绝对时间即使由 CURRENT_TIMESTAMP 默认值生成，也不得按整列猜测平移'
  );
  assert.strictEqual(
    sourceCatalog.classifyColumn('hr_profile_templates', 'updated_at', {
      columnDefault: 'CURRENT_TIMESTAMP'
    }).migrationAction,
    'record_review',
    '用户可见业务表必须保留逐记录来源审查'
  );
  assert.strictEqual(
    sourceCatalog.classifyColumn('hr_info', 'created_at', {
      columnDefault: 'CURRENT_TIMESTAMP'
    }).migrationAction,
    'record_review',
    '存在手工 UTC 写入的混合来源表禁止整列平移'
  );
  assert.strictEqual(
    sourceCatalog.classifyColumn('accounts', 'created_at', {
      columnDefault: 'CURRENT_TIMESTAMP'
    }).migrationAction,
    'shift_minus_480',
    '只有具备迁移账本、备份与行级因果证据的旧字段允许保留整列平移结论'
  );
  assert.strictEqual(
    sourceCatalog.classifyColumn('venue_bookings', 'time_start').sourceType,
    'legacy_unverified'
  );
  assert.strictEqual(
    sourceCatalog.classifyColumn('future_table', 'unexpected_time').sourceType,
    'unclassified'
  );
  const nativeUtcColumns = {
    security_rate_limit_buckets: [
      'window_started_at',
      'expires_at',
      'created_at',
      'updated_at'
    ],
    audit_temp_uploads: ['expires_at', 'created_at'],
    score_snapshot_backfill_audits: ['reconstructed_at', 'applied_at']
  };
  Object.entries(nativeUtcColumns).forEach(([tableName, columnNames]) => {
    assert.strictEqual(sourceCatalog.isUserVisibleTable(tableName), false);
    columnNames.forEach((columnName) => {
      const classification = sourceCatalog.classifyColumn(tableName, columnName, {
        columnDefault: columnName === 'created_at' || columnName === 'updated_at'
          ? 'CURRENT_TIMESTAMP(3)'
          : null
      });
      assert.strictEqual(classification.sourceType, 'post_cutover_native_utc');
      assert.strictEqual(classification.migrationAction, 'keep_utc');
    });
  });
  assert.strictEqual(preflight.quoteIdentifier('audit_events'), '`audit_events`');
  assert.throws(() => preflight.quoteIdentifier('audit_events;DROP TABLE x'));
  const schemaReport = preflight.runSchemaPreflight(path.join(root, 'server/db/init.sql'));
  assert.ok(schemaReport.totalColumns > 0);
  assert.strictEqual(schemaReport.blockers.length, 0);
  assert.ok(schemaReport.shiftColumns > 0);
  assert.ok(schemaReport.reviewColumns > 0);

  const migration = fs.readFileSync(migrationPath, 'utf8');
  assert.strictEqual(migrationTools.isDestructiveMigration(migration), true);
  assert.match(migration, /^-- @destructive/m);
  assert.match(migration, /SET SESSION time_zone = '\+00:00'/);
  assert.match(migration, /absolute_time_source_registry/);
  assert.match(migration, /absolute_time_record_reviews/);
  assert.match(migration, /absolute_time_migration_audit/);
  assert.match(migration, /absolute_time_cutovers/);
  assert.match(migration, /timezone_config_version/);
  assert.match(migration, /knownWallOffsetMinutes', -480/);
  assert.match(migration, /unprovenOffsetMinutes', 0/);
  assert.match(migration, /proof_gated_partial_normalization/);
  assert.match(migration, /migration_action = 'shift_minus_480'/);
  assert.match(migration, /normalization_status = 'shifted_to_utc'/);
  assert.match(migration, /START TRANSACTION;[\s\S]*COMMIT;/);
  assert.match(migration, /DATE_SUB\s*\(/i);
  sourceCatalog.MIXED_SOURCE_TABLES.forEach((tableName) => {
    assert.ok(migration.includes(`'${tableName}'`), `迁移 SQL 缺少混合来源表：${tableName}`);
  });

  const securityMigration = fs.readFileSync(securityMigrationPath, 'utf8');
  assert.match(securityMigration, /SET @server_security_previous_time_zone := @@SESSION\.time_zone/);
  assert.match(securityMigration, /SET SESSION time_zone = '\+00:00'/);
  assert.match(securityMigration, /SET SESSION time_zone = @server_security_previous_time_zone/);

  const venueLegacyMigration = fs.readFileSync(venueLegacyMigrationPath, 'utf8');
  assert.match(venueLegacyMigration, /SET @venue_assignment_previous_time_zone = @@SESSION\.time_zone/);
  assert.match(venueLegacyMigration, /SET SESSION time_zone = '\+00:00'/);
  assert.match(venueLegacyMigration, /SET SESSION time_zone = @venue_assignment_previous_time_zone/);

  const reclassificationMigration = fs.readFileSync(unprovenTimeReclassificationMigrationPath, 'utf8');
  assert.match(reclassificationMigration, /reclassified_review_required/);
  assert.match(reclassificationMigration, /previous_audit\.affected_rows/);
  assert.match(reclassificationMigration, /table_name = 'accounts'/);
  assert.match(reclassificationMigration, /table_name = 'hr_profile_record_values'/);
  assert.match(reclassificationMigration, /migration_action = 'record_review'/);
  assert.match(reclassificationMigration, /status = 'review_pending'/);
  assert.doesNotMatch(reclassificationMigration, /DATE_(?:ADD|SUB)\s*\(/i);

  const materializer = fs.readFileSync(
    path.join(root, 'server/scripts/materializeUtcTimeReviews.js'), 'utf8'
  );
  assert.match(materializer, /SET SESSION time_zone = '\+00:00'/);
  assert.match(materializer, /review_required/);
  assert.match(materializer, /raw_value/);
  assert.match(materializer, /UTC 切换状态未通过语义校验/);
  assert.match(materializer, /buildKeysetClause/);
  assert.doesNotMatch(materializer, /LIMIT \? OFFSET \?/);

  const deployScript = fs.readFileSync(path.join(root, 'server/scripts/deployProduction.sh'), 'utf8');
  assert.match(deployScript, /stop_process_group whusu-smart-workspace-api/);
  assert.match(deployScript, /materializeUtcTimeReviews\.js" --materialize/);
  assert.match(deployScript, /materializeUtcTimeReviews\.js" --verify/);
  assert.match(deployScript, /historicalTimeReviewRequired/);

  const dbConfig = fs.readFileSync(path.join(root, 'server/src/config/db.js'), 'utf8');
  assert.match(dbConfig, /timezone:\s*'Z'/);
  assert.match(dbConfig, /dateStrings:\s*\['DATE'\]/);
  assert.match(dbConfig, /SET SESSION time_zone = '\+00:00'/);
}

testServerFormatting();
testMiniProgramFormatting();
testAuditScanner();
testSourceClassificationAndMigrationContract();
console.log('UTC 时间体系工具、审计与迁移契约测试通过');
