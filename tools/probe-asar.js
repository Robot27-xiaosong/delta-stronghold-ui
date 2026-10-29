/* 冒烟：直接从 app.asar 里加载页面，确认 MP4 导出所需的东西都在 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
app.commandLine.appendSwitch('no-sandbox');
const ROOT = path.resolve(__dirname, '..');
const ASAR = path.join(ROOT, 'dist/win-unpacked/resources/app.asar');
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: true, width: 1100, height: 800,
    webPreferences: { backgroundThrottling: false, preload: path.join(ASAR, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.show(); win.focus(); win.setAlwaysOnTop(true, 'screen-saver');
  await win.loadFile(path.join(ASAR, 'index.html'));
  await sleep(1500);
  const r = await win.webContents.executeJavaScript(`(async () => ({
    title: document.title,
    muxer: typeof window.Mp4Muxer,
    encoder: typeof VideoEncoder,
    format: appSettings.exportFormat,
    hasVendor: !!document.querySelector('script[src*="05-vendor-mp4"]'),
    avc: (await VideoEncoder.isConfigSupported({codec:'avc1.42E033',width:512,height:512,bitrate:1e7,framerate:60})).supported,
    saveApi: !!(window.electronAPI && window.electronAPI.saveMediaFile)
  }))()`, true);
  console.log(JSON.stringify(r, null, 1));
  app.exit(r.muxer === 'object' && r.avc && r.saveApi && r.format === 'mp4' ? 0 : 1);
});
