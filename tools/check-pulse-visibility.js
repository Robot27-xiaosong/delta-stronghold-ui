/* 直接在 Canvas 里对比「脉冲中 / 无脉冲」两帧的边缘亮度，确认贴边后闪烁还看得出来 */
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
app.commandLine.appendSwitch('no-sandbox');
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 700, height: 600, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(path.join(ROOT, 'index.html'));
  win.show(); win.focus(); win.setAlwaysOnTop(true, 'screen-saver');
  await sleep(800);
  const r = await win.webContents.executeJavaScript(`(async () => {
    const cv = document.getElementById('exportCanvas');
    cv.width = 512; cv.height = 512;
    const rd = new CanvasRenderer(cv, 'B1', true, 'normal', true);
    rd.borderState = 'green'; rd.borderProgress = 1; rd.borderColor = '#40ff70';
    rd.textColor = '#40ff70'; rd.displayText = 'B1'; rd.textMode = 'name'; rd.textOpacity = 1;
    const ctx = cv.getContext('2d');
    const bright = (band) => {
      const d = ctx.getImageData(0, 0, 512, 512).data;
      let sum = 0, n = 0;
      for (let y = 0; y < 512; y += 1) for (let x = 0; x < 512; x += 1) {
        const edge = x < band || x > 512 - band || y < band || y > 512 - band;
        if (!edge) continue;
        const i = (y * 512 + x) * 4;
        // 只统计灰底附近的像素（排除边框本身的纯绿），看「光晕」有没有把灰提亮
        const g = d[i+1], rr = d[i];
        if (g > 200) continue;
        sum += rr * 0.3 + g * 0.6 + d[i+2] * 0.1; n++;
      }
      return { v: +(sum / n).toFixed(1), n };
    };
    const out = {};
    // 无脉冲
    rd.pulseActive = false;
    rd.renderFrame(performance.now());
    out.noPulse = bright(60);
    out.frameNoPulse = cv.toDataURL('image/png');
    // 脉冲最强（e≈0，第 0 段 idx=0 → 强度 1）
    rd.triggerPulse('green');
    rd.renderFrame(performance.now());
    out.pulsePeak = bright(60);
    out.framePulse = cv.toDataURL('image/png');
    // 脉冲暗的那半（e=0.07? 亮度 0）
    rd.pulseStartTime = performance.now() - 60;
    rd.renderFrame(performance.now());
    out.pulseDim = bright(60);
    out.outerRing = (() => {
      // 画面最外 4px 有没有绿色（边框贴边）
      const d = ctx.getImageData(0, 0, 512, 512).data;
      let green = 0, total = 0;
      for (let y = 0; y < 512; y += 1) for (let x = 0; x < 512; x += 1) {
        if (x > 3 && x < 508 && y > 3 && y < 508) continue;
        const i = (y * 512 + x) * 4; total++;
        if (d[i+1] > 150 && d[i] < 150) green++;
      }
      return { greenRatio: +(green / total).toFixed(2) };
    })();
    return out;
  })()`, true);
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'string') fs.writeFileSync(path.join(ROOT, `tools/_pv_${k}.png`), Buffer.from(v.split(',')[1], 'base64'));
    else console.log(k, JSON.stringify(v));
  }
  app.exit(0);
});
