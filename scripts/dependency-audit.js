'use strict';

/**
 * 依赖漏洞门禁。
 *
 * 默认阻断 high / critical；只放行“官方无修复版本且漏洞路径在本仓库不可达”的公告。
 * 每条豁免必须写明公告编号、不可达证据与到期日，到期后自动重新阻断，避免长期沉默放行。
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ALLOWED_ADVISORIES = [
  {
    id: 'GHSA-86W9-CPQP-85RV',
    module: 'node-forge',
    severity: 'high',
    reason: '官方暂无修复版本（1.4.0 已是最新）。该公告针对 node-forge 自身的 RSA PKCS#1 v1.5 验签，本仓库 CMS/PDF 验签使用 Node 原生 crypto.verify，未调用 forge 的 pki.rsa 校验路径。',
    expires: '2026-12-31'
  }
];

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

function activeExemptions(now) {
  const today = now instanceof Date ? now : new Date();
  return ALLOWED_ADVISORIES.filter((item) => {
    const expires = new Date(`${item.expires}T23:59:59Z`);
    return !Number.isNaN(expires.getTime()) && expires.getTime() >= today.getTime();
  });
}

function advisoryIdsOf(vulnerability) {
  const ids = new Set();
  (vulnerability && vulnerability.via || []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const url = String(entry.url || '');
    const matched = url.match(/GHSA-[a-z0-9-]+/i);
    if (matched) ids.add(matched[0].toUpperCase());
  });
  return Array.from(ids);
}

function collectBlockingFindings(report, now) {
  const exemptions = activeExemptions(now);
  const allowed = new Set(exemptions.map((item) => item.id));
  const findings = [];
  Object.entries(report && report.vulnerabilities || {}).forEach(([name, vulnerability]) => {
    const severity = String(vulnerability && vulnerability.severity || '').toLowerCase();
    if (!BLOCKING_SEVERITIES.has(severity)) return;
    const ids = advisoryIdsOf(vulnerability);
    // 严重级别也参与匹配：同一公告被升级为更高级别时必须重新评估。
    const exempted = exemptions.some((item) => item.module === name && item.severity === severity
      && (ids.length === 0 || ids.every((id) => allowed.has(id))));
    if (exempted) return;
    findings.push({
      module: name,
      severity,
      advisories: ids,
      title: String(vulnerability && vulnerability.via && vulnerability.via[0] && vulnerability.via[0].title || '')
    });
  });
  return findings;
}

function readAuditReport() {
  const serverDir = path.resolve(__dirname, '..', 'server');
  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'npm.cmd' : 'npm';
  try {
    return execFileSync(command, ['audit', '--json'], {
      cwd: serverDir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: isWindows
    });
  } catch (error) {
    // 存在漏洞时 npm audit 以非零码结束，但 JSON 仍完整写在 stdout。
    if (error && error.stdout) return String(error.stdout);
    throw error;
  }
}

function selfTest() {
  const now = new Date('2026-10-02T00:00:00Z');
  const allowedReport = {
    vulnerabilities: {
      'node-forge': {
        severity: 'high',
        via: [{ url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv', title: 'forge', cwe: ['CWE-347'] }]
      }
    }
  };
  if (collectBlockingFindings(allowedReport, now).length !== 0) {
    throw new Error('已豁免公告不应阻断');
  }
  const blockedReport = {
    vulnerabilities: {
      axios: {
        severity: 'high',
        via: [{ url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', title: 'other' }]
      },
      'node-forge': {
        severity: 'critical',
        via: [{ url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv', title: 'forge' }]
      }
    }
  };
  const findings = collectBlockingFindings(blockedReport, now);
  if (findings.length !== 2) throw new Error('未豁免的告警与升级后的严重级别都必须阻断');
  const expired = collectBlockingFindings(allowedReport, new Date('2027-03-01T00:00:00Z'));
  if (expired.length !== 1) throw new Error('豁免到期后必须重新阻断');
  console.log('依赖门禁自测通过：豁免生效、其它告警阻断、到期自动恢复阻断');
}

function main() {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return;
  }
  const report = JSON.parse(readAuditReport());
  const findings = collectBlockingFindings(report);
  const exemptions = activeExemptions();
  exemptions.forEach((item) => {
    console.log(`[dependency-audit] 已豁免 ${item.id}（${item.module}，到期 ${item.expires}）：${item.reason}`);
  });
  if (findings.length) {
    findings.forEach((finding) => {
      console.error(`[dependency-audit] 阻断 ${finding.module} ${finding.severity} ${finding.advisories.join(',')} ${finding.title}`);
    });
    process.exitCode = 1;
    return;
  }
  console.log('[dependency-audit] 除已豁免公告外，无 high / critical 依赖告警');
}

main();
