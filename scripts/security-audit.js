'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = ['miniprogram', 'server'];
const RULES = [
  { id: 'dynamic-code', severity: 'critical', pattern: /\b(?:eval|Function)\s*\(/g },
  { id: 'insecure-http', severity: 'high', pattern: /["']http:\/\//g, allow: match => match.input.slice(match.index, match.index + 80).includes('http://www.w3.org/') },
  { id: 'token-log', severity: 'high', pattern: /console\.(?:log|info|warn)\([^\n]*\b(?:token|authorization)\b/gi },
  { id: 'unsafe-temp-path', severity: 'high', pattern: /USER_DATA_PATH[^\n]+(?:fileId|fileName)/g },
  {
    id: 'dynamic-navigation',
    severity: 'medium',
    pattern: /wx\.(?:navigateTo|redirectTo)\(\{\s*url\s*:\s*[A-Za-z_$][\w$]*/g,
    allow: match => match.input.slice(Math.max(0, match.index - 700), match.index).includes('function navigateToTrustedRoute')
  }
];

function addFinding(severity, rule, file, source, offset) {
  findings.push({ severity, rule, file, line: lineAt(source, Math.max(0, offset || 0)) });
}

function walk(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !['node_modules', 'coverage', 'dist', '.git'].includes(entry.name)) walk(fullPath, output);
    else if (/\.(?:js|wxs)$/.test(entry.name)) output.push(fullPath);
  }
  return output;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

const findings = [];
for (const target of TARGETS) {
  for (const file of walk(path.join(ROOT, target))) {
    const source = fs.readFileSync(file, 'utf8');
    const relativeFile = path.relative(ROOT, file).replace(/\\/g, '/');
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(source))) {
        if (rule.allow && rule.allow(match)) continue;
        findings.push({
          severity: rule.severity,
          rule: rule.id,
          file: relativeFile,
          line: lineAt(source, match.index)
        });
      }
    }

    if (relativeFile.startsWith('server/src/')) {
      const runtimeDdl = source.search(/\b(?:CREATE|ALTER|DROP|TRUNCATE)\s+(?:TABLE|INDEX|DATABASE)\b/i);
      if (runtimeDdl >= 0) addFinding('high', 'runtime-ddl', relativeFile, source, runtimeDdl);
      const legacySpreadsheet = source.search(/require\(['"]xlsx['"]\)/);
      if (legacySpreadsheet >= 0) addFinding('high', 'legacy-xlsx-runtime', relativeFile, source, legacySpreadsheet);
      const legacyUuid = source.search(/require\(['"]uuid['"]\)/);
      if (legacyUuid >= 0) addFinding('high', 'legacy-uuid-runtime', relativeFile, source, legacyUuid);
      const clientTempPath = source.search(/req\.body\.(?:tmpPath|tempPath|filePath)\b/);
      if (clientTempPath >= 0) addFinding('high', 'client-file-path-trust', relativeFile, source, clientTempPath);
    }

    if (/server\/src\/(?:core|modules)\/.+\/routes\/.+\.js$/.test(relativeFile) ||
      /server\/src\/core\/routes\/.+\.js$/.test(relativeFile)) {
      const directSql = source.search(/pool\.(?:query|execute)\s*\(/);
      if (directSql >= 0) addFinding('medium', 'route-direct-sql', relativeFile, source, directSql);
    }

    if (relativeFile.startsWith('server/src/core/routes/') && source.includes('pool.')) {
      const poolImport = source.search(/const\s+pool\s*=\s*require\(['"]\.\.\/\.\.\/config\/db['"]\)/);
      const firstRoute = source.indexOf('router.');
      if (poolImport < 0 || (firstRoute >= 0 && poolImport > firstRoute)) {
        findings.push({
          severity: 'high',
          rule: 'route-pool-scope',
          file: relativeFile,
          line: lineAt(source, source.indexOf('pool.'))
        });
      }
    }
  }
}

function requireSourceContract(relativeFile, checks) {
  const file = path.join(ROOT, relativeFile);
  const source = fs.readFileSync(file, 'utf8');
  for (const check of checks) {
    if (check.test(source)) continue;
    addFinding(check.severity || 'high', check.rule, relativeFile, source, 0);
  }
}

requireSourceContract('server/src/middleware/orgContext.js', [
  { rule: 'org-header-required', test: source => source.includes("status: 'org_context_required'") },
  { rule: 'org-no-default-fallback', test: source => !/current_organization|systemConfigModel/.test(source) }
]);
requireSourceContract('server/src/core/services/adminAuthorization.js', [
  { rule: 'admin-two-level-matrix', test: source => source.includes("const ADMIN_LEVELS = [SUPER_ADMIN_LEVEL, REGULAR_ADMIN_LEVEL]") && !source.includes('root_admin') },
  { rule: 'admin-self-management-blocked', test: source => source.includes('operator.id === target.id') },
  { rule: 'admin-last-super-protected', test: source => source.includes('Number(activeSuperAdminCount) > 1') }
]);
requireSourceContract('server/src/core/models/adminInfo.js', [
  { rule: 'admin-invite-plaintext-storage', test: source => source.includes('SET invite_code = ?') && !source.includes('invite_code_hash') }
]);
requireSourceContract('server/src/core/routes/admin.js', [
  { rule: 'admin-invite-authorized-display', test: source => source.includes('canViewInviteCode: canAccessInvite') && source.includes('canRegenerateInvite: canAccessInvite') }
]);
requireSourceContract('server/src/core/routes/auth.js', [
  { rule: 'admin-invite-plaintext-binding', test: source => source.includes('WHERE invite_code = ?') && !source.includes('invite_code_hash') }
]);
requireSourceContract('server/src/core/services/adminPermissions.js', [
  {
    rule: 'hr-template-permission-split',
    test: source => source.includes("key: 'hr.profile_templates.manage'")
      && source.includes("key: 'hr.profile_templates.select'")
      && !/mapRoutes\('hr\.profile_review',\s*\[[^\]]*saveHrProfileTemplate/.test(source)
  }
]);
requireSourceContract('server/src/core/services/hrProfileTemplateLibrary.js', [
  {
    rule: 'hr-template-switch-atomic-org-scope',
    test: source => source.includes('pool.withTransaction(async (connection)')
      && source.includes('WHERE org_id = ? AND field_id = ?')
      && source.includes('actionsHash')
      && source.includes('valueStateHash')
      && source.includes('delete_confirmation_required')
  }
]);
requireSourceContract('server/src/core/routes/hrProfile.js', [
  {
    rule: 'hr-template-legacy-save-disabled',
    test: source => source.includes("status: 'client_upgrade_required'")
      && !source.includes('INSERT INTO hr_profile_templates (id, template_key')
  }
]);
requireSourceContract('server/src/modules/audit/utils/fileSecurity.js', [
  { rule: 'signed-file-token', test: source => /createHmac\(['"]sha256['"]/.test(source) && /timingSafeEqual/.test(source) }
]);
requireSourceContract('server/src/middleware/requestContext.js', [
  { rule: 'crypto-request-id', test: source => /randomUUID/.test(source) && !/require\(['"]uuid['"]\)/.test(source) }
]);

const summary = findings.reduce((result, finding) => {
  result[finding.severity] += 1;
  return result;
}, { critical: 0, high: 0, medium: 0 });

console.log('REDSU security audit');
console.table(summary);
if (findings.length) console.table(findings);

if (process.argv.includes('--strict') && (summary.critical || summary.high)) process.exitCode = 1;
