const fs = require('fs');
const f = 'C:/Users/pc/Doubao/chats/2026-09-13/new-chat/项目交接文档.md';
let s = fs.readFileSync(f, 'utf8');
const orig = s;
let applied = [];

function replaceBetween(startMark, endMark, newText, label) {
  const i = s.indexOf(startMark);
  const j = s.indexOf(endMark, i + startMark.length);
  if (i < 0 || j < 0) { console.log('❌ 定位失败: ' + label); return; }
  s = s.slice(0, i) + newText + s.slice(j);
  applied.push(label);
}

/* ---------------- 二、PC 端结构 ---------------- */
replaceBetween('### PC 端（Electron v3.0.0）', '### 移动端（Android v1.0.0）', `### PC 端（Electron v3.1.0）

> v3.1.0 已把单文件拆开，逻辑没改，只是分成多文件方便维护。

\`\`\`
C:\\Users\\pc\\Doubao\\chats\\2026-08-21\\new-chat\\delta-stronghold-v3\\

├── index.html            # 页面结构（27KB，只剩 HTML 标签）
├── css/                  # 样式，10 个文件，引入顺序 = 层叠顺序
│   ├── 00-fonts.css      # 内嵌字体 base64（5.2MB，自动生成区，别手改）
│   ├── 00-base.css       # 变量（--point-size / --border-width 等）+ 重置
│   ├── 10-panel.css      # 左侧控制面板
│   ├── 15-stage.css      # 舞台 + 据点卡片（尺寸/字号规则在这）
│   ├── 20-tutorial.css   # 教程弹窗
│   ├── 30-convoy.css     # 护送车队 UI
│   ├── 40-classic.css    # 经典版布局
│   ├── 50-node-theme.css # 节点版三栏布局
│   ├── 55-node-editor.css# 节点编辑器
│   └── 60-wiki.css       # Wiki 教程样式
├── js/                   # 脚本，7 个文件，经典脚本按顺序加载（共享全局作用域）
│   ├── 00-assets.js      # 旗子/坦克 base64（自动生成，别手改）
│   ├── 00-core.js        # $ / uid / log
│   ├── 10-stronghold.js  # StrongholdPoint 据点实例
│   ├── 20-chain.js       # EventChainManager 事件链调度 + 校验
│   ├── 30-samples.js     # 示例事件链
│   ├── 40-ui.js          # UI 绑定、双模式编辑、设置面板、分隔条
│   ├── 45-node-editor.js # 节点编辑器 + 据点尺寸
│   └── 60-renderer.js    # Canvas 导出、模板导入导出、启动
├── assets/               # 素材原件（flag/tank/P-BOLD/P-MED），打包时一起带上
├── tools/                # 开发工具（不打包进 asar）
│   ├── split.js          # 单文件 → 多文件（可重跑）
│   ├── verify.js         # 校验拆分没改逻辑
│   ├── probe.js          # 无头自测执行器
│   ├── probe-suite.js    # 测试用例①启动/尺寸/同步/中断/大事件
│   ├── probe-suite2.js   # 测试用例②真实点击流程/边界
│   ├── export-test.js    # 单独验证导出视频
│   └── build-portable.js # 一键重打 asar
├── main.js               # Electron 主进程
├── preload.js
├── package.json
└── dist/
    ├── win-unpacked/resources/app.asar          # 打包后的应用
    └── DeltaStrongholdUI-v3.1.0-portable.zip    # 当前交付的绿色版（119.7MB）
\`\`\`

`,'PC 端结构');

