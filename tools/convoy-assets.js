/* 护送车队素材：把现成的 7 张深底白图（正方形+高清修复）抠成「纯白 + 透明底」PNG
   - tank    : 坦克本体（不含状态图标）
   - flag    : 旗子（检查点标记）
   - arrow1/2/3 : 坦克前方的加速状态图标（单/双/三箭头）
   - repair  : 扳手（修理中，坦克停）
   - warn    : 感叹号（受阻，几乎不动）

   做法：亮度→alpha（深底≈25 / 白图≈255，60~230 软过渡当抗锯齿）
        → 紧致 bbox + 3% 边距 → 面积平均重采样（保比例，不拉成正方形）
   输出：tools/convoy-<name>.png，并重写 js/00-assets.js（保留附属据点图标那段）

   用法：node tools/convoy-assets.js
*/
const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');
const { writePNG } = require('./pnglib');

const SRC_DIR = path.join(__dirname, 'convoy-src');
const SRC = {
  tank:   'tank.jpg',
  flag:   'flag.jpg',
  arrow1: 'arrow1.jpg',
  arrow2: 'arrow2.jpg',
  arrow3: 'arrow3.jpg',
  repair: 'repair.jpg',
  warn:   'warn.jpg',
};
/* 输出高度（宽度按原图比例算），页面最大显示也才几十像素，不必更大 */
const OUT_H = { tank: 384, flag: 512, arrow1: 256, arrow2: 256, arrow3: 256, repair: 256, warn: 256 };

function lumToAlpha(img) {
  const { width: W, height: H, data } = img.bitmap;
  const alpha = new Float32Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    let a = (lum - 60) / 170;
    alpha[i] = a < 0 ? 0 : a > 1 ? 1 : a;
  }
  return { W, H, alpha };
}

function tightBbox(alpha, W, H) {
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (alpha[y * W + x] > 0.35) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { minX, maxX, minY, maxY };
}

/* 面积平均重采样（按源矩形 → 输出 w×h） */
function resample(alpha, W, H, sx0, sy0, sx1, sy1, ow, oh) {
  const out = new Float32Array(ow * oh);
  const scaleX = (sx1 - sx0) / ow, scaleY = (sy1 - sy0) / oh;
  for (let oy = 0; oy < oh; oy++) {
    const y0 = sy0 + oy * scaleY, y1 = y0 + scaleY;
    const iy0 = Math.max(0, Math.floor(y0)), iy1 = Math.min(H - 1, Math.ceil(y1) - 1);
    for (let ox = 0; ox < ow; ox++) {
      const x0 = sx0 + ox * scaleX, x1 = x0 + scaleX;
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
      out[oy * ow + ox] = wsum > 0 ? sum / wsum : 0;
    }
  }
  return out;
}

function writeWhitePNG(file, alpha, w, h) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 255; rgba[i * 4 + 1] = 255; rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, alpha[i])) * 255);
  }
  writePNG(file, { width: w, height: h, data: rgba });
}

async function main() {
  const b64 = {};
  const dims = {};
  for (const [key, file] of Object.entries(SRC)) {
    const p = path.join(SRC_DIR, file);
    if (!fs.existsSync(p)) throw new Error('缺源图: ' + p);
    const img = await Jimp.read(p);
    const { W, H, alpha } = lumToAlpha(img);
    const bb = tightBbox(alpha, W, H);
    const bw = bb.maxX - bb.minX + 1, bh = bb.maxY - bb.minY + 1;
    const padX = bw * 0.03, padY = bh * 0.03;
    const oh = OUT_H[key];
    const ow = Math.max(8, Math.round(bw / bh * oh));
    const out = resample(alpha, W, H, bb.minX - padX, bb.minY - padY,
      bb.minX + bw + padX, bb.minY + bh + padY, ow, oh);
    const outFile = path.join(__dirname, 'convoy-' + key + '.png');
    writeWhitePNG(outFile, out, ow, oh);
    b64[key] = fs.readFileSync(outFile).toString('base64');
    dims[key] = ow + 'x' + oh;
    console.log(`${key.padEnd(7)} 源 ${W}x${H} bbox ${bw}x${bh} → ${ow}x${oh}  ${(b64[key].length / 1024).toFixed(1)}KB b64`);
  }

  /* ---- 重写 js/00-assets.js：保留文件头注释与附属据点图标段 ---- */
  const ASSETS = path.join(__dirname, '..', 'js', '00-assets.js');
  const old = fs.readFileSync(ASSETS, 'utf8');
  const satStart = old.indexOf('window.SATELLITE_ICON_PNG');
  if (satStart < 0) throw new Error('00-assets.js 里找不到 SATELLITE_ICON_PNG，先检查文件');
  const satTail = old.slice(satStart);
  const header = `/* ============================================================
   素材资源（自动生成区，别在这里手写代码）
   —— 字体在 css/00-fonts.css，这里只放图片的 base64
   —— 护送车队素材：node tools/convoy-assets.js（源图在 tools/convoy-src/）
   ============================================================ */

/* 护送：坦克（不含状态图标）与旗子 */
window.CONVOY_TANK_SRC = 'data:image/png;base64,${b64.tank}';
window.CONVOY_FLAG_SRC = 'data:image/png;base64,${b64.flag}';

/* 护送：坦克前方的状态小图标（none = 不显示，即正常速度） */
window.CONVOY_ST_SRCS = {
  arrow1: 'data:image/png;base64,${b64.arrow1}',
  arrow2: 'data:image/png;base64,${b64.arrow2}',
  arrow3: 'data:image/png;base64,${b64.arrow3}',
  repair: 'data:image/png;base64,${b64.repair}',
  warn:   'data:image/png;base64,${b64.warn}'
};

`;
  fs.writeFileSync(ASSETS, header + satTail);
  console.log('\njs/00-assets.js 重写完成', (fs.statSync(ASSETS).size / 1024).toFixed(0) + 'KB');
  console.log('尺寸(宽x高):', JSON.stringify(dims));
}

main().catch(e => { console.error('失败', e); process.exit(1); });
