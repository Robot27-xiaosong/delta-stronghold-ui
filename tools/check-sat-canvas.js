/* 把 CanvasRenderer 画的附属据点帧存成 PNG，肉眼确认图标绘制正确 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 1400, height: 900, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(path.join(ROOT, 'index.html'));
  win.show(); win.focus(); win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop();
  await sleep(1200);
  const dataUrl = await win.webContents.executeJavaScript(`(() => {
    const cv = document.getElementById('exportCanvas');
    const rd = new CanvasRenderer(cv, 'C1', true, 'satellite');
    rd.borderState = 'green'; rd.borderProgress = 1; rd.borderColor = '#40ff70';
    rd.textColor = '#40ff70'; rd.displayText = 'C1'; rd.textMode = 'name';
    rd.renderFrame(performance.now());
    // 只截中间那块，避免整张画布太空
    const c2 = document.createElement('canvas');
    const S = Math.min(cv.width, cv.height);
    c2.width = S; c2.height = S;
    c2.getContext('2d').drawImage(cv, (cv.width - S) / 2, (cv.height - S) / 2, S, S, 0, 0, S, S);
    return c2.toDataURL('image/png');
  })()`, true);
  fs.writeFileSync(path.join(__dirname, 'shot-sat-canvas.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('已保存 tools/shot-sat-canvas.png');
  app.exit(0);
});
