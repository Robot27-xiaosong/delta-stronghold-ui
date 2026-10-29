/* 验证三件事：
   1) 导出的 MP4 没有一圈黑边（四角是背景色，不是黑）
   2) 导出完成后进度弹窗/悬浮圆窗自动消失
   3) 节点卡片拖到下方后，连线 SVG 跟着变高、画布可滚动（线不会被裁） */
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '_exp4');
fs.mkdirSync(OUT, { recursive: true });
fs.readdirSync(OUT).forEach(f => fs.unlinkSync(path.join(OUT, f)));
process.env.DS_EXPORT_TEST_DIR = OUT;
require(path.resolve(__dirname, '../main.js'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  await sleep(2500);
  const win = BrowserWindow.getAllWindows()[0];
  win.show(); win.focus(); win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop();
  await sleep(800);

  /* ---------- 1+2 导出 ---------- */
  const exp = await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    appSettings.exportFormat = 'mp4';
    appSettings.exportRes = 512;
    document.querySelector('.mode-tab[data-mode="code"]').click();
    document.getElementById('chainEditor').value = JSON.stringify([{ type: 'greenState' }, { type: 'greenAdvance', duration: 0.8 }]);
    manager.setActive(Object.keys(manager.points)[0]);
    const before = document.querySelectorAll('#logBox .log-line').length;
    document.getElementById('btnExport').click();
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      const lines = [...document.querySelectorAll('#logBox .log-line')].map(e => e.textContent).slice(before);
      if (lines.some(l => l.includes('视频已导出'))) {
        await sleep(500);
        return {
          ok: true,
          overlayShown: document.getElementById('exportOverlay').classList.contains('show'),
          floatShown: document.getElementById('exportFloat').classList.contains('show'),
          lines: lines.filter(l => /导出|📁|打开/.test(l))
        };
      }
      if (lines.some(l => l.includes('❌'))) return { ok: false, lines: lines.filter(l => l.includes('❌')) };
      await sleep(200);
    }
    return { ok: false, lines: ['timeout'] };
  })()`, true);
  console.log('导出结果:', JSON.stringify(exp, null, 1));

  const mp4 = fs.readdirSync(OUT).find(f => f.endsWith('.mp4'));
  let px = null;
  if (mp4) {
    const b64 = fs.readFileSync(path.join(OUT, mp4)).toString('base64');
    px = await win.webContents.executeJavaScript(`(async () => {
      const v = document.createElement('video'); v.muted = true;
      v.src = 'data:video/mp4;base64,${b64}';
      await new Promise(r => { v.onloadedmetadata = r; });
      v.currentTime = v.duration * 0.5;
      await new Promise(r => { v.onseeked = r; });
      const cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight;
      const cx = cv.getContext('2d'); cx.drawImage(v, 0, 0);
      const pick = (x, y) => { const d = cx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
      const W = cv.width, H = cv.height;
      return { size: W + 'x' + H, lt: pick(1, 1), rt: pick(W - 2, 1), lb: pick(1, H - 2), rb: pick(W - 2, H - 2), center: pick(W >> 1, H >> 1) };
    })()`, true);
  }
  console.log('四角像素:', JSON.stringify(px));

  /* ---------- 3 节点编辑器连线 ---------- */
  const ne = await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.body.classList.add('new-ui');
    if (window.__neInit === undefined && typeof initNodeEditor === 'function') { window.__neInit = 1; }
    // 确保有 4 个节点
    visualBlocks = [
      { type: 'greenState' }, { type: 'greenAdvance', duration: 2 },
      { type: 'standby', duration: 1 }, { type: 'greenRetreat', duration: 2 }
    ];
    if (window.neSyncFromBlocks) window.neSyncFromBlocks();
    await sleep(400);
    const canvas = document.getElementById('neCanvas');
    const svg = document.getElementById('neLines');
    const cards = [...canvas.querySelectorAll('.ne-card')];
    if (!cards.length) return { err: '无卡片' };
    const last = cards[cards.length - 1];
    const head = last.querySelector('.nc-head');
    const r = head.getBoundingClientRect();
    const cRect = canvas.getBoundingClientRect();
    // 模拟拖拽：从标题栏拖到画布下方很远的位置
    head.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.x + 20, clientY: r.y + 8 }));
    const targetY = cRect.top + canvas.clientHeight + 240;
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.x + 20, clientY: targetY }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await sleep(300);
    const lastRect = last.getBoundingClientRect();
    return {
      cardBottomInContent: Math.round(last.offsetTop + last.offsetHeight),
      svgHeight: parseInt(svg.style.height) || 0,
      canvasClientH: canvas.clientHeight,
      scrollable: canvas.scrollHeight > canvas.clientHeight + 4,
      pathCount: svg.querySelectorAll('path.ne-conn-line').length,
      lastCardVisible: lastRect.bottom > cRect.top && lastRect.top < cRect.bottom + 400
    };
  })()`, true);
  console.log('节点连线:', JSON.stringify(ne, null, 1));

  const pass1 = px && !(px.lt[0] < 20 && px.lt[1] < 20 && px.lt[2] < 20) && !(px.rb[0] < 20);
  const pass2 = exp.ok && !exp.overlayShown && !exp.floatShown;
  const pass3 = ne && !ne.err && ne.svgHeight >= ne.cardBottomInContent && ne.scrollable && ne.pathCount >= 3;
  console.log('\\n=== 结果 ===');
  console.log('1) 视频无黑边:', pass1 ? 'PASS' : 'FAIL');
  console.log('2) 弹窗自动消失:', pass2 ? 'PASS' : 'FAIL');
  console.log('3) 连线不被裁:', pass3 ? 'PASS' : 'FAIL');
  app.exit(pass1 && pass2 && pass3 ? 0 : 1);
});
