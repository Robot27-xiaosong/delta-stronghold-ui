/* probe-suite.js — 在页面内执行的测试套件（由 probe.js 注入） */
const R = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ok = (name, cond, detail) => R.push({ name, status: cond ? 'PASS' : 'FAIL', detail: detail || '' });
const info = (name, detail) => R.push({ name, status: 'INFO', detail: detail || '' });

const pageErrors = [];
window.addEventListener('error', (e) => pageErrors.push(e.message));
window.addEventListener('unhandledrejection', (e) => pageErrors.push('unhandledrejection: ' + e.reason));

async function waitIdle(timeout = 10000) {
  const t0 = performance.now();
  while (manager.isRunning && performance.now() - t0 < timeout) await sleep(50);
  await sleep(120);
}

try {
  /* ---------------- 1. 启动状态 ---------------- */
  const ids = Object.keys(manager.points);
  ok('启动后创建 2 个据点', ids.length === 2, '实际 ' + ids.length);
  const p1 = manager.points[ids[0]], p2 = manager.points[ids[1]];
  ok('B1 默认绿色边框', p1 && p1.borderState === 'green', 'borderState=' + (p1 && p1.borderState));
  ok('B2 默认红色边框', p2 && p2.borderState === 'red', 'borderState=' + (p2 && p2.borderState));
  ok('默认选中第一个据点', manager.activePointId === ids[0]);
  ok('日志区已输出内容', document.querySelectorAll('#logBox .log-line').length > 0);

  /* ---------------- 2. 边框粗细 ---------------- */
  const bw = document.getElementById('setBorderWidth');
  bw.value = 15;
  bw.dispatchEvent(new Event('input', { bubbles: true }));
  const applied = [...document.querySelectorAll('.border-path')].map(e => getComputedStyle(e).strokeWidth);
  ok('边框粗细对已有据点生效', applied.length > 0 && applied.every(v => parseFloat(v) === 15), applied.join(','));

  const newId = manager.createPoint('T9');
  const newPath = manager.points[newId].svgPath;
  await sleep(60);
  ok('边框粗细对新建据点生效', parseFloat(getComputedStyle(newPath).strokeWidth) === 15,
    '实际 ' + getComputedStyle(newPath).strokeWidth);
  bw.value = 7;
  bw.dispatchEvent(new Event('input', { bubbles: true }));

  /* ---------------- 3. 据点大小 / 字号 ---------------- */
  const ps = document.getElementById('setPointSize');
  ps.value = 320;
  ps.dispatchEvent(new Event('input', { bubbles: true }));
  const newId2 = manager.createPoint('T10');
  await sleep(60);
  const card = manager.points[newId2].element;
  ok('据点大小对新建据点生效', Math.round(card.getBoundingClientRect().width) === 320,
    '实际 ' + Math.round(card.getBoundingClientRect().width) + 'px');

  const nameEl = document.querySelector('.stronghold .text-elem.name');
  const fs = nameEl ? parseFloat(getComputedStyle(nameEl).fontSize) : 0;
  ok('字号随据点大小缩放（应为方块一半 160px）', Math.abs(fs - 160) < 6, '实际 ' + fs + 'px');
  ps.value = 220;
  ps.dispatchEvent(new Event('input', { bubbles: true }));

  /* ---------------- 4. 可视化 → 代码 同步 ---------------- */
  document.querySelector('.mode-tab[data-mode="visual"]').click();
  const vt = document.getElementById('visualEventType');
  vt.value = 'greenAdvance';
  vt.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('btnVisualAdd').click();
  await sleep(50);
  const editorVal = document.getElementById('chainEditor').value;
  let parsed = null;
  try { parsed = JSON.parse(editorVal); } catch (e) {}
  ok('可视化添加事件后代码框同步更新',
    Array.isArray(parsed) && parsed.length === visualBlocks.length && parsed.length > 0,
    '可视化 ' + visualBlocks.length + ' 个 / 代码框解析 ' + (parsed ? parsed.length : 'null'));
  document.querySelector('.mode-tab[data-mode="code"]').click();

  /* ---------------- 5. 打开节点编辑器按钮 ---------------- */
  const ne = document.getElementById('nodeEditor');
  const before = getComputedStyle(ne).display;
  document.getElementById('btnOpenNE').click();
  await sleep(100);
  const after = getComputedStyle(ne).display;
  ok('#btnOpenNE 点击后有反应', before !== after, '点击前 display=' + before + ' 点击后=' + after);
  document.body.classList.remove('new-ui');
  document.getElementById('setUiTheme').value = 'classic';
  await sleep(100);

  /* ---------------- 6. 校验报错带编号 ---------------- */
  const e1 = manager.validate([{ type: 'greenAdvance' }]);
  ok('链首错误带 [E0xx] 编号', /\[E0\d\d\]/.test(e1 || ''), '实际: ' + e1);
  const e2 = manager.preprocess([{ type: 'interrupt', triggerAt: 2 }, { type: 'greenState' }]);
  ok('interrupt 位置错误带 [E1xx] 编号', /\[E1\d\d\]/.test(e2.error || ''), '实际: ' + e2.error);

  /* ---------------- 7. 正常跑一条链 ---------------- */
  manager.setActive(ids[0]);
  const chainA = [
    { type: 'redState' },
    { type: 'redRetreat', duration: 0.4 },
    { type: 'standby', duration: 0.2 },
    { type: 'greenAdvance', duration: 0.4 }
  ];
  manager.runEventChain(ids[0], chainA);
  await waitIdle();
  ok('事件链执行完毕', !manager.isRunning, 'isRunning=' + manager.isRunning);
  ok('执行完毕后边框为绿色', p1.borderState === 'green', 'borderState=' + p1.borderState);
  ok('执行完毕后文字为 GTI 绿', p1.textColor === 'gti', 'textColor=' + p1.textColor);

  /* ---------------- 7b. 占领完成后要有脉冲闪光 ---------------- */
  manager.runEventChain(ids[0], [
    { type: 'redState' }, { type: 'redRetreat', duration: 0.3 }, { type: 'greenAdvance', duration: 0.5 }
  ]);
  let sawFlash = false;
  const tf = performance.now();
  while (performance.now() - tf < 3000) {
    if (p1.svgPath.style.filter) { sawFlash = true; break; }
    await sleep(20);
  }
  ok('占领完成后有脉冲闪光', sawFlash, sawFlash ? '采到发光帧' : '3 秒内没看到 filter 变化');
  await waitIdle();

  /* ---------------- 8. 中断保留进度 ---------------- */
  manager.runEventChain(ids[0], [
    { type: 'redState' },
    { type: 'redRetreat', duration: 0.3 },
    { type: 'greenAdvance', duration: 4 },
    { type: 'interrupt', triggerAt: 1 }
  ]);
  await waitIdle();
  const prog = p1._borderProgress;
  ok('中断后保留部分进度', prog > 0.05 && prog < 0.9, '进度 ' + prog.toFixed(2));
  ok('从中立据点推进时外框已经是绿色', p1.borderState === 'green', 'borderState=' + p1.borderState);
  ok('从中立推进中断后名称仍是白色（没占满不上色）', p1.textColor === 'neutral', 'textColor=' + p1.textColor);

  /* ---------------- 8c. 从中立推到满 → 名称才变绿 ---------------- */
  manager.runEventChain(ids[0], [
    { type: 'neutralState' },
    { type: 'greenAdvance', duration: 0.8 }
  ]);
  await sleep(300);
  const midNeutralText = p1.textColor;      // 推进途中
  await waitIdle();
  ok('中立据点占领途中名称是白色', midNeutralText === 'neutral', '途中 textColor=' + midNeutralText);
  ok('中立据点占满后名称变绿', p1.textColor === 'gti', '结束后 textColor=' + p1.textColor);
  ok('中立据点占满后外框是绿色', p1.borderState === 'green', 'borderState=' + p1.borderState);

  /* ---------------- 8b. 已是绿色再推进 → 中断 + 暂停，文字必须还是绿 ---------------- */
  manager.runEventChain(ids[0], [
    { type: 'greenState' },
    { type: 'greenAdvance', duration: 3 },
    { type: 'interrupt', triggerAt: 0.8 },
    { type: 'standby', duration: 0.4 }
  ]);
  await sleep(1000);            // 中断之后、standby 还在跑的时候采样
  const midText = p1.textColor;
  await waitIdle();
  ok('绿色据点上推进中断+暂停，文字仍是绿色', midText === 'gti' && p1.textColor === 'gti',
    '暂停中=' + midText + ' 结束后=' + p1.textColor);

  /* ---------------- 9. 停止后可立即重跑（竞争检测） ---------------- */
  manager.runEventChain(ids[0], [{ type: 'greenState' }, { type: 'greenAdvance', duration: 2.5 }]);
  await sleep(250);
  manager.stop();
  await sleep(50);
  manager.runEventChain(ids[0], [{ type: 'greenState' }, { type: 'greenAdvance', duration: 2 }]);
  await sleep(400);
  ok('停止后立即重跑：新链仍在运行中', manager.isRunning === true, 'isRunning=' + manager.isRunning);
  manager.stop();
  await waitIdle();

  /* ---------------- 10. 大事件变种1 ---------------- */
  manager.runEventChain(ids[0], [{ type: 'greenState' }, { type: 'bigEvent', variant: 1, whiteDuration: 0.4 }]);
  await waitIdle();
  ok('大事件1 结束后变中立', p1.borderState === 'none' && p1.textColor === 'neutral',
    'borderState=' + p1.borderState + ' textColor=' + p1.textColor);
  ok('大事件1 结束后文字恢复为据点名', p1.textElem && p1.textElem.textContent === 'B1',
    '当前文字="' + (p1.textElem && p1.textElem.textContent) + '"');

  /* ---------------- 10b. 大事件进行中强制停止 ---------------- */
  manager.runEventChain(ids[0], [{ type: 'greenState' }, { type: 'bigEvent', variant: 3, whiteDuration: 2.5, oldName: 'B1', newName: '废墟', collapseDelay: 1.5 }]);
  await sleep(600);
  manager.stop();
  await sleep(200);
  ok('大事件中途停止后文字不是 ×', p1.textElem && p1.textElem.textContent !== '×',
    '当前文字="' + (p1.textElem && p1.textElem.textContent) + '"');
  ok('大事件中途停止后文字为不透明', p1.textElem && parseFloat(getComputedStyle(p1.textElem).opacity) > 0.9,
    'opacity=' + (p1.textElem && getComputedStyle(p1.textElem).opacity));
  ok('大事件中途停止后仍可重新运行', manager.isRunning === false);

  /* ---------------- 10c. 大事件变种3 名称替换 ---------------- */
  manager.runEventChain(ids[0], [{ type: 'greenState' }, { type: 'bigEvent', variant: 3, whiteDuration: 0.3, oldName: 'B1', newName: '废墟', collapseDelay: 0.3 }]);
  await waitIdle();
  ok('变种3 替换为新名称', p1.displayName === '废墟' && p1.textElem.textContent === '废墟',
    'displayName=' + p1.displayName + ' 文字=' + p1.textElem.textContent);
  ok('变种3 结束后为红色边框', p1.borderState === 'red', 'borderState=' + p1.borderState);

  /* ---------------- 11. 模板存取 ---------------- */
  const demo = [{ type: 'greenState' }, { type: 'greenAdvance', duration: 2 }];
  setCurrentBlocks(demo);
  const back = getCurrentBlocks();
  ok('模板写入/读取一致', JSON.stringify(back) === JSON.stringify(demo), JSON.stringify(back));

  /* ---------------- 12. 节点编辑器 ---------------- */
  document.body.classList.add('new-ui');
  await sleep(200);
  const nodes = (typeof neGetNodes === 'function') ? neGetNodes() : [];
  ok('切到节点版后节点编辑器有节点', nodes.length > 0, '节点数 ' + nodes.length);
  ok('节点顺序与事件链一致', nodes.length === demo.length && nodes[0].params.type === 'greenState',
    nodes.map(n => n.params.type).join('→'));

  /* ---------------- 13. 切换回经典版 ---------------- */
  document.body.classList.remove('new-ui');
  await sleep(100);
  ok('可切回经典版', !document.body.classList.contains('new-ui'));

  info('页面未捕获异常', pageErrors.length ? pageErrors.join(' | ') : '无');
} catch (err) {
  R.push({ name: '测试套件异常中断', status: 'FAIL', detail: err.message + '\n' + (err.stack || '') });
}

return R;