/* ---------------- 三、构建流程 ---------------- */
replaceBetween('### 日常修改流程（最重要）', '### 安装版 exe 构建（偶尔可用）', `### 日常修改流程（v3.1.0 之后）

改完源码跑一条命令就行，脚本会自动做「解包 asar → 覆盖文件 → 重打 asar → 校验」：

\`\`\`bash
cd delta-stronghold-v3
node tools/build-portable.js
\`\`\`

然后手动压缩 zip（PowerShell 里跑）：

\`\`\`powershell
Compress-Archive -Path "dist\\win-unpacked\\*" \`
  -DestinationPath "dist\\DeltaStrongholdUI-v3.1.0-portable.zip" \`
  -CompressionLevel Optimal -Force
\`\`\`

> zip 被占用时换个文件名（加 -v2），不要反复重试删除。

**顺序很重要**：先 \`node tools/verify.js\` 确认拆分没改坏，再 \`build-portable.js\`。

### 自测（改完必跑）

\`\`\`bash
# 注意要清掉 ELECTRON_RUN_AS_NODE，否则 electron 会当成 node 跑
env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe tools/probe.js probe-suite.js
env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe tools/probe.js probe-suite2.js

# 也可以直接对着打包后的 asar 测（验证 css/js 在 asar 里能找到）
env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe tools/probe.js probe-suite.js "dist/win-unpacked/resources/app.asar/index.html"

# 单独验导出视频
env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe tools/export-test.js
\`\`\`

测试窗口是可见的（隐藏窗口里 requestAnimationFrame 会被节流到 2 帧/500ms，测试会误报失败）。

`,'构建流程');

/* ---------------- 六、已知 Bug ---------------- */
replaceBetween('### 已知 Bug', '### 待开发功能（提过但还没做）', `### v3.1.0 已修复（回归测试请重点看这些）

| 问题 | 原因 | 修法 |
| --- | --- | --- |
| 边框粗细改完，新建据点又变 7px | 逐个元素写内联 stroke-width，新元素没继承 | 改成 CSS 变量 \`--border-width\` |
| 据点大小滑块只改方块，字号不变 | \`.text-elem\` 写死 110px | 改 \`calc(var(--point-size) * 0.5)\` |
| 据点大小改完，新建据点又变 220px | 内联宽高 | 改成 CSS 变量 \`--point-size\` |
| 可视化加完事件，代码框不更新 | 少了 \`syncCodeFromVisual()\` | 加同步；代码→可视化切换也先解析 |
| 「🔗 打开节点编辑器」按钮点了没反应 | 没有绑定任何监听 | 绑到切节点版 + 同步当前事件链 |
| 报错没有 [E0xx]/[E1xx] 编号 | 教程写了编号，代码没实现 | 补全 E001–E013、E101/E102 |
| 点停止后马上重跑，状态被旧链覆盖 | 旧循环收尾时无条件改 isRunning/文字 | 每轮运行带令牌，旧循环失效后直接 return |
| 大事件播一半停，文字残留 ×/半透明/错色 | 停止时只清定时器，没还原文字 | 新增 \`resetText()\`，按边框进度决定白字/阵营色 |
| 推进被中断后文字被刷成阵营色 | 收尾调用 \`stopAlertBlink()\` 用了旧 textColor | 同上，没闭合一律白字 |
| 护送素材加载失败，导出永久卡住 | 只等 onload，没有 onerror | 加 onerror + 3 秒兜底 |
| 窗口被遮挡时导出卡顿/丢帧 | Electron 后台节流把 rAF 降频 | main.js 关掉 \`backgroundThrottling\` |
| 护送导出完成提示说「透明通道」 | 文案没分模式 | 按 hasConvoy 分开提示 |

### 仍然存在 / 没验证的

* 安装版 exe 图标：\`assets/icon.ico\` 和 \`icon.png\` 一直不存在，用的是 Electron 默认图标，不崩但不专业
* 节点编辑器拖动性能：没做虚拟化，节点多了会卡（未改）
* 移动端节点编辑器：还是旧体验（未动）
* 视觉细节（脉冲时长、发光强度、动画缓动）自动化测不出来，需要人工看

`,'已知Bug');

