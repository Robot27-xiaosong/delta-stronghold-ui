/**
 * probe.js — 用隐藏的 Electron 窗口把应用跑起来，自动点一遍主要功能，收集问题。
 *
 * 用法：npx electron tools/probe.js
 * 输出：控制台报告 + tools/probe-report.json
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('allow-file-access-from-files');

const ROOT = path.resolve(__dirname, '..');
const consoleMsgs = [];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: true,
    width: 1280,
    height: 820,
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  win.webContents.on('console-message', (...args) => {
    // Electron < 35: (event, level, message, line, sourceId)
    const [, level, message, line, source] = args;
    consoleMsgs.push({ level, message, line, source });
  });
  win.webContents.on('render-process-gone', (e, d) => {
    consoleMsgs.push({ level: 3, message: 'RENDER PROCESS GONE: ' + JSON.stringify(d) });
  });
  win.webContents.on('preload-error', (e, p, err) => {
    consoleMsgs.push({ level: 3, message: 'PRELOAD ERROR: ' + err.message });
  });

  const target = process.argv[3] || path.join(ROOT, 'index.html');
  console.log('加载页面: ' + target);
  await win.loadFile(path.resolve(target));
  // 窗口被遮挡时 Chromium 会暂停合成，CSS 过渡不推进，采样会误判
  win.show();
  win.focus();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
  // 清掉上一轮跑测试写进去的 localStorage，保证每次从干净状态开始
  await win.webContents.executeJavaScript('localStorage.clear()', true);
  await win.webContents.reload();
  await sleep(1200); // 等 load 事件里的初始化跑完

  const suiteName = process.argv[2] || 'probe-suite.js';
  const tests = fs.readFileSync(path.join(__dirname, suiteName), 'utf8');
  let results;
  try {
    results = await win.webContents.executeJavaScript(`(async () => { ${tests} })()`, true);
  } catch (err) {
    results = [{ name: '测试套件执行', status: 'FAIL', detail: '脚本抛异常: ' + err.message }];
  }

  const report = { console: consoleMsgs, tests: results };
  fs.writeFileSync(path.join(__dirname, 'probe-report.json'), JSON.stringify(report, null, 2), 'utf8');

  // ---- 打印 ----
  const errs = consoleMsgs.filter(m => m.level >= 2);
  console.log('\n========== 控制台错误/警告 (' + errs.length + ') ==========');
  errs.slice(0, 30).forEach(m => console.log(`  [${m.level}] ${m.message}  (${m.source}:${m.line})`));

  console.log('\n========== 功能测试 (' + results.length + ') ==========');
  results.forEach(t => {
    const icon = t.status === 'PASS' ? '✅' : t.status === 'FAIL' ? '❌' : 'ℹ️ ';
    console.log(`${icon} ${t.name}${t.detail ? ' — ' + t.detail : ''}`);
  });

  const failed = results.filter(t => t.status === 'FAIL').length;
  console.log(`\n结果：${results.length - failed} 通过 / ${failed} 失败`);

  await sleep(200);
  app.exit(0);
});
