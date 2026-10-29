// preload.js - 安全桥接，仅暴露必要API
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 接收主进程菜单消息
  onMenuAction: (callback) => {
    const channels = ['menu-export', 'menu-bg-white', 'menu-bg-chroma', 'menu-tutorial', 'menu-about'];
    channels.forEach(ch => {
      ipcRenderer.on(ch, () => callback(ch));
    });
  },
  // 版本信息（真实版本从主进程的 app:info 取，这里只给个兜底）
  getVersion: () => '3.0.0',

  // 导出视频：走系统「另存为」对话框，返回 { canceled, path, size }
  saveMediaFile: (bytes, defaultName, ext) =>
    ipcRenderer.invoke('media:save', { bytes, defaultName, ext }),
  // 在资源管理器里定位到该文件
  revealFile: (filePath) => ipcRenderer.invoke('media:reveal', filePath),

  // ===== 关于 / 更新 =====
  appInfo: () => ipcRenderer.invoke('app:info'),          // 版本 / Electron / 系统 / 仓库地址
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),   // 只放行 https
  checkUpdate: (urls, affiliatedUrl) =>
    ipcRenderer.invoke('update:check', { urls, affiliatedUrl }),

  // ===== 附属应用（实验性）=====
  affiliatedList: (items) => ipcRenderer.invoke('aff:list', { items }),
  affiliatedDownload: (item) => ipcRenderer.invoke('aff:download', { item }),
  affiliatedCancel: (id) => ipcRenderer.invoke('aff:cancel', { id }),
  affiliatedOpen: (id) => ipcRenderer.invoke('aff:open', { id }),
  affiliatedRemove: (id) => ipcRenderer.invoke('aff:remove', { id }),
  onAffiliatedProgress: (callback) => {
    ipcRenderer.on('aff:progress', (e, data) => callback(data));
  }
});
