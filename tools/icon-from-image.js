/* 用现成的高清图标图（1920×1920 JPEG，深底白图）直接抠成白色 + alpha 的 PNG。
   不做任何描摹/拟合 —— 形状就是这张图本身。
   输出：tools/satellite-icon.png（SIZE×SIZE）、tools/satellite-icon.b64.txt，
        并写进 js/00-assets.js 的 window.SATELLITE_ICON_PNG
   用法：node tools/icon-from-image.js [图片路径] [输出尺寸=512] */
const fs = require('fs');
const Jimp = require('jimp');
const { writePNG } = require('./pnglib');

const SRC = process.argv[2] || 'C:/Users/pc/.workbuddy/clipboard-images/clipboard-2026-10-27T23-33-43-190Z-345c257e.jpg';
const SIZE = +(process.argv[3] || 512);

Jimp.read(SRC).then(img => {
  const { width: W, height: H, data } = img.bitmap;
  const lum = new Float32Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4)
    lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];

  /* 背景 ~25，图形 ~255。留 60~230 做软过渡，把 JPEG 边缘那几像素的模糊翻译成抗锯齿 */
  const LO = 60, HI = 230;
  const alpha = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    let a = (lum[i] - LO) / (HI - LO);
    alpha[i] = a < 0 ? 0 : a > 1 ? 1 : a;
  }

  /* 紧致 bbox（alpha>0.5） */
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (alpha[y * W + x] > 0.5) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const side = Math.max(bw, bh) * 1.02;          // 留 1% 边距
  console.log('原图', W + 'x' + H, '紧致 bbox', bw + 'x' + bh, '裁成正方形边长', side.toFixed(1));

  /* 面积平均缩小（box filter）—— 比双线性缩小干净，不会丢细节也不会出摩尔纹 */
  const half = side / 2;
  const sx0 = cx - half, sy0 = cy - half;
  const scale = side / SIZE;
  const out = new Float32Array(SIZE * SIZE);
  for (let oy = 0; oy < SIZE; oy++) {
    const y0 = sy0 + oy * scale, y1 = y0 + scale;
    const iy0 = Math.max(0, Math.floor(y0)), iy1 = Math.min(H - 1, Math.ceil(y1) - 1);
    for (let ox = 0; ox < SIZE; ox++) {
      const x0 = sx0 + ox * scale, x1 = x0 + scale;
      const ix0 = Math.max(0, Math.floor(x0)), ix1 = Math.min(W - 1, Math.ceil(x1) - 1);
      let sum = 0, wsum = 0;
      for (let y = iy0; y <= iy1; y++) {
        const ty = Math.min(y1, y + 1) - Math.max(y0, y);
        if (ty <= 0) continue;
        for (let x = ix0; x <= ix1; x++) {
          const tx = Math.min(x1, x + 1) - Math.max(x0, x);
          if (tx <= 0) continue;
          const wgt = tx * ty;
          sum += alpha[y * W + x] * wgt; wsum += wgt;
        }
      }
      out[oy * SIZE + ox] = wsum > 0 ? sum / wsum : 0;
    }
  }

  /* 白色 + alpha */
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    rgba[i * 4] = 255; rgba[i * 4 + 1] = 255; rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = Math.round(out[i] * 255);
  }
  writePNG('tools/satellite-icon.png', { width: SIZE, height: SIZE, data: rgba });
  const b64 = fs.readFileSync('tools/satellite-icon.png').toString('base64');
  fs.writeFileSync('tools/satellite-icon.b64.txt', b64);

  /* 写进 js/00-assets.js */
  const ASSETS = 'js/00-assets.js';
  const lines = fs.readFileSync(ASSETS, 'utf8').split('\n')
    .filter(l => !l.startsWith('window.SATELLITE_ICON_PNG ='));
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  lines.push(`window.SATELLITE_ICON_PNG =\n  'data:image/png;base64,${b64}';`);
  lines.push('');
  fs.writeFileSync(ASSETS, lines.join('\n'));

  console.log('图标', SIZE + 'x' + SIZE,
    (fs.statSync('tools/satellite-icon.png').size / 1024).toFixed(1) + 'KB',
    'base64', (b64.length / 1024).toFixed(1) + 'KB');
}).catch(e => { console.error('失败', e); process.exit(1); });
