/* 10-stronghold.js — StrongholdPoint 据点实例 */
/* ============================================================
   StrongholdPoint 据点实例
   ============================================================ */
class StrongholdPoint {
  constructor(id, name, pointType = 'normal') {
    this.id = id;
    this.name = name;
    this.pointType = pointType;    // 'normal' | 'satellite'（附属据点）
    this.displayName = name;       // 当前显示的名称（大事件变种3会替换）
    this.borderState = 'none';     // 'green' | 'red' | 'none' | 'white'
    this.textColor = 'neutral';    // 'gti' | 'havvk' | 'neutral'
    this.textMode = 'name';        // 'name' | 'alert' | 'bigEvent'
    this._advancingNeutral = false; // true = 正从中立据点往上占，边框/文字都还是白的

    // 动画控制
    this._rafId = null;
    this._borderTimer = null;   // 边框动画的中断定时器
    this._timers = [];          // 其他定时器（文字闪烁、等待、脉冲等）
    this._borderProgress = 0;   // 0~1, 当前边框显示进度
    this._perimeter = 0;

    this._buildDOM();
  }

  /** 附属据点图标：官方高清图抠出的位图，CSS mask 上色（window.SATELLITE_ICON_PNG） */
  static satelliteIconMarkup() {
    return `<div class="satellite-icon" data-color="neutral"></div>`;
  }

  _buildDOM() {
    const el = document.createElement('div');
    el.className = 'stronghold' + (this.pointType === 'satellite' ? ' satellite-point' : '');
    el.dataset.id = this.id;

    // 附属据点显示图标（矢量），普通据点显示文字
    const centerContent = this.pointType === 'satellite'
      ? StrongholdPoint.satelliteIconMarkup()
      : `<span class="text-elem name text-neutral">${this.name}</span>`;

    el.innerHTML = `
      <div class="stronghold-bg"></div>
      <svg class="border-svg" viewBox="0 0 220 220">
        <path class="border-path hidden" d="M 110 10 L 210 10 L 210 210 L 10 210 L 10 10 L 110 10"/>
      </svg>
      <div class="text-layer">
        ${centerContent}
      </div>
    `;
    this.element = el;
    this.svgPath = el.querySelector('.border-path');
    this.textLayer = el.querySelector('.text-layer');
    this.textElem = el.querySelector('.text-elem');
    this.satelliteIcon = el.querySelector('.satellite-icon');

    // 计算周长
    requestAnimationFrame(() => {
      this._perimeter = this.svgPath.getTotalLength();
      this.svgPath.style.strokeDasharray = this._perimeter;
      this.svgPath.style.strokeDashoffset = this._perimeter;
    });

    $('#pointsContainer').appendChild(el);
  }

  /* ---------- 边框基础控制 ---------- */
  _setBorderColor(color) {
    this.svgPath.classList.remove('green', 'red', 'white');
    if (color) this.svgPath.classList.add(color);
    // 切换颜色时清除脉冲残留的内联辉光，避免白色推进时透出绿/红光
    this.svgPath.style.filter = '';
  }

  _setBorderProgress(p) {
    // p=0 空, p=1 满
    this._borderProgress = Math.max(0, Math.min(1, p));
    this.svgPath.style.strokeDashoffset = this._perimeter * (1 - this._borderProgress);
  }

  _showBorder() { this.svgPath.classList.remove('hidden'); }
  _hideBorder() { this.svgPath.classList.add('hidden'); }

  /** 立即设置完整边框 */
  setFullBorder(color) {
    this._clearTimers();
    this._setBorderColor(color);
    this._showBorder();
    this._setBorderProgress(1);
    this.borderState = color;
  }

  /** 立即清除边框 */
  clearBorder() {
    this._clearTimers();
    this._hideBorder();
    this._setBorderProgress(0);
    this.svgPath.style.filter = '';
    this.borderState = 'none';
    this._advancingNeutral = false;
  }

  /* ---------- 文字控制 ---------- */
  _setText(text, className, sizeClass) {
    // 如果已有元素且类型相同，直接更新内容和class（支持CSS transition）
    if (this.textElem && this.textElem.classList.contains(sizeClass)) {
      this.textElem.textContent = text;
      this.textElem.className = `text-elem ${sizeClass} ${className}`;
      return;
    }
    this.textLayer.innerHTML = '';
    const span = document.createElement('span');
    span.className = `text-elem ${sizeClass} ${className}`;
    span.textContent = text;
    this.textLayer.appendChild(span);
    this.textElem = span;
  }

