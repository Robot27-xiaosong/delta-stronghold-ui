/* 40-ui.js — UI 绑定 & 设置面板 */
/* ============================================================
   UI 绑定 & 初始化
   ============================================================ */
const manager = new EventChainManager();

// 背景切换
function updateBgButtons() {
  const chroma = document.body.classList.contains('chroma-key');
  $('#btnBgWhite').classList.toggle('primary', !chroma);
  $('#btnBgChroma').classList.toggle('primary', chroma);
}
$('#btnBgWhite').addEventListener('click', () => {
  document.body.classList.remove('chroma-key');
  updateBgButtons();
  log('背景切换为纯白 #FFFFFF', 'info');
});
$('#btnBgChroma').addEventListener('click', () => {
  document.body.classList.add('chroma-key');
  updateBgButtons();
  log('背景切换为抠像色 #990066', 'info');
});
$('#btnBgToggleFloat').addEventListener('click', () => {
  document.body.classList.toggle('chroma-key');
  updateBgButtons();
  log('背景已切换', 'info');
});

// 参数说明折叠
$('#paramToggle').addEventListener('click', () => {
  const help = $('#paramHelp');
  const toggle = $('#paramToggle');
  if (help.style.display === 'none') {
    help.style.display = '';
    toggle.textContent = '▾ 参数说明';
  } else {
    help.style.display = 'none';
    toggle.textContent = '▸ 参数说明';
  }
});
// 点击参数说明中的代码自动复制
document.querySelectorAll('.param-help code').forEach(code => {
  code.style.cursor = 'pointer';
  code.addEventListener('click', () => {
    navigator.clipboard.writeText(code.textContent).then(() => {
      const orig = code.textContent;
      code.textContent = '✓ 已复制';
      setTimeout(() => { code.textContent = orig; }, 800);
    }).catch(() => {});
  });
});

// 美化JSON缩进
$('#btnFormatJson').addEventListener('click', () => {
  try {
    const obj = JSON.parse($('#chainEditor').value);
    $('#chainEditor').value = JSON.stringify(obj, null, 2);
    log('✓ JSON已美化（2空格缩进，结构更清晰）', 'ok');
  } catch (e) {
    log('❌ [E205] JSON 格式错误: ' + e.message, 'err');
  }
});

// 从可视化同步到代码
$('#btnSyncFromVisual').addEventListener('click', () => {
  if (visualBlocks.length === 0) { log('可视化列表为空', 'warn'); return; }
  $('#chainEditor').value = JSON.stringify(visualBlocks, null, 2);
  log(`已从可视化同步 ${visualBlocks.length} 个事件到代码模式`, 'ok');
});

// 新建据点
$('#btnAddPoint').addEventListener('click', () => {
  const name = $('#inputNewPoint').value.trim();
  if (!name) { log('请输入据点名称', 'warn'); return; }
  const isSatellite = $('#chkSatellitePoint').checked;
  const id = manager.createPoint(name, isSatellite ? 'satellite' : 'normal');
  if (!id) return;
  if (!manager.activePointId) manager.setActive(id);
  $('#inputNewPoint').value = '';
});
$('#inputNewPoint').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btnAddPoint').click();
});

// ========== 双模式：代码 + 可视化 ==========
let currentMode = 'code';
let visualBlocks = [];

