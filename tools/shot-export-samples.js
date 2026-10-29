/* 导出一次带脉冲的视频，并按时间抽几帧存 PNG（看边缘留白与闪烁） */
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '_exp5');
fs.mkdirSync(OUT, { recursive: true });
fs.readdirSync(OUT).forEach(f => fs.unlinkSync(path.join(OUT, f)));
process.env.DS_EXPORT_TEST_DIR = OUT;
require(path.resolve(__dirname, '../main.js'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  await sleep(2500);
  const win = BrowserWindow.getAllWindows()[0];
  win.show(); win.focus(); win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop();
  await sleep(700);
  await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    appSettings.exportFormat = 'mp4';
    appSettings.exportRes = 512;
    document.querySelector('.mode-tab[data-mode="code"]').click();
    document.getElementById('chainEditor').value = JSON.stringify([
      { type: 'greenState' }, { type: 'greenAdvance', duration: 0.8 }, { type: 'standby', duration: 0.8 }
    ]);
    manager.setActive(Object.keys(manager.points)[0]);
    const before = document.querySelectorAll('#logBox .log-line').length;
    document.getElementById('btnExport').click();
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      const lines = [...document.querySelectorAll('#logBox .log-line')].map(e => e.textContent).slice(before);
      if (lines.some(l => l.includes('视频已导出'))) return true;
      if (lines.some(l => l.includes('❌'))) return false;
      await sleep(200);
    }
    return false;
  })()`, true);

  const mp4 = fs.readdirSync(OUT).find(f => f.endsWith('.mp4'));
  if (!mp4) { console.log('没导出成功'); app.exit(1); return; }
  const b64 = fs.readFileSync(path.join(OUT, mp4)).toString('base64');
  const frames = await win.webContents.executeJavaScript(`(async () => {
    const v = document.createElement('video'); v.muted = true;
    v.src = 'data:video/mp4;base64,${b64}';
    await new Promise(r => { v.onloadedmetadata = r; });
    const cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight;
    const cx = cv.getContext('2d');
    const out = [];
    // 总时长约 1.9s：0.8s 推进结束 → 脉冲 0.5s
    const times = [0.15, 0.5, 0.85, 0.95, 1.05, 1.3];
    for (const t of times) {
      v.currentTime = t;
      await new Promise(r => { v.onseeked = r; });
      cx.drawImage(v, 0, 0);
      out.push({ t, data: cv.toDataURL('image/png') });
    }
    return { w: cv.width, h: cv.height, dur: v.duration, frames: out };
  })()`, true);
  frames.frames.forEach((f, i) =>
    fs.writeFileSync(path.join(__dirname, `_expframe_${i}_t${String(f.t).replace('.', '_')}.png`), Buffer.from(f.data.split(',')[1], 'base64')));
  console.log('时长', frames.dur.toFixed(2) + 's', '尺寸', frames.w + 'x' + frames.h);
  console.log('帧:', frames.frames.map(f => f.t).join(', '));
  app.exit(0);
});
