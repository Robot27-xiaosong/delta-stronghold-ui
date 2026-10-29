/**
 * split.js — 把单文件 index.html 拆成 index.html + css/ + js/ (+ assets/)
 *
 * 用法：
 *   node tools/split.js --src=../_refactor_backup/index.v3.0.0.original.html --out=. --assets=embed
 *   node tools/split.js --assets=file      # 素材抽成真实文件（需要验证 file:// 下字体/画布是否可用）
 *
 * 设计原则：
 *   1. 只做位置搬移，不改逻辑。拆分后每段内容与原文件逐字节一致（除素材引用方式）。
 *   2. 拆分后可拼回原文，verify.js 会做这个校验。
 *   3. 使用经典 <script>（非 ES module），保持全局作用域不变，避免 file:// 下的 CORS 限制。
 */
const fs = require('fs');
const path = require('path');

const args = {};
process.argv.slice(2).forEach(a => {
  const m = a.match(/^--([^=]+)=?(.*)$/);
  if (m) args[m[1]] = m[2] === '' ? true : m[2];
});

const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(args.src || path.join(ROOT, '..', '_refactor_backup', 'index.v3.0.0.original.html'));
const OUT = path.resolve(args.out || ROOT);
const ASSET_MODE = args.assets === 'file' ? 'file' : 'embed';

const raw = fs.readFileSync(SRC, 'utf8').replace(/^\uFEFF/, '');
const L = raw.split(/\r?\n/); // 统一成 LF

/** 取原文件 1-based 闭区间行 */
const slice = (a, b) => L.slice(a - 1, b).join('\n');

// ---------------------------------------------------------------- 分区定义
// CSS: <style> 7 .. </style> 1049（内容 8..1048）
const CSS_PARTS = [
  ['00-fonts.css', 8, 26, '内嵌字体（base64，自动生成区，别手改）'],
  ['00-base.css', 27, 60, '全局变量 & 基础样式'],
  ['10-panel.css', 61, 323, '左侧控制面板'],
  ['15-stage.css', 324, 437, '中间录屏舞台 + 据点卡片'],
  ['20-tutorial.css', 438, 634, '教程弹窗'],
  ['30-convoy.css', 635, 717, '大事件4：护送车队 UI'],
  ['40-classic.css', 718, 722, '经典版：左右栏合并为左侧边栏'],
  ['50-node-theme.css', 723, 777, '节点版：三栏 + 底部节点编辑器'],
  ['55-node-editor.css', 778, 938, '节点编辑器'],
  ['60-wiki.css', 939, 1048, 'Wiki 风格教程'],
];

// JS: <script> 1193 .. </script> 3349（内容 1194..3348）
const JS_PARTS = [
  ['00-core.js', 1194, 1209, '工具函数'],
  ['10-stronghold.js', 1210, 1582, 'StrongholdPoint 据点实例'],
  ['20-chain.js', 1583, 2015, 'EventChainManager 事件链调度'],
  ['30-samples.js', 2016, 2056, '示例事件链'],
  ['40-ui.js', 2057, 2461, 'UI 绑定 & 设置面板'],
  ['45-node-editor.js', 2462, 2785, '节点编辑器 + 据点尺寸'],
  ['60-renderer.js', 2786, 3348, 'Canvas 视频导出渲染器 + 模板导入导出 + 启动'],
];

// ---------------------------------------------------------------- 素材抽取
const FONT_RE = /data:font\/ttf;base64,[A-Za-z0-9+/=]+/g;
const IMG_RE = /data:image\/png;base64,[A-Za-z0-9+/=]+/g;

function write(rel, content) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

function writeBin(rel, b64) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.from(b64, 'base64'));
  return p;
}

// 字体：TacticalBold / TacticalMedium
const fontCssRaw = slice(8, 26);
const fonts = [...fontCssRaw.matchAll(FONT_RE)].map(m => m[0]);
if (fonts.length !== 2) throw new Error('字体数量异常: ' + fonts.length);
const FONT_FILES = ['P-BOLD.ttf', 'P-MED.ttf'];
fonts.forEach((d, i) => writeBin(path.join('assets', FONT_FILES[i]), d.split(',')[1]));