let viDragIdx = null;
function renderVisualList() {
  const list = $('#visualList');
  if (!list) return;
  if (visualBlocks.length === 0) {
    list.innerHTML = '<div class="visual-empty">还没有事件，从下方选择类型添加</div>';
    return;
  }
  list.innerHTML = visualBlocks.map((b, i) => {
    // 中文描述 + 中文参数名，和节点版保持一致
    const meta = (typeof eventMeta === 'function') ? eventMeta(b.type) : { short: b.type };
    const params = (typeof eventParamText === 'function')
      ? eventParamText(b.type, b).replace(/<br>/g, ' · ').replace(/<[^>]+>/g, '')
      : Object.entries(b).filter(([k]) => k !== 'type').map(([k, v]) => `${k}:${v}`).join(' ');
    return `<div class="visual-item" draggable="true" data-i="${i}">
      <span class="vi-drag">⋮⋮</span>
      <span class="vi-idx">${i+1}</span>
      <span class="vi-type" title="${b.type}">${meta.short}</span>
      <span class="vi-params" title="${b.type}">${params || '-'}</span>
      <span class="vi-actions">
        <button data-act="up" data-i="${i}" ${i===0?'disabled style="opacity:0.3"':''}>↑</button>
        <button data-act="down" data-i="${i}" ${i===visualBlocks.length-1?'disabled style="opacity:0.3"':''}>↓</button>
        <button data-act="del" data-i="${i}">×</button>
      </span>
    </div>`;
  }).join('');
  list.querySelectorAll('.vi-actions button').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.i);
      const act = btn.dataset.act;
      if (act === 'up' && i > 0) { const t=visualBlocks[i-1]; visualBlocks[i-1]=visualBlocks[i]; visualBlocks[i]=t; }
      if (act === 'down' && i < visualBlocks.length-1) { const t=visualBlocks[i+1]; visualBlocks[i+1]=visualBlocks[i]; visualBlocks[i]=t; }
      if (act === 'del') { visualBlocks.splice(i, 1); }
      renderVisualList(); syncCodeFromVisual();
    });
  });
  list.querySelectorAll('.visual-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      viDragIdx = parseInt(item.dataset.i);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      list.querySelectorAll('.visual-item').forEach(el => el.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.visual-item').forEach(el => el.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => { item.classList.remove('drag-over'); });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetIdx = parseInt(item.dataset.i);
      if (viDragIdx !== null && viDragIdx !== targetIdx) {
        const moved = visualBlocks.splice(viDragIdx, 1)[0];
        visualBlocks.splice(targetIdx, 0, moved);
        renderVisualList(); syncCodeFromVisual();
      }
      viDragIdx = null;
    });
  });
}
function syncCodeFromVisual() {
  const ce = document.getElementById('chainEditor');
  if (ce) ce.value = JSON.stringify(visualBlocks, null, 2);
}

// 模式切换
document.querySelectorAll('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    currentMode = tab.dataset.mode;
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t === tab));
    $('#codeMode').style.display = currentMode === 'code' ? '' : 'none';
    $('#visualMode').style.display = currentMode === 'visual' ? '' : 'none';
    if (currentMode === 'visual') {
      // 进可视化前先吃一遍代码框内容，避免两边对不上
      try {
        const parsed = JSON.parse($('#chainEditor').value);
        if (Array.isArray(parsed)) visualBlocks = parsed;
      } catch (e) { /* 代码框有语法错误时保持原列表 */ }
      renderVisualList();
    }
  });
});

/* 当前选中的据点是不是附属据点（附属据点不支持大事件） */
function isActiveSatellite() {
  const p = manager.points[manager.activePointId];
  return !!(p && p.pointType === 'satellite');
}

/** 按当前据点类型，禁用/启用「大事件」选项 */
function syncBigEventAvailability() {
  const sat = isActiveSatellite();
  const labels = {
    visualEventType: ['bigEvent 大事件', 'bigEvent 大事件（附属据点不支持）'],
    neAddType: ['大事件（变种1~4）', '大事件（附属据点不支持）']
  };
  Object.keys(labels).forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    [...sel.options].forEach(o => {
      if (o.value !== 'bigEvent') return;
      o.disabled = sat;
      o.textContent = sat ? labels[id][1] : labels[id][0];
    });
    if (sat && sel.value === 'bigEvent') { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  });
}

/* 护送（变种4）参数表单：字段全部来自 EVENT_META，新增/改动只需改那一处 */
function escortParamsHtml() {
  const fields = escortFields();      // 实验开关关掉时只会拿到「初始时间 / 变红倒计时」
  let html = fields.map(f => {
    if (f.kind === 'list') return listEditorHtml(f, f.def);
    if (f.kind === 'select') {
      return '<div class="visual-param-row"><label>' + f.label + '</label>' +
        '<select data-key="' + f.key + '" data-kind="select">' +
        f.options.map(o => '<option value="' + o.v + '">' + o.t + '</option>').join('') +
        '</select></div>';
    }
    if (f.kind === 'text') {
      return '<div class="visual-param-row"><label>' + f.label + '</label>' +
        '<input type="text" data-key="' + f.key + '" data-kind="text" value="' + f.def + '"></div>';
    }
    return '<div class="visual-param-row"><label>' + f.label + '</label>' +
      '<input type="number" data-key="' + f.key + '" data-kind="number" value="' + f.def +
      '" min="' + (f.min === undefined ? 0 : f.min) + '" step="' + (f.step || 1) + '"></div>';
  }).join('');
  if (!isNewBig4()) {
    html += '<div class="visual-param-row"><div class="setting-hint" style="margin:0;">' +
      '当前是<b>旧版大事件4</b>：固定 3 个检查点、坦克匀速走完全程、倒计时归零就结束，只认上面这几项（颜色和名称照样能改）。<br>' +
      '想要检查点加时 / 坦克状态图标 / 中途失败，去 设置 → 实验性功能 → 选「新版大事件4」。</div></div>';
  }
  return html;
}

