/* 把「大事件」闪烁用的叉号换成高清剪影图。
   —— 和 icon-from-image.js 同一套思路：不做描摹，只把深底白图转成白色 + alpha 的 PNG
   —— 区别：这里保留原始宽高比（叉号不是严格正方形），并且只缩到 256 高就够用
   输出：tools/bigevent-x.png，并写进 js/00-assets.js 的 window.BIGEVENT_X_PNG
   用法：node tools/x-from-image.js [图片路径] [目标高度=256] */
const fs = require('fs');
const { PNG } = require('pngjs');
const { writePNG } = require('./pnglib');

const SRC = process.argv[2] || 'C:/Users/pc/Downloads/image.png';
const TARGET_H = +(process.argv[3] || 256);

const png = PNG.sync.read(fs.readFileSync(SRC));
const W = png.width, H = png.height, data = png.data;

/* 亮度 → alpha。背景约 24，图形约 254，60~230 留作软过渡（吃掉 JPEG/PNG 边缘的抗锯齿） */
const LO = 60, HI = 230;
const alpha = new Float32Array(W * H);
for (let i = 0, p = 0; i < W * H; i++, p += 4) {
  const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  const a = (lum - LO) / (HI - LO);
  alpha[i] = a < 0 ? 0 : a > 1 ? 1 : a;
}

/* 紧致 bbox（alpha > 0.5） */
let minX = W, maxX = -1, minY = H, maxY = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (alpha[y * W + x] > 0.5) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
const bw = maxX - minX + 1, bh = maxY - minY + 1;
const scale = bh / TARGET_H;
const OUT_W = Math.max(1, Math.round(bw / scale));
const OUT_H = TARGET_H;
console.log('原图 ' + W + 'x' + H + '，可见区域 ' + bw + 'x' + bh + ' → 输出 ' + OUT_W + 'x' + OUT_H);

/* 面积平均缩小（box filter）：比双线性干净，斜边不会出阶梯 */
const out = new Float32Array(OUT_W * OUT_H);
for (let oy = 0; oy < OUT_H; oy++) {
  const y0 = minY + oy * scale, y1 = y0 + scale;
  const iy0 = Math.max(minY, Math.floor(y0)), iy1 = Math.min(maxY, Math.ceil(y1) - 1);
  for (let ox = 0; ox < OUT_W; ox++) {
    const x0 = minX + ox * scale, x1 = x0 + scale;
    const ix0 = Math.max(minX, Math.floor(x0)), ix1 = Math.min(maxX, Math.ceil(x1) - 1);
    let sum = 0, wsum = 0;
    for (let y = iy0; y <= iy1; y++) {
      const ty = Math.min(y1, y + 1) - Math.max(y0, y);
      if (ty <= 0) continue;
      for (let x = ix0; x <= ix1; x++) {
        const tx = Math.min(x1, x + 1) - Math.max(x0, x);
        if (tx <= 0) continue;
        const wgt = tx * ty;
        sum += alpha[y * W + x] * wgt;
        wsum += wgt;
      }
    }
    out[oy * OUT_W + ox] = wsum > 0 ? sum / wsum : 0;
  }
}

/* 纯白 + alpha（页面靠 mask + currentColor 上色，导出靠 source-in） */
const rgba = Buffer.alloc(OUT_W * OUT_H * 4);
for (let i = 0; i < OUT_W * OUT_H; i++) {
  rgba[i * 4] = 255; rgba[i * 4 + 1] = 255; rgba[i * 4 + 2] = 255;
  rgba[i * 4 + 3] = Math.round(out[i] * 255);
}
writePNG('tools/bigevent-x.png', { width: OUT_W, height: OUT_H, data: rgba });
const b64 = fs.readFileSync('tools/bigevent-x.png').toString('base64');

/* 写进 js/00-assets.js（这一段是自动生成区，只替换同名变量） */
const ASSETS = 'js/00-assets.js';
const lines = fs.readFileSync(ASSETS, 'utf8').split('\n')
  .filter(l => !l.startsWith('window.BIGEVENT_X_PNG ='))
  .filter(l => !/^  'data:image\/png;base64,[^']*';?$/.test(l) || !l.includes('BIGEVENT_MARK'));
while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
lines.push(`window.BIGEVENT_X_PNG =\n  'data:image/png;base64,${b64}';`);
lines.push('');
fs.writeFileSync(ASSETS, lines.join('\n'));

console.log('叉号 ' + OUT_W + 'x' + OUT_H,
  (fs.statSync('tools/bigevent-x.png').size / 1024).toFixed(1) + 'KB',
  'base64 ' + (b64.length / 1024).toFixed(1) + 'KB');
