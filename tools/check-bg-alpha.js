/* 验证「灰块透明度」：页面 DOM 与导出画面都要跟着变 */
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '_exp6');
fs.mkdirSync(OUT, { recursive: true });
fs.readdirSync(OUT).forEach(f => fs.unlinkSync(path.join(OUT, f)));
process.env.DS_EXPORT_TEST_DIR = OUT;
require(path.resolve(__dirname, '../main.js'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  await sleep(2500);
  const win = BrowserWindow.getAllWindows()[0];
  win.show(); win.focus(); win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop();
  await sleep(800);

  // 1) 页面 DOM 上的灰块透明度
  const dom = await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const el = document.querySelector('.stronghold-bg');
    const read = () => getComputedStyle(el).backgroundColor;
    const before = read();
    appSettings.bgAlpha = 30; applyBgAlpha(); await sleep(120);
    const mid = read();
    appSettings.bgAlpha = 82; applyBgAlpha(); await sleep(120);
    return { before, mid, back: read(), slider: !!document.getElementById('setBgAlpha') };
  })()`, true);
  console.log('DOM:', JSON.stringify(dom));

  // 2) 导出（透明度 30%），取中心像素看是否透出背景色
  const exp = await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    appSettings.bgAlpha = 30;
    applyBgAlpha();
    appSettings.exportFormat = 'mp4';
    appSettings.exportRes = 512;
    document.querySelector('.mode-tab[data-mode="code"]').click();
    document.getElementById('chainEditor').value = JSON.stringify([{ type: 'neutralState' }, { type: 'standby', duration: 0.6 }]);
    manager.setActive(Object.keys(manager.points)[0]);
    const before = document.querySelectorAll('#logBox .log-line').length;
    document.getElementById('btnExport').click();
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      const lines = [...document.querySelectorAll('#logBox .log-line')].map(e => e.textContent).slice(before);
      if (lines.some(l => l.includes('视频已导出'))) return { ok: true, lines: lines.filter(l => /透明|导出/.test(l)) };
      if (lines.some(l => l.includes('❌'))) return { ok: false, lines: lines.filter(l => l.includes('❌')) };
      await sleep(200);
    }
    return { ok: false, lines: ['timeout'] };
  })()`, true);
  console.log('导出:', JSON.stringify(exp));

  const mp4 = fs.readdirSync(OUT).find(f => f.endsWith('.mp4'));
  if (!mp4) { console.log('无文件'); app.exit(1); return; }
  const b64 = fs.readFileSync(path.join(OUT, mp4)).toString('base64');
  const px = await win.webContents.executeJavaScript(`(async () => {
    const v = document.createElement('video'); v.muted = true;
    v.src = 'data:video/mp4;base64,${b64}';
    await new Promise(r => { v.onloadedmetadata = r; });
    v.currentTime = v.duration * 0.5;
    await new Promise(r => { v.onseeked = r; });
    const cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight;
    const cx = cv.getContext('2d'); cx.drawImage(v, 0, 0);
    const pick = (x, y) => { const d = cx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
    return { corner: pick(2, 2), center: pick(v.videoWidth >> 1, v.videoHeight >> 1), bodyBg: getComputedStyle(document.body).backgroundColor };
  })()`, true);
  console.log('成片像素:', JSON.stringify(px));
  app.exit(0);
});
