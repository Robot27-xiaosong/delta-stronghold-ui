/**
 * verify.js — 校验拆分没有改动任何逻辑
 * 逐段对比「拆分后的文件」与「原始单文件」对应行区间，只允许已知的素材引用变化。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(ROOT, '..', '_refactor_backup', 'index.v3.0.0.original.html');
const raw = fs.readFileSync(SRC, 'utf8').replace(/^\uFEFF/, '');
const L = raw.split(/\r?\n/);
const slice = (a, b) => L.slice(a - 1, b).join('\n').split('\n');

const CSS_PARTS = [
  ['00-fonts.css', 8, 26],
  ['00-base.css', 27, 60],
  ['10-panel.css', 61, 323],
  ['15-stage.css', 324, 437],
  ['20-tutorial.css', 438, 634],
  ['30-convoy.css', 635, 717],
  ['40-classic.css', 718, 722],
  ['50-node-theme.css', 723, 777],
  ['55-node-editor.css', 778, 938],
  ['60-wiki.css', 939, 1048],
];
const JS_PARTS = [
  ['00-core.js', 1194, 1209],
  ['10-stronghold.js', 1210, 1582],
  ['20-chain.js', 1583, 2015],
  ['30-samples.js', 2016, 2056],
  ['40-ui.js', 2057, 2461],
  ['45-node-editor.js', 2462, 2785],
  ['60-renderer.js', 2786, 3348],
];

let fail = 0;
const problems = [];

function cmp(rel, expected, allowLine) {
  const got = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  // 去掉 split.js 注入的头注释行
  got.shift();
  // 去掉尾部空行差异
  while (got.length && got[got.length - 1] === '' ) got.pop();
  while (expected.length && expected[expected.length - 1] === '') expected.pop();

  if (got.length !== expected.length) {
    fail++;
    problems.push(rel + ': 行数不一致 期望 ' + expected.length + ' 实际 ' + got.length);
    return;
  }
  for (let i = 0; i < expected.length; i++) {
    if (got[i] !== expected[i]) {
      if (allowLine && allowLine(i, got[i], expected[i])) continue;
      fail++;
      problems.push(rel + ':' + (i + 2) + ' 内容不一致\n  期望: ' + expected[i].slice(0, 100) + '\n  实际: ' + got[i].slice(0, 100));
      if (problems.length > 12) return;
    }
  }
}

CSS_PARTS.forEach(([n, a, b]) => cmp('css/' + n, slice(a, b)));
JS_PARTS.forEach(([n, a, b]) => cmp('js/' + n, slice(a, b), (i, got, exp) => {
  // 只允许护送车队素材引用方式变化
  return /CONVOY_(FLAG|TANK)_SRC/.test(got) && /data:image\/png;base64,/.test(exp);
}));

// index.html 检查
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const need = ['css/00-fonts.css', 'js/00-assets.js', 'js/60-renderer.js']
  .filter(f => !html.includes(f));
if (need.length) { fail++; problems.push('index.html 缺少引用: ' + need.join(',')); }
if (html.includes('data:image/png;base64')) { fail++; problems.push('index.html 里还有 base64 图片'); }
if (html.includes('<style>')) { fail++; problems.push('index.html 里还有内联 <style>'); }

// body 标记块是否原样保留
const bodyExpected = slice(1052, 1192).join('\n').replace(/\s+/g, '');
if (!html.replace(/\s+/g, '').includes(bodyExpected.slice(0, 2000))) {
  fail++; problems.push('body 标记块疑似缺失或被改动');
}

console.log(fail === 0 ? '✅ 校验通过：拆分结果与原始文件逻辑一致' : '❌ 校验失败');
problems.slice(0, 20).forEach(p => console.log(' - ' + p));
process.exit(fail === 0 ? 0 : 1);