// 图片：旗子 / 坦克
const imgLines = [1485, 1486];
const imgs = imgLines.map(n => {
  const m = (L[n - 1] || '').match(IMG_RE);
  if (!m) throw new Error('第 ' + n + ' 行没找到 base64 图片');
  return m[0];
});
const IMG_FILES = ['flag.png', 'tank.png'];
imgs.forEach((d, i) => writeBin(path.join('assets', IMG_FILES[i]), d.split(',')[1]));

// ---------------------------------------------------------------- 生成 CSS
let fontCss = fontCssRaw;
if (ASSET_MODE === 'file') {
  let k = 0;
  fontCss = fontCss.replace(FONT_RE, () => 'data:font/ttf;base64,__FONT' + (k++) + '__');
  for (let i = 0; i < FONT_FILES.length; i++) {
    fontCss = fontCss.split('data:font/ttf;base64,__FONT' + i + '__').join('../assets/' + FONT_FILES[i]);
  }
}

const cssFiles = [];
CSS_PARTS.forEach(([name, a, b, desc], idx) => {
  let body = name === '00-fonts.css' ? fontCss : slice(a, b);
  const header = '/* ' + name + ' — ' + desc + ' */\n';
  write(path.join('css', name), header + body);
  cssFiles.push(name);
});

// ---------------------------------------------------------------- 生成 JS
// 先处理素材行（1485/1486）
const jsAssetMode = ASSET_MODE;
let stronghold = slice(1210, 1582);
if (jsAssetMode === 'file') {
  stronghold = stronghold
    .replace(/const flagSrc = 'data:image\/png;base64,[^']+';/, "const flagSrc = '../assets/flag.png';")
    .replace(/const tankSrc = 'data:image\/png;base64,[^']+';/, "const tankSrc = '../assets/tank.png';");
} else {
  stronghold = stronghold
    .replace(/const flagSrc = 'data:image\/png;base64,[^']+';/, 'const flagSrc = window.CONVOY_FLAG_SRC;')
    .replace(/const tankSrc = 'data:image\/png;base64,[^']+';/, 'const tankSrc = window.CONVOY_TANK_SRC;');
}

const jsFiles = [];
JS_PARTS.forEach(([name, a, b, desc]) => {
  let body = name === '10-stronghold.js' ? stronghold : slice(a, b);
  write(path.join('js', name), '/* ' + name + ' — ' + desc + ' */\n' + body);
  jsFiles.push(name);
});

// 素材模块（embed 模式才需要）
if (ASSET_MODE === 'embed') {
  const assetJs =
    '/* 00-assets.js — 自动生成，勿手改。\n' +
    ' * 护送车队素材以 base64 内嵌：file:// 下用外部图片会让 canvas 被标记为 tainted，\n' +
    ' * 导致导出视频失败，所以保持 data URI。改图请用 tools/split.js --assets=file 重新生成。\n' +
    ' */\n' +
    "window.CONVOY_FLAG_SRC = '" + imgs[0] + "';\n" +
    "window.CONVOY_TANK_SRC = '" + imgs[1] + "';\n";
  fs.writeFileSync(path.join(OUT, 'js', '00-assets.js'), assetJs, 'utf8');
  jsFiles.unshift('00-assets.js');
}

// ---------------------------------------------------------------- 生成 index.html
const headTop = slice(1, 6);
const bodyMarkup = slice(1052, 1192);
const tailMarkup = slice(3350, L.length);

const out = [
  headTop,
  '',
  '<!-- 样式：按顺序加载，顺序即层叠优先级，别随意调换 -->',
  ...cssFiles.map(f => '  <link rel="stylesheet" href="css/' + f + '">'),
  '</head>',
  '<body>',
  bodyMarkup,
  '',
  '<!-- 脚本：经典脚本（非 module），按顺序加载，共享同一全局作用域 -->',
  ...jsFiles.map(f => '<script src="js/' + f + '"></script>'),
  tailMarkup,
].join('\n');

write('index.html', out);

// ---------------------------------------------------------------- 报告
const kb = p => (fs.statSync(path.join(OUT, p)).size / 1024).toFixed(1) + ' KB';
console.log('素材模式:', ASSET_MODE);
console.log('css:', cssFiles.map(f => f + '(' + kb('css/' + f) + ')').join(', '));
console.log('js :', jsFiles.map(f => f + '(' + kb('js/' + f) + ')').join(', '));
console.log('index.html:', kb('index.html'));
console.log('assets:', FONT_FILES.concat(IMG_FILES).map(f => f).join(', '));
