/**
 * build-portable.js — 把当前源码打进 dist/win-unpacked/resources/app.asar，并压缩成绿色版 zip
 *
 * 用法：node tools/build-portable.js [版本号]
 *
 * 为什么要手动替换 asar：
 *   electron-builder 的 winCodeSign 在无管理员权限时解不开符号链接，完整重建会失败，
 *   所以沿用「解包 → 换文件 → 重打包」的方式，只更新 asar。
 */
const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const UNPACKED = path.join(DIST, 'win-unpacked');
const ASAR = path.join(UNPACKED, 'resources', 'app.asar');
const TMP = path.join(DIST, '_tmp');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = process.argv[2] || pkg.version;
const ZIP = path.join(DIST, `DeltaStrongholdUI-v${version}-portable.zip`);

// 进 asar 的内容（与 package.json build.files 保持一致）
const ENTRIES = ['main.js', 'preload.js', 'package.json', 'index.html', 'css', 'js', 'assets'];

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }

if (!fs.existsSync(ASAR)) {
  console.error('找不到 ' + ASAR + '，先用 electron-builder 生成一次 win-unpacked');
  process.exit(1);
}

// 1. 解包
rmrf(TMP);
asar.extractAll(ASAR, TMP);
console.log('解包完成');

// 2. 覆盖源码
for (const e of ENTRIES) {
  const src = path.join(ROOT, e);
  const dst = path.join(TMP, e);
  if (!fs.existsSync(src)) { console.log('跳过（不存在）: ' + e); continue; }
  fs.cpSync(src, dst, { recursive: true });
  console.log('覆盖: ' + e);
}

// 3. 重新打包
const BAK = path.join(DIST, 'app.asar.bak');   // 备份放到 dist/ 外面，别进 zip
if (fs.existsSync(BAK)) fs.rmSync(BAK, { force: true });
fs.copyFileSync(ASAR, BAK);
async function pack() {
  if (asar.createPackage.length >= 3) {
    await new Promise((res, rej) => asar.createPackage(TMP, ASAR, (err) => err ? rej(err) : res()));
  } else {
    await asar.createPackage(TMP, ASAR);
  }
}

pack().then(() => {
  // 4. 校验
  const listed = asar.listPackage(ASAR).map(p => p.replace(/^[\\/]/, '').replace(/\\/g, '/'));
  const need = ['index.html', 'main.js', 'preload.js', 'css/00-base.css', 'js/00-core.js', 'js/60-renderer.js'];
  const missing = need.filter(f => !listed.includes(f));
  if (missing.length) {
    console.error('❌ asar 里缺文件: ' + missing.join(', '));
    process.exit(1);
  }
  console.log('✅ asar 已更新，大小 ' + (fs.statSync(ASAR).size / 1024 / 1024).toFixed(2) + ' MB，入口文件齐全');
  console.log('下一步打包 zip: ' + ZIP);
}).catch(err => {
  console.error('打包失败:', err);
  process.exit(1);
});

