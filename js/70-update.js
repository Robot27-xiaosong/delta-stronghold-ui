/* ============================================================
   关于界面 / 检查更新 / 附属应用下载
   —— 所有网络请求都走主进程（preload 暴露的 electronAPI）：
      渲染进程会被 CORS / CSP 挡，而且主进程能流式写文件
   —— 仓库地址只在 main.js 的 GITHUB_REPO 一处定义，这里用 appInfo() 读回来，
      不要在渲染侧另写一份（改仓库时只改一处）
   ============================================================ */
(function () {
  'use strict';

  const q = (sel, root) => (root || document).querySelector(sel);
  const api = (typeof window.electronAPI !== 'undefined') ? window.electronAPI : null;

  let APP_INFO = {
    version: '3.0.0', electron: '', chrome: '', node: '',
    platform: '', arch: '', repo: '', repoUrl: '', releasesUrl: ''
  };
  const UPDATE = { checking: false, info: null, at: 0 };

  /* 附属应用清单：目前只有一个，版本/下载地址都是 GitHub Release 的直链。
     ⚠ 仓库地址填好后不用改这里：url 会按 main.js 里的仓库地址自动拼。
     ⚠ sha256 是「重新打包 exe 之后」算出来的，重新打包 exe 就必须更新这个值
        （PowerShell: Get-FileHash .\xxx.exe -Algorithm SHA256），
        对不上时下载会被判为损坏并自动删掉。留空则只提示、不拦。 */
  const AFFILIATED = [
    {
      id: 'hud_demo',
      name: '三角洲全面战场 · 局内提示工具',
      version: '0.0.1-alpha.1',
      size: 117616689,
      // 本地保存用的文件名 = Release 附件名，直接就能启动
      exe: 'deltaforce-hud-tool.exe',
      asset: 'deltaforce-hud-tool.exe',
      // 附属应用在自己的仓库里发版；tag 填实际 tag（预发布版不能用 releases/latest，会 404）
      repo: 'Robot27-xiaosong/deltaforce-hud-tool',
      tag: 'v0.0.1-alpha.1',
      sha256: '1a2c779163b7c077e4ea397d1dabcaa2c1a8cbdd12237fc4ad40fbad5d9128cb'
    }
  ];

  const REPO_PLACEHOLDER = /^OWNER\/REPO$/i;

  function repoReady() {
    return !!APP_INFO.repo && !REPO_PLACEHOLDER.test(APP_INFO.repo);
  }

  /** 附属应用某一项的下载地址：有 tag 用固定 tag，没有就走 latest（只认正式版） */
  function affDownloadUrl(it) {
    const repo = it.repo || APP_INFO.affiliateRepo || '';
    if (!repo || REPO_PLACEHOLDER.test(repo)) return '';
    const name = encodeURIComponent(it.asset || it.exe);
    const tag = it.tag || '';
    return 'https://github.com/' + repo + '/releases/'
      + (tag ? 'download/' + encodeURIComponent(tag) : 'latest/download')
      + '/' + name;
  }

  /** 这一项的仓库地址填好了没（下载前检查） */
  function affReady(it) {
    const repo = (it && it.repo) || APP_INFO.affiliateRepo || '';
    return !!repo && !REPO_PLACEHOLDER.test(repo);
  }
  function fmtSize(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB';
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  /* ---------- 版本比较（1.2.10 > 1.2.9） ---------- */
  function parseVer(v) {
    return String(v || '').replace(/^v/i, '').split(/[.\-+]/)
      .map(x => parseInt(x, 10) || 0);
  }
  function compareVer(a, b) {
    const x = parseVer(a), y = parseVer(b);
    const n = Math.max(x.length, y.length);
    for (let i = 0; i < n; i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  /* ---------- 关于界面初始化 ---------- */
  async function initAbout() {
    if (api && api.appInfo) {
      try { APP_INFO = Object.assign(APP_INFO, await api.appInfo()); } catch (e) { /* 浏览器里直接打开时没有 */ }
    }
    const verEl = q('#aboutVersion');
    if (verEl) verEl.textContent = 'v' + (APP_INFO.version || '3.0.0');

    const repoLink = q('#aboutRepoLink');
    const relLink = q('#aboutReleasesLink');
    if (repoReady()) {
      if (repoLink) repoLink.href = APP_INFO.repoUrl || ('https://github.com/' + APP_INFO.repo);
      if (relLink) relLink.href = APP_INFO.releasesUrl || (APP_INFO.repoUrl + '/releases');
    } else {
      [repoLink, relLink].forEach(a => {
        if (!a) return;
        a.removeAttribute('href');
        a.classList.add('disabled');
        a.title = '仓库地址还没配置（开发者待填）';
      });
    }

    const statusEl = q('#aboutUpdateStatus');
    if (statusEl && !UPDATE.at) statusEl.textContent = '点一下看看有没有新版本';

    // 附属应用：把清单里的下载地址补全 + 渲染卡片
    AFFILIATED.forEach(it => { it.url = affDownloadUrl(it); });
    renderAffiliated();
  }

  /* ---------- 检查更新 ---------- */
  function setStatus(text, kind) {
    const el = q('#aboutUpdateStatus');
    if (!el) return;
    el.className = 'about-update-status' + (kind ? ' ' + kind : '');
    el.innerHTML = text;
  }

  async function doCheckUpdate() {
    const btn = q('#btnCheckUpdate');
    if (UPDATE.checking) return;
    if (!repoReady()) {
      setStatus('⚠ 开发者还没填 GitHub 仓库地址，检查更新暂时用不了', 'warn');
      return;
    }
    UPDATE.checking = true;
    if (btn) { btn.disabled = true; btn.textContent = '检查中…'; }
    setStatus('正在检查…', 'checking');

    const repo = APP_INFO.repo;
    // 先直连 GitHub API，不行再走 jsDelivr 上的 version.json（国内这个能通）
    const urls = [
      'https://api.github.com/repos/' + repo + '/releases/latest',
      'https://cdn.jsdelivr.net/gh/' + repo + '@main/version.json'
    ];
    let res = null;
    try {
      res = api && api.checkUpdate
        ? await api.checkUpdate(urls, urls[1])
        : await fallbackCheck(urls);
    } catch (e) {
      res = { ok: false, errors: [String(e && e.message || e)] };
    }

    UPDATE.checking = false;
    if (btn) { btn.disabled = false; btn.textContent = '检查更新'; }
    UPDATE.at = Date.now();

    if (!res || !res.ok) {
      const why = (res && res.errors && res.errors.length) ? res.errors[0] : '未知原因';
      setStatus(
        '⚠ 检查失败：<span class="au-dim">' + escapeHtml(why) + '</span><br>' +
        '<a href="' + (APP_INFO.releasesUrl || '#') + '" id="auManualLink">去 Release 页手动看</a>',
        'warn');
      return;
    }

    // version.json 里可能带了更新后的附属应用清单（版本 / sha256），有就合并进来
    if (mergeAffiliated(res.affiliated)) renderAffiliated();

    const cur = APP_INFO.version;
    if (compareVer(res.latest, cur) > 0) {
      const notes = (res.notes || []).map(cleanNote).filter(Boolean).slice(0, 6)
        .map(t => '<div class="au-note">· ' + escapeHtml(t) + '</div>').join('');
      setStatus(
        '<b class="au-new">发现新版本 v' + escapeHtml(res.latest) + '</b>' +
        '<span class="au-dim">（当前 v' + escapeHtml(cur) + (res.date ? ' · ' + escapeHtml(res.date) : '') + '）</span>' +
        (notes ? '<div class="au-notes">' + notes + '</div>' : '') +
        '<a class="au-dl" href="' + escapeHtml(res.page || APP_INFO.releasesUrl) + '">→ 去 GitHub 下载</a>',
        'has-new');
    } else if (compareVer(res.latest, cur) < 0) {
      setStatus('✅ 当前 v' + escapeHtml(cur) + ' 比线上 v' + escapeHtml(res.latest) + ' 还新（开发版）', 'ok');
    } else {
      setStatus('✅ 已是最新版本 v' + escapeHtml(cur), 'ok');
    }
  }

  /* 没有 Electron（直接双击 index.html 调试）时的兜底：GitHub API 是允许跨域的 */
  async function fallbackCheck(urls) {
    const errors = [];
    for (const u of urls) {
      try {
        const r = await fetch(u, { headers: { Accept: 'application/vnd.github+json' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        if (d.tag_name) {
          return {
            ok: true, latest: String(d.tag_name).replace(/^v/i, ''),
            date: (d.published_at || '').slice(0, 10),
            notes: String(d.body || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 8),
            page: d.html_url
          };
        }
        if (d.version) {
          return { ok: true, latest: String(d.version).replace(/^v/i, ''), date: d.date || '', notes: d.notes || [], page: (d.downloads && d.downloads.github) || APP_INFO.releasesUrl };
        }
        errors.push(u + '：格式不认识');
      } catch (e) { errors.push(u + '：' + e.message); }
    }
    return { ok: false, errors };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** 清洗更新日志：GitHub Release 的正文是 Markdown + HTML，
      直接显示会冒出一堆 [文字](链接) 和 <sup>，
      这里把链接语法压成文字、去掉标签、压缩空白，再截到一行能放下的长度 */
  function cleanNote(s) {
    let t = String(s || '');
    t = t.replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, '$1');   // [文字](链接) → 文字
    t = t.replace(/<[^>]+>/g, '');                       // 去掉 HTML 标签
    t = t.replace(/[*_`~]/g, '');                        // 去掉 Markdown 修饰符
    t = t.replace(/\(?Also in[^)]*\)?/gi, '');           // 「(Also in 44)」这种附带说明
    t = t.replace(/\s+/g, ' ').trim();
    if (t.length > 90) {
      t = t.slice(0, 88);
      // 别留半个括号：截断点落在括号里就砍掉这一段
      const open = t.lastIndexOf('('), close = t.lastIndexOf(')');
      if (open > close) t = t.slice(0, open);
      t = t.trim().replace(/[,;:\-]$/, '') + '…';
    }
    return t;
  }

  /* ---------- 复制诊断信息 ---------- */
  async function copyDiag() {
    const text = [
      '三角洲据点UI 诊断信息',
      '版本: v' + APP_INFO.version,
      'Electron: ' + APP_INFO.electron,
      'Chrome: ' + APP_INFO.chrome,
      'Node: ' + APP_INFO.node,
      '系统: ' + APP_INFO.platform + ' ' + APP_INFO.arch,
      '时间: ' + new Date().toLocaleString()
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // 剪贴板被拒时退回旧办法
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
        return true;
      } catch (e2) { return false; }
    }
  }

  /* ---------- 附属应用 ---------- */
  let affState = {};       // id -> { installed, installedVersion, path }
  let affDownloading = {}; // id -> pct

  /** 把 version.json 里的附属应用清单合并进来（以后加第二个应用不用改代码） */
  function mergeAffiliated(remote) {
    if (!Array.isArray(remote) || !remote.length) return false;
    let changed = false;
    remote.forEach(r => {
      if (!r || !r.id) return;
      const cur = AFFILIATED.find(x => x.id === r.id);
      if (!cur) {
        if (!r.url) return;                 // 没地址的项没法下载，跳过
        AFFILIATED.push(Object.assign({}, r));
        changed = true;
        return;
      }
      ['name', 'version', 'size', 'exe', 'asset', 'repo', 'tag', 'sha256'].forEach(k => {
        if (r[k] !== undefined && r[k] !== '' && r[k] !== cur[k]) { cur[k] = r[k]; changed = true; }
      });
      // url 本地能按 repo/tag 自己拼，只有远端给了明确地址才用远端的
      if (r.url && !/OWNER\/REPO/.test(r.url)) {
        if (r.url !== cur.url) { cur.url = r.url; changed = true; }
      } else {
        const built = affDownloadUrl(cur);
        if (built && built !== cur.url) { cur.url = built; changed = true; }
      }
    });
    return changed;
  }

  async function renderAffiliated() {
    const box = q('#affList');
    if (!box) return;
    // 状态从主进程读（已下载 / 版本 / 路径）
    if (api && api.affiliatedList) {
      try {
        const list = await api.affiliatedList(AFFILIATED.map(it => ({
          id: it.id, name: it.name, version: it.version, size: it.size, exe: it.exe
        })));
        affState = {};
        (list || []).forEach(x => { affState[x.id] = x; });
      } catch (e) { /* 浏览器调试时没有 */ }
    }

    box.innerHTML = AFFILIATED.map(it => {
      const st = affState[it.id] || {};
      const pct = affDownloading[it.id];
      const downloading = pct !== undefined;
      const installed = !!st.installed;
      const outdated = installed && st.installedVersion && it.version && compareVer(it.version, st.installedVersion) > 0;

      let statusText, buttons;
      if (downloading) {
        statusText = '下载中 ' + pct.toFixed(0) + '%（' + fmtSize(it.size) + '）';
        buttons = '<button class="about-btn sm" data-aff="cancel" data-id="' + it.id + '">取消</button>';
      } else if (installed) {
        statusText = '已安装 v' + (st.installedVersion || it.version) + (outdated ? ' · 有新版本 v' + it.version : '');
        buttons =
          '<button class="about-btn sm primary" data-aff="open" data-id="' + it.id + '">启动</button>' +
          (outdated ? '<button class="about-btn sm" data-aff="update" data-id="' + it.id + '">更新</button>' : '') +
          '<button class="about-btn sm" data-aff="remove" data-id="' + it.id + '">删除</button>';
      } else {
        statusText = '未下载 · 约 ' + fmtSize(it.size);
        buttons = '<button class="about-btn sm primary" data-aff="download" data-id="' + it.id + '">下载</button>';
      }

      return '<div class="aff-card" data-aff-card="' + it.id + '">' +
        '<div class="aff-head"><b>' + escapeHtml(it.name) + '</b>' +
          '<span class="aff-ver">v' + escapeHtml(it.version) + '</span></div>' +
        '<div class="aff-desc">独立的 Electron 小工具，用来在游戏里显示自定义提示。' +
          '主程序不内置它，装了才下载。</div>' +
        '<div class="aff-status' + (downloading ? ' downloading' : '') + '">' + escapeHtml(statusText) + '</div>' +
        (downloading ? '<div class="aff-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' : '') +
        '<div class="aff-actions">' + buttons + '</div>' +
      '</div>';
    }).join('');

    // 卡片重绘完顺手同步顶栏那个「▶ 局内提示工具」按钮
    syncAffRunButton();
  }

  function affItem(id) {
    return AFFILIATED.find(x => x.id === id);
  }

  /* 顶栏的「▶ 局内提示工具」：只要有一个附属应用下载好了就露出来，
     点一下直接启动它 —— 不用每次都进设置翻卡片 */
  let affRunBusy = false;
  async function syncAffRunButton() {
    const btn = q('#btnAffRun');
    if (!btn) return;
    let installed = [];
    if (api && api.affiliatedList) {
      try {
        const list = await api.affiliatedList(AFFILIATED.map(it => ({
          id: it.id, name: it.name, version: it.version, size: it.size, exe: it.exe
        })));
        installed = (list || []).filter(x => x.installed);
        (list || []).forEach(x => { affState[x.id] = x; });   // 顺手把状态缓存也更新掉
      } catch (e) { installed = []; }
    }
    if (!installed.length) {
      btn.style.display = 'none';
      btn.dataset.id = '';
      return;
    }
    const first = installed[0];
    const meta = affItem(first.id);
    btn.style.display = '';
    btn.dataset.id = first.id;
    // 按钮固定短文案（面板窄），应用名放 tooltip
    btn.textContent = '▶ 附属应用';
    btn.title = '启动已下载的附属应用：' + ((meta && meta.name) || first.name)
      + (first.installedVersion ? '（v' + first.installedVersion + '）' : '');
  }

  async function runAffiliated(id) {
    if (affRunBusy) return;
    const item = affItem(id) || AFFILIATED[0];
    if (!item) return;
    affRunBusy = true;
    const res = api && api.affiliatedOpen ? await api.affiliatedOpen(item.id) : { ok: false, error: '浏览器里打不开' };
    affRunBusy = false;
    log(res.ok ? '▶ 已启动附属应用：' + item.name : '❌ 启动失败：' + (res.error || '未知原因'), res.ok ? 'ok' : 'err');
  }

  /** 在日志里插一行可点击的快捷操作（log() 本身不支持点击） */
  function logAction(text, onClick, type) {
    const box = document.getElementById('logBox');
    if (!box || !onClick) return;
    const line = document.createElement('div');
    line.className = 'log-line';
    line.style.cursor = 'pointer';
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    line.innerHTML = '<span class="log-time">[' + time + ']</span><span class="log-' + (type || 'info') + '">'
      + escapeHtml(text) + '</span>';
    line.onclick = onClick;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }

  /** 在日志里插一行「📂 打开所在文件夹」，点一下就定位到文件 */
  function logOpenFolder(filePath) {
    if (!filePath) return;
    logAction('📂 打开所在文件夹', () => { if (api && api.revealFile) api.revealFile(filePath); });
  }

  async function affAction(action, id) {
    const it = affItem(id);
    if (!it) return;
    if (!affReady(it)) {
      log('⚠ 附属应用的仓库地址没填（js/70-update.js 的 AFFILIATED 里），暂时下载不了', 'warn');
      return;
    }

    if (action === 'download' || action === 'update') {
      const ok = confirm(
        '要下载「' + it.name + '」吗？\n\n' +
        '· 体积约 ' + fmtSize(it.size) + '\n' +
        '· 来源：GitHub Release（' + (it.repo || APP_INFO.affiliateRepo || '') + '）\n' +
        '· 存到：应用数据目录 affiliated/' + it.id + '\n\n' +
        '下载完成后会校验文件完整性，不会自动运行。'
      );
      if (!ok) return;
      affDownloading[id] = 0;
      renderAffiliated();
      log('⬇ 开始下载附属应用：' + it.name, 'info');
      let res;
      try {
        res = await api.affiliatedDownload({
          id: it.id, name: it.name, version: it.version,
          size: it.size, exe: it.exe, sha256: it.sha256, url: it.url
        });
      } catch (e) {
        res = { ok: false, error: String(e && e.message || e) };
      }
      delete affDownloading[id];
      await renderAffiliated();
      if (res && res.ok) {
        log('✅ 附属应用已下载：' + res.path, 'ok');
        logAction('▶ 点这里启动「' + it.name + '」', () => runAffiliated(it.id), 'ok');
        logOpenFolder(res.path);
      } else {
        log('❌ 下载失败：' + ((res && res.error) || '未知原因'), 'err');
      }
      return;
    }

    if (action === 'cancel') {
      if (api && api.affiliatedCancel) await api.affiliatedCancel(id);
      delete affDownloading[id];
      renderAffiliated();
      return;
    }

    if (action === 'open') {
      const res = api && api.affiliatedOpen ? await api.affiliatedOpen(id) : { ok: false, error: '浏览器里打不开' };
      log(res.ok ? '▶ 已启动：' + it.name : '❌ 启动失败：' + res.error, res.ok ? 'ok' : 'err');
      return;
    }

    if (action === 'remove') {
      if (!confirm('删除已下载的「' + it.name + '」？文件会被直接删掉，下次要重新下载。')) return;
      const res = api && api.affiliatedRemove ? await api.affiliatedRemove(id) : { ok: false, error: '浏览器里删不了' };
      await renderAffiliated();
      log(res.ok ? '🗑 已删除：' + it.name : '❌ 删除失败：' + res.error, res.ok ? 'info' : 'err');
    }
  }

  /* ---------- 绑定 ---------- */
  window.addEventListener('load', () => {
    initAbout();

    // 顶栏「▶ 局内提示工具」：有下载好的附属应用才显示，点一下直接启动
    const btnAffRun = q('#btnAffRun');
    if (btnAffRun) btnAffRun.addEventListener('click', () => {
      const id = btnAffRun.dataset.id || (AFFILIATED[0] && AFFILIATED[0].id);
      runAffiliated(id);
    });
    syncAffRunButton();
    // 设置里可能刚启用/下载完，隔一会儿再对一次，保证开机时下载好的应用也能直接开
    setTimeout(syncAffRunButton, 1500);

    const btnCheck = q('#btnCheckUpdate');
    if (btnCheck) btnCheck.addEventListener('click', doCheckUpdate);

    const btnDiag = q('#btnCopyDiag');
    if (btnDiag) btnDiag.addEventListener('click', async () => {
      const ok = await copyDiag();
      const old = btnDiag.textContent;
      btnDiag.textContent = ok ? '已复制到剪贴板' : '复制失败，请手动截图';
      setTimeout(() => { btnDiag.textContent = old; }, 1600);
    });

    // 附属应用卡片上的按钮（事件委托，卡片会被重绘）
    const affList = q('#affList');
    if (affList) affList.addEventListener('click', e => {
      const btn = e.target.closest('[data-aff]');
      if (!btn) return;
      affAction(btn.dataset.aff, btn.dataset.id);
    });

    // 实验性开关：启用后才显示附属应用区
    const affSel = q('#setAffEnabled');
    const affBlock = q('#affBlock');
    // appSettings 是 40-ui.js 里的全局 const（不挂在 window 上），这里用 try 兜住加载顺序
    const readSetting = () => { try { return !!appSettings.experimentalAffiliated; } catch (e) { return false; } };
    const writeSetting = (v) => {
      try { appSettings.experimentalAffiliated = v; saveSettings(); } catch (e) { /* 设置还没初始化 */ }
    };
    const syncAffBlock = () => {
      if (!affBlock || !affSel) return;
      affBlock.style.display = affSel.value === 'true' ? '' : 'none';
      if (affSel.value === 'true') renderAffiliated();
    };
    if (affSel) {
      affSel.value = String(readSetting());
      syncAffBlock();
      affSel.addEventListener('change', () => {
        writeSetting(affSel.value === 'true');
        syncAffBlock();
      });
    }

    // 下载进度（主进程每 200ms 推一次）
    if (api && api.onAffiliatedProgress) {
      api.onAffiliatedProgress(p => {
        if (!p || !p.id) return;
        affDownloading[p.id] = Number(p.pct) || 0;
        const card = q('[data-aff-card="' + p.id + '"]');
        // 只更新状态文字和进度条，避免整块重绘（重绘会丢焦点、闪一下）
        if (card) {
          const st = card.querySelector('.aff-status');
          const bar = card.querySelector('.aff-bar i');
          if (st) st.textContent = '下载中 ' + Number(p.pct || 0).toFixed(0) + '%（' + fmtSize(p.total) + '）';
          if (bar) bar.style.width = Number(p.pct || 0).toFixed(1) + '%';
        } else {
          renderAffiliated();
        }
      });
    }
  });
})();
