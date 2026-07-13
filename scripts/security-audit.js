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

const summary = findings.reduce((result, finding) => {
  result[finding.severity] += 1;
  return result;
}, { critical: 0, high: 0, medium: 0 });

console.log('REDSU security audit');
console.table(summary);
if (findings.length) console.table(findings);

if (process.argv.includes('--strict') && (summary.critical || summary.high)) process.exitCode = 1;
