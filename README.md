# 三角洲行动 · 据点UI组件 v3

给《三角洲行动》做据点/事件演示动画的桌面小工具。所有画面都在本地用 Canvas + CSS 画出来，
可以按事件链一步步演，也能直接导出成视频（MP4 / 透明 WebM）丢进剪辑软件。

- 作者：B站 [@我是小宋awa](https://space.bilibili.com/1707515344)
- 版本：v3.0.0（Electron 31 桌面版）
- 协议：[MIT](LICENSE)

## 能做什么

| 功能 | 说明 |
|---|---|
| 据点 UI | 绿 / 红 / 中立 / 附属据点，边框推进、后退、闪烁、变中立，颜色纯色、无光晕 |
| 事件链 | 一条链串起多个事件（推进、后退、待机、中断、大事件），按顺序自动演 |
| 大事件 | 变种 1 炸毁变中立 · 变种 2 自动归属 GTI · 变种 3 替换敌方据点 · 变种 4 护送车队 |
| 护送车队 | 进度条 + 检查点 + 旗帜 + 坦克 + 状态图标 + 倒计时，检查点加时、坦克状态、失败位置都可自定义 |
| 两种编辑器 | 经典版（表单 + 事件链 JSON）和节点版（底部拖拽编排），随时切换不丢内容 |
| 视频导出 | 默认 MP4（H.264，标准封装），要透明就用 WebM（VP9 alpha）；分辨率 / 帧率 / 码率可调 |
| 模板 | 事件链可存成 `.deltaTemplate` 文件，导入导出方便复用 |

## 下载

到 [Releases](../../releases) 下载：

- `DeltaStrongholdUI-vx.x.x-portable.zip` — exe 压缩包（编译好的程序，解压后运行 `三角洲据点UI.exe`）
- `DeltaStrongholdUI-vx.x.x-source.zip` — 源码包（`npm install && npm start` 可跑）

Windows 10/11 x64。没做代码签名，首次运行可能被 SmartScreen 拦，点「更多信息 → 仍要运行」即可。

## 从源码跑

```bash
npm install     # 首次
npm start       # 开发模式
npm run dist    # 打包（输出到 dist/）
```

需要 Node.js 18+（推荐 20 LTS）。

## 项目结构

```
delta-stronghold-v3/
├── index.html          # 只放页面结构和教程文案
├── main.js             # 主进程：窗口、菜单、另存为、检查更新、附属应用下载
├── preload.js          # 安全桥接（contextBridge，只暴露必要接口）
├── css/                # 10 个样式文件，引入顺序即层叠顺序
│   ├── 00-fonts.css    # 内嵌字体（base64，自动生成区）
│   ├── 00-base.css     # CSS 变量：--point-size / --border-width / --point-bg-alpha
│   ├── 10-panel.css    # 右侧面板、参数列表
│   ├── 15-stage.css    # 预览舞台
│   ├── 20-tutorial.css # 教程弹窗 + 设置面板
│   ├── 30-convoy.css   # 护送车队 UI
│   ├── 50-node-theme.css / 55-node-editor.css  # 节点版
│   └── 60-wiki.css     # 教程正文排版
├── js/                 # 经典脚本按序加载，共享全局作用域（不是 ES Module）
│   ├── 00-assets.js    # 素材 base64（自动生成区）
│   ├── 00-core.js      # 事件元数据、校验、护送时间轴 buildEscortPlan
│   ├── 05-vendor-mp4.js# mp4-muxer 打包产物（自动生成区）
│   ├── 10-stronghold.js# 单个据点的绘制与动画
│   ├── 20-chain.js     # 事件链管理器 + 校验
│   ├── 30-samples.js   # 示例链
│   ├── 40-ui.js        # 面板、设置、可视化编辑器
│   ├── 45-node-editor.js # 节点编辑器
│   ├── 60-renderer.js  # Canvas 渲染 + 视频编码
│   └── 70-update.js    # 关于界面、检查更新、附属应用
├── templates/          # 事件链模板（.deltaTemplate，就是 JSON）
├── tools/              # 构建与测试脚本（见下）
└── assets/             # 应用图标
```

## 开发和验证

```bash
# 跑自动探针（改完 js/css 后建议跑一遍）
npx electron tools/probe.js probe-suite.js    # 基础功能 37 条
npx electron tools/probe.js probe-suite2.js   # 编辑器 / 参数 / 护送 91 条

# 导出视频的端到端测试（6 个用例，会真的编码出文件）
npx electron tools/export-test.js

# 改了 js/css 之后重打 asar + exe 压缩包
node tools/build-portable.js
```

几个注意点：

- 项目用的是**经典脚本**，不是 ES Module —— Electron 用 `file://` 加载时 module 会被 CORS 拦
- `js/00-assets.js`、`css/00-fonts.css`、`js/05-vendor-mp4.js` 是自动生成区，别手改：
  - 素材/图标：`node tools/icon-from-image.js <图片> 512`、`node tools/convoy-assets.js`
  - mp4-muxer：`node tools/build-muxer.js`
- 测试窗口必须可见，否则 rAF 会被降到 2Hz，动画测试全乱

## 检查更新 / version.json

软件里「设置 → 关于 → 检查更新」按这个顺序取数据，前一个失败才试下一个：

1. `https://api.github.com/repos/Robot27-xiaosong/delta-stronghold-ui/releases/latest`
2. `https://cdn.jsdelivr.net/gh/Robot27-xiaosong/delta-stronghold-ui@main/version.json`（国内比 api.github.com 稳）

仓库地址只写在 `main.js` 的 `GITHUB_REPO` 一处，渲染侧通过 `appInfo()` 读回来。

`version.json` 放在仓库根，格式：

```json
{
  "version": "3.0.0",
  "date": "2026-10-29",
  "notes": ["新增 xxx", "修了 xxx"],
  "downloads": { "github": "https://github.com/Robot27-xiaosong/delta-stronghold-ui/releases" },
  "affiliated": [
    {
      "id": "hud_demo",
      "name": "三角洲全面战场 · 局内提示工具",
      "version": "1.0.0",
      "size": 117671788,
      "exe": "三角洲全面战场局内提示工具.exe",
      "sha256": "<重新打包 exe 后必须更新>",
      "url": "https://github.com/Robot27-xiaosong/delta-stronghold-ui/releases/latest/download/<文件名>"
    }
  ]
}
```

发新版时改 `version` 和 `notes` 就够了，客户端会自己比对语义化版本号。

## 附属应用（实验性）

主程序**不内置**任何附属应用。在「设置 → 实验性功能 → 附属应用支持」选「启用」后才会出现下载入口：

- 下载源只允许 GitHub / jsDelivr 白名单域名
- 存到 `%APPDATA%/三角洲据点UI/affiliated/<id>/`
- 先写 `.part`，校验 sha256 通过后才改名；校验不过直接删掉
- 下完不会自动运行，要手动点「启动」

## 隐私

软件本身不收集任何数据，只在点「检查更新」或下载附属应用时访问 GitHub / jsDelivr。

## 免责声明

《三角洲行动》及相关素材（游戏字体、图标、贴图）版权归原厂所有。
本项目是非官方的个人学习作品，仅供交流学习，**禁止任何商业用途**。
如果权利方认为有侵权，请联系删除。

## 许可证

[MIT](LICENSE)
