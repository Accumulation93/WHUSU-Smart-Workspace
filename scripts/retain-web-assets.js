'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MANIFEST = '.release-assets.json';
const RETAIN_GENERATIONS = 5;
const MAX_BYTES = 128 * 1024 * 1024;

// 只复制 Vite 生成的静态文件，保留旧页面的懒加载依赖；清单按版本有界保存。
function assetPath(root, name) {
  if (typeof name !== 'string' || !/^assets\/[A-Za-z0-9_.\/-]+$/.test(name) || name.split('/').includes('..')) throw new Error('静态文件路径无效');
  const target = path.resolve(root, name);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('静态文件越界');
  const real = fs.realpathSync(target);
  if (!real.startsWith(fs.realpathSync(root) + path.sep) || !fs.statSync(real).isFile()) throw new Error('静态文件不是目录内的普通文件');
  return target;
}
function ownAssets(root) {
  const base = path.join(root, 'assets');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => 'assets/' + entry.name).sort();
}
function retainWebAssets(currentRoot, previousRoot, bootstrapRoots = []) {
  const owned = ownAssets(currentRoot);
  const generations = [];
  if (previousRoot && fs.existsSync(previousRoot)) {
    const manifestPath = path.join(previousRoot, MANIFEST);
    const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { owned: ownAssets(previousRoot), generations: [] };
    if (!Array.isArray(previous.owned) || !Array.isArray(previous.generations)) throw new Error('旧版本静态清单损坏');
    const sources = new Map();
    generations.push(previous.owned, ...previous.generations);
    for (const name of generations.flat()) sources.set(name, previousRoot);
    if (!fs.existsSync(manifestPath)) {
      for (const root of bootstrapRoots) {
        if (generations.length >= RETAIN_GENERATIONS) break;
        if (path.resolve(root) === path.resolve(previousRoot) || path.resolve(root) === path.resolve(currentRoot)) continue;
        const names = ownAssets(root);
        if (!names.length) continue;
        generations.push(names);
        for (const name of names) if (!sources.has(name)) sources.set(name, root);
      }
    }
    generations.length = Math.min(generations.length, RETAIN_GENERATIONS);
    const names = [...new Set(generations.flat())];
    let bytes = 0;
    for (const name of names) {
      const source = assetPath(sources.get(name), name);
      bytes += fs.statSync(source).size;
      if (bytes > MAX_BYTES) throw new Error('旧版本静态文件超过保留预算');
      const destination = path.resolve(currentRoot, name);
      if (fs.existsSync(destination)) {
        assetPath(currentRoot, name);
        if (!fs.readFileSync(source).equals(fs.readFileSync(destination))) throw new Error('同名静态文件内容不一致');
      } else {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      }
    }
  }
  const manifest = { owned, generations };
  fs.writeFileSync(path.join(currentRoot, MANIFEST), JSON.stringify(manifest));
  return manifest;
}
if (require.main === module) {
  const [currentRoot, previousRoot, releasesRoot] = process.argv.slice(2);
  if (!currentRoot) throw new Error('缺少新版本静态目录');
  const bootstrapRoots = releasesRoot && fs.existsSync(releasesRoot)
    ? fs.readdirSync(releasesRoot, { withFileTypes: true }).filter(entry => entry.isDirectory() && /^[a-f0-9]{40}$/.test(entry.name))
      .map(entry => path.join(releasesRoot, entry.name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
      .map(root => path.join(root, 'web', 'dist')) : [];
  const manifest = retainWebAssets(currentRoot, previousRoot, bootstrapRoots);
  console.log('网页静态文件已保留最近 ' + manifest.generations.length + ' 个旧版本');
}
module.exports = { retainWebAssets };