/* ---------------- 五、关键代码位置 ---------------- */
replaceBetween('## 五、关键代码位置（index.html）', '### appSettings 结构', `## 五、关键代码位置

> v3.1.0 之后按文件找，不用再在大文件里搜关键词。

| 功能 | 文件 | 关键位置 |
| --- | --- | --- |
| 据点类 | \`js/10-stronghold.js\` | \`class StrongholdPoint\` |
| 文字设置 | \`js/10-stronghold.js\` | \`_setText(text, className, sizeClass)\` |
| 警报闪烁 | \`js/10-stronghold.js\` | \`startAlertBlink()\` / \`stopAlertBlink()\` |
| 收尾还原文字 | \`js/10-stronghold.js\` | \`resetText()\`（新加） |
| 边框动画 | \`js/10-stronghold.js\` | \`animateBorder()\` |
| 护送车队 UI | \`js/10-stronghold.js\` | \`startConvoyMission()\` |
| 事件校验 | \`js/20-chain.js\` | \`validate(blocks)\`（带 E0xx 编号） |
| 事件链预处理 | \`js/20-chain.js\` | \`preprocess(blocks)\`（interrupt 合并，E1xx） |
| 事件链执行 | \`js/20-chain.js\` | \`runEventChain()\`（带 \`_runToken\`） |
| 停止 | \`js/20-chain.js\` | \`stop()\` / \`_cleanupPoints()\` |
| 大事件 | \`js/20-chain.js\` | \`_executeBigEvent()\` |
| 双模式编辑 | \`js/40-ui.js\` | \`btnVisualAdd\` / \`syncCodeFromVisual()\` |
| 设置面板 | \`js/40-ui.js\` | \`appSettings\` / \`applyBorderWidth()\` |
| 据点尺寸 | \`js/45-node-editor.js\` | \`applyPointSize()\`（写 CSS 变量） |
| 节点编辑器 | \`js/45-node-editor.js\` | \`initNodeEditor()\` / \`neSyncToBlocks\` |
| 视频导出 | \`js/60-renderer.js\` | \`class CanvasRenderer\` / \`#btnExport\` 监听 |
| 模板导入导出 | \`js/60-renderer.js\` | \`getCurrentBlocks()\` / \`.deltaTemplate\` |
| 尺寸/字号样式 | \`css/15-stage.css\` | \`.stronghold\` / \`.text-elem\` |

`,'关键代码位置');

/* ---------------- 追加重构说明 ---------------- */
const tail = '*文档结束。祝新账号开发顺利。*';
if (s.includes(tail)) {
  s = s.replace(tail, `## 十二、v3.1.0 重构说明

### 为什么这么拆

原 \`index.html\` 6.6MB / 3722 行，其中 6.5MB 是字体和图片的 base64，真正代码只有约 60KB。
拆完：\`index.html\` 27KB、\`css/\` 共 10 个文件、\`js/\` 共 7 个文件。

### 为什么不改成 ES Module

Electron 用 \`file://\` 加载页面，\`<script type="module">\` 会被 CORS 拦。所以还是经典脚本，
按顺序加载、共享同一全局作用域 —— 和原来单文件里的行为完全一致。

### 素材为什么还留在 base64 里

\`css/00-fonts.css\` 和 \`js/00-assets.js\` 里仍是 base64。原因是 \`file://\` 下外部图片
会让 canvas 变 tainted，导出视频可能出问题。实测（\`node tools/split.js --assets=file\`）
当前 Electron 版本下外置文件也能用、canvas 没被污染，但为了零风险，默认仍走内嵌。
想切换成外置：\`node tools/split.js --assets=file\`，然后重跑自测和 \`export-test.js\`。

### 拆分是怎么保证没改坏逻辑的

\`tools/split.js\` 只按行区间搬移内容，\`tools/verify.js\` 会逐段和原始文件比对（只允许素材引用方式变化）。
原始单文件备份在 \`..\\_refactor_backup\\index.v3.0.0.original.html\`。

### 改代码的顺序建议

1. 改 \`js/\` 或 \`css/\` 里对应文件
2. \`node tools/verify.js\`（只在你动过拆分结构时需要）
3. \`node tools/probe.js\` 两套测试全绿
4. \`node tools/build-portable.js\`
5. 压 zip，整包替换后测试

${tail}`);
  applied.push('追加重构说明');
}

fs.writeFileSync(f, s, 'utf8');
console.log('已更新: ' + applied.join(' / '));
console.log('原大小', orig.length, '→ 新大小', s.length);
