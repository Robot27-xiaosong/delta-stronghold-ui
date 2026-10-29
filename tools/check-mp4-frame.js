/* 从导出的 MP4 里抽几帧存 PNG，肉眼确认画面内容正常 */
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
app.commandLine.appendSwitch('no-sandbox');
const ROOT = path.resolve(__dirname, '..');
const file = process.argv[2] || 'tools/_exp/据点_B1_20261028_082426.mp4';
const sleep = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 700, height: 600, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(path.join(ROOT, 'index.html'));
  win.show(); win.focus(); win.setAlwaysOnTop(true, 'screen-saver');
  await sleep(600);
  const b64 = fs.readFileSync(path.join(ROOT, file)).toString('base64');
  const shots = await win.webContents.executeJavaScript(`(async () => {
    const v = new Image();
    const vid = document.createElement('video'); vid.muted = true; vid.src = 'data:video/mp4;base64,${b64}';
    await new Promise(r => { vid.onloadedmetadata = r; });
    const out = [];
    const cv = document.createElement('canvas');
    cv.width = vid.videoWidth; cv.height = vid.videoHeight;
    const ctx = cv.getContext('2d');
    for (const frac of [0.15, 0.6, 0.95]) {
      vid.currentTime = vid.duration * frac;
      await new Promise(r => { vid.onseeked = r; });
      ctx.drawImage(vid, 0, 0);
      out.push(cv.toDataURL('image/png'));
    }
    return { w: cv.width, h: cv.height, dur: vid.duration, frames: out };
  })()`, true);
  shots.frames.forEach((d, i) => fs.writeFileSync(path.join(__dirname, `_mp4frame${i}.png`), Buffer.from(d.split(',')[1], 'base64')));
  console.log('尺寸', shots.w + 'x' + shots.h, '时长', shots.dur.toFixed(2) + 's', '帧已存 _mp4frame0/1/2.png');
  app.exit(0);
});
