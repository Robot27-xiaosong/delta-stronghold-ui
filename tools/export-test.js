/* export-test.js — 验证「导出视频」三种模式 × 两种格式是否真的产出可播放文件 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

/* 测试直接起 BrowserWindow，不走 main.js，所以这里自己注册保存用的 IPC
   （真实运行走 main.js 的原生「另存为」） */
ipcMain.handle('media:save', async (e, payload) => {
  const { bytes, defaultName } = payload || {};
  const p = path.join(__dirname, '_exp', defaultName);
  const buf = Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength || bytes.length || 0);
  fs.writeFileSync(p, buf);
  return { canceled: false, path: p, size: buf.length, auto: true };
});
ipcMain.handle('media:reveal', async () => true);

// DS_GPU=1 时保留 GPU，用来测真实编码性能
if (!process.env.DS_GPU) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('disable-software-rasterizer');
}
app.commandLine.appendSwitch('no-sandbox');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, '_exp');
fs.mkdirSync(OUT_DIR, { recursive: true });
process.env.DS_EXPORT_TEST_DIR = OUT_DIR;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 解析 MP4 顶层 box，确认是标准封装（ftyp|moov|mdat，而不是 fMP4 的 moof） */
function inspectMp4(file) {
  const buf = fs.readFileSync(file);
  let p = 0; const boxes = [];
  while (p + 8 <= buf.length) {
    let sz = buf.readUInt32BE(p);
    const ty = buf.toString('ascii', p + 4, p + 8);
    if (sz === 1) sz = Number(buf.readBigUInt64BE(p + 8));
    boxes.push(ty);
    if (sz < 8) break;
    p += sz;
  }
  return { size: buf.length, boxes, fragmented: boxes.includes('moof'), faststart: boxes.indexOf('moov') < boxes.indexOf('mdat') };
}

