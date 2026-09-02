#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STRICT = process.argv.includes('--strict');
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const SKIP_SUFFIXES = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz',
  '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.mov', '.xlsx', '.xls'
]);
const SAFE_VALUE_PATTERN = /^(?:|change[-_]?me|replace[-_]?me|example|placeholder|your[-_].*|test|dummy|none|null|\$\{|process\.env\b|os\.getenv\b|required_env\b)/i;
const SECRET_ASSIGNMENT_PATTERN = /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)\b\s*[=:]\s*["']([^"'\r\n]{6,})["']/ig;
const PROVIDER_TOKEN_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\bmysql:\/\/[^\s:@/]+:[^\s@/]+@/ig
];

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true
  }).split('\0').filter(Boolean);
}

function lineNumber(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function scanFile(relativePath) {
  if (relativePath.replace(/\\/g, '/') === 'scripts/secret-audit.js') return [];
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  const extension = path.extname(relativePath).toLowerCase();
  if (SKIP_SUFFIXES.has(extension)) return [];
  const stat = fs.statSync(absolutePath);
  if (stat.size > MAX_TEXT_BYTES) return [];
  const content = fs.readFileSync(absolutePath, 'utf8');
  if (content.includes('\u0000')) return [];
  const findings = [];

  SECRET_ASSIGNMENT_PATTERN.lastIndex = 0;
  let match;
  while ((match = SECRET_ASSIGNMENT_PATTERN.exec(content)) !== null) {
    const value = String(match[1] || '').trim();
    if (!SAFE_VALUE_PATTERN.test(value)) {
      findings.push({ relativePath, line: lineNumber(content, match.index), kind: 'literal-secret-assignment' });
    }
  }

  for (const pattern of PROVIDER_TOKEN_PATTERNS) {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      findings.push({ relativePath, line: lineNumber(content, match.index), kind: 'credential-pattern' });
    }
  }
  return findings;
}

const findings = trackedFiles().flatMap(scanFile);
if (findings.length === 0) {
  console.log('[secret-audit] tracked working tree: no credential literals detected');
  process.exit(0);
}

for (const finding of findings) {
  console.error(`[secret-audit] ${finding.relativePath}:${finding.line} ${finding.kind}`);
}
console.error(`[secret-audit] findings=${findings.length}`);
process.exit(STRICT ? 1 : 0);