/** 切换新旧版大事件4 之后，把正在显示的参数区重画一遍（可视化面板 + 节点卡片） */
function refreshBig4UI() {
  const vs = $('#vpVariant');
  const ex = $('#vpVariantExtra');
  if (vs && ex && vs.value === '4') {
    ex.innerHTML = escortParamsHtml();
    bindListEditors(ex);
  }
  if (document.body.classList.contains('new-ui') && typeof neSyncFromBlocks === 'function') {
    try { neSyncFromBlocks(); } catch (e) { console.warn('节点编辑器重画失败', e); }
  }
}

// 可视化：事件类型选择 → 动态参数
$('#visualEventType').addEventListener('change', () => {
  const type = $('#visualEventType').value;
  const paramsDiv = $('#visualParams');
  let html = '';
  if (['greenAdvance','redAdvance','greenRetreat','redRetreat','standby'].includes(type)) {
    html = '<div class="visual-param-row"><label>时长(秒)</label><input type="number" id="vpDuration" value="3" min="0.1" step="0.1"></div>';
  }
  if (type === 'interrupt') {
    html = '<div class="visual-param-row"><label>中断时间(秒)</label><input type="number" id="vpTrigger" value="3" min="0.1" step="0.1"></div>';
  }
  if (type === 'bigEvent') {
    html = `<div class="visual-param-row"><label>变种</label>
      <select id="vpVariant">
        <option value="1">变种1 炸毁变中立</option>
        <option value="2">变种2 自动归属GTI</option>
        <option value="3">变种3 替换敌方据点</option>
        <option value="4">变种4 护送车队</option>
      </select></div>
      <div class="visual-param-row" id="vpWhiteRow"><label>白色推进(秒)</label><input type="number" id="vpWhiteDur" value="2.5" min="0.5" step="0.1"></div>
      <div id="vpVariantExtra"></div>`;
  }
  paramsDiv.innerHTML = html;
  const vs = $('#vpVariant');
  if (vs) {
    const upd = () => {
      const v = parseInt(vs.value);
      const ex = $('#vpVariantExtra');
      // 护送（变种4）没有白色推进阶段，把这行藏掉，免得误以为要填
      const whiteRow = $('#vpWhiteRow');
      if (whiteRow) whiteRow.style.display = v === 4 ? 'none' : '';
      if (v === 2) ex.innerHTML = `<div class="visual-param-row"><label>绿色推进(秒)</label><input type="number" id="vpGreenDur" value="2.5" min="0.5" step="0.1"></div>`;
      else if (v === 3) ex.innerHTML = `<div class="visual-param-row"><label>原名称</label><input type="text" id="vpOldName" value="尖塔"></div><div class="visual-param-row"><label>新名称</label><input type="text" id="vpNewName" value="废墟"></div><div class="visual-param-row"><label>倒塌延时(秒)</label><input type="number" id="vpCollapse" value="2" min="0" step="0.1"></div><div class="setting-hint" style="margin:2px 0 0;">填 <b>0</b> = 没有延时，白色边框闭合后立刻替换成新名称</div>`;
      else if (v === 4) {
        ex.innerHTML = escortParamsHtml();
        bindListEditors(ex);
      }
      else ex.innerHTML = '';
    };
    vs.addEventListener('change', upd); upd();
  }
});

