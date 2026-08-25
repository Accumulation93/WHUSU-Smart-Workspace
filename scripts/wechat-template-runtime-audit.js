'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const MINI_ROOT = path.join(ROOT, 'miniprogram');
const MAX_SINGLE_TEMPLATE_TAGS = 2375;
const failures = [];

function walk(dir, output) {
  const result = output || [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, result);
    else if (entry.isFile() && entry.name.endsWith('.wxml')) result.push(fullPath);
  }
  return result;
}

function relativeMiniPath(file) {
  return path.relative(MINI_ROOT, file).replace(/\\/g, '/');
}

function report(file, message) {
  failures.push(relativeMiniPath(file) + ': ' + message);
}

function findCompiler() {
  const configured = String(process.env.WECHAT_TEMPLATE_COMPILER_PATH || '').trim();
  const candidates = [
    configured,
    path.join(process.env['ProgramFiles(x86)'] || '', 'Tencent', '微信web开发者工具', 'code', 'package.nw', 'node_modules', 'glass-easel-template-compiler', 'glass_easel_template_compiler.js'),
    path.join(process.env.ProgramFiles || '', 'Tencent', '微信web开发者工具', 'code', 'package.nw', 'node_modules', 'glass-easel-template-compiler', 'glass_easel_template_compiler.js')
  ].filter(Boolean);
  return candidates.find(function(candidate) { return fs.existsSync(candidate); }) || '';
}

function registerExternalScripts(group, file, source) {
  const pattern = /<wxs\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/g;
  let match = pattern.exec(source);
  while (match) {
    const scriptFile = path.resolve(path.dirname(file), match[2]);
    if (!fs.existsSync(scriptFile)) {
      report(file, '外部 WXS 不存在: ' + match[2]);
    } else {
      group.addScript(relativeMiniPath(scriptFile), fs.readFileSync(scriptFile, 'utf8'));
    }
    match = pattern.exec(source);
  }
}

const files = walk(MINI_ROOT);
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const tagCount = (source.match(/<[A-Za-z][^>]*>/g) || []).length;
  if (tagCount > MAX_SINGLE_TEMPLATE_TAGS) {
    report(file, '单模板包含 ' + tagCount + ' 个元素，超过 ' + MAX_SINGLE_TEMPLATE_TAGS + ' 个硬上限；必须拆分自定义组件，避免 Glass-Easel 生成保留字变量');
  }
}

const compilerPath = findCompiler();
if (compilerPath) {
  const compiler = require(compilerPath);
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const group = compiler.TmplGroup.newDev();
    try {
      registerExternalScripts(group, file, source);
      const diagnostics = group.addTmpl(relativeMiniPath(file), source) || [];
      const errors = diagnostics.filter(function(item) {
        return item && (item.level === 'error' || item.error === true || item.severity === 'error');
      });
      if (errors.length) {
        report(file, 'Glass-Easel 编译错误: ' + JSON.stringify(errors));
        continue;
      }
      const generated = group.getTmplGenObject(relativeMiniPath(file));
      new vm.Script(generated, { filename: relativeMiniPath(file) + '.generated.js' });
    } catch (error) {
      report(file, 'Glass-Easel 生成代码无法解析: ' + error.message);
    } finally {
      group.free();
    }
  }
}

if (failures.length) {
  console.error('微信模板运行时审计失败（' + failures.length + ' 项）：');
  failures.forEach(function(item) { console.error('- ' + item); });
  process.exitCode = 1;
} else {
  console.log('微信模板运行时审计通过：' + files.length + ' 个 WXML；' + (compilerPath ? '已使用本机 Glass-Easel 生成并解析全部模板。' : '当前环境无 Glass-Easel，已执行模板复杂度硬门禁。'));
}
