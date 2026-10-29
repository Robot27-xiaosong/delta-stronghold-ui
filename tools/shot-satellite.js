const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const ROOT = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 1400, height: 900, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(path.join(ROOT, 'index.html'));
  win.show(); win.focus(); win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop();
  await win.webContents.executeJavaScript('localStorage.clear()', true);
  await win.webContents.reload();
  await sleep(1500);
  const r = await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    manager.removePoint(Object.keys(manager.points)[0]);
    manager.removePoint(Object.keys(manager.points)[0]);
    const mk = (n) => {
      document.getElementById('inputNewPoint').value = n;
      document.getElementById('chkSatellitePoint').checked = true;
      document.getElementById('btnAddPoint').click();
    };
    mk('C1'); await sleep(150); mk('C2'); await sleep(150); mk('C3');
    await sleep(300);
    const [a, b, c] = Object.values(manager.points);
    // 中立 / 绿 / 红
    a.setFullBorder('green'); a.setFullBorder('green'); a.clearBorder(); a.setNameText('C1', 'neutral');
    b.setFullBorder('green'); b.setNameText('C2', 'gti');
    c.setFullBorder('red'); c.setNameText('C3', 'havvk');
    // C2 模拟警报中的感叹号
    b.textMode = 'alert';
    b.satelliteIcon.style.opacity = '0';
    const mark = b._ensureMark('alert', 'gti');
    mark.textContent = '!';
    mark.style.transition = 'none';
    mark.style.opacity = '1';
    await sleep(200);
    const rs = [a, b, c].map(p => p.element.getBoundingClientRect());
    const x0 = Math.min(...rs.map(r => r.x)) - 20, x1 = Math.max(...rs.map(r => r.right)) + 20;
    const y0 = Math.min(...rs.map(r => r.y)) - 20, y1 = Math.max(...rs.map(r => r.bottom)) + 20;
    return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
  })()`, true);
  await sleep(300);
  const img = await win.capturePage({ x: r.x, y: r.y, width: r.w, height: r.h });
  fs.writeFileSync(path.join(__dirname, 'shot-satellite.png'), img.toPNG());
  console.log('截图区域', JSON.stringify(r));
  app.exit(0);
});