// 可视化：添加事件
$('#btnVisualAdd').addEventListener('click', () => {
  const type = $('#visualEventType').value;
  if (!type) { log('请先选择事件类型', 'warn'); return; }
  if (type === 'bigEvent' && isActiveSatellite()) {
    log('❌ [E014] 附属据点不支持大事件，请先切到普通据点', 'err');
    return;
  }
  const block = { type };
  if (['greenAdvance','redAdvance','greenRetreat','redRetreat','standby'].includes(type))
    block.duration = parseFloat($('#vpDuration').value) || 3;
  if (type === 'interrupt') block.triggerAt = parseFloat($('#vpTrigger').value) || 3;
  if (type === 'bigEvent') {
    block.variant = parseInt($('#vpVariant').value);
    const wd = parseFloat($('#vpWhiteDur').value);
    if (wd && wd !== 2.5) block.whiteDuration = wd;
    if (block.variant === 2) {
      const gd = parseFloat($('#vpGreenDur')?.value);
      if (gd && gd !== 2.5) block.greenDuration = gd;
    }
    if (block.variant === 3) {
      block.oldName = $('#vpOldName').value || '据点';
      block.newName = $('#vpNewName').value || '新据点';
      // 不能用 `|| 2`：填 0（无延时、立刻替换）会被当成空值变成 2
      const cd = parseFloat($('#vpCollapse').value);
      block.collapseDelay = isNaN(cd) ? 2 : Math.max(0, cd);
    }
    if (block.variant === 4) {
      // 参数说明全部来自 EVENT_META：列表字段读行，其余读 data-key 控件
      // 旧版（实验开关未开）只收「初始时间 / 变红倒计时」，别往里塞空列表
      const extra = $('#vpVariantExtra');
      escortFields().forEach(f => {
        if (f.kind === 'list') {
          const v = collectListValue(extra, f);
          if (v.length) block[f.key] = v;
          return;
        }
        const el = extra.querySelector('[data-key="' + f.key + '"]');
        if (!el) return;
        block[f.key] = f.kind === 'select' ? el.value
          : (f.kind === 'text' ? el.value : Number(el.value));
      });
    }
  }
  visualBlocks.push(block);
  renderVisualList();
  syncCodeFromVisual();
  log(`已添加: ${type}`, 'ok');
});


// 示例填充（同步两种模式）
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const key = chip.dataset.example;
    const blocks = EXAMPLES[key];
    $('#chainEditor').value = JSON.stringify(blocks, null, 2);
    visualBlocks = JSON.parse(JSON.stringify(blocks));
    if (currentMode === 'visual') renderVisualList();
    if (typeof neSyncFromBlocks === 'function') neSyncFromBlocks();
    log(`已填充示例: ${chip.textContent}`, 'info');
  });
});

// 运行（根据当前模式获取事件链）
$('#btnRun').addEventListener('click', () => {
  if (!manager.activePointId) { log('❌ [E206] 请先在据点列表中选择一个目标据点', 'err'); return; }
  let blocks;
  const isNodeUI = document.body.classList.contains('new-ui');
  if (isNodeUI) {
    // 节点版：从节点编辑器读取
    if (typeof neSyncToBlocks === 'function') neSyncToBlocks();
    const nodes = (typeof neGetNodes === 'function') ? neGetNodes() : [];
    if (!nodes || nodes.length === 0) { log('❌ [E207] 节点编辑器为空，请先添加事件', 'err'); return; }
    blocks = JSON.parse(JSON.stringify(visualBlocks));
    log('📋 从节点编辑器读取 ' + blocks.length + ' 个事件: ' + blocks.map(b=>b.type).join(' → '), 'info');
  } else if (currentMode === 'code') {
    try { blocks = JSON.parse($('#chainEditor').value); }
    catch (e) { log('❌ [E208] JSON 解析失败: ' + e.message, 'err'); return; }
  } else {
    if (visualBlocks.length === 0) { log('❌ [E209] 可视化列表为空，请先添加事件', 'err'); return; }
    blocks = JSON.parse(JSON.stringify(visualBlocks));
  }
  manager.runEventChain(manager.activePointId, blocks);
});

// 停止
$('#btnStop').addEventListener('click', () => manager.stop());

// 教程弹窗（等DOM加载完再绑定，因为弹窗HTML在script之后）
window.addEventListener('load', () => {
  applyBorderWidth();
  const tutorialOverlay = $('#tutorialOverlay');
  if (!tutorialOverlay) return;
  function openTutorial() { tutorialOverlay.classList.add('show'); }
  function closeTutorial() { tutorialOverlay.classList.remove('show'); }
  const btn = $('#btnTutorial');
  if (btn) btn.addEventListener('click', openTutorial);
  $('#tutorialClose').addEventListener('click', closeTutorial);
  tutorialOverlay.addEventListener('click', (e) => {
    if (e.target === tutorialOverlay) closeTutorial();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tutorialOverlay.classList.contains('show')) closeTutorial();
  });
});

