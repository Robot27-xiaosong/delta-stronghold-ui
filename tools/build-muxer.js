/* 把 mp4-muxer 打成经典脚本（IIFE，全局 Mp4Muxer），供 file:// 页面直接加载
   用法：node tools/build-muxer.js */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const entry = path.join(ROOT, 'tools/_muxer-entry.js');
fs.writeFileSync(entry, "export { Muxer, ArrayBufferTarget } from 'mp4-muxer';\n");
esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'Mp4Muxer',
  target: 'es2020',
  outfile: path.join(ROOT, 'js/05-vendor-mp4.js'),
  legalComments: 'none'
});
fs.unlinkSync(entry);
const st = fs.statSync(path.join(ROOT, 'js/05-vendor-mp4.js'));
console.log('已生成 js/05-vendor-mp4.js', (st.size / 1024).toFixed(1) + 'KB');
