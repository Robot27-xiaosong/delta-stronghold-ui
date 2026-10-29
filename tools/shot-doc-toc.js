const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
app.commandLine.appendSwitch('no-sandbox');
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 1280, height: 900,
    webPreferences: { backgroundThrottling: false, preload: path.join(ROOT, 'preload.js'), contextIsolation: true } });
  win.show(); win.focus(); win.setAlwaysOnTop(true, 'screen-saver');
  await win.loadFile(path.join(ROOT, 'index.html'));
  await sleep(1500);
  await win.webContents.executeJavaScript(`document.getElementById('btnTutorial').click()`, true);
  await sleep(1500);
  const box = await win.webContents.executeJavaScript(`(() => {
    const p = document.querySelector('#tutorialOverlay .tutorial-panel');
    const b = p.getBoundingClientRect();
    const c = p.querySelector('.tutorial-content');
    c.scrollTop = 0;
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
             shown: document.getElementById('tutorialOverlay').classList.contains('show') };
  })()`, true);
  console.log('box', JSON.stringify(box));
  await sleep(400);
  const img = await win.capturePage({ x: box.x, y: box.y, width: box.w, height: Math.min(box.h, 700) });
  fs.writeFileSync(path.join(__dirname, 'shot-doc-toc.png'), img.toPNG());
  console.log('done');
  app.exit(0);
});
