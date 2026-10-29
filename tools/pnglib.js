/* 纯 Node PNG 读写（无第三方依赖），给图标提取用 */
const fs = require('fs');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function readPNG(file) {
  const buf = fs.readFileSync(file);
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('不是 PNG');
  let off = 8;
  let w = 0, h = 0, bitDepth = 8, colorType = 6, interlace = 0;
  const idat = [];
  let palette = null, trns = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.slice(off + 4, off + 8).toString('ascii');
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (interlace) throw new Error('不支持隔行 PNG');
  if (bitDepth !== 8) throw new Error('只支持 8 位深，当前 ' + bitDepth);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('不支持 colorType ' + colorType);
  const bpp = channels;
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 4);   // 统一输出 RGBA
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = Buffer.from(raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v = (v + a) & 0xff;
      else if (ft === 2) v = (v + b) & 0xff;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      line[x] = v;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (colorType === 6) { out[o] = line[x * 4]; out[o + 1] = line[x * 4 + 1]; out[o + 2] = line[x * 4 + 2]; out[o + 3] = line[x * 4 + 3]; }
      else if (colorType === 2) { out[o] = line[x * 3]; out[o + 1] = line[x * 3 + 1]; out[o + 2] = line[x * 3 + 2]; out[o + 3] = 255; }
      else if (colorType === 0) { out[o] = out[o + 1] = out[o + 2] = line[x]; out[o + 3] = 255; }
      else if (colorType === 4) { out[o] = out[o + 1] = out[o + 2] = line[x * 2]; out[o + 3] = line[x * 2 + 1]; }
      else if (colorType === 3) {
        const i = line[x];
        out[o] = palette[i * 3]; out[o + 1] = palette[i * 3 + 1]; out[o + 2] = palette[i * 3 + 2];
        out[o + 3] = trns && i < trns.length ? trns[i] : 255;
      }
    }
    prev = line;
  }
  return { width: w, height: h, data: out };
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function writePNG(file, { width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
  return png.length;
}

/** 裁剪 + 整数倍最近邻放大，可选反色（便于看白色图标） */
function cropZoom(img, x0, y0, w, h, zoom = 1, opts = {}) {
  const outW = w * zoom, outH = h * zoom;
  const data = Buffer.alloc(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = x0 + Math.floor(x / zoom);
      const sy = y0 + Math.floor(y / zoom);
      const si = (sy * img.width + sx) * 4;
      const di = (y * outW + x) * 4;
      let r = img.data[si], g = img.data[si + 1], b = img.data[si + 2], a = img.data[si + 3];
      if (opts.invert) { r = 255 - r; g = 255 - g; b = 255 - b; }
      if (opts.flatten) { // 透明压到指定底色上
        const bg = opts.flatten;
        r = Math.round(r * a / 255 + bg[0] * (1 - a / 255));
        g = Math.round(g * a / 255 + bg[1] * (1 - a / 255));
        b = Math.round(b * a / 255 + bg[2] * (1 - a / 255));
        a = 255;
      }
      data[di] = r; data[di + 1] = g; data[di + 2] = b; data[di + 3] = a;
    }
  }
  return { width: outW, height: outH, data };
}

module.exports = { readPNG, writePNG, cropZoom };
