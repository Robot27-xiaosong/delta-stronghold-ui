/* 在导出视频里找「脉冲闪光最亮」的帧，存图看闪烁是否可见 */
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
app.commandLine.appendSwitch('no-sandbox');
const ROOT = path.resolve(__dirname, '..');
const dir = path.join(ROOT, 'tools/_exp5');
const mp4 = fs.readdirSync(dir).find(f => f.endsWith('.mp4'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 700, height: 600, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(path.join(ROOT, 'index.html'));
  win.show(); win.focus(); win.setAlwaysOnTop(true, 'screen-saver');
  await sleep(800);
  const b64 = fs.readFileSync(path.join(dir, mp4)).toString('base64');
  const r = await win.webContents.executeJavaScript(`(async () => {
    const v = document.createElement('video'); v.muted = true;
    v.src = 'data:video/mp4;base64,${b64}';
    await new Promise(r => { v.onloadedmetadata = r; });
    const W = v.videoWidth, H = v.videoHeight;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d');
    // 统计「边框内侧 30px 环带」的亮度，脉冲时会明显变亮
    const ringBright = () => {
      const d = cx.getImageData(0, 0, W, H).data;
      let sum = 0, n = 0;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
        const edge = x < 34 || x > W - 34 || y < 34 || y > H - 34;
        if (!edge) continue;
        const i = (y * W + x) * 4;
        sum += d[i] * 0.3 + d[i+1] * 0.6 + d[i+2] * 0.1; n++;
      }
      return sum / n;
    };
    let best = { t: 0, v: -1 }, all = [];
    for (let t = 0; t < v.duration; t += 0.04) {
      v.currentTime = t;
      await new Promise(res => { v.onseeked = res; });
      cx.drawImage(v, 0, 0);
      const b = ringBright();
      all.push(+b.toFixed(1));
      if (b > best.v) best = { t: +t.toFixed(2), v: +b.toFixed(1) };
    }
    // 平均亮度和最大值差多少（判断闪烁幅度）
    const avg = all.reduce((a, b) => a + b, 0) / all.length;
    v.currentTime = best.t;
    await new Promise(res => { v.onseeked = res; });
    cx.drawImage(v, 0, 0);
    return { dur: +v.duration.toFixed(2), best, avg: +avg.toFixed(1), baseline: all[0], png: cv.toDataURL('image/png') };
  })()`, true);
  fs.writeFileSync(path.join(ROOT, 'tools/_pulse_frame.png'), Buffer.from(r.png.split(',')[1], 'base64'));
  delete r.png;
  console.log(JSON.stringify(r));
  app.exit(0);
});