function inspectWebm(file) {
  const buf = fs.readFileSync(file);
  return { size: buf.length, ebml: buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3 };
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: true, width: 1280, height: 820,
    webPreferences: { backgroundThrottling: false, preload: path.join(ROOT, 'preload.js'), contextIsolation: true },
  });
  win.show(); win.focus(); win.setAlwaysOnTop(true, 'screen-saver');
  await win.loadFile(path.join(ROOT, 'index.html'));
  await win.webContents.executeJavaScript('localStorage.clear()', true);
  await win.webContents.reload();
  await sleep(1200);

  async function runCase(title, blocks, format, jsPrep) {
    const before = new Set(fs.readdirSync(OUT_DIR));
    const res = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      appSettings.exportFormat = ${JSON.stringify(format)};
      const logsBefore = document.querySelectorAll('#logBox .log-line').length;
      ${jsPrep || ''}
      const id = window.__exportTestPointId || Object.keys(manager.points)[0];
      manager.setActive(id);
      document.querySelector('.mode-tab[data-mode="code"]').click();
      document.getElementById('chainEditor').value = JSON.stringify(${JSON.stringify(blocks)}, null, 2);
      document.getElementById('btnExport').click();
      const t0 = Date.now();
      let ok = false, err = '';
      while (Date.now() - t0 < 60000) {
        const lines = [...document.querySelectorAll('#logBox .log-line')].map(e => e.textContent).slice(logsBefore);
        if (lines.some(l => l.includes('视频已导出'))) { ok = true; break; }
        if (lines.some(l => l.includes('❌'))) { err = lines.filter(l => l.includes('❌')).join(' | '); break; }
        await sleep(200);
      }
      const lines = [...document.querySelectorAll('#logBox .log-line')].map(e => e.textContent).slice(logsBefore);
      return { ok, err, lines: lines.filter(l => /导出|录制|编码|❌|⚠|MB|帧/.test(l)) };
    })()`, true);
    await sleep(600);
    const added = fs.readdirSync(OUT_DIR).filter(f => !before.has(f));
    const file = added.length ? path.join(OUT_DIR, added[0]) : null;
    let info = null;
    if (file) info = format === 'mp4' ? inspectMp4(file) : inspectWebm(file);
    return { title, format, ...res, file, info };
  }

  const cases = [
    ['据点模式', [{ type: 'redState' }, { type: 'redRetreat', duration: 0.3 }, { type: 'greenAdvance', duration: 0.8 }, { type: 'standby', duration: 0.2 }], 'mp4', ''],
    // 护送用例走「新版大事件4」（检查点 + 坦克状态），先打开实验开关
    ['护送车队（紫幕MP4）', [{ type: 'greenState' }, { type: 'bigEvent', variant: 4, totalSeconds: 4, warningAt: 1,
      checkpoints: [{ remain: 1, bonus: 1 }, { remain: 1, bonus: 0 }],
      tankStates: [{ at: 1, state: 'repair' }, { at: 2, state: 'arrow2' }],
      failMode: 'none', failValue: 0, holdSeconds: 1 }], 'mp4', ''],
    ['护送车队（透明WebM）', [{ type: 'greenState' }, { type: 'bigEvent', variant: 4, totalSeconds: 4, warningAt: 1,
      checkpoints: [{ remain: 2, bonus: 0 }],
      tankStates: [{ at: 0, state: 'arrow3' }],
      failMode: 'none', failValue: 0, holdSeconds: 1 }], 'webm', ''],
    ['附属据点', [{ type: 'greenState' }, { type: 'greenRetreat', duration: 1 }], 'mp4',
      `const sid = manager.createPoint('C1', 'satellite'); window.__exportTestPointId = sid; manager.setActive(sid);`],
    ['据点模式·WebM', [{ type: 'greenState' }, { type: 'greenAdvance', duration: 1 }], 'webm', ''],
    ['1024 分辨率', [{ type: 'greenState' }, { type: 'greenAdvance', duration: 1 }], 'mp4',
      'appSettings.exportRes = 1024;']
  ];

  const results = [];
  await win.webContents.executeJavaScript('appSettings.experimentalBig4 = true;', true);   // 护送用例＝新版
  for (const [title, blocks, fmt, prep] of cases) {
    const r = await runCase(title, blocks, fmt, prep);
    results.push(r);
    const baseOk = r.ok && r.file;
    console.log(`\n【${title} · ${fmt.toUpperCase()}】${baseOk ? '✅ 导出成功' : '❌ 失败 ' + (r.err || '无文件')}`);
    if (r.file) console.log('  文件:', path.basename(r.file), (fs.statSync(r.file).size / 1024 / 1024).toFixed(2) + 'MB', JSON.stringify(r.info));
    r.lines.forEach(l => console.log('   ' + l));
  }

  const allOk = results.every(r => r.ok && r.file);
  const mp4s = results.filter(r => r.format === 'mp4' && r.info);
  const mp4Good = mp4s.length > 0 && mp4s.every(r => !r.info.fragmented && r.info.faststart);

  // 各分辨率下 H.264 是否可用（设置里可选 768 / 1024）
  const resSupport = await win.webContents.executeJavaScript(`(async () => {
    const o = {};
    for (const [s, fr] of [[512,60],[768,60],[1024,60],[1024,30]]) {
      try { const r = await VideoEncoder.isConfigSupported({ codec: 'avc1.42E033', width: s, height: s, bitrate: 2e7, framerate: fr });
        o[s + '@' + fr] = !!r.supported; } catch (e) { o[s + '@' + fr] = false; }
    }
    return o;
  })()`, true);

  // 再验一遍：把导出的 MP4 读回页面，看能不能解码 + seek
  let playback = null;
  const firstMp4 = results.find(r => r.format === 'mp4' && r.file);
  if (firstMp4) {
    const b64 = fs.readFileSync(firstMp4.file).toString('base64');
    playback = await win.webContents.executeJavaScript(`(async () => new Promise(res => {
      const v = document.createElement('video'); v.muted = true;
      v.src = 'data:video/mp4;base64,${b64}';
      v.onloadedmetadata = () => { v.currentTime = Math.min(1, v.duration / 2); };
      v.onseeked = () => res({ dur: +v.duration.toFixed(2), w: v.videoWidth, h: v.videoHeight, seek: +v.currentTime.toFixed(2) });
      v.onerror = () => res({ err: 'decode failed code=' + (v.error && v.error.code) });
      setTimeout(() => res({ err: 'timeout' }), 6000);
    }))()`, true);
  }

  console.log('\n=== 汇总 ===');
  console.log('全部导出成功:', allOk ? 'YES' : 'NO');
  console.log('MP4 均为标准封装(非 fMP4 + faststart):', mp4Good ? 'YES' : 'NO');
  console.log('各分辨率 H.264 支持:', JSON.stringify(resSupport));
  console.log('MP4 回读解码:', JSON.stringify(playback));
  await sleep(300);
  app.exit(allOk && mp4Good && playback && !playback.err ? 0 : 1);
});