  setNameText(name, colorClass) {
    this.displayName = name;
    this.textColor = colorClass;
    if (this.pointType === 'satellite') {
      // 附属据点：更新图标颜色
      this._setSatelliteColor(colorClass);
    } else {
      this._setText(name, 'text-' + colorClass, 'name');
    }
  }

  setTextColor(colorClass) {
    this.textColor = colorClass;
    if (this.pointType === 'satellite') {
      this._setSatelliteColor(colorClass);
    } else {
      this.textElem.className = `text-elem name text-${colorClass}`;
    }
  }

  /** 设置附属据点图标颜色（颜色本身由 CSS 变量控制，这里只换 data-color） */
  _setSatelliteColor(colorClass) {
    if (!this.satelliteIcon) return;
    const c = (colorClass === 'gti' || colorClass === 'havvk') ? colorClass : 'neutral';
    this.satelliteIcon.dataset.color = c;
  }

  /** 附属据点没有文字，「!」「×」用这个覆盖层显示 */
  _ensureMark(sizeClass, colorClass) {
    const cls = `text-elem satellite-mark ${sizeClass} text-${colorClass}`;
    if (!this._mark || !this._mark.isConnected) {
      this._mark = document.createElement('span');
      this.textLayer.appendChild(this._mark);
    }
    this._mark.className = cls;
    return this._mark;
  }
  _removeMark() {
    if (this._mark) { this._mark.remove(); this._mark = null; }
  }

