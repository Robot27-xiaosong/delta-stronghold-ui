/* 验证 WebM 护送导出：角落像素 alpha 应为 0（真透明） */
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
app.commandLine.appendSwitch('no-sandbox');
const ROOT = path.resolve(__dirname, '..');
const file = process.argv[2] || 'tools/_exp/据点_B1_20261028_101834.webm';
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 700, height: 600, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(path.join(ROOT, 'index.html'));
  win.show(); win.focus(); win.setAlwaysOnTop(true, 'screen-saver');
  await sleep(600);
  const b64 = fs.readFileSync(path.join(ROOT, file)).toString('base64');
  const res = await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const vid = document.createElement('video'); vid.muted = true; vid.src = 'data:video/webm;base64,${b64}';
    vid.loop = true;
    await new Promise(r => { vid.onloadeddata = r; });
    vid.play();
    await sleep(900); // 播到中段
    const cv = document.createElement('canvas');
    cv.width = vid.videoWidth; cv.height = vid.videoHeight;
    const ctx = cv.getContext('2d');
    ctx.drawImage(vid, 0, 0);
    const corners = {
      tl: ctx.getImageData(5, 5, 1, 1).data,
      tr: ctx.getImageData(vid.videoWidth - 6, 5, 1, 1).data,
      bl: ctx.getImageData(5, vid.videoHeight - 6, 1, 1).data,
      br: ctx.getImageData(vid.videoWidth - 6, vid.videoHeight - 6, 1, 1).data,
    };
    const out = {};
    for (const k in corners) out[k] = Array.from(corners[k]);
    return { w: cv.width, h: cv.height, corners: out };
  })()`, true);
  console.log(JSON.stringify(res, null, 2));
  app.exit(0);
});
