/* 截图：教程（目录 + 导出章节）与设置面板（带说明小字） */
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
app.commandLine.appendSwitch('no-sandbox');
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: true, width: 1280, height: 900,
    webPreferences: { backgroundThrottling: false, preload: path.join(ROOT, 'preload.js'), contextIsolation: true }
  });
  win.show(); win.focus(); win.setAlwaysOnTop(true, 'screen-saver');
  await win.loadFile(path.join(ROOT, 'index.html'));
  await sleep(1400);

  // 1) 教程：目录 + 快速上手
  await win.webContents.executeJavaScript(`document.getElementById('btnTutorial').click()`, true);
  await sleep(1200);
  let box = await win.webContents.executeJavaScript(`(() => {
    const p = document.querySelector('#tutorialOverlay .tutorial-panel');
    const b = p.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  })()`, true);
  let img = await win.capturePage({ x: box.x, y: box.y, width: box.w, height: Math.min(box.h, 760) });
  fs.writeFileSync(path.join(__dirname, 'shot-doc-tutorial.png'), img.toPNG());

  // 2) 教程：滚到导出章节
  const ok = await win.webContents.executeJavaScript(`(() => {
    const el = document.getElementById('wiki-10');
    if (!el) return false;
    el.scrollIntoView({ block: 'start' });
    return true;
  })()`, true);
  await sleep(600);
  img = await win.capturePage({ x: box.x, y: box.y, width: box.w, height: Math.min(box.h, 760) });
  fs.writeFileSync(path.join(__dirname, 'shot-doc-export.png'), img.toPNG());
  console.log('导出章节定位:', ok);
  await win.webContents.executeJavaScript(`document.getElementById('tutorialClose').click()`, true);
  await sleep(400);

  // 3) 设置面板
  await win.webContents.executeJavaScript(`document.getElementById('btnSettings').click()`, true);
  await sleep(500);
  box = await win.webContents.executeJavaScript(`(() => {
    const p = document.querySelector('#settingsOverlay .tutorial-panel');
    const b = p.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  })()`, true);
  img = await win.capturePage({ x: box.x, y: box.y, width: box.w, height: Math.min(box.h, 780) });
  fs.writeFileSync(path.join(__dirname, 'shot-doc-settings.png'), img.toPNG());
  console.log('已输出 shot-doc-tutorial / shot-doc-export / shot-doc-settings');
  app.exit(0);
});