  /* ---------- 定时器管理 ---------- */
  _addTimer(fn, ms) {
    // 触发后自动从列表里摘掉，避免报警闪烁长时间运行把 _timers 撑大
    const t = setTimeout(() => {
      this._timers = this._timers.filter(x => x !== t);
      fn();
    }, ms);
    this._timers.push(t);
    return t;
  }
  _clearTimers() {
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this._borderTimer) { clearTimeout(this._borderTimer); this._borderTimer = null; }
    // 闪烁是靠定时器驱动的，定时器一清就必须退出闪烁模式，否则文字会卡在「!」或半透明
    if (this.textMode === 'alert' || this.textMode === 'bigEvent') this.textMode = 'name';
  }
  /** 仅取消边框动画相关，不影响文字闪烁等其他定时器 */
  _cancelBorderAnim() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this._borderTimer) { clearTimeout(this._borderTimer); this._borderTimer = null; }
  }

  /* ---------- 边框动画（核心） ---------- */
  /**
   * 播放边框动画
   * @param {'advance'|'retreat'} direction
   * @param {number} duration 秒
   * @param {Function} onDone 完成回调
   * @param {number} interruptAt 中断秒数（可选）
   */
  animateBorder(direction, duration, onDone, interruptAt = null) {
    this._cancelBorderAnim();
    const startProgress = this._borderProgress;
    const targetProgress = direction === 'advance' ? 1 : 0;
    const startTime = performance.now();

    const step = (now) => {
      const elapsed = (now - startTime) / 1000;
      let t = Math.min(elapsed / duration, 1);
      const current = startProgress + (targetProgress - startProgress) * t;
      this._setBorderProgress(current);

      if (t >= 1) {
        this._rafId = null;
        if (this._borderTimer) { clearTimeout(this._borderTimer); this._borderTimer = null; }
        if (onDone) onDone(false);
        return;
      }
      this._rafId = requestAnimationFrame(step);
    };
    this._rafId = requestAnimationFrame(step);

    // 中断处理
    if (interruptAt !== null && interruptAt > 0) {
      this._borderTimer = setTimeout(() => {
        if (this._rafId) {
          cancelAnimationFrame(this._rafId);
          this._rafId = null;
          this._borderTimer = null;
          // 按真实经过时间补算一次进度：窗口被遮挡/系统暂停合成时 rAF 不推进，
          // 直接用上一帧的值会把进度算少（看起来像「中断后边框没了」）
          const elapsed = (performance.now() - startTime) / 1000;
          const t = Math.min(elapsed / duration, 1);
          this._setBorderProgress(startProgress + (targetProgress - startProgress) * t);
          log(`  ⏸ 动画在 ${interruptAt}s 被中断，保留边框进度 ${(this._borderProgress*100).toFixed(0)}%`, 'warn');
          if (onDone) onDone(true);
        }
      }, interruptAt * 1000);
    }
  }

  /* ---------- 脉冲闪光 ---------- */
  pulse(color, onDone) {
    const path = this.svgPath;
    const baseFilter = getComputedStyle(path).filter;
    const intensities = [1, 0.55, 0.3025, 0.1664, 0.0915];
    const glowColor = color === 'green' ? '64,255,112' : '255,80,80';
    const strokeColor = color === 'green' ? 'var(--gti-glow)' : 'var(--havvk-glow)';
    let i = 0;

    const flash = () => {
      if (i >= intensities.length) {
        path.style.filter = '';
        if (onDone) onDone();
        return;
      }
      const k = intensities[i];
      path.style.filter = `drop-shadow(0 0 ${1+2*k}px ${strokeColor}) drop-shadow(0 0 ${3+6*k}px rgba(${glowColor},${0.85*k})) drop-shadow(0 0 ${7+14*k}px rgba(${glowColor},${0.45*k}))`;
      this._addTimer(() => {
        path.style.filter = '';
        i++;
        this._addTimer(flash, 50);
      }, 50);
    };
    flash();
  }

  /* ---------- 警报闪烁（丢失场景） ---------- */
  /**
   * 淡入/淡出：先设初始值并强制一次样式计算，再改成目标值。
   * 直接 rAF 改 opacity 对「刚创建的元素」不生效（浏览器把那次变化当成初始样式，不会过渡），
   * 所以之前只有第一次循环能淡入淡出，后面都是硬切。
   */
  _fadeTo(el, from, to, dur = 0.5, guardMode) {
    if (!el || !el.isConnected) return;
    if (guardMode && this.textMode !== guardMode) return;
    el.style.transition = 'none';
    el.style.opacity = String(from);
    void el.offsetWidth;               // 强制样式落地，过渡才有起点
    // 强制重排期间模式可能已经切走（比如被中断），再确认一次
    if (guardMode && this.textMode !== guardMode) return;
    el.style.transition = `opacity ${dur}s ease-in-out`;
    el.style.opacity = String(to);
  }

  startAlertBlink() {
    this.textMode = 'alert';

    // 附属据点：图标 ↔ 感叹号 闪烁
    if (this.pointType === 'satellite') {
      const cycleSatellite = () => {
        if (this.textMode !== 'alert') return;
        // 前0.5s: 图标渐隐 100% → 0
        this._fadeTo(this.satelliteIcon, 1, 0, 0.5, 'alert');

        this._addTimer(() => {
          if (this.textMode !== 'alert') return;
          // 后0.5s: 感叹号渐显 0 → 100%
          const mark = this._ensureMark('alert', 'gti');
          mark.textContent = '!';
          this._fadeTo(mark, 0, 1, 0.5, 'alert');
          this._addTimer(() => {
            if (this.textMode !== 'alert') return;
            this._removeMark();
            if (this.satelliteIcon) this.satelliteIcon.style.opacity = '1';
            cycleSatellite();
          }, 500);
        }, 500);
      };
      cycleSatellite();
      return;
    }

    // 普通据点：名称 ↔ 感叹号 闪烁
    const cycle = () => {
      if (this.textMode !== 'alert') return;
      // 前0.5s: 据点名称渐隐 100% → 30%
      this._setText(this.displayName, 'text-gti', 'name');
      this._fadeTo(this.textElem, 1, 0.3, 0.5, 'alert');

      this._addTimer(() => {
        if (this.textMode !== 'alert') return;
        // 后0.5s: 感叹号渐显 0 → 100%
        this._setText('!', 'text-gti', 'alert');
        this._fadeTo(this.textElem, 0, 1, 0.5, 'alert');
        this._addTimer(cycle, 500);
      }, 500);
    };
    cycle();
  }

  /** 立刻恢复不透明：先关过渡再改 opacity，否则会从 0.3 慢慢淡回来（看起来像变暗） */
  _restoreOpacity(el, modeGuard) {
    if (!el) return;
    el.style.transition = 'none';
    el.style.opacity = '1';
    requestAnimationFrame(() => {
      if (el.style.opacity === '1' && this.textMode === (modeGuard || 'name')) el.style.transition = '';
    });
  }

  stopAlertBlink() {
    this.textMode = 'name';

    // 附属据点：移除感叹号，恢复图标
    if (this.pointType === 'satellite') {
      this._removeMark();
      if (this.satelliteIcon) {
        this.satelliteIcon.style.opacity = '1';
        this._restoreOpacity(this.satelliteIcon);
      }
      return;
    }

    this._setText(this.displayName, 'text-' + this.textColor, 'name');
    this._restoreOpacity(this.textElem);
  }

  /* ---------- 收尾：按边框状态还原文字 ---------- */
  /** 停止/执行完毕时调用，避免残留感叹号、×、半透明文字或错色文字 */
  resetText(force) {
    // 正在报警（名称↔感叹号）且边框还没退完：继续闪，直到下一次推进或清空
    // 只有「强制停止」才强制收掉（force=true），否则定时器被清掉后会卡在某一帧
    if (!force && this.textMode === 'alert' && this._borderProgress > 0.01) return;
    // 边框有进度就说明这个据点是阵营色，文字跟着阵营走；空边框才是白字
    // 例外：中立据点被占到一半（_advancingNeutral）——外框已经是阵营色，但名字还没被占领，保持白
    const started = this._borderProgress > 0.01 && !this._advancingNeutral;
    const colorClass = started ? ({ green: 'gti', red: 'havvk' }[this.borderState] || 'neutral') : 'neutral';
    this.textMode = 'name';
    this.textColor = colorClass;

    if (this.pointType === 'satellite') {
      // 附属据点：更新图标颜色
      this._setSatelliteColor(colorClass);
      // 清除残留的感叹号/×
      this._removeMark();
      if (this.satelliteIcon) {
        this.satelliteIcon.style.opacity = '1';
        this._restoreOpacity(this.satelliteIcon);
      }
    } else {
      this._setText(this.displayName || this.name, 'text-' + colorClass, 'name');
      this._restoreOpacity(this.textElem);
    }
  }

  /* ---------- 大事件文字闪烁（名称 ↔ ×） ---------- */
  startBigEventBlink(oldName) {
    this.textMode = 'bigEvent';

    // 附属据点：图标 ↔ × 闪烁（不能用 _setText，会把图标清掉）
    if (this.pointType === 'satellite') {
      this._setSatelliteColor('neutral');
      const cycleSatellite = () => {
        if (this.textMode !== 'bigEvent') return;
        this._fadeTo(this.satelliteIcon, 1, 0, 0.5, 'bigEvent');
        this._addTimer(() => {
          if (this.textMode !== 'bigEvent') return;
          const mark = this._ensureMark('destroy', 'neutral');
          mark.textContent = '';        // 叉号是图（CSS mask），不留字符
          this._fadeTo(mark, 0, 1, 0.5, 'bigEvent');
          this._addTimer(() => {
            if (this.textMode !== 'bigEvent') return;
            this._removeMark();
            if (this.satelliteIcon) this.satelliteIcon.style.opacity = '1';
            cycleSatellite();
          }, 500);
        }, 500);
      };
      cycleSatellite();
      return;
    }

    const cycle = () => {
      if (this.textMode !== 'bigEvent') return;
      // 前0.5s: 原名称白色渐隐 100% → 0
      this._setText(oldName, 'text-neutral', 'name');
      this._fadeTo(this.textElem, 1, 0, 0.5, 'bigEvent');

      this._addTimer(() => {
        if (this.textMode !== 'bigEvent') return;
        // 后0.5s: 放大叉号渐显 0 → 100%（叉号是图，不是字符 ×）
        this._setText('', 'text-neutral', 'destroy');
        this._fadeTo(this.textElem, 0, 1, 0.5, 'bigEvent');
        this._addTimer(cycle, 500);
      }, 500);
    };
    cycle();
  }

  stopBigEventBlink() {
    this.textMode = 'name';
    if (this.pointType === 'satellite') {
      this._removeMark();
      if (this.satelliteIcon) { this.satelliteIcon.style.opacity = '1'; this._restoreOpacity(this.satelliteIcon); }
      return;
    }
    this._restoreOpacity(this.textElem);
  }

  /* ---------- 大事件4：护送车队 ----------
     参数全部来自事件本身，时间轴由 buildEscortPlan() 算好（页面与导出共用）：
       totalSeconds / checkpoints[{remain,bonus}] / tankStates[{at,state}]
       failMode(none|checkpoint|route) / failValue / holdSeconds / warningAt
     —— 坦克只填「走到哪个检查点时剩多少秒」，所以一定在指定时间到撤离点；
        状态图标只影响段内位移分布（修理停住、箭头加速），段末自动追平 */
  startConvoyMission(block, onDone) {
    const plan = buildEscortPlan(block || {});
    if (plan.issues && plan.issues.length) plan.issues.forEach(msg => log('⚠ ' + msg, 'warn'));
    if (plan.warnings && plan.warnings.length) plan.warnings.forEach(msg => log('💡 ' + msg, 'info'));
    if (plan.legacy) log('ℹ 大事件4 正在按【旧版】运行（设置 → 实验性功能 可切到新版）', 'info');
    // 坦克状态和检查点时间对不上时，把冲突和改法都打出来
    if (!plan.legacy) checkEscortConflicts(block || {}).forEach(c => {
      log('⚠ ' + c.text, 'warn');
      log('   → 怎么改：' + c.fix, 'info');
    });

    this._clearTimers();
    this._savedHTML = this.element.innerHTML;
    this.textMode = 'convoy';
    this.borderState = 'convoy';
    // 护送 UI 是白图标：白底看不见，自动切到紫底（结束后恢复原背景）
    this._convoySavedChroma = document.body.classList.contains('chroma-key');
    if (!this._convoySavedChroma) document.body.classList.add('chroma-key');

    const flagSrc = window.CONVOY_FLAG_SRC || '';
    const tankSrc = window.CONVOY_TANK_SRC || '';
    const stSrcs = window.CONVOY_ST_SRCS || {};
    const fmt = (sec) => {
      const v = Math.max(0, Math.ceil(sec - 1e-6));
      return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
    };
    const cpDots = plan.checkpoints
      .map(cp => `<div class="convoy-checkpoint" style="left:${cp.toFixed(3)}%"></div>`).join('');

    this.element.innerHTML = `
      <div class="convoy-panel">
        <div class="convoy-progress-wrap">
          <div class="convoy-track"></div>
          <div class="convoy-fill"></div>
          ${cpDots}
          <div class="convoy-flag-img"></div>
          <div class="convoy-tank-wrap">
            <div class="convoy-st-img"></div>
            <div class="convoy-tank-img"></div>
          </div>
        </div>
        <div class="convoy-timer">${fmt(plan.remainAt(0))}</div>
        <div class="convoy-label">${plan.label}</div>
      </div>
    `;

    const fill = this.element.querySelector('.convoy-fill');
    const wrap = this.element.querySelector('.convoy-tank-wrap');
    const stImg = this.element.querySelector('.convoy-st-img');
    const flag = this.element.querySelector('.convoy-flag-img');
    const tankImg = this.element.querySelector('.convoy-tank-img');
    const timer = this.element.querySelector('.convoy-timer');

    /* 坦克/棋子是白色剪影，用 mask + 背景色上色（导出那边用 source-in 染同一色） */
    const art = CONVOY_ART;
    const layer = (el, src, color, h, ratio) => {
      if (!src) return;
      el.style.width = (h * ratio).toFixed(2) + 'px';
      el.style.height = h + 'px';
      el.style.background = color;
      const u = `url("${src}")`;
      el.style.webkitMaskImage = u; el.style.maskImage = u;
    };
    layer(tankImg, tankSrc, plan.colors.tank, art.tankH, art.tankRatio);
    layer(flag, flagSrc, plan.colors.flag, art.flagH, art.flagRatio);
    wrap.style.top = `calc(50% + ${art.tankGap}px)`;       // 坦克往下沉一点
    // 状态图标也是白色剪影，染成和坦克一样的颜色（宽度靠 aspect-ratio 由高度推）
    stImg.style.height = art.stH + 'px';
    stImg.style.background = plan.colors.tank;
    stImg.style.left = `calc(100% + ${art.stGap}px)`;       // 状态图标在坦克前方（右侧＝行进方向）
    stImg.style.right = 'auto';
    const stRatio = {};                                     // state → 宽高比（素材是 data URL，解码很快）
    Object.keys(stSrcs).forEach(k => {
      const im = new Image();
      im.onload = () => { stRatio[k] = im.naturalWidth / im.naturalHeight; };
      im.src = stSrcs[k];
    });
    const showState = (state) => {
      const src = stSrcs[state];
      if (!src) return;
      if (stImg.dataset.state !== state) {
        const u = `url("${src}")`;
        stImg.style.webkitMaskImage = u; stImg.style.maskImage = u;
        stImg.dataset.state = state;
      }
      // 素材解码完成后才拿得到真实宽高比，补一次就够
      const r = stRatio[state];
      if (r && stImg.dataset.ratio !== String(r)) {
        stImg.style.aspectRatio = String(r);
        stImg.dataset.ratio = String(r);
      }
    };
    // 棋子不是居中摆的：让旗杆底部正好压在检查点圆点上
    const flagW = art.flagH * art.flagRatio;
    flag.style.transform = `translateX(${(-art.flagPole * flagW).toFixed(2)}px)`;
    flag.style.bottom = `calc(50% - ${(art.flagPad * art.flagH).toFixed(2)}px)`;

    const startTime = performance.now();
    const step = (now) => {
      if (this.textMode !== 'convoy') return;
      const elapsed = (now - startTime) / 1000;
      const t = Math.min(elapsed, plan.endTime);   // 失败定格期间画面停在归零那一刻
      const pos = plan.positionAt(t);
      const remain = plan.remainAt(t);
      const state = plan.stateAt(t);

      fill.style.width = pos.toFixed(3) + '%';
      wrap.style.left = pos.toFixed(3) + '%';
      // 状态图标在坦克前方（右侧＝行进方向），none 时隐藏
      if (state === 'none' || !stSrcs[state]) {
        stImg.style.display = 'none';
      } else {
        stImg.style.display = 'block';   // 不能写 ''：CSS 里默认就是 none
        showState(state);
        // 快到终点时图标会顶出面板右边，按面板右边缘钳回来（只推必要的几像素）
        const barBox = fill.parentElement;
        const boxW = barBox.clientWidth;
        const tankW = wrap.offsetWidth || 0;
        const iconW = stImg.offsetWidth || 0;
        const roomL = barBox.offsetLeft || 0;                                  // 进度条左端到面板左边
        const roomR = (barBox.parentElement.clientWidth || 480) - roomL - boxW; // 右端到面板右边
        const wantRight = pos / 100 * boxW + tankW / 2 + art.stGap + iconW;    // 图标右沿（相对进度条左端）
        const over = wantRight - (boxW + roomR);
        stImg.style.transform = `translate(${(over > 0 ? -over : 0).toFixed(1)}px, -50%)`;
      }
      const passed = plan.passedCount(t);
      flag.style.left = plan.checkpoints[Math.min(passed, plan.checkpoints.length - 1)].toFixed(3) + '%';
      timer.textContent = fmt(remain);
      timer.style.color = (plan.failTime != null && t >= plan.endTime - 1e-6) || remain <= plan.warningAt
        ? '#ff5050' : '#ffffff';

      if (elapsed >= plan.duration) {
        this._rafId = null;
        this.restorePointUI();
        if (onDone) onDone();
        return;
      }
      this._rafId = requestAnimationFrame(step);
    };
    this._rafId = requestAnimationFrame(step);
  }

  /* ---------- 恢复据点UI（护送车队结束/停止时调用） ---------- */
  restorePointUI() {
    if (!this._savedHTML) return;
    this.element.innerHTML = this._savedHTML;
    this._savedHTML = null;
    // 恢复护送前的录屏背景
    if (!this._convoySavedChroma) document.body.classList.remove('chroma-key');
    this._convoySavedChroma = false;
    this.svgPath = this.element.querySelector('.border-path');
    this.textLayer = this.element.querySelector('.text-layer');
    this.textElem = this.element.querySelector('.text-elem');
    // 附属据点的图标是重建出来的，引用必须重新取，否则后面改颜色全部打在旧节点上
    this.satelliteIcon = this.element.querySelector('.satellite-icon');
    this._mark = null;
    if (this.pointType === 'satellite') {
      this.textColor = 'neutral';
      this._setSatelliteColor('neutral');
    }
    this.textMode = 'name';
    this.borderState = 'none';
    this._advancingNeutral = false;
    this._borderProgress = 0;
    this._rafId = null;
    requestAnimationFrame(() => {
      if (this.svgPath) {
        this._perimeter = this.svgPath.getTotalLength();
        this.svgPath.style.strokeDasharray = this._perimeter;
        this.svgPath.style.strokeDashoffset = this._perimeter;
      }
    });
  }

  /* ---------- 销毁 ---------- */
  destroy() {
    this._clearTimers();
    this.element.remove();
  }
}
