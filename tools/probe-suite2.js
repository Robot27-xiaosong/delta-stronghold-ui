/* probe-suite2.js — 第二轮：走真实 UI 点击流程 + 边界情况 */
const R = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ok = (name, cond, detail) => R.push({ name, status: cond ? 'PASS' : 'FAIL', detail: detail || '' });
const info = (name, detail) => R.push({ name, status: 'INFO', detail: detail || '' });
const pageErrors = [];
window.addEventListener('error', (e) => pageErrors.push(e.message));

async function waitIdle(timeout = 12000) {
  const t0 = performance.now();
  while (manager.isRunning && performance.now() - t0 < timeout) await sleep(60);
  await sleep(150);
}
const lastLogs = (n = 8) => [...document.querySelectorAll('#logBox .log-line')].slice(-n).map(e => e.textContent).join(' / ');

try {
  const ids = Object.keys(manager.points);

  /* ---------- 1. 示例链点击 → 运行 全链路 ---------- */
  document.querySelector('.chip[data-example="capture"]').click();
  await sleep(80);
  const filled = JSON.parse(document.getElementById('chainEditor').value);
  ok('点击示例链填充代码框', Array.isArray(filled) && filled.length >= 3, '积木数 ' + (filled || []).length);
  manager.setActive(ids[0]);
  document.getElementById('btnRun').click();
  await waitIdle();
  ok('点击运行按钮后正常跑完', !manager.isRunning && manager.points[ids[0]].borderState === 'green',
    'borderState=' + manager.points[ids[0]].borderState);

  /* ---------- 2. 绿色后退时警报闪烁 ---------- */
  const p = manager.points[ids[0]];
  document.getElementById('chainEditor').value = JSON.stringify([
    { type: 'greenState' }, { type: 'greenRetreat', duration: 1.6 }
  ]);
  document.getElementById('btnRun').click();
  await sleep(900);
  const blinkText = p.textElem.textContent;
  const blinkMode = p.textMode;
  ok('绿色后退过程中出现警报（感叹号）', blinkText === '!' || blinkMode === 'alert',
    '文字="' + blinkText + '" textMode=' + blinkMode);
  await waitIdle();
  ok('后退结束后文字恢复为据点名', p.textElem.textContent === 'B1', '文字="' + p.textElem.textContent + '"');
  ok('后退结束后边框清空', p.borderState === 'none', 'borderState=' + p.borderState);
  ok('后退结束后文字为白色', p.textColor === 'neutral', 'textColor=' + p.textColor);

  /* ---------- 3. 后退被中断：警报继续 ---------- */
  document.getElementById('chainEditor').value = JSON.stringify([
    { type: 'greenState' }, { type: 'greenRetreat', duration: 3 }, { type: 'interrupt', triggerAt: 0.6 },
    { type: 'standby', duration: 0.8 }
  ]);
  document.getElementById('btnRun').click();
  await sleep(1400);
  ok('后退中断后警报仍在闪', p.textMode === 'alert', 'textMode=' + p.textMode);
  await waitIdle();

  /* ---------- 3b. 边框只有一部分（非中立）时后退也要闪 ---------- */
  document.getElementById('chainEditor').value = JSON.stringify([
    { type: 'neutralState' }, { type: 'greenAdvance', duration: 3 },
    { type: 'interrupt', triggerAt: 1 }, { type: 'greenRetreat', duration: 2 }
  ]);
  document.getElementById('btnRun').click();
  await sleep(1500);                 // 中断完成，后退已经开始
  let sawBang = false, sawName = false;
  for (let i = 0; i < 10; i++) {
    const t = p.textElem.textContent;
    if (t === '!') sawBang = true;
    if (t === p.displayName) sawName = true;
    await sleep(90);
  }
  ok('中立占领中途后退：不报警、名称保持白色', !sawBang && sawName && p.textColor === 'neutral',
    '感叹号=' + sawBang + ' 名称=' + sawName + ' textColor=' + p.textColor);
  await waitIdle();

  /* ---------- 3c. 后退被中断：链结束后继续闪，按停止复位 ---------- */
  document.getElementById('chainEditor').value = JSON.stringify([
    { type: 'greenState' }, { type: 'greenRetreat', duration: 3 }, { type: 'interrupt', triggerAt: 1 }
  ]);
  document.getElementById('btnRun').click();
  await waitIdle();
  const blinkAfter = await p.textMode;
  ok('中断后退，事件链结束后仍在报警', blinkAfter === 'alert', 'textMode=' + blinkAfter);
  document.getElementById('btnStop').click();
  await sleep(150);
  ok('按停止可以复位警报', p.textMode === 'name' && p.textElem.textContent === p.displayName,
    'textMode=' + p.textMode + ' 文字=' + p.textElem.textContent);

  /* ---------- 3d. 绿色后退 → 红色推进：文字必须是红色且不透明 ---------- */
  let whiteFrames = 0, dimFrames = 0;
  for (let r = 0; r < 3; r++) {
    document.getElementById('chainEditor').value = JSON.stringify([
      { type: 'greenState' }, { type: 'greenRetreat', duration: 0.9 + r * 0.1 },
      { type: 'redAdvance', duration: 1.2 }
    ]);
    document.getElementById('btnRun').click();
    // 等红色推进真正开始（borderState 变 red），避免把后退的警报相位算进去
    const tw = performance.now();
    while (p.borderState !== 'red' && performance.now() - tw < 6000) await sleep(20);
    await sleep(80);
    for (let i = 0; i < 10; i++) {
      if (p.textColor === 'neutral') whiteFrames++;
      if (parseFloat(getComputedStyle(p.textElem).opacity) < 0.9) dimFrames++;
      await sleep(50);
    }
    await waitIdle();
  }
  ok('从中立起步的红色推进：名称是白色且不透明', dimFrames === 0 && whiteFrames > 0,
    '白字帧=' + whiteFrames + ' 变暗帧=' + dimFrames);

  /* ---------- 3e. 警报闪烁必须是渐隐渐显，不能硬切 ---------- */
  document.getElementById('chainEditor').value = JSON.stringify([
    { type: 'greenState' }, { type: 'greenRetreat', duration: 2.2 }
  ]);
  document.getElementById('btnRun').click();
  // 等警报真正开始（textMode=alert），否则采到的是上一轮的静止画面
  const tb = performance.now();
  while (p.textMode !== 'alert' && performance.now() - tb < 4000) await sleep(20);
  let midFrames = 0, intentFrames = 0, nameFrames = 0;
  for (let i = 0; i < 30; i++) {
    const el = p.textElem;
    const op = parseFloat(getComputedStyle(el).opacity);
    if (el.textContent === p.displayName) {
      nameFrames++;
      if (op > 0.4 && op < 0.95) midFrames++;                       // 真的在渐变
      // 合成器被系统暂停时 computed 不推进，退而检查过渡是否配置正确
      if (/opacity 0\.5s/.test(el.style.transition || '') && el.style.opacity === '0.3') intentFrames++;
    }
    await sleep(45);
  }
  ok('名称→感叹号有渐隐过渡（不是硬切）', midFrames >= 2 || intentFrames >= 2,
    '名称帧=' + nameFrames + ' 渐变帧=' + midFrames + ' 过渡配置帧=' + intentFrames);
  await waitIdle();

  /* ---------- 4. 6 个据点上限 ---------- */
  const before = Object.keys(manager.points).length;
  for (let i = 0; i < 8; i++) manager.createPoint('X' + i);
  const after = Object.keys(manager.points).length;
  ok('据点数量上限 6', after === 6, before + ' → ' + after);
  ok('超出上限时有报错提示', lastLogs(20).includes('最多只能创建 6 个'));

  /* ---------- 5. 运行中禁止删除 / 非运行可删除 ---------- */
  const runId = Object.keys(manager.points)[0];
  document.getElementById('chainEditor').value = JSON.stringify([{ type: 'greenState' }, { type: 'standby', duration: 2 }]);
  manager.setActive(runId);
  document.getElementById('btnRun').click();
  await sleep(300);
  const countRunning = Object.keys(manager.points).length;
  const delBtn = document.querySelector('.point-item.active .point-del-btn');
  if (delBtn) delBtn.click();
  await sleep(100);
  ok('运行中的据点不能删除', Object.keys(manager.points).length === countRunning,
    countRunning + ' → ' + Object.keys(manager.points).length);
  document.getElementById('btnStop').click();
  await waitIdle();
  ok('停止后可以删除据点', (() => {
    const b = document.querySelectorAll('.point-item .point-del-btn')[1];
    const n0 = Object.keys(manager.points).length;
    if (b) b.click();
    return Object.keys(manager.points).length === n0 - 1;
  })());

  /* ---------- 6. 设置持久化 ---------- */
  const size = document.getElementById('setPointSize');
  size.value = 260; size.dispatchEvent(new Event('input', { bubbles: true }));
  const saved = JSON.parse(localStorage.getItem('delta_stronghold_settings_v32') || '{}');
  ok('设置写入 localStorage', saved.pointSize === 260, JSON.stringify(saved));
  ok('据点尺寸变量已应用', getComputedStyle(document.documentElement).getPropertyValue('--point-size').trim() === '260px',
    getComputedStyle(document.documentElement).getPropertyValue('--point-size'));
  document.getElementById('btnResetSize').click();
  ok('重置按钮恢复 220px', getComputedStyle(document.documentElement).getPropertyValue('--point-size').trim() === '220px',
    getComputedStyle(document.documentElement).getPropertyValue('--point-size'));

  /* ---------- 7. 节点编辑器：增删与连线 ---------- */
  document.body.classList.add('new-ui');
  await sleep(200);
  const selAdd = document.getElementById('neAddType');
  const n0 = neGetNodes().length;
  selAdd.value = 'greenState'; selAdd.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(100);
  ok('节点编辑器可通过下拉添加节点', neGetNodes().length === n0 + 1,
    n0 + ' → ' + neGetNodes().length);
  const xBtn = document.querySelector('.ne-card .nc-x');
  if (xBtn) xBtn.click();
  await sleep(100);
  ok('节点可以删除', neGetNodes().length === n0, '现在 ' + neGetNodes().length);

  /* ---------- 8. 节点编辑器参数编辑 ---------- */
  document.getElementById('neClear').click();
  await sleep(80);
  selAdd.value = 'greenAdvance'; selAdd.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(120);
  const body = document.querySelector('.ne-card .nc-body');
  if (body) body.click();
  await sleep(80);
  const inp = document.querySelector('.ne-param-input[data-key="duration"]');
  if (inp) {
    inp.value = '1.5';
    document.querySelector('.ne-param-save').click();
    await sleep(120);
  }
  const dur = neGetNodes()[0] && neGetNodes()[0].params.duration;
  ok('节点参数可以修改并保存', dur === 1.5, 'duration=' + dur);
  ok('参数改动同步到代码框', document.getElementById('chainEditor').value.includes('1.5'),
    document.getElementById('chainEditor').value.replace(/\s+/g, ' ').slice(0, 80));

  /* ---------- 连线图层要跟着内容变高，否则卡片下移后线被裁 ---------- */
  ok('节点画布有撑开滚动范围的占位块', !!document.getElementById('neSpace'), '');
  const neLinesEl = document.getElementById('neLines');
  ok('连线 SVG 高度按内容设定（不是写死 100%）',
    !!neLinesEl && /px$/.test(neLinesEl.style.height || ''),
    'height=' + (neLinesEl ? neLinesEl.style.height || '(空)' : '无元素'));
  ok('连线 SVG 高度不小于最靠下卡片',
    (() => {
      const cards = [...document.querySelectorAll('#neCanvas .ne-card')];
      if (!cards.length) return false;
      const bottom = Math.max(...cards.map(c => c.offsetTop + c.offsetHeight));
      return (parseInt(neLinesEl.style.height) || 0) >= bottom;
    })(), 'svgH=' + (neLinesEl ? neLinesEl.style.height : '?'));

  document.body.classList.remove('new-ui');
  await sleep(100);

  /* ---------- 9. 非法 JSON 不崩 ---------- */
  manager.stop();                       // 先确保没有残留的链在跑
  document.body.classList.remove('new-ui');
  await sleep(150);
  document.getElementById('chainEditor').value = '[{invalid}]';
  document.getElementById('btnRun').click();
  await sleep(200);
  ok('非法 JSON 有 E208 报错且不崩', lastLogs(5).includes('[E208]'),
    'body=' + document.body.className + ' | mode=' + currentMode + ' | vis=' + JSON.stringify(visualBlocks) + ' || ' + lastLogs(5));
  ok('非法 JSON 后页面仍可用', typeof manager.createPoint === 'function');

  /* ---------- 10. 空链校验 ---------- */
  document.getElementById('chainEditor').value = '[]';
  document.getElementById('btnRun').click();
  await sleep(200);
  ok('空事件链有 E001 报错', lastLogs(5).includes('[E001]'), lastLogs(5));

  /* ---------- 11. 节点版：中文描述 + 大事件变种3/4 字段自动补齐 ---------- */
  document.body.classList.add('new-ui');
  await sleep(150);
  document.getElementById('neClear').click();
  await sleep(80);

  const addSel = document.getElementById('neAddType');
  const optText = [...addSel.options].map(o => o.textContent).join('|');
  ok('节点版添加事件下拉有中文描述',
    optText.includes('绿色推进（占领）') && optText.includes('大事件') && optText.includes('绿色后退'),
    optText.slice(0, 70));

  addSel.value = 'bigEvent'; addSel.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(120);
  const headTxt = document.querySelector('.ne-card .nc-head').textContent;
  ok('节点卡片标题显示中文类型名', headTxt.includes('大事件') && headTxt.includes('bigEvent'), headTxt.trim());

  document.querySelector('.ne-card .nc-body').click();
  await sleep(80);
  let keys = [...document.querySelectorAll('.ne-param-input')].map(i => i.dataset.key);
  ok('变种1 只显示白色推进时长', keys.includes('whiteDuration') && !keys.includes('oldName'), keys.join(','));

  const vSel = document.querySelector('.ne-param-input[data-key="variant"]');
  vSel.value = '3'; vSel.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(180);
  keys = [...document.querySelectorAll('.ne-param-input')].map(i => i.dataset.key);
  ok('切到变种3 自动出现 原名称/新名称/倒塌延时',
    keys.includes('oldName') && keys.includes('newName') && keys.includes('collapseDelay'), keys.join(','));

  const setVal = (k, v) => {
    const el = document.querySelector('.ne-param-input[data-key="' + k + '"]');
    if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  setVal('oldName', '尖塔'); setVal('newName', '废墟'); setVal('collapseDelay', '0.3'); setVal('whiteDuration', '0.4');
  document.querySelector('.ne-param-save').click();
  await sleep(150);
  let pv = neGetNodes()[0].params;
  ok('变种3 参数保存成功', pv.variant === 3 && pv.oldName === '尖塔' && pv.newName === '废墟' && pv.collapseDelay === 0.3,
    JSON.stringify(pv));

  // 下面测的是「新版大事件4」：先把设置里的实验开关打开（默认是旧版，只有两个参数）
  appSettings.experimentalBig4 = true;
  document.querySelector('.ne-card .nc-body').click();
  await sleep(80);
  const vSel2 = document.querySelector('.ne-param-input[data-key="variant"]');
  vSel2.value = '4'; vSel2.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(180);
  keys = [...document.querySelectorAll('.ne-param-input')].map(i => i.dataset.key);
  ok('切到变种4 自动出现 初始时间/变红倒计时，并清掉变种3 字段',
    keys.includes('totalSeconds') && keys.includes('warningAt') && !keys.includes('newName'), keys.join(','));
  ok('变种4 有两个列表编辑器（检查点 / 坦克状态）',
    document.querySelectorAll('.nc-body .plist').length === 2,
    'plist=' + document.querySelectorAll('.nc-body .plist').length);
  ok('检查点默认 3 行（最后一行是撤离点）',
    (() => {
      const box = document.querySelector('.nc-body .plist[data-list="checkpoints"]');
      if (!box) return false;
      const rows = box.querySelectorAll('.plist-row');
      const last = rows[rows.length - 1].querySelector('[data-col="bonus"]');
      return rows.length === 3 && Number(last.value) === 0;
    })(),
    (() => {
      const box = document.querySelector('.nc-body .plist[data-list="checkpoints"]');
      return box ? [...box.querySelectorAll('.plist-row')].map(r => r.querySelector('[data-col="remain"]').value).join('/') : '无';
    })());

  // 加一行坦克状态：第 1 秒切单箭头
  (() => {
    const box = document.querySelector('.nc-body .plist[data-list="tankStates"]');
    box.querySelector('.plist-add').click();
    const rows = box.querySelectorAll('.plist-row');
    const last = rows[rows.length - 1];
    last.querySelector('[data-col="at"]').value = '1';
    last.querySelector('[data-col="state"]').value = 'arrow1';
  })();

  setVal('totalSeconds', '6'); setVal('warningAt', '1');
  document.querySelector('.ne-param-save').click();
  await sleep(150);
  pv = neGetNodes()[0].params;
  ok('变种4 参数保存成功（含检查点与状态时间轴）',
    pv.variant === 4 && pv.totalSeconds === 6 && pv.oldName === undefined
      && Array.isArray(pv.checkpoints) && pv.checkpoints.length === 3
      && Array.isArray(pv.tankStates) && pv.tankStates.length === 2
      && pv.tankStates[1].state === 'arrow1' && pv.tankStates[1].at === 1,
    JSON.stringify(pv));
  ok('护送的坦克状态时间轴能算出图标（第 1 秒起是单箭头）',
    (() => {
      const plan = buildEscortPlan(pv);
      return plan.stateAt(0.5) === 'none' && plan.stateAt(1.5) === 'arrow1';
    })(), '0.5s=' + buildEscortPlan(pv).stateAt(0.5) + ' 1.5s=' + buildEscortPlan(pv).stateAt(1.5));

  /* ---------- 12. 节点版变种3 能真正跑完（不再卡 E010/E011） ---------- */
  document.getElementById('neClear').click();
  await sleep(80);
  addSel.value = 'greenState'; addSel.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(100);
  addSel.value = 'bigEvent'; addSel.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(120);

  const bigNode = neGetNodes()[1];
  const bigBody = document.querySelector('.ne-card[data-nid="' + bigNode.id + '"] .nc-body');
  bigBody.click();
  await sleep(80);
  const vSel3 = document.querySelector('.ne-param-input[data-key="variant"]');
  vSel3.value = '3'; vSel3.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(180);
  setVal('whiteDuration', '0.4'); setVal('oldName', 'B1'); setVal('newName', '废墟'); setVal('collapseDelay', '0.2');
  document.querySelector('.ne-param-save').click();
  await sleep(150);

  const codeJson = document.getElementById('chainEditor').value;
  ok('代码框里的变种3 带齐 oldName/newName/collapseDelay',
    codeJson.includes('"oldName"') && codeJson.includes('"newName"') && codeJson.includes('"collapseDelay"'),
    codeJson.replace(/\s+/g, ' ').slice(0, 120));

  const runPt = Object.values(manager.points)[0];
  if (runPt) manager.setActive(runPt.id);
  const logBefore = document.getElementById('logBox').textContent.length;
  document.getElementById('btnRun').click();
  await waitIdle();
  const runLogs = document.getElementById('logBox').textContent.slice(logBefore);
  ok('节点版变种3 能跑完且无校验报错',
    !/\[E0(01|02|03|10|11|12)\]/.test(runLogs) && /事件链执行完毕/.test(runLogs),
    runLogs.replace(/\s+/g, ' ').slice(-160));
  ok('变种3 跑完后据点变红且改名', runPt && runPt.borderState === 'red' && runPt.textElem.textContent === '废墟',
    runPt ? 'borderState=' + runPt.borderState + ' 文字=' + runPt.textElem.textContent : '无据点');
  document.body.classList.remove('new-ui');
  await sleep(100);

  /* ---------- 13. 内置示例链：全部能过校验，中断示例要看得到「保留进度」 ---------- */
  const exKeys = Object.keys(EXAMPLES);
  const badEx = exKeys.filter(k => {
    const pp = manager.preprocess(EXAMPLES[k]);
    if (pp.error) return true;
    return manager.validate(pp.blocks) !== null;
  });
  ok('内置示例链全部通过校验', badEx.length === 0,
    badEx.length ? '有问题: ' + badEx.join(',') : exKeys.join(','));

  const exPt = Object.values(manager.points)[0];
  manager.setActive(exPt.id);
  document.getElementById('chainEditor').value = JSON.stringify(EXAMPLES.interrupt);
  document.getElementById('btnRun').click();
  await sleep(4200);                     // 3s 推进 + 1.2s 余量
  const midProg = exPt._borderProgress;
  ok('中断示例能看到保留一半进度（不是满格空转）', midProg > 0.2 && midProg < 0.7,
    '中断处进度 ' + midProg.toFixed(2));
  await waitIdle();
  ok('中断示例跑完回到中立', exPt.borderState === 'none' && exPt._borderProgress <= 0.01,
    'borderState=' + exPt.borderState + ' 进度=' + exPt._borderProgress.toFixed(2));

  /* ---------- 14. 附属据点：图标 / 警报闪烁 / 大事件 ---------- */
  manager.stop();
  await sleep(150);
  document.body.classList.remove('new-ui');
  document.body.classList.remove('chroma-key');
  while (Object.keys(manager.points).length > 2) manager.removePoint(Object.keys(manager.points)[0]);

  document.getElementById('inputNewPoint').value = 'C1';
  document.getElementById('chkSatellitePoint').checked = true;
  document.getElementById('btnAddPoint').click();
  await sleep(250);
  const spt = Object.values(manager.points).find(p => p.pointType === 'satellite');
  ok('可以创建附属据点', !!spt, spt ? spt.name : '没创建出来');
  if (spt) {
    ok('附属据点列表显示附属徽章',
      !!document.querySelector('.ptype-badge.satellite'), '无徽章');
    ok('附属据点显示图标位图而不是文字',
      !!spt.element.querySelector('div.satellite-icon') && !spt.element.querySelector('.text-elem'),
      'icon=' + !!spt.element.querySelector('div.satellite-icon'));
    ok('图标 mask 已注入（base64 只存一份）',
      (getComputedStyle(spt.satelliteIcon).maskImage || getComputedStyle(spt.satelliteIcon).webkitMaskImage || '').includes('data:image/png;base64'),
      (getComputedStyle(spt.satelliteIcon).maskImage || '').slice(0, 40));
    const box = spt.satelliteIcon.getBoundingClientRect();
    ok('附属据点图标有尺寸', box.width > 20 && box.height > 20,
      Math.round(box.width) + 'x' + Math.round(box.height));

    manager.setActive(spt.id);
    document.getElementById('chainEditor').value = JSON.stringify([{ type: 'greenState' }]);
    document.getElementById('btnRun').click();
    await waitIdle();
    ok('满格绿时图标变绿',
      getComputedStyle(spt.satelliteIcon).backgroundColor === 'rgb(64, 255, 112)',
      getComputedStyle(spt.satelliteIcon).backgroundColor);

    /* 绿色后退：图标渐隐 + 感叹号渐显 */
    document.getElementById('chainEditor').value = JSON.stringify([
      { type: 'greenState' }, { type: 'greenRetreat', duration: 3 }
    ]);
    document.getElementById('btnRun').click();
    let sawMark = false, markPeak = 0, iconDimmed = false;
    const tb = performance.now();
    while (performance.now() - tb < 3200) {
      const m = spt._mark;
      if (m && m.textContent === '!') {
        sawMark = true;
        markPeak = Math.max(markPeak, Number(getComputedStyle(m).opacity) || 0, parseFloat(m.style.opacity) || 0);
      }
      const opStr = spt.satelliteIcon.style.opacity;          // 注意「0 || 1」会变成 1，不能这么写
      if (opStr !== '' && parseFloat(opStr) < 0.6) iconDimmed = true;
      await sleep(60);
    }
    ok('附属据点绿色后退出现感叹号', sawMark, 'sawMark=' + sawMark);
    ok('附属据点感叹号真的渐显（不是透明度 0）', markPeak > 0.3, '峰值 ' + markPeak.toFixed(2));
    ok('附属据点图标会渐隐让位', iconDimmed, 'iconDimmed=' + iconDimmed);
    manager.stop();
    await sleep(300);
    ok('停止后图标恢复不透明、感叹号移除',
      parseFloat(spt.satelliteIcon.style.opacity || '1') >= 0.99 && !spt._mark,
      'op=' + spt.satelliteIcon.style.opacity + ' mark=' + !!spt._mark);

    /* 设计约束：附属据点不支持大事件（下拉禁用 + 运行时 E014） */
    const beOpt = [...document.getElementById('visualEventType').options].find(o => o.value === 'bigEvent');
    ok('选中附属据点时「大事件」选项被禁用', beOpt.disabled && /不支持/.test(beOpt.textContent),
      'disabled=' + beOpt.disabled + ' text=' + beOpt.textContent);

    document.getElementById('chainEditor').value = JSON.stringify([
      { type: 'greenState' }, { type: 'bigEvent', variant: 1, whiteDuration: 0.5 }
    ]);
    const bigBefore = document.getElementById('logBox').textContent.length;
    document.getElementById('btnRun').click();
    await sleep(500);
    const bigLogs = document.getElementById('logBox').textContent.slice(bigBefore);
    ok('附属据点跑大事件被 E014 拒绝', bigLogs.includes('[E014]') && !bigLogs.includes('大事件变种1 触发'),
      bigLogs.replace(/\s+/g, ' ').slice(-110));
    ok('被拒绝后据点状态没变、图标还在',
      !!spt.element.querySelector('.satellite-icon') && !manager.isRunning,
      'icon=' + !!spt.element.querySelector('.satellite-icon') + ' running=' + manager.isRunning);

    /* 切回普通据点，大事件要能正常跑（确认限制只针对附属据点） */
    const normalPt = Object.values(manager.points).find(pp => pp.pointType !== 'satellite');
    if (normalPt) {
      manager.setActive(normalPt.id);
      await sleep(200);
      const beOpt2 = [...document.getElementById('visualEventType').options].find(o => o.value === 'bigEvent');
      ok('切回普通据点后「大事件」恢复可用', !beOpt2.disabled, 'disabled=' + beOpt2.disabled);
      const nb = document.getElementById('logBox').textContent.length;
      manager.runEventChain(normalPt.id, [{ type: 'greenState' }, { type: 'bigEvent', variant: 1, whiteDuration: 0.3 }]);
      let gg = 0; while (manager.isRunning && gg++ < 150) await sleep(100);
      await sleep(200);
      const nlogs = document.getElementById('logBox').textContent.slice(nb);
      ok('普通据点跑大事件仍然正常', !nlogs.includes('[E014]') && nlogs.includes('事件链执行完毕'),
        nlogs.replace(/\s+/g, ' ').slice(-90));
      manager.setActive(spt.id);
      await sleep(150);
    }

    /* 导出渲染：Canvas 里真的画出图标（数像素） */
    const cv = document.getElementById('exportCanvas');
    const rd = new CanvasRenderer(cv, 'C1', true, 'satellite');
    rd.borderState = 'green'; rd.borderProgress = 1; rd.borderColor = '#40ff70';
    rd.textColor = '#40ff70'; rd.displayText = 'C1'; rd.textMode = 'name';
    rd.renderFrame(performance.now());
    const pctx = cv.getContext('2d');
    const px = pctx.getImageData(0, 0, cv.width, cv.height).data;
    let greenPx = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 200 && px[i] < 110 && px[i + 1] > 200 && px[i + 2] < 170) greenPx++;
    }
    ok('导出渲染画出附属据点图标（有足够绿色像素）', greenPx > 800, '绿色像素 ' + greenPx);

    // 闪烁时的 × 用白色文字绘制
    rd.textMode = 'name'; rd.textColor = '#ffffff'; rd.displayText = '\u00d7';
    rd.renderFrame(performance.now());
    const px2 = pctx.getImageData(0, 0, cv.width, cv.height).data;
    let whitePx = 0;
    for (let i = 0; i < px2.length; i += 4) {
      if (px2[i + 3] > 200 && px2[i] > 230 && px2[i + 1] > 230 && px2[i + 2] > 230) whitePx++;
    }
    ok('导出渲染闪烁时画的是 × 而不是图标', whitePx > 400 && whitePx < greenPx * 2, '白色像素 ' + whitePx);

    /* 大事件叉号已经换成高清剪影位图（不是字符 ×）：
       页面靠 mask 上色、导出靠 source-in，两边共用 window.BIGEVENT_X_PNG */
    ok('叉号素材已内嵌并解码', !!(window.BIGEVENT_X_PNG && window.BIGEVENT_X_IMG
      && window.BIGEVENT_X_IMG.complete && window.BIGEVENT_X_IMG.naturalWidth > 0),
      'naturalWidth=' + (window.BIGEVENT_X_IMG ? window.BIGEVENT_X_IMG.naturalWidth : 'null'));
    {
      const sp = document.createElement('span');
      sp.className = 'text-elem destroy text-neutral';
      sp.style.position = 'fixed'; sp.style.left = '-9999px';
      document.body.appendChild(sp);
      const cs = getComputedStyle(sp);
      const mask = cs.webkitMaskImage || cs.maskImage || '';
      const w = sp.getBoundingClientRect().width;
      sp.remove();
      const ptSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--point-size')) || 220;
      ok('页面叉号是 mask 图（不再是字符）',
        mask.indexOf('data:image/png') >= 0 && Math.abs(w - ptSize * 0.46) < 2,
        '宽=' + Math.round(w) + 'px，mask=' + mask.slice(0, 26));
    }

    /* ---------- 导出格式：MP4（H.264）后端 ---------- */
    ok('mp4-muxer 已加载（js/05-vendor-mp4.js）',
      !!(window.Mp4Muxer && typeof window.Mp4Muxer.Muxer === 'function'), 'Mp4Muxer=' + typeof window.Mp4Muxer);
    ok('WebCodecs VideoEncoder 可用（安全上下文）', typeof VideoEncoder === 'function', typeof VideoEncoder);

    let codecOk = false, codecName = '';
    if (typeof VideoEncoder === 'function') {
      for (const c of ['avc1.42E033', 'avc1.42E01F', 'avc1.4D402A']) {
        try {
          const s = await VideoEncoder.isConfigSupported({ codec: c, width: 512, height: 512, bitrate: 1e7, framerate: 60 });
          if (s.supported) { codecOk = true; codecName = c; break; }
        } catch (e) {}
      }
    }
    ok('H.264 编码配置可用（MP4 才能导出）', codecOk, codecName || '无可用 avc1 配置');

    ok('设置里默认导出格式是 MP4', appSettings.exportFormat === 'mp4', 'exportFormat=' + appSettings.exportFormat);
    ok('设置面板有「格式」下拉且选中 MP4',
      !!document.getElementById('setExportFormat') && document.getElementById('setExportFormat').value === 'mp4',
      document.getElementById('setExportFormat') ? document.getElementById('setExportFormat').value : '缺元素');
    ok('导出完成后能一键定位文件（revealFile）',
      !!(window.electronAPI && typeof window.electronAPI.revealFile === 'function'),
      'electronAPI=' + typeof window.electronAPI);

    /* ---------- 灰块透明度：设置项 → CSS 变量 → 导出 Canvas ---------- */
    const alphaInput = document.getElementById('setBgAlpha');
    ok('设置里有「灰块透明度」滑块', !!alphaInput, alphaInput ? 'value=' + alphaInput.value : '缺元素');
    const bgEl = document.querySelector('.stronghold-bg');
    const alphaBefore = bgEl ? getComputedStyle(bgEl).backgroundColor : '';
    if (alphaInput) {
      alphaInput.value = '35';
      alphaInput.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(100);
    }
    const alphaAfter = bgEl ? getComputedStyle(bgEl).backgroundColor : '';
    ok('拖滑块后据点灰块的 alpha 变了', alphaBefore !== alphaAfter && /0\.35/.test(alphaAfter),
      alphaBefore + ' → ' + alphaAfter);
    ok('滑块值写进了 appSettings', appSettings.bgAlpha === 35, 'bgAlpha=' + appSettings.bgAlpha);

    /* 导出画布的灰块：
       MP4（opaqueBg）没有 alpha 通道，以前是合成到页面背景色上（白/紫），成片会"露出背景"；
       现在 MP4 一律实心 #33353c，只有 WebM 才保留半透明 */
    const sampleGrayPx = (opaque) => {
      const cv = document.getElementById('exportCanvas');
      cv.width = 64; cv.height = 64;
      const r2 = new CanvasRenderer(cv, 'X', true, 'normal', opaque);
      r2.bgAlpha = 0.35; r2.baseColor = '#ffffff';
      r2.renderFrame(performance.now());
      return [...cv.getContext('2d').getImageData(4, 4, 1, 1).data];
    };
    const mp4Px = sampleGrayPx(true), webmPx = sampleGrayPx(false);
    ok('MP4 导出的灰块是实心 #33353c（不露出白/紫背景）',
      Math.abs(mp4Px[0] - 51) < 4 && Math.abs(mp4Px[1] - 53) < 4 && Math.abs(mp4Px[2] - 60) < 4,
      'rgb=' + mp4Px.slice(0, 3).join(','));
    // WebM 保留 alpha：0.35 * 51 + 0.65 * 0（透明底）= 18 左右，alpha≈89
    ok('WebM 导出的灰块保留半透明 alpha',
      webmPx[3] > 60 && webmPx[3] < 120, 'alpha=' + webmPx[3]);

    /* ---------- 教程与提示 ---------- */
    const secIds = [...document.querySelectorAll('#tutorialOverlay .wiki-section')].map(e => e.id);
    const tocHrefs = [...document.querySelectorAll('#tutorialOverlay .wiki-toc a')]
      .map(a => a.getAttribute('href').slice(1));
    ok('教程目录与章节一一对应', secIds.length >= 15 && secIds.every(id => tocHrefs.includes(id))
      && tocHrefs.every(id => secIds.includes(id)),
      '章节 ' + secIds.length + ' / 目录 ' + tocHrefs.length);
    ok('教程里有「颜色与状态规则」章（中立占领白字）',
      !!document.getElementById('wiki-8') && document.getElementById('wiki-8').textContent.includes('名称全程白色'),
      'wiki-8=' + !!document.getElementById('wiki-8'));
    ok('教程导出章已改成 MP4 说法（不再写"录制为 WebM"）',
      (() => {
        const t = document.getElementById('wiki-10');
        return !!t && t.textContent.includes('MP4') && !t.textContent.includes('自动渲染动画并录制为 WebM');
      })(), '');
    ok('每个设置项都带了说明小字',
      document.querySelectorAll('#settingsOverlay .setting-hint').length >= 10,
      'hint=' + document.querySelectorAll('#settingsOverlay .setting-hint').length);
    ok('教程的「提示」块有绿色样式（.wiki-tip 已定义）',
      (() => {
        const el = document.querySelector('#tutorialOverlay .wiki-tip');
        if (!el) return false;
        const bg = getComputedStyle(el).backgroundColor;
        return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      })(), 'tip=' + document.querySelectorAll('#tutorialOverlay .wiki-tip').length);

    if (alphaInput) {   // 复原，别影响后面的用例
      alphaInput.value = '82';
      alphaInput.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(80);
    }
    ok('导出面板不用常驻（完成后自动收起，不留浮动窗）',
      !document.getElementById('exportActions') && !document.getElementById('exportPath'),
      'exportActions=' + !!document.getElementById('exportActions'));
    ok('preload 暴露了 saveMediaFile（原生另存为通道）',
      !!(window.electronAPI && typeof window.electronAPI.saveMediaFile === 'function'),
      'electronAPI=' + typeof window.electronAPI);

    /* 护送时间轴：位置曲线必须连续、不倒退、过检查点后继续走
       （曾经因为 segs 存绝对时间、positionAt 拿相对时间比，
        第二段开始坦克停在检查点不动、到段末瞬移过去） */
    {
      const tpl = { type: 'bigEvent', variant: 4, totalSeconds: 270, warningAt: 60, faction: 'gti', label: '护送车队',
        checkpoints: [{ remain: 180, bonus: 45 }, { remain: 150, bonus: 45 }, { remain: 120, bonus: 45 }, { remain: 90, bonus: 0 }],
        tankStates: [{ at: 0, state: 'none' }, { at: 45, state: 'arrow2' }],
        failMode: 'none', failValue: 0, holdSeconds: 2 };
      const pl = buildEscortPlan(tpl);
      let prev = 0, maxJump = 0, back = 0;
      for (let t = 0; t <= pl.endTime + 1e-9; t += 0.1) {
        const x = pl.positionAt(t);
        if (x < prev - 1e-6) back++;
        maxJump = Math.max(maxJump, x - prev);
        prev = x;
      }
      ok('护送：位置曲线连续（不会到检查点才瞬移）', maxJump < 1 && back === 0,
        '最大 0.1s 位移=' + maxJump.toFixed(3) + '% 倒退=' + back);
      const l1 = pl.legs[0];
      const moved = pl.positionAt(l1.endTime + 2) - pl.positionAt(l1.endTime);
      ok('护送：过了第 1 个检查点坦克继续走', moved > 0.1, '检查点后 2s 前进 ' + moved.toFixed(2) + '%');
      ok('护送：终点停在 100%', Math.abs(pl.positionAt(pl.endTime - 1e-6) - 100) < 0.2,
        'pos=' + pl.positionAt(pl.endTime - 1e-6).toFixed(1));

      // 状态按「第几段 + 段内第几秒」填：要能换算成正确的绝对时间
      const segPl = buildEscortPlan({ totalSeconds: 270,
        checkpoints: [{ remain: 180, bonus: 45 }, { remain: 150, bonus: 45 }, { remain: 120, bonus: 45 }, { remain: 90, bonus: 0 }],
        tankStates: [{ seg: 2, at: 30, state: 'repair' }], failMode: 'none', failValue: 0, holdSeconds: 2 });
      const segStart = segPl.legs[1].startTime;
      ok('护送：坦克状态按段号换算（第2段第30秒 → 该段第31秒是修理）',
        segPl.stateAt(segStart + 31) === 'repair' && segPl.stateAt(segStart + 5) === 'none',
        '段2起点=' + segStart.toFixed(0) + 's');
      // 老写法（只有 at）仍按全程绝对秒
      const legPl = buildEscortPlan({ totalSeconds: 270,
        checkpoints: [{ remain: 180, bonus: 45 }, { remain: 150, bonus: 45 }, { remain: 120, bonus: 45 }, { remain: 90, bonus: 0 }],
        tankStates: [{ at: 120, state: 'repair' }], failMode: 'none', failValue: 0, holdSeconds: 2 });
      ok('护送：老写法（只填 at＝全程绝对秒）仍然有效',
        legPl.stateAt(119) === 'none' && legPl.stateAt(121) === 'repair',
        'at=120 生效');

      // 旧版大事件4（设置里开关关掉）：固定 3 段匀速、不吃坦克状态、颜色照样按阵营
      appSettings.experimentalBig4 = false;
      const lg = buildEscortPlan(tpl);
      const sp = l => (l.endP - l.startP) / l.dur;
      ok('旧版大事件4：固定 3 段、匀速、不吃坦克状态',
        lg.legacy && lg.legs.length === 3 && lg.states.length === 0
          && Math.abs(sp(lg.legs[0]) - sp(lg.legs[1])) < 1e-6,
        'legs=' + lg.legs.length + ' 段速度=' + sp(lg.legs[0]).toFixed(3));
      ok('旧版大事件4：颜色/名称跟新版一致（阵营照生效）',
        lg.colors.tank === convoyColors('gti').tank && lg.colors.flag === convoyColors('gti').flag
          && lg.label === '护送车队',
        JSON.stringify(lg.colors));

      // 冲突检测（只提示不拦）：段内秒超时 / 段号越界 / 正常不误报
      appSettings.experimentalBig4 = true;
      const c1 = checkEscortConflicts(Object.assign({}, tpl, { tankStates: [{ seg: 1, at: 999, state: 'repair' }] }));
      ok('冲突检测：段内秒超过段时长会提示「永远不会生效」',
        c1.some(c => c.text.indexOf('永远不会生效') >= 0 && c.fix), c1.length + ' 条');
      const c2 = checkEscortConflicts(Object.assign({}, tpl, { tankStates: [{ seg: 9, at: 0, state: 'arrow1' }] }));
      ok('冲突检测：段号越界会提示', c2.some(c => c.text.indexOf('第 9 段') >= 0 && c.fix), c2.length + ' 条');
      const c3 = checkEscortConflicts(Object.assign({}, tpl, { tankStates: [{ seg: 1, at: 10, state: 'arrow2' }] }));
      ok('冲突检测：正常设定不误报', c3.length === 0, JSON.stringify(c3));
      const c4 = checkEscortConflicts(Object.assign({}, tpl,
        { tankStates: [{ seg: 2, at: 10, state: 'arrow1' }], failMode: 'checkpoint', failValue: 1 }));
      ok('冲突检测：失败点之后的状态会提示看不到',
        c4.some(c => c.text.indexOf('成片里看不到') >= 0), c4.length + ' 条');
    }

    /* 关于界面 / 附属应用开关（开源加上检查更新那次改动） */
    {
      ok('关于界面不再有蓝奏云下载链接', document.body.innerHTML.indexOf('lanzouu') < 0,
        'lanzouu 出现次数=' + (document.body.innerHTML.split('lanzouu').length - 1));
      ok('关于界面有版本号 / 仓库链接 / 复制诊断信息入口',
        !!document.getElementById('aboutVersion') && !!document.getElementById('aboutRepoLink')
          && !!document.getElementById('btnCopyDiag'), '');
      ok('关于界面有免责声明（素材版权归原厂）',
        !!document.querySelector('.about-legal')
          && document.querySelector('.about-legal').textContent.indexOf('版权') >= 0, '');
      ok('附属应用下载默认关闭', appSettings.experimentalAffiliated === false,
        'experimentalAffiliated=' + appSettings.experimentalAffiliated);
      ok('检查更新只认 GitHub（不跳外部下载页）',
        typeof window.electronAPI.checkUpdate === 'function', '');
      ok('「▶ 附属应用」按钮默认隐藏（没下载就不显示）',
        (() => { const b = document.getElementById('btnAffRun');
          return !!b && getComputedStyle(b).display === 'none'; })(),
        'btnAffRun');
    }

    /* 变种3 倒塌延时 = 0：白色边框闭合后立刻替换（不再被 `|| 2` 吞成 2）
       注意链首必须是状态事件，否则 validate 先报 E002 */
    {
      const head = { type: 'neutralState' };
      const v3 = (cd) => manager.validate([head, { type: 'bigEvent', variant: 3, oldName: '尖塔', newName: '废墟', collapseDelay: cd }]);
      ok('变种3：倒塌延时 0 通过校验', v3(0) === null, String(v3(0)));
      ok('变种3：倒塌延时为负数时拦住', typeof v3(-1) === 'string' && v3(-1).indexOf('E011') >= 0, String(v3(-1)));
      ok('变种3：缺 collapseDelay 仍然报 E011',
        typeof v3(undefined) === 'string' && v3(undefined).indexOf('E011') >= 0, String(v3(undefined)));
    }

    document.body.classList.remove('chroma-key');
    manager.removePoint(spt.id);
  }

  info('页面未捕获异常', pageErrors.length ? pageErrors.join(' | ') : '无');
} catch (err) {
  R.push({ name: '测试套件异常中断', status: 'FAIL', detail: err.message + '\n' + (err.stack || '') });
}
return R;