// ========== 设置面板 ==========
const SETTINGS_KEY = 'delta_stronghold_settings_v32';
const appSettings = Object.assign({
  exportFormat: 'mp4',      // mp4 = H.264（兼容性最好）｜ webm = VP9（唯一支持透明）
  exportRes: 512,
  exportFps: 60,
  exportBitrate: 10000000,
  pointSize: 220,
  initBg: 'white',
  uiTheme: 'classic',
  exportGrayBg: true,
  borderWidth: 7,
  bgAlpha: 82,         // 灰色方块透明度（%），页面和导出共用
  experimentalBig4: false,        // 实验性：新版大事件4（检查点/坦克状态/失败位置）。关掉＝旧版
  experimentalAffiliated: false   // 实验性：附属应用支持（默认不启用、不下载）
}, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings)); }
function applyBorderWidth() {
  // 走 CSS 变量，新建据点自动继承（之前逐个元素写内联样式，新据点会退回默认值）
  document.documentElement.style.setProperty('--border-width', appSettings.borderWidth + 'px');
}
function applyBgAlpha() {
  const v = Math.max(0, Math.min(100, Number(appSettings.bgAlpha)));
  document.documentElement.style.setProperty('--point-bg-alpha', (v / 100).toFixed(3));
}

window.addEventListener('load', () => {
  const overlay = $('#settingsOverlay');
  if (!overlay) return;
  const openSet = () => overlay.classList.add('show');
  const closeSet = () => overlay.classList.remove('show');
  $('#btnSettings').addEventListener('click', openSet);
  $('#settingsClose').addEventListener('click', closeSet);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('show')) closeSet(); });

  // 初始化设置值
  if ($('#setExportFormat')) $('#setExportFormat').value = appSettings.exportFormat;
  $('#setExportRes').value = appSettings.exportRes;
  $('#setExportFps').value = appSettings.exportFps;
  $('#setExportBitrate').value = appSettings.exportBitrate;
  $('#setPointSize').value = appSettings.pointSize;
  $('#setPointSizeVal').textContent = appSettings.pointSize + 'px';
  $('#setBorderWidth').value = appSettings.borderWidth;
  $('#setBorderWidthVal').textContent = appSettings.borderWidth + 'px';
  if ($('#setBgAlpha')) {
    $('#setBgAlpha').value = appSettings.bgAlpha;
    $('#setBgAlphaVal').textContent = appSettings.bgAlpha + '%';
  }
  applyBgAlpha();
  $('#setInitBg').value = appSettings.initBg;
  if ($('#setUiTheme')) $('#setUiTheme').value = appSettings.uiTheme;
  if ($('#setExportGrayBg')) $('#setExportGrayBg').value = String(appSettings.exportGrayBg);
  if ($('#setNewBig4')) $('#setNewBig4').value = String(!!appSettings.experimentalBig4);
  applyPointSize(appSettings.pointSize);
  if (appSettings.uiTheme === 'node') document.body.classList.add('new-ui');

  if ($('#setExportFormat')) $('#setExportFormat').addEventListener('change', e => {
    appSettings.exportFormat = e.target.value === 'webm' ? 'webm' : 'mp4';
    saveSettings();
    log(appSettings.exportFormat === 'mp4'
      ? '导出格式：MP4（H.264）—— 标准封装，剪辑软件和手机都能直接播'
      : '导出格式：WebM（VP9）—— 唯一支持透明通道的格式', 'info');
  });
  $('#setExportRes').addEventListener('change', e => { appSettings.exportRes = parseInt(e.target.value); saveSettings(); });
  $('#setExportFps').addEventListener('change', e => { appSettings.exportFps = parseInt(e.target.value); saveSettings(); });
  $('#setExportBitrate').addEventListener('change', e => { appSettings.exportBitrate = parseInt(e.target.value); saveSettings(); });
  if ($('#setExportGrayBg')) $('#setExportGrayBg').addEventListener('change', e => { appSettings.exportGrayBg = e.target.value === 'true'; saveSettings(); log('导出灰色背景: ' + (appSettings.exportGrayBg ? '保留' : '透明'), 'info'); });
  if ($('#setNewBig4')) $('#setNewBig4').addEventListener('change', e => {
    appSettings.experimentalBig4 = e.target.value === 'true';
    saveSettings();
    refreshBig4UI();
    log(appSettings.experimentalBig4
      ? '大事件4 已切换到【新版】：检查点加时、坦克状态、中途失败、阵营/名称都可以填'
      : '大事件4 已切换到【旧版】：固定 3 个检查点、坦克匀速、倒计时归零结束（颜色和新版一致）', 'info');
  });
  $('#setPointSize').addEventListener('input', e => {
    appSettings.pointSize = parseInt(e.target.value);
    $('#setPointSizeVal').textContent = appSettings.pointSize + 'px';
    applyPointSize(appSettings.pointSize);
    saveSettings();
  });
  $('#setBorderWidth').addEventListener('input', e => { appSettings.borderWidth = Number(e.target.value); $('#setBorderWidthVal').textContent = e.target.value + 'px'; applyBorderWidth(); saveSettings(); });
  $('#btnResetBorder').addEventListener('click', () => { appSettings.borderWidth = 7; $('#setBorderWidth').value = 7; $('#setBorderWidthVal').textContent = '7px'; applyBorderWidth(); saveSettings(); });
  if ($('#setBgAlpha')) {
    $('#setBgAlpha').addEventListener('input', e => {
      appSettings.bgAlpha = parseInt(e.target.value);
      $('#setBgAlphaVal').textContent = appSettings.bgAlpha + '%';
      applyBgAlpha();
      saveSettings();
    });
  }
  if ($('#btnResetBgAlpha')) $('#btnResetBgAlpha').addEventListener('click', () => {
    appSettings.bgAlpha = 82;
    $('#setBgAlpha').value = 82;
    $('#setBgAlphaVal').textContent = '82%';
    applyBgAlpha();
    saveSettings();
  });
  $('#btnResetSize').addEventListener('click', () => {
    appSettings.pointSize = 220;
    $('#setPointSize').value = 220;
    $('#setPointSizeVal').textContent = '220px';
    applyPointSize(220);
    saveSettings();
    log('据点大小已重置为标准 220px', 'info');
  });
  $('#setInitBg').addEventListener('change', e => {
    appSettings.initBg = e.target.value;
    saveSettings();
    // 立即应用
    if (e.target.value === 'chroma') document.body.classList.add('chroma-key');
    else document.body.classList.remove('chroma-key');
    updateBgButtons();
    log(`默认背景已设为: ${e.target.value === 'chroma' ? '抠像 #990066' : '纯白 #FFFFFF'}`, 'info');
  });
  if ($('#setUiTheme')) {
    $('#setUiTheme').addEventListener('change', e => {
      appSettings.uiTheme = e.target.value;
      saveSettings();
      document.body.classList.toggle('new-ui', e.target.value === 'node');
      log('界面风格已切换', 'info');
    });
  }

  // ===== 节点编辑器（安全包裹，出错不影响主功能） =====
  try { initNodeEditor(); } catch(err) { console.error('节点编辑器初始化失败:', err); }
  try { initSplitters(); } catch(err) { console.error('分隔条初始化失败:', err); }
});

function initSplitters() {
  const root = document.documentElement;
  let dragging = null;
  function start(type, e) {
    dragging = type;
    e.preventDefault();
  }
  document.getElementById('splitLeft').addEventListener('mousedown', e => start('left', e));
  document.getElementById('splitRight').addEventListener('mousedown', e => start('right', e));
  document.getElementById('splitBottom').addEventListener('mousedown', e => start('bottom', e));
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    if (dragging === 'left') {
      const w = Math.max(180, Math.min(500, e.clientX));
      root.style.setProperty('--left-w', w + 'px');
    } else if (dragging === 'right') {
      const w = Math.max(180, Math.min(500, window.innerWidth - e.clientX));
      root.style.setProperty('--right-w', w + 'px');
    } else if (dragging === 'bottom') {
      const h = Math.max(150, Math.min(window.innerHeight - 200, window.innerHeight - e.clientY));
      root.style.setProperty('--editor-h', h + 'px');
    }
  });
  document.addEventListener('mouseup', () => { dragging = null; });
}
