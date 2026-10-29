// 三角洲行动 · 据点UI组件 v3 - Electron主进程
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let mainWindow = null;
let lastSaveDir = '';   // 记住上次保存位置，下次默认还是那里

/* ============================================================
   在线能力（检查更新 / 附属应用下载）
   —— 网络请求一律放主进程：渲染进程会被 CORS / CSP 拦，
      而且主进程能流式写文件、能拿系统代理设置
   ============================================================ */
const PKG = require('./package.json');
const APP_VERSION = PKG.version;
// ⚠ 仓库地址只有这一处，GitHub 建好仓库后改这两行即可（渲染侧会自动跟着变）
const GITHUB_REPO = 'Robot27-xiaosong/delta-stronghold-ui';
const GITHUB_URL = 'https://github.com/' + GITHUB_REPO;
const RELEASES_URL = GITHUB_URL + '/releases';

// 附属应用单独一个仓库：主程序的检查更新和它的下载地址互不影响
const AFFILIATE_REPO = 'Robot27-xiaosong/deltaforce-hud-tool';
const AFFILIATE_URL = 'https://github.com/' + AFFILIATE_REPO;

/** 发一个带超时的 https GET，返回解析后的 JSON（非 2xx 抛错） */
async function fetchJson(url, timeoutMs, headers) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs || 10000);
  try {
    const res = await net.fetch(url, {
      signal: ac.signal,
      headers: Object.assign({ 'User-Agent': 'delta-stronghold-ui/' + APP_VERSION }, headers || {})
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 把「GitHub Release」和「version.json」两种格式统一成同一份结构 */
function normalizeRelease(data, source) {
  if (!data || typeof data !== 'object') return null;
  // GitHub Releases API
  if (data.tag_name || data.name && data.html_url) {
    const latest = String(data.tag_name || data.name || '').replace(/^v/i, '').trim();
    if (!latest) return null;
    const body = String(data.body || '');
    return {
      latest,
      date: (data.published_at || '').slice(0, 10),
      notes: body.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')).slice(0, 12),
      page: data.html_url || RELEASES_URL,
      assets: (data.assets || []).map(a => ({ name: a.name, url: a.browser_download_url, size: a.size })),
      source
    };
  }
  // 仓库里的 version.json
  const latest = String(data.version || '').replace(/^v/i, '').trim();
  if (!latest) return null;
  const notes = Array.isArray(data.notes) ? data.notes
    : (typeof data.notes === 'string' ? data.notes.split('\n') : []);
  return {
    latest,
    date: data.date || '',
    notes: notes.map(s => String(s).trim()).filter(Boolean).slice(0, 12),
    page: (data.downloads && data.downloads.github) || RELEASES_URL,
    assets: Array.isArray(data.affiliated) ? data.affiliated : [],
    affiliated: Array.isArray(data.affiliated) ? data.affiliated : [],
    source
  };
}

// 自定义菜单模板
const menuTemplate = [
  {
    label: '文件',
    submenu: [
      {
        label: '导出视频',
        accelerator: 'Ctrl+E',
        click: () => {
          mainWindow.webContents.send('menu-export');
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        accelerator: 'Ctrl+Q',
        click: () => app.quit()
      }
    ]
  },
  {
    label: '视图',
    submenu: [
      {
        label: '切换纯白背景',
        accelerator: 'Ctrl+1',
        click: () => mainWindow.webContents.send('menu-bg-white')
      },
      {
        label: '切换抠像背景',
        accelerator: 'Ctrl+2',
        click: () => mainWindow.webContents.send('menu-bg-chroma')
      },
      { type: 'separator' },
      {
        label: '全屏',
        accelerator: 'F11',
        click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen())
      },
      {
        label: '开发者工具',
        accelerator: 'F12',
        click: () => mainWindow.webContents.toggleDevTools()
      },
      { role: 'reload', label: '刷新' }
    ]
  },
  {
    label: '帮助',
    submenu: [
      {
        label: '使用教程',
        accelerator: 'Ctrl+H',
        click: () => mainWindow.webContents.send('menu-tutorial')
      },
      {
        label: '关于',
        click: () => {
          mainWindow.webContents.send('menu-about');
        }
      }
    ]
  }
];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: '三角洲据点UI v3',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      // 关掉后台节流：窗口被遮挡/最小化时 rAF 会被降频，导出视频会卡住甚至丢帧
      backgroundThrottling: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  // 加载内核HTML（用绝对路径：从其它目录启动也不会找错）
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // ===== 导出视频：原生「另存为」=====
  // 之前是浏览器式 a[download]，只能落到下载目录、文件名带随机串；
  // 保存位置交给系统对话框选，并记住上次的目录
  ipcMain.handle('media:save', async (event, payload) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
      const { bytes, defaultName, ext } = payload || {};
      if (!bytes) return { canceled: true, error: '空数据' };
      const e = ext || 'mp4';
      const buf = Buffer.isBuffer(bytes)
        ? bytes
        : Buffer.from(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength || bytes.length || 0);

      // 自动化测试：设了环境变量就直接落盘，不弹对话框（否则测试会被模态窗卡死）
      if (process.env.DS_EXPORT_TEST_DIR) {
        const p = require('path').join(process.env.DS_EXPORT_TEST_DIR, defaultName || ('export.' + e));
        require('fs').writeFileSync(p, buf);
        return { canceled: false, path: p, size: buf.length, auto: true };
      }

      const defaultDir = lastSaveDir || app.getPath('videos');
      const res = await dialog.showSaveDialog(win, {
        title: '保存导出的视频',
        defaultPath: path.join(defaultDir, defaultName || ('stronghold.' + e)),
        filters: [
          { name: e === 'mp4' ? 'MP4 视频（H.264）' : 'WebM 视频（VP9）', extensions: [e] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });
      if (res.canceled || !res.filePath) return { canceled: true };
      fs.writeFileSync(res.filePath, buf);
      lastSaveDir = path.dirname(res.filePath);
      return { canceled: false, path: res.filePath, size: fs.statSync(res.filePath).size };
    } catch (err) {
      return { canceled: true, error: err.message };
    }
  });

  ipcMain.handle('media:reveal', async (event, filePath) => {
    if (!filePath) return false;
    shell.showItemInFolder(filePath);
    return true;
  });

  // ===== 关于界面要用到的本机信息 =====
  ipcMain.handle('app:info', () => ({
    version: APP_VERSION,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    repo: GITHUB_REPO,
    repoUrl: GITHUB_URL,
    releasesUrl: RELEASES_URL,
    affiliateRepo: AFFILIATE_REPO,
    affiliateUrl: AFFILIATE_URL
  }));

  // ===== 用系统浏览器打开链接（只放行 https）=====
  ipcMain.handle('shell:open', async (event, url) => {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  // ===== 检查更新 =====
  // urls 按优先级排：GitHub Releases API → 仓库里的 version.json（jsDelivr）
  // 任何一个能通就返回，全挂才报错（国内直连 api.github.com 经常超时）
  ipcMain.handle('update:check', async (event, payload) => {
    const urls = Array.isArray(payload && payload.urls) ? payload.urls : [];
    const affUrl = payload && payload.affiliatedUrl;
    const errors = [];
    let info = null;
    for (const u of urls) {
      if (!/^https:\/\//i.test(u)) { errors.push('非法地址：' + u); continue; }
      const isApi = /api\.github\.com/i.test(u);
      try {
        const data = await fetchJson(u, 9000, isApi ? { 'Accept': 'application/vnd.github+json' } : null);
        const norm = normalizeRelease(data, isApi ? 'github' : 'json');
        if (norm) { info = norm; break; }
        errors.push(u + '：返回的内容不是预期格式');
      } catch (err) {
        errors.push(u + '：' + (err.name === 'AbortError' ? '请求超时' : err.message));
      }
    }
    if (!info) return { ok: false, errors, current: APP_VERSION, releasesUrl: RELEASES_URL };
    // 附属应用清单只在 version.json 里有，GitHub API 通的时候补拉一次（拿不到就算了）
    if ((!info.affiliated || !info.affiliated.length) && affUrl && /^https:\/\//i.test(affUrl)) {
      try {
        const vd = await fetchJson(affUrl, 6000);
        if (vd && Array.isArray(vd.affiliated)) info.affiliated = vd.affiliated;
      } catch (e) { /* 附属清单不是必需品 */ }
    }
    return Object.assign({ ok: true, current: APP_VERSION, repo: GITHUB_REPO, releasesUrl: RELEASES_URL }, info);
  });

  /* ============================================================
     附属应用（实验性）：默认不内置、不下载；
     默认不下载：只有 设置 → 实验性功能 里主动点了，才从 GitHub Release 取到应用数据目录
     ============================================================ */
  const AFF_HOST_ALLOW = [
    'github.com', 'objects.githubusercontent.com', 'codeload.github.com',
    'raw.githubusercontent.com', 'cdn.jsdelivr.net',
    // GitHub Release 附件的实际落点（302 之后跳到这，直接写直链也能下）
    'release-assets.githubusercontent.com'
  ];
  const affJobs = new Map();   // id -> { controller, received, total }

  const affRoot = () => path.join(app.getPath('userData'), 'affiliated');
  const affDir = (id) => path.join(affRoot(), String(id || '').replace(/[^\w.-]/g, ''));
  const affMetaPath = (id) => path.join(affDir(id), 'installed.json');

  function affReadMeta(id) {
    try {
      const p = affMetaPath(id);
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) { return null; }
  }

  ipcMain.handle('aff:list', (event, payload) => {
    const items = Array.isArray(payload && payload.items) ? payload.items : [];
    return items.map(it => {
      const meta = affReadMeta(it.id);
      const dir = affDir(it.id);
      const exe = (meta && meta.exe) || it.exe || '';
      const exePath = exe ? path.join(dir, exe) : '';
      return {
        id: it.id,
        name: it.name || it.id,
        version: it.version || '',
        size: Number(it.size) || 0,
        installed: !!(meta && exePath && fs.existsSync(exePath)),
        installedVersion: meta ? meta.version : '',
        path: exePath,
        root: dir
      };
    });
  });

  ipcMain.handle('aff:download', async (event, payload) => {
    const item = payload && payload.item;
    if (!item || !item.id) return { ok: false, error: '清单为空' };
    if (affJobs.has(item.id)) return { ok: false, error: '这个应用已经在下载了' };

    // 只认白名单域名：清单可以被远端改，不能让它随便下任意地址
    let parsed;
    try { parsed = new URL(String(item.url || '')); } catch (e) { return { ok: false, error: '下载地址无效' }; }
    if (parsed.protocol !== 'https:' || !AFF_HOST_ALLOW.includes(parsed.hostname)) {
      return { ok: false, error: '下载地址不在允许的域名里：' + parsed.hostname };
    }

    const dir = affDir(item.id);
    fs.mkdirSync(dir, { recursive: true });
    const exe = String(item.exe || 'app.exe').replace(/[\\/:*?"<>|]/g, '_');
    const tmp = path.join(dir, exe + '.part');
    const out = path.join(dir, exe);

    const controller = new AbortController();
    const job = { controller, received: 0, total: Number(item.size) || 0 };
    affJobs.set(item.id, job);
    const sender = event.sender;
    let lastPush = 0;
    const push = (force) => {
      const now = Date.now();
      if (!force && now - lastPush < 200) return;
      lastPush = now;
      if (sender.isDestroyed()) return;
      sender.send('aff:progress', {
        id: item.id, received: job.received, total: job.total,
        pct: job.total ? Math.min(100, job.received / job.total * 100) : 0
      });
    };

    let file = null;      // 取消/出错时要先关掉它，否则 Windows 上 unlink 会 EBUSY，.part 删不掉
    try {
      const res = await net.fetch(parsed.toString(), {
        signal: controller.signal,
        headers: { 'User-Agent': 'delta-stronghold-ui/' + APP_VERSION }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (!job.total) job.total = Number(res.headers.get('content-length')) || 0;

      const hash = crypto.createHash('sha256');
      file = fs.createWriteStream(tmp);
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const buf = Buffer.from(value);
        hash.update(buf);
        job.received += buf.length;
        await new Promise((resolve, reject) => file.write(buf, err => err ? reject(err) : resolve()));
        push(false);
      }
      await new Promise(resolve => file.end(resolve));

      const digest = hash.digest('hex');
      if (item.sha256 && String(item.sha256).toLowerCase() !== digest.toLowerCase()) {
        try { file.destroy(); } catch (e) {}
        try { fs.unlinkSync(tmp); } catch (e) {}
        throw new Error('文件校验没通过（sha256 对不上），已删掉，请重试或去 Release 页手动下载');
      }
      fs.renameSync(tmp, out);
      fs.writeFileSync(affMetaPath(item.id), JSON.stringify({
        version: item.version || '', name: item.name || item.id,
        exe, size: job.received, sha256: digest, at: Date.now()
      }, null, 2));
      push(true);
      return { ok: true, path: out, size: job.received };
    } catch (err) {
      // 先把写流关掉再删，Windows 上句柄没放掉 unlink 会失败（正好是"取消后 .part 残留"那个 bug）
      try { if (file) file.destroy(); } catch (e) {}
      for (let i = 0; i < 5; i++) {
        try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); break; } catch (e) { await new Promise(r => setTimeout(r, 60)); }
      }
      const aborted = err.name === 'AbortError' || /abort/i.test(err.message || '');
      return { ok: false, error: aborted ? '已取消下载' : (err.message || String(err)) };
    } finally {
      affJobs.delete(item.id);
    }
  });

  ipcMain.handle('aff:cancel', (event, payload) => {
    const id = payload && payload.id;
    const job = affJobs.get(id);
    if (!job) return false;
    job.controller.abort();
    return true;
  });

  ipcMain.handle('aff:open', async (event, payload) => {
    const id = payload && payload.id;
    const meta = affReadMeta(id);
    if (!meta || !meta.exe) return { ok: false, error: '还没下载' };
    const p = path.join(affDir(id), meta.exe);
    if (!fs.existsSync(p)) return { ok: false, error: '文件不见了，请重新下载' };
    // 只允许启动自己目录下的程序
    if (!path.resolve(p).startsWith(path.resolve(affRoot()))) return { ok: false, error: '路径不合法' };
    try {
      const { spawn } = require('child_process');
      spawn(p, [], { detached: true, stdio: 'ignore', cwd: path.dirname(p) }).unref();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('aff:remove', (event, payload) => {
    const id = payload && payload.id;
    const dir = affDir(id);
    if (!path.resolve(dir).startsWith(path.resolve(affRoot()))) return { ok: false, error: '路径不合法' };
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // 设置菜单
  const menu = Menu.buildFromTemplate(menuTemplate);  Menu.setApplicationMenu(menu);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
