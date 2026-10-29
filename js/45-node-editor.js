/* 45-node-editor.js — 节点编辑器 + 据点尺寸 */
function initNodeEditor() {
  const editor = document.getElementById('nodeEditor');
  const canvas = document.getElementById('neCanvas');
  const svg = document.getElementById('neLines');
  const btnClose = document.getElementById('neClose');
  const btnClear = document.getElementById('neClear');
  const selAdd = document.getElementById('neAddType');
  const neTut = document.getElementById('neTutorial');
  const neSet = document.getElementById('neSettings');
  if (!editor || !canvas || !svg || !btnClose || !btnClear || !selAdd) return;

  let neNodes = [];
  let neConnections = [];
  let neDrag = null;
  let neLinking = null;
  let collapsed = false;

  function getNodeById(id) { return neNodes.find(n => n.id === id); }
  function getOutConn(id) { return neConnections.find(c => c.from === id); }
  function getInConn(id) { return neConnections.find(c => c.to === id); }

  // 按连线顺序生成有序事件链
  function getOrderedNodes() {
    if (neNodes.length === 0) return [];
    if (neConnections.length === 0) return neNodes.slice();
    // 找起点（没有输入连线的节点）
    const starts = neNodes.filter(n => !getInConn(n.id));
    if (starts.length === 0) return neNodes.slice();
    const ordered = [];
    const visited = new Set();
    let cur = starts[0];
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      ordered.push(cur);
      const out = getOutConn(cur.id);
      cur = out ? getNodeById(out.to) : null;
    }
    // 把没连进来的节点追加到后面
    neNodes.forEach(n => { if (!visited.has(n.id)) ordered.push(n); });
    return ordered;
  }

  function syncToBlocks() {
    if (typeof visualBlocks === 'undefined') return;
    const ordered = getOrderedNodes();
    visualBlocks = ordered.map(n => JSON.parse(JSON.stringify(n.params)));
    const ce = document.getElementById('chainEditor');
    if (ce) ce.value = JSON.stringify(visualBlocks, null, 2);
    if (typeof renderVisualList === 'function') renderVisualList();
    updateNodeCount();
  }
  function updateNodeCount() {
    const t = document.querySelector('.ne-title');
    if (t) t.textContent = '节点编辑器（' + neNodes.length + '个事件 · ' + neConnections.length + '条连线）';
  }
  window.neGetNodes = () => getOrderedNodes();
  window.neSyncToBlocks = () => syncToBlocks();
  window.neSyncFromBlocks = () => { syncFromBlocks(); renderNE(); };

  function syncFromBlocks() {
    neNodes = (typeof visualBlocks !== 'undefined' ? visualBlocks : []).map((b, i) => ({
      id: 'ne' + Date.now() + '_' + i,
      type: b.type,
      params: JSON.parse(JSON.stringify(b)),
      x: 60 + (i % 3) * 280,
      y: 40 + Math.floor(i / 3) * 170
    }));
    // 自动按顺序连线
    neConnections = [];
    for (let i = 0; i < neNodes.length - 1; i++) {
      neConnections.push({ from: neNodes[i].id, to: neNodes[i+1].id });
    }
  }

  function nodePorts(n) {
    const card = canvas.querySelector('.ne-card[data-nid="' + n.id + '"]');
    const w = card ? card.offsetWidth : 150;
    const h = card ? card.offsetHeight : 56;
    return {
      inX: n.x, inY: n.y + h / 2,
      outX: n.x + w, outY: n.y + h / 2
    };
  }

  /* 卡片是绝对定位，撑不开父元素：不加这一步，节点拖到可视区下面以后
     ① 画布不会出现滚动条（够不着）② SVG 只有可视区那么高，连线直接被裁掉。
     所以按最远节点算一个内容尺寸，同时喂给占位块和 SVG。 */
  const spacer = document.getElementById('neSpace');
  function updateCanvasExtent() {
    let maxR = 0, maxB = 0;
    neNodes.forEach(n => {
      const card = canvas.querySelector('.ne-card[data-nid="' + n.id + '"]');
      const w = card ? card.offsetWidth : 170;
      const h = card ? card.offsetHeight : 80;
      if (n.x + w > maxR) maxR = n.x + w;
      if (n.y + h > maxB) maxB = n.y + h;
    });
    const w = Math.max(canvas.clientWidth, maxR + 60);
    const h = Math.max(canvas.clientHeight, maxB + 60);
    if (spacer) { spacer.style.width = w + 'px'; spacer.style.height = h + 'px'; }
    svg.style.width = w + 'px';
    svg.style.height = h + 'px';
  }

  function drawLines() {
    updateCanvasExtent();
    svg.innerHTML = '';
    // 已有连线
    neConnections.forEach((conn, idx) => {
      const a = getNodeById(conn.from), b = getNodeById(conn.to);
      if (!a || !b) return;
      const pa = nodePorts(a), pb = nodePorts(b);
      const cx = (pa.outX + pb.inX) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M' + pa.outX + ',' + pa.outY + ' C' + cx + ',' + pa.outY + ' ' + cx + ',' + pb.inY + ' ' + pb.inX + ',' + pb.inY);
      path.setAttribute('stroke', '#4a9eff');
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('fill', 'none');
      path.setAttribute('opacity', '0.7');
      path.setAttribute('class', 'ne-conn-line');
      path.setAttribute('data-idx', idx);
      path.style.cursor = 'pointer';
      path.style.pointerEvents = 'stroke';
      path.addEventListener('click', (e) => {
        e.stopPropagation();
        neConnections.splice(idx, 1);
        renderNE(); syncToBlocks();
      });
      path.addEventListener('mouseenter', () => { path.setAttribute('stroke', '#ff5a5a'); path.setAttribute('stroke-width', '3.5'); });
      path.addEventListener('mouseleave', () => { path.setAttribute('stroke', '#4a9eff'); path.setAttribute('stroke-width', '2.5'); });
      svg.appendChild(path);
      // 箭头
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const ax = pb.inX, ay = pb.inY;
      arrow.setAttribute('points', (ax-6) + ',' + (ay-4) + ' ' + (ax+2) + ',' + ay + ' ' + (ax-6) + ',' + (ay+4));
      arrow.setAttribute('fill', '#4a9eff');
      svg.appendChild(arrow);
    });
    // 正在拖拽的临时线
    if (neLinking) {
      const from = getNodeById(neLinking.fromId);
      if (from) {
        const p = nodePorts(from);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M' + p.outX + ',' + p.outY + ' L' + neLinking.mx + ',' + neLinking.my);
        path.setAttribute('stroke', '#80c0ff');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '5,3');
        path.setAttribute('fill', 'none');
        svg.appendChild(path);
      }
    }
  }

  /* ---------- 参数编辑区：字段由 EVENT_META 决定 ---------- */
  /** 把编辑区里输入的值写回 n.params（数值字段转数字，文本保持字符串） */
  function collectParams(body, n) {
    body.querySelectorAll('.ne-param-input').forEach(inp => {
      const k = inp.dataset.key;
      if (!k) return;
      const field = eventFields(n.type, n.params).find(f => f.key === k) || {};
      const raw = inp.value;
      if (field.kind === 'text') {
        n.params[k] = raw;
      } else if (field.kind === 'variant') {
        n.params[k] = Number(raw) || 1;
      } else if (field.kind === 'select') {
        n.params[k] = raw;      // failMode 这类是字符串，别 Number()
      } else {
        const num = Number(raw);
        n.params[k] = isNaN(num) ? (field.def === undefined ? raw : field.def) : num;
      }
    });
    // 列表字段（检查点 / 坦克状态）单独收。
    // 注意：切变种时 DOM 里还是上一个变种的字段，找不到列表就别动，
    // 否则会把刚补好的默认检查点清成空数组
    eventFields(n.type, n.params).filter(f => f.kind === 'list').forEach(f => {
      if (!body.querySelector('.plist[data-list="' + f.key + '"]')) return;
      n.params[f.key] = collectListValue(body, f);
    });
  }

  /** 按「类型 + 变种」生成输入行：切到变种3/4 会自动出现 oldName/newName/collapseDelay 等必填项 */
  function renderParamEditor(body, n) {
    // 编辑中的卡片浮到最上层，避免被相邻节点盖住
    const cardEl = body.closest('.ne-card');
    if (cardEl) cardEl.style.zIndex = '6';
    const fields = eventFields(n.type, n.params);
    let html = '';
    fields.forEach(f => {
      const label = f.label + (f.req ? ' *' : '');
      const val = n.params[f.key] === undefined
        ? (f.def === undefined ? '' : f.def)
        : n.params[f.key];
      const safe = String(val).replace(/"/g, '&quot;');
      if (f.kind === 'variant') {
        html += '<div class="ne-param-row"><span class="ne-param-label">' + label + '</span>' +
          '<select class="ne-param-input" data-key="' + f.key + '">' +
            [1, 2, 3, 4].map(v => '<option value="' + v + '"' + (Number(val) === v ? ' selected' : '') + '>' +
              '变种' + v + ' · ' + (EVENT_VARIANT_NAMES[v] || '') + '</option>').join('') +
          '</select></div>';
      } else if (f.kind === 'text') {
        html += '<div class="ne-param-row"><span class="ne-param-label">' + label + '</span>' +
          '<input class="ne-param-input" data-key="' + f.key + '" type="text" value="' + safe + '"></div>';
      } else if (f.kind === 'list') {
        html += listEditorHtml(f, n.params[f.key] === undefined ? f.def : n.params[f.key]);
      } else if (f.kind === 'select') {
        html += '<div class="ne-param-row"><span class="ne-param-label">' + label + '</span>' +
          '<select class="ne-param-input" data-key="' + f.key + '">' +
          f.options.map(o => '<option value="' + o.v + '"' +
            (o.v === (n.params[f.key] === undefined ? f.def : n.params[f.key]) ? ' selected' : '') + '>' +
            o.t + '</option>').join('') +
          '</select></div>';
      } else {
        const step = f.step || (f.kind === 'int' ? 1 : 0.1);
        const min = f.min === undefined ? 0 : f.min;
        html += '<div class="ne-param-row"><span class="ne-param-label">' + label + '</span>' +
          '<input class="ne-param-input" data-key="' + f.key + '" type="number" step="' + step + '" min="' + min + '" value="' + safe + '"></div>';
      }
    });
    html += '<div class="ne-param-actions"><button class="ne-param-save">保存</button></div>';
    body.innerHTML = html;
    bindListEditors(body);   // 列表字段的增删按钮 + 阻止冒泡（不然会拖到卡片）

    body.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('click', (ev) => ev.stopPropagation());
    });

    // 变种切换：先保留已填内容，再补齐/清掉该变种需要的字段，然后重画编辑区
    const vSel = body.querySelector('.ne-param-input[data-key="variant"]');
    if (vSel) vSel.addEventListener('change', (ev) => {
      ev.stopPropagation();
      collectParams(body, n);
      n.params.variant = Number(vSel.value) || 1;
      normalizeEventParams('bigEvent', n.params);
      syncToBlocks();
      renderNE();
      const nb = canvas.querySelector('.ne-card[data-nid="' + n.id + '"] .nc-body');
      if (nb) { nb.dataset.edit = '1'; renderParamEditor(nb, n); }
    });

    body.querySelector('.ne-param-save').addEventListener('click', (ev) => {
      ev.stopPropagation();
      collectParams(body, n);
      normalizeEventParams(n.type, n.params);
      renderNE();
      syncToBlocks();
    });
  }

  function renderNE() {
    canvas.querySelectorAll('.ne-card').forEach(el => el.remove());
    const ordered = getOrderedNodes();
    const orderMap = {};
    ordered.forEach((n, i) => orderMap[n.id] = i + 1);

    neNodes.forEach((n) => {
      const card = document.createElement('div');
      card.className = 'ne-card t-' + n.type;
      card.style.left = n.x + 'px';
      card.style.top = n.y + 'px';
      card.setAttribute('data-nid', n.id);
      const meta = eventMeta(n.type);
      const paramStr = eventParamText(n.type, n.params);
      card.innerHTML =
        '<div class="nc-port nc-port-in" data-nid="' + n.id + '" title="输入点"></div>' +
        '<div class="nc-port nc-port-out" data-nid="' + n.id + '" title="输出点·拖拽连线"></div>' +
        '<div class="nc-head" data-id="' + n.id + '">' +
          '<span class="nc-num">' + (orderMap[n.id] || '?') + '</span>' +
          '<span>' + meta.short + '</span>' +
          '<span class="nc-type">' + n.type + '</span>' +
          '<button class="nc-x" data-id="' + n.id + '">×</button>' +
        '</div>' +
        '<div class="nc-body" data-edit="0">' + (paramStr || '<i style="opacity:0.5">无参数 · 点击填写</i>') + '</div>';
      canvas.appendChild(card);

      // 拖拽移动
      const head = card.querySelector('.nc-head');
      head.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('nc-x')) return;
        if (e.target.closest('.nc-body')) return;
        if (e.target.classList.contains('nc-port')) return;
        const cRect = canvas.getBoundingClientRect();
        neDrag = {
          id: n.id,
          dx: e.clientX - n.x - cRect.left + canvas.scrollLeft,
          dy: e.clientY - n.y - cRect.top + canvas.scrollTop
        };
        e.preventDefault();
      });

      // 输出点开始连线
      const outPort = card.querySelector('.nc-port-out');
      outPort.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const cRect = canvas.getBoundingClientRect();
        neLinking = {
          fromId: n.id,
          mx: e.clientX - cRect.left + canvas.scrollLeft,
          my: e.clientY - cRect.top + canvas.scrollTop
        };
        drawLines();
      });

      // 输入点接收连线
      const inPort = card.querySelector('.nc-port-in');
      inPort.addEventListener('mouseup', (e) => {
        if (!neLinking) return;
        e.stopPropagation();
        const fromId = neLinking.fromId;
        const toId = n.id;
        if (fromId === toId) { neLinking = null; drawLines(); return; }
        // 断开旧连线
        neConnections = neConnections.filter(c => c.from !== fromId && c.to !== toId);
        neConnections.push({ from: fromId, to: toId });
        neLinking = null;
        renderNE(); syncToBlocks();
      });

      // 删除节点
      card.querySelector('.nc-x').addEventListener('click', (e) => {
        e.stopPropagation();
        neNodes = neNodes.filter(x => x.id !== n.id);
        neConnections = neConnections.filter(c => c.from !== n.id && c.to !== n.id);
        renderNE(); syncToBlocks();
      });

      // 参数编辑
      const body = card.querySelector('.nc-body');
      body.addEventListener('click', (e) => {
        e.stopPropagation();
        if (body.dataset.edit === '1') return;
        body.dataset.edit = '1';
        renderParamEditor(body, n);
      });
    });
    drawLines();
  }

  // 全局鼠标事件
  document.addEventListener('mousemove', (e) => {
    const cRect = canvas.getBoundingClientRect();
    if (neDrag) {
      const n = neNodes.find(x => x.id === neDrag.id);
      if (n) {
        n.x = Math.max(0, e.clientX - neDrag.dx - cRect.left + canvas.scrollLeft);
        n.y = Math.max(0, e.clientY - neDrag.dy - cRect.top + canvas.scrollTop);
        const card = canvas.querySelector('.ne-card[data-nid="' + n.id + '"]');
        if (card) { card.style.left = n.x + 'px'; card.style.top = n.y + 'px'; }
        drawLines();
      }
    }
    if (neLinking) {
      neLinking.mx = e.clientX - cRect.left + canvas.scrollLeft;
      neLinking.my = e.clientY - cRect.top + canvas.scrollTop;
      drawLines();
    }
  });
  document.addEventListener('mouseup', () => {
    neDrag = null;
    if (neLinking) { neLinking = null; drawLines(); }
  });

  btnClose.addEventListener('click', () => {
    collapsed = !collapsed;
    editor.style.height = collapsed ? '36px' : '';
    canvas.style.display = collapsed ? 'none' : '';
    btnClose.textContent = collapsed ? '展开' : '收起';
  });

  // 经典版可视化模式里的「打开节点编辑器」按钮：切到节点版并把当前事件链带过去
  const btnOpen = document.getElementById('btnOpenNE');
  if (btnOpen) btnOpen.addEventListener('click', () => {
    document.body.classList.add('new-ui');
    appSettings.uiTheme = 'node';
    saveSettings();
    const themeSel = document.getElementById('setUiTheme');
    if (themeSel) themeSel.value = 'node';
    collapsed = false;
    editor.style.height = '';
    canvas.style.display = '';
    btnClose.textContent = '收起';
    syncFromBlocks();
    renderNE();
    updateNodeCount();
    log('已打开节点编辑器（界面切到节点版）', 'info');
  });
  btnClear.addEventListener('click', () => { neNodes = []; neConnections = []; renderNE(); syncToBlocks(); });
  if (neTut) neTut.addEventListener('click', () => { const b = document.getElementById('btnTutorial'); if (b) b.click(); });
  if (neSet) neSet.addEventListener('click', () => { const b = document.getElementById('btnSettings'); if (b) b.click(); });
  selAdd.addEventListener('change', () => {
    const type = selAdd.value;
    if (!type) return;
    if (type === 'bigEvent' && isActiveSatellite()) {
      log('❌ [E014] 附属据点不支持大事件，请先切到普通据点', 'err');
      selAdd.value = '';
      return;
    }
    // 默认参数统一从 EVENT_META 生成，保证必填字段一个都不缺
    const params = normalizeEventParams(type, type === 'bigEvent' ? { type: type, variant: 1 } : { type: type });
    const newNode = {
      id: 'ne' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      type: type, params: params,
      x: 60 + (neNodes.length % 3) * 280,
      y: 40 + Math.floor(neNodes.length / 3) * 170
    };
    neNodes.push(newNode);
    // 如果有节点，自动连到最后一个
    if (neNodes.length > 1) {
      const last = neNodes[neNodes.length - 2];
      if (!getOutConn(last.id)) neConnections.push({ from: last.id, to: newNode.id });
    }
    renderNE(); syncToBlocks();
    selAdd.value = '';
    log('已添加节点：' + eventMeta(type).label, 'ok');
  });

  if (document.body.classList.contains('new-ui')) {
    syncFromBlocks();
    renderNE();
    updateNodeCount();
  }
  const obs = new MutationObserver(() => {
    if (document.body.classList.contains('new-ui') && neNodes.length === 0) {
      syncFromBlocks(); renderNE(); updateNodeCount();
    }
  });
  obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function applyPointSize(size) {
  // 走 CSS 变量：据点宽高和字号一起缩放，新建据点也自动继承
  document.documentElement.style.setProperty('--point-size', size + 'px');
}
