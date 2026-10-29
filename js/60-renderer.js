/* 60-renderer.js — Canvas 视频导出渲染器 + 模板导入导出 + 启动 */
/* ============================================================
   Canvas视频导出渲染器
   ============================================================ */
class CanvasRenderer {
  constructor(canvas, pointName, drawGrayBg, pointType = 'normal', opaqueBg = false) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width; this.H = canvas.height;
    this.name = pointName;
    this.pointType = pointType;    // 'normal' | 'satellite'
    this.drawGrayBg = drawGrayBg !== false;
    // MP4 没有透明通道：整张画布不铺满就会留一圈黑边，所以不透明导出时铺满底色
    this.opaqueBg = !!opaqueBg;
    this.bgFill = '#33353c';
    this.bgAlpha = 1;            // 灰色方块的透明度（跟设置里的「灰块透明度」同一个值）
    this.baseColor = '#000000';  // 灰块下面垫的底色：MP4 不透明导出铺纯黑（见 startExport）
    // 画面就是据点本身：不留外圈留白（以前 pad=28，导出的视频四周会空出一圈）
    // borderPad 取线宽的一半，让边框外沿正好压在画面边缘上
    this.pad = 0;
    this.boxSize = this.W - this.pad * 2;
    this.borderPad = 9;
    this.borderBoxSize = this.W - this.borderPad * 2;
    this.perimeter = this.borderBoxSize * 4;
    this.borderState = 'none';
    this.borderColor = '#40ff70';
    this.borderProgress = 0;
    this._advancingNeutral = false;   // true = 从中立据点往上占，名称还是白的
    this.textColor = '#fff';
    this.displayText = pointName;
    this.textSize = this.boxSize * 0.5;
    this.textOpacity = 1;
    this.textMode = 'name';
    this.modeStartTime = 0;
    this.pulseActive = false;
    this.pulseStartTime = 0;
    this.running = true;
    // 护送车队素材：旗子 + 坦克 + 坦克前方的状态小图标
    this.flagImg = new Image();
    if (window.CONVOY_FLAG_SRC) this.flagImg.src = window.CONVOY_FLAG_SRC;
    this.tankImg = new Image();
    if (window.CONVOY_TANK_SRC) this.tankImg.src = window.CONVOY_TANK_SRC;
    this.stImgs = {};
    const stSrcs = window.CONVOY_ST_SRCS || {};
    Object.keys(stSrcs).forEach(k => {
      const im = new Image();
      im.src = stSrcs[k];
      this.stImgs[k] = im;
    });
    // 护送导出背景：'transparent' = 透明(WebM) / 'purple' = 纯紫幕(#990066，MP4，和页面录屏一致) / 'blue' = 备用蓝幕
    this.convoyBg = 'transparent';
  }
  colorFor(s) { return { green:'#40ff70', red:'#ff5050', white:'#ffffff' }[s] || '#fff'; }

  /** 把白色剪影素材染成指定颜色（离屏 source-in，等价页面的 CSS mask），按 名字+颜色 缓存 */
  _tint(img, color, key) {
    this._tintCache = this._tintCache || {};
    const ck = key + '|' + color;
    const hit = this._tintCache[ck];
    if (hit) return hit;
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tx = c.getContext('2d');
    tx.drawImage(img, 0, 0, w, h);
    tx.globalCompositeOperation = 'source-in';
    tx.fillStyle = color;
    tx.fillRect(0, 0, w, h);
    this._tintCache[ck] = c;
    return c;
  }
  /** #rrggbb + 透明度 → rgba() */
  _rgba(hex, a) {
    const h = String(hex).replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
  }
  getPulseIntensity(now) {
    if (!this.pulseActive) return 0;
    const e = (now - this.pulseStartTime) / 1000;
    if (e >= 0.5) { this.pulseActive = false; return 0; }
    const idx = Math.floor(e / 0.1);
    const on = (e % 0.1) < 0.05;
    if (!on) return 0;
    return [1, 0.55, 0.3025, 0.1664, 0.0915][Math.min(idx, 4)];
  }
  triggerPulse(color) { this.pulseActive = true; this.pulseStartTime = performance.now(); }
  updateTextMode(now) {
    if (this.textMode === 'alert') {
      const p = ((now - this.modeStartTime) / 1000) % 1;
      if (p < 0.5) { this.displayText = this.name; this.textColor = '#40ff70'; this.textOpacity = 1 - p * 1.4; }
      else { this.displayText = '!'; this.textColor = '#40ff70'; this.textOpacity = (p - 0.5) * 2; }
    } else if (this.textMode === 'bigEvent') {
      const p = ((now - this.modeStartTime) / 1000) % 1;
      if (p < 0.5) { this.displayText = this.name; this.textColor = '#fff'; this.textOpacity = 1 - p * 2; }
      else { this.displayText = '\u00d7'; this.textColor = '#fff'; this.textOpacity = (p - 0.5) * 2; }
    }
  }
  renderFrame(now) {
    const ctx = this.ctx;
    const pk = this.getPulseIntensity(now);
    this.updateTextMode(now);
    ctx.clearRect(0, 0, this.W, this.H);
    // MP4 没有 alpha：先铺满一层底色（现在是纯黑，见 baseColor），
    // 灰块的半透明就合成到这层黑上 —— 别铺就留黑边，铺页面背景色则会露出白/紫
    if (this.opaqueBg) {
      ctx.fillStyle = this.baseColor;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    // 灰色方块。
    // MP4 没有 alpha：半透明度没有意义，合成到任何底色上都会"露馅"
    // ——叠白/紫就会「露出背景」，叠黑又会让灰块整体变暗；
    // 所以 MP4 一律按 100% 不透明画，#33353c 就是页面上看到的那个灰。
    // 只有 WebM（真透明通道）才输出半透明。
    if (this.drawGrayBg) {
      const keepAlpha = !this.opaqueBg && this.bgAlpha < 0.999;
      ctx.fillStyle = keepAlpha ? this._rgba(this.bgFill, this.bgAlpha) : this.bgFill;
      ctx.fillRect(this.pad, this.pad, this.boxSize, this.boxSize);
    }
    // 边框
    if (this.borderState !== 'none' && this.borderProgress > 0) {
      ctx.save();
      ctx.strokeStyle = this.borderColor;
      // 边框贴着画面边缘，脉冲的光晕外侧没有空间了：
      // 所以闪烁靠「框变粗 + 更强的内发光」表现，别把光圈调小
      ctx.lineWidth = 18 + 6 * pk;
      ctx.lineJoin = 'miter';
      if (pk > 0) { ctx.shadowColor = this.borderColor; ctx.shadowBlur = 8 + 42 * pk; }
      const cx = this.borderPad + this.borderBoxSize / 2;
      ctx.beginPath();
      ctx.moveTo(cx, this.borderPad);
      ctx.lineTo(this.borderPad + this.borderBoxSize, this.borderPad);
      ctx.lineTo(this.borderPad + this.borderBoxSize, this.borderPad + this.borderBoxSize);
      ctx.lineTo(this.borderPad, this.borderPad + this.borderBoxSize);
      ctx.lineTo(this.borderPad, this.borderPad);
      ctx.lineTo(cx, this.borderPad);
      ctx.setLineDash([this.perimeter]);
      ctx.lineDashOffset = this.perimeter * (1 - this.borderProgress);
      ctx.stroke();
      ctx.restore();
    }
    // 中心内容（文字或附属据点图标）
    if (this.textOpacity > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.textOpacity;
      if (pk > 0) { ctx.shadowColor = this.textColor; ctx.shadowBlur = 3 + 12 * pk; }

      if (this.pointType === 'satellite') {
        // 附属据点：闪烁时画「!」/「×」，其余时间画图标
        const mark = (this.displayText === '!' || this.displayText === '\u00d7') ? this.displayText : null;
        this._drawSatelliteIcon(ctx, this.W / 2, this.H / 2, this.textColor, mark);
      } else {
        // 普通据点：绘制文字
        ctx.fillStyle = this.textColor;
        if (this.displayText === '\u00d7') {
          // 大事件叉号是位图剪影，不是字符
          this._drawBigEventX(ctx, this.W / 2, this.H / 2, this.boxSize * 0.46, this.textColor);
        } else {
          let sz = this.textSize;
          if (this.displayText === '!') sz = this.boxSize * 0.5;
          ctx.font = `bold ${sz}px TacticalBold, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(this.displayText, this.W / 2, this.H / 2);
        }
      }
      ctx.restore();
    }
  }
  animBorder(color, direction, duration, interruptAt) {
    return new Promise(resolve => {
      this.borderState = color;
      this.borderColor = this.colorFor(color);
      const sp = this.borderProgress;
      const target = direction === 'advance' ? 1 : 0;
      const t0 = performance.now();
      const step = (now) => {
        if (!this.running) { resolve(); return; }
        const e = (now - t0) / 1000;
        const t = Math.min(e / duration, 1);
        this.borderProgress = sp + (target - sp) * t;
        this.renderFrame(now);
        if (interruptAt && e >= interruptAt) { resolve(); return; }
        if (t >= 1) { resolve(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  wait(duration) {
    return new Promise(resolve => {
      const t0 = performance.now();
      const step = (now) => {
        if (!this.running) { resolve(); return; }
        this.renderFrame(now);
        if ((now - t0) / 1000 >= duration) { resolve(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  setFullBorder(color) {
    this.borderState = color;
    this.borderColor = this.colorFor(color);
    this.borderProgress = 1;
    this.textColor = this.colorFor(color);
    this.displayText = this.name;
    this.textMode = 'name';
    this.textOpacity = 1;
  }

  /* ---------- 护送车队渲染（变种4）
     背景由 this.convoyBg 决定：
       'transparent' 透明（WebM alpha）/ 'purple' 紫幕 #990066（MP4，和页面录屏一致）/ 'blue' 蓝幕（备用） */
  /** 绘制护送车队画面（时间和位置都来自 buildEscortPlan，页面与导出同一套算法） */
  renderConvoyFrame(plan, t) {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);
    if (this.convoyBg === 'blue') {
      ctx.fillStyle = '#0000FF';
      ctx.fillRect(0, 0, W, H);
    } else if (this.convoyBg === 'purple') {
      ctx.fillStyle = '#990066';
      ctx.fillRect(0, 0, W, H);
    }
    // transparent：什么都不铺，clearRect 后就是透明

    const pos = plan.positionAt(t);
    const remaining = plan.remainAt(t);
    const isFail = plan.failTime != null && t >= plan.endTime - 1e-6;
    const timerColor = (isFail || remaining <= plan.warningAt) ? '#ff5050' : '#ffffff';

    // 设计尺寸 480x220，按高度等比缩放居中
    const DW = 480, DH = 220;
    const scale = H / DH;
    const ox = (W - DW * scale) / 2;
    ctx.save();
    ctx.translate(ox, 0);
    ctx.scale(scale, scale);

    // 左右各留 56：坦克半宽 + 状态图标都塞得下，起点和终点不会被裁
    const barX = 56, barY = 74.5, barW = 368, barH = 5, radius = 2;
    const barCY = barY + barH / 2;    // 进度条中线：坦克/棋子都从这里算纵向位置

    // 轨道
    ctx.fillStyle = 'rgba(80,25,25,0.7)';
    this._roundRect(ctx, barX, barY, barW, barH, radius);
    ctx.fill();
    // 已走部分
    if (barW * pos / 100 > 0) {
      ctx.fillStyle = '#40ff70';
      this._roundRect(ctx, barX, barY, Math.max(barH, barW * pos / 100), barH, radius);
      ctx.fill();
    }
    // 检查点（数量/位置由参数决定）
    plan.checkpoints.forEach(cp => {
      ctx.beginPath();
      ctx.arc(barX + barW * cp / 100, barCY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5050';
      ctx.fill();
    });

    // 旗子：坦克每过一个检查点，旗子前移到下一个（旗杆底部压在检查点圆点上，画在圆点之后＝压在点上面）
    const passed = plan.passedCount(t);
    const flagP = plan.checkpoints[Math.min(passed, plan.checkpoints.length - 1)];
    const flagX = barX + barW * flagP / 100;
    const flagH = CONVOY_ART.flagH;
    if (this.flagImg.complete && this.flagImg.naturalWidth > 0) {
      const flagW = flagH * CONVOY_ART.flagRatio;
      const dy = flagH * CONVOY_ART.flagPad;         // 原图底部有透明边，补偿掉
      const tinted = this._tint(this.flagImg, plan.colors.flag, 'flag');
      ctx.drawImage(tinted, flagX - flagW * CONVOY_ART.flagPole, barCY - flagH + dy, flagW, flagH);
    }

    // 坦克 + 前方状态图标
    const tankX = barX + barW * pos / 100;
    const tankH = CONVOY_ART.tankH;
    const tankY = barCY + CONVOY_ART.tankGap;
    const tank = this.tankImg;
    let tankW = 0;
    if (tank && tank.complete && tank.naturalWidth > 0) {
      tankW = tankH * CONVOY_ART.tankRatio;
      ctx.drawImage(this._tint(tank, plan.colors.tank, 'tank'), tankX - tankW / 2, tankY, tankW, tankH);
    }
    const stKey = plan.stateAt(t);
    const st = stKey !== 'none' ? this.stImgs[stKey] : null;
    if (st && st.complete && st.naturalWidth > 0) {
      const iconH = CONVOY_ART.stH;
      const iconW = iconH * (st.naturalWidth / st.naturalHeight);
      // 状态图标跟坦克同色（白色剪影用 source-in 染色），位置在坦克右侧＝行进方向
      const stTint = this._tint(st, plan.colors.tank, 'st-' + stKey);
      const iconX = Math.min(DW - 2 - iconW, tankX + tankW / 2 + CONVOY_ART.stGap);
      ctx.drawImage(stTint, iconX, tankY + (tankH - iconH) / 2, iconW, iconH);
    }

    // 倒计时
    const secsTotal = Math.max(0, Math.ceil(remaining - 1e-6));
    const mins = Math.floor(secsTotal / 60);
    const secs = secsTotal % 60;
    ctx.fillStyle = timerColor;
    ctx.font = "26px 'TacticalMedium', Consolas, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    try { ctx.letterSpacing = '2px'; } catch (e) {}
    ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, 240, 123);

    ctx.fillStyle = '#ffffff';
    ctx.font = "28px 'TacticalMedium', Consolas, sans-serif";
    try { ctx.letterSpacing = '4px'; } catch (e) {}
    ctx.fillText(plan.label || '护送车队', 240, 155);
    try { ctx.letterSpacing = '0px'; } catch (e) {}

    ctx.restore();
  }

  /** 大事件「据点被摧毁」叉号：白色剪影图，source-in 染成当前文字色
      叉号故意压扁一点（和 CSS 的 252/230 对齐），所以传独立的宽高，别按原图比例算 */
  _drawBigEventX(ctx, cx, cy, w, color) {
    const img = window.BIGEVENT_X_IMG;
    const h = w * (230 / 252);
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(this._tint(img, color, 'xmark'), cx - w / 2, cy - h / 2, w, h);
      return;
    }
    // 兜底：图还没解码完就先画字符，至少不是空白
    ctx.fillStyle = color;
    ctx.font = `bold ${h * 1.6}px TacticalBold, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u00d7', cx, cy);
  }

  /** 绘制附属据点图标 */
  /** 绘制附属据点图标：mark 传 '!' 或 '×' 时画闪烁符号，否则画矢量图标 */
  _drawSatelliteIcon(ctx, cx, cy, color, mark = null) {
    if (mark) {
      // 叉号是图（same as 普通据点），感叹号还是字符
      if (mark === '\u00d7') {
        this._drawBigEventX(ctx, cx, cy, this.boxSize * 0.46, color);
        return;
      }
      ctx.fillStyle = color;
      ctx.font = `bold ${this.boxSize * 0.5}px TacticalBold, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mark, cx, cy);
      return;
    }

    const iconSize = this.boxSize * 0.55;
    const img = window.SATELLITE_ICON_IMG;

    // 位图图标：和页面共用 window.SATELLITE_ICON_PNG，
    // 用离屏 canvas 的 source-in 把白色图标染成阵营色（等价页面的 CSS mask）
    if (img && img.complete && img.naturalWidth) {
      const N = img.naturalWidth;
      if (!this._satTint || this._satTint.width !== N) {
        this._satTint = document.createElement('canvas');
        this._satTint.width = N;
        this._satTint.height = N;
      }
      const tc = this._satTint, tx = tc.getContext('2d');
      tx.globalCompositeOperation = 'source-over';
      tx.clearRect(0, 0, N, N);
      tx.drawImage(img, 0, 0, N, N);
      tx.globalCompositeOperation = 'source-in';
      tx.fillStyle = color;
      tx.fillRect(0, 0, N, N);
      tx.globalCompositeOperation = 'source-over';
      ctx.drawImage(tc, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
      return;
    }

    // 极端兜底：图片还没解码好时画个方块，至少不是空白
    ctx.fillStyle = color;
    ctx.fillRect(cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
  }

  // 圆角矩形辅助
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  runConvoy(block) {
    this._convoyMode = true;
    const plan = buildEscortPlan(block || {});
    return new Promise(resolve => {
      const t0 = performance.now();
      const step = (now) => {
        if (!this.running) { resolve(); return; }
        const elapsed = (now - t0) / 1000;
        // 失败时画面定格在归零那一刻，等 holdSeconds 走完再结束
        this.renderConvoyFrame(plan, Math.min(elapsed, plan.endTime));
        if (elapsed >= plan.duration) { resolve(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  async runBigEvent(b) {
    if (b.variant === 4) {
      await this.runConvoy(b);
      return;
    }
    this.borderState = 'none'; this.borderProgress = 0;
    this.textMode = 'bigEvent'; this.modeStartTime = performance.now();
    const wd = b.whiteDuration || 2.5;
    await this.animBorder('white', 'advance', wd);
    if (b.variant === 1) {
      this.borderState = 'none'; this.borderProgress = 0;
      this.textMode = 'name'; this.displayText = this.name; this.textColor = '#fff'; this.textOpacity = 1;
      this.renderFrame(performance.now());
    } else if (b.variant === 2) {
      this.borderProgress = 0;
      const gd = b.greenDuration || b.whiteDuration || 2.5;
      await this.animBorder('green', 'advance', gd);
      this.textMode = 'name'; this.displayText = this.name; this.textColor = '#40ff70'; this.textOpacity = 1;
      this.triggerPulse('green');
    } else if (b.variant === 3) {
      // 倒塌延时 0 = 不等待，闭合后立刻替换
      const cd = Math.max(0, Number(b.collapseDelay) || 0);
      if (cd > 0) await this.wait(cd);
      // 替换完成就停止闪烁（对齐页面的 stopBigEventBlink），否则成片里
      // 红色新名字会一直和新叉号来回闪，和页面预览对不上
      this.textMode = 'name';
      this.name = b.newName;
      this.displayText = b.newName;
      this.textColor = '#ff5050';
      this.textOpacity = 1;
      this.setFullBorder('red');
      this.renderFrame(performance.now());
    }
  }
  async runChain(blocks, onProgress) {
    this.running = true;
    let idx = 0;
    for (const b of blocks) {
      if (!this.running) break;
      if (onProgress) onProgress(idx, blocks.length, b.type);
      idx++;
      switch (b.type) {
        case 'greenState': this.setFullBorder('green'); this.renderFrame(performance.now()); break;
        case 'redState': this.setFullBorder('red'); this.renderFrame(performance.now()); break;
        case 'neutralState':
          this.borderState = 'none'; this.borderProgress = 0; this._advancingNeutral = false;
          this.textMode = 'name'; this.displayText = this.name; this.textColor = '#fff'; this.textOpacity = 1;
          this.renderFrame(performance.now());
          break;
        case 'greenAdvance': {
          // 从中立据点开始占领：外框照常绿色，只让名称保持白色，占满才变绿
          const nG = this.borderState === 'none';
          this._advancingNeutral = nG;
          this.borderState = 'green';
          this.borderColor = this.colorFor('green');
          this.textColor = this.colorFor(nG ? 'white' : 'green');
          this.displayText = this.name; this.textMode = 'name'; this.textOpacity = 1;
          await this.animBorder('green', 'advance', b.duration, b.interruptAt);
          if (!b.interruptAt) {
            if (nG) { this._advancingNeutral = false; this.textColor = this.colorFor('green'); }
            this.triggerPulse('green');
          }
          break;
        }
        case 'redAdvance': {
          const nR = this.borderState === 'none';
          this._advancingNeutral = nR;
          this.borderState = 'red';
          this.borderColor = this.colorFor('red');
          this.textColor = this.colorFor(nR ? 'white' : 'red');
          this.displayText = this.name; this.textMode = 'name'; this.textOpacity = 1;
          await this.animBorder('red', 'advance', b.duration, b.interruptAt);
          if (!b.interruptAt) {
            if (nR) { this._advancingNeutral = false; this.textColor = this.colorFor('red'); }
            this.triggerPulse('red');
          }
          break;
        }
        case 'greenRetreat': {
          // 中立据点占到一半又退回：名称保持白色，不闪警报
          const wG = !!this._advancingNeutral;
          if (!wG) { this.textMode = 'alert'; this.modeStartTime = performance.now(); }
          await this.animBorder('green', 'retreat', b.duration, b.interruptAt);
          if (this.borderProgress <= 0.01) {
            this.textMode = 'name'; this.textOpacity = 1; this.displayText = this.name; this.textColor = '#fff';
            this.borderState = 'none'; this.borderProgress = 0; this._advancingNeutral = false;
          } else if (wG) {
            this.textMode = 'name'; this.textColor = '#fff';
          }
          // 中断：保持 alert 模式继续闪烁
          break;
        }
        case 'redRetreat': {
          const wR = !!this._advancingNeutral;
          await this.animBorder('red', 'retreat', b.duration, b.interruptAt);
          this.textColor = '#fff';
          if (this.borderProgress <= 0.01) { this.borderState = 'none'; this.borderProgress = 0; this._advancingNeutral = false; }
          break;
        }
        case 'standby': await this.wait(b.duration); break;
        case 'bigEvent': await this.runBigEvent(b); break;
      }
    }
    if (!this._convoyMode) {
      // 后退被中断且在报警：收尾阶段继续闪，和页面上一致
      if (!(this.textMode === 'alert' && this.borderProgress > 0.01)) {
        this.textMode = 'name'; this.textOpacity = 1; this.displayText = this.name;
      }
      await this.wait(0.6);
    }
    this.running = false;
  }
}

// ============================================================
// 视频编码后端
//   MP4：WebCodecs(H.264 Baseline) + mp4-muxer → 标准 MP4（ftyp|moov|mdat，
//        moov 在前=faststart），PR/剪映/达芬奇/手机相册都能直接认
//        —— 不再用 MediaRecorder 的 MP4，那是碎片化 fMP4(moof)，部分软件读不了
//   WebM：MediaRecorder(VP9)，只有它支持 alpha 透明通道
// ============================================================
const MP4_CODEC_CANDIDATES = [
  'avc1.42E033',   // Baseline L5.1：大分辨率/高帧率也够用，硬解兼容性最好
  'avc1.42E01F',   // Baseline L3.1
  'avc1.42E01E',   // Baseline L3.0
  'avc1.4D402A',   // Main L4.2
  'avc1.64002A'    // High L4.2
];

async function pickMp4Codec(w, h, fps, bitrate) {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const codec of MP4_CODEC_CANDIDATES) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate, framerate: fps });
      if (s.supported) return codec;
    } catch (e) { /* 换下一个 */ }
  }
  return null;
}

/* 逐帧把 canvas 塞进 H.264 编码器，时间戳用真实经过时间，保证视频时长=播放时长 */
function createMp4Recorder(canvas, fps, bitrate, codec) {
  if (!window.Mp4Muxer || !window.Mp4Muxer.Muxer) throw new Error('mp4-muxer 未加载（js/05-vendor-mp4.js）');
  const W = canvas.width, H = canvas.height;
  const muxer = new window.Mp4Muxer.Muxer({
    target: new window.Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H },
    fastStart: 'in-memory',        // moov 放最前面，边下边播、剪辑软件秒读
    firstTimestampBehavior: 'offset'
  });
  let encError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encError = e; }
  });
  encoder.configure({ codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality' });

  const frameDur = Math.round(1e6 / fps);     // 微秒
  const t0 = performance.now();
  const keyEvery = Math.max(1, Math.round(fps * 2));   // 每 2 秒一个关键帧
  let rafId = 0, frames = 0, lastTs = -1, stopped = false, startTs = -1;

  const tick = () => {
    if (stopped) return;
    const ts = Math.round((performance.now() - t0) * 1000);
    // 采样间隔到了才取帧；编码器积压时宁可跳帧也不要越堆越多
    if (lastTs < 0 || (ts - lastTs >= frameDur * 0.9 && encoder.encodeQueueSize <= 8)) {
      try {
        if (startTs < 0) startTs = ts;
        const vf = new VideoFrame(canvas, { timestamp: ts, duration: frameDur });
        encoder.encode(vf, { keyFrame: frames % keyEvery === 0 });
        vf.close();
        lastTs = ts;
        frames++;
      } catch (e) { /* 单帧失败不影响整体 */ }
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    frames: () => frames,
    async stop() {
      stopped = true;
      cancelAnimationFrame(rafId);
      if (encError) throw encError;
      await encoder.flush();
      encoder.close();
      muxer.finalize();
      return {
        bytes: new Uint8Array(muxer.target.buffer),
        frames,
        durationUs: Math.max(0, lastTs - Math.max(0, startTs))
      };
    }
  };
}

/* 保存：桌面版走系统「另存为」，浏览器里退回下载 */
async function saveVideoBytes(bytes, defaultName) {
  const ext = defaultName.split('.').pop();
  if (window.electronAPI && window.electronAPI.saveMediaFile) {
    return await window.electronAPI.saveMediaFile(bytes, defaultName, ext);
  }
  const blob = new Blob([bytes], { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = defaultName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { canceled: false, path: defaultName, size: blob.size, browser: true };
}

// 导出视频按钮
$('#btnExport').addEventListener('click', async () => {
  if (!manager.activePointId) { log('❌ [E301] 请先选择目标据点', 'err'); return; }
  if (manager.isRunning) { log('❌ [E302] 事件链正在运行，请先停止', 'err'); return; }
  let blocks;
  const isNodeUIExp = document.body.classList.contains('new-ui');
  if (isNodeUIExp) {
    if (typeof neSyncToBlocks === 'function') neSyncToBlocks();
    const nodes = (typeof neGetNodes === 'function') ? neGetNodes() : [];
    if (!nodes || nodes.length === 0) { log('❌ [E303] 节点编辑器为空', 'err'); return; }
    blocks = JSON.parse(JSON.stringify(visualBlocks));
    log('📋 从节点编辑器读取 ' + blocks.length + ' 个事件: ' + blocks.map(b=>b.type).join(' → '), 'info');
  } else if (currentMode === 'code') {
    try { blocks = JSON.parse($('#chainEditor').value); }
    catch (e) { log('❌ [E304] JSON解析失败: ' + e.message, 'err'); return; }
  } else {
    if (visualBlocks.length === 0) { log('❌ [E305] 可视化列表为空', 'err'); return; }
    blocks = JSON.parse(JSON.stringify(visualBlocks));
  }
  const pp = manager.preprocess(blocks);
  if (pp.error) { log('❌ ' + pp.error, 'err'); return; }
  const processed = pp.blocks;
  const hasConvoy = processed.some(b => b.type === 'bigEvent' && b.variant === 4);
  if (hasConvoy && !window.CONVOY_FLAG_SRC) {
    log('❌ [E306] 护送图片素材未加载！请先在页面上运行一次护送车队（点运行按钮），再点导出。', 'err');
    return;
  }
  const err = manager.validate(processed);
  if (err) { log('❌ 校验失败: ' + err, 'err'); return; }
  log('🎬 准备导出视频，等待字体加载...', 'info');
  try { await document.fonts.ready; } catch (e) {}
  // 大事件叉号素材（base64 已内嵌，一般早就解码完，这里兜一下）
  const xImg = window.BIGEVENT_X_IMG;
  if (xImg && !xImg.complete) {
    await new Promise(res => {
      xImg.addEventListener('load', res, { once: true });
      xImg.addEventListener('error', res, { once: true });
      setTimeout(res, 1500);
    });
  }
  const canvas = $('#exportCanvas');
  // H.264 要求宽高都是偶数，护送模式算出来的宽度可能是奇数
  const even = n => (n % 2 === 0 ? n : n - 1);
  // 格式：mp4 = H.264（默认，兼容性最好）；webm = VP9，唯一能带透明通道的
  const exportFormat = appSettings.exportFormat === 'webm' ? 'webm' : 'mp4';
  if (hasConvoy) {
    canvas.height = even(appSettings.exportRes);
    canvas.width = even(Math.round(appSettings.exportRes * 960 / 440));
    log(`🎬 护送车队模式：${canvas.width}x${canvas.height}，${exportFormat === 'webm' ? '透明背景（WebM alpha）' : '纯紫幕 #990066（和页面录屏一致）'}`, 'info');
  } else {
    canvas.width = even(appSettings.exportRes);
    canvas.height = even(appSettings.exportRes);
  }
  let drawGrayBg = appSettings.exportGrayBg;
  if (exportFormat === 'mp4' && !drawGrayBg) {
    drawGrayBg = true;
    log('⚠ MP4 不支持透明通道（透明会变纯黑），已自动改为深灰背景；要透明请把格式切成 WebM', 'warn');
  }
  const activePoint = manager.points[manager.activePointId];
  const pointName = activePoint.name;
  const pointType = activePoint.pointType || 'normal';
  const renderer = new CanvasRenderer(canvas, pointName, drawGrayBg, pointType, exportFormat === 'mp4');
  // 护送导出背景：WebM = 透明 alpha；MP4 = 纯紫幕 #990066（和页面录屏/教程里的抠像色一致）
  if (hasConvoy) renderer.convoyBg = exportFormat === 'webm' ? 'transparent' : 'purple';
  // 灰块透明度跟设置同步。
  // ⚠ MP4 没有透明通道：半透明灰块合成到任何底色上都会"露馅"——
  //   合成白/紫就会「露出背景」，合成黑又会让灰块整体发暗。
  //   所以 MP4 导出一律按 100% 不透明画（#33353c 就是页面上那个灰），
  //   透明度只在 WebM（真有 alpha 通道）里生效。
  renderer.bgAlpha = Math.max(0, Math.min(1, Number(appSettings.bgAlpha ?? 82) / 100));
  if (renderer.opaqueBg) renderer.baseColor = '#000000';
  if (renderer.bgAlpha < 0.999) {
    log(`🎚 灰块透明度 ${Math.round(renderer.bgAlpha * 100)}%` + (exportFormat === 'mp4'
      ? '，MP4 没有透明通道，成片里灰块按 100% 不透明导出（要半透明请用 WebM）'
      : '，WebM 会保留透明通道'), 'info');
  }
  // 护送模式等待图片加载（图片失败也要放行，否则导出会一直卡住）
  if (hasConvoy) {
    const waitImg = (img, name) => new Promise(resolve => {
      if (img.complete && img.naturalWidth > 0) { resolve(); return; }
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      img.addEventListener('load', finish, { once: true });
      img.addEventListener('error', () => {
        log(`⚠ 护送素材 ${name} 加载失败，导出画面会缺这张图`, 'warn');
        finish();
      }, { once: true });
      setTimeout(finish, 3000);
    });
    const waits = [waitImg(renderer.flagImg, 'flag.png'), waitImg(renderer.tankImg, 'tank.png')];
    Object.keys(renderer.stImgs).forEach(k => waits.push(waitImg(renderer.stImgs[k], 'state-' + k + '.png')));
    await Promise.all(waits);
  }
  const fps = appSettings.exportFps;
  const bitrate = appSettings.exportBitrate;
  let stopRecording = null;
  let encoderLabel = '';

  if (exportFormat === 'mp4') {
    const codec = await pickMp4Codec(canvas.width, canvas.height, fps, bitrate);
    if (!codec) {
      log('❌ [E308] 本机不支持 MP4(H.264) 编码，请去设置里把格式切成 WebM', 'err');
      return;
    }
    const rec = createMp4Recorder(canvas, fps, bitrate, codec);
    stopRecording = rec.stop;
    encoderLabel = `MP4 · H.264（${codec}）`;
    log(`🎬 编码器：${encoderLabel}，${canvas.width}×${canvas.height} @ ${fps}fps`, 'info');
  } else {
    const stream = canvas.captureStream(fps);
    let recorder = null;
    const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const mt of mimeTypes) {
      try { recorder = new MediaRecorder(stream, { mimeType: mt, videoBitsPerSecond: bitrate }); break; }
      catch (e) { recorder = null; }
    }
    if (!recorder) { try { recorder = new MediaRecorder(stream); } catch (e) { log('❌ [E307] 浏览器不支持视频录制', 'err'); return; } }
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start();
    stopRecording = () => new Promise(resolve => {
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        resolve({ bytes, frames: 0, durationUs: 0 });
      };
      recorder.stop();
    });
    encoderLabel = 'WebM · VP9（带透明通道）';
    log(`🎬 编码器：${encoderLabel}，${canvas.width}×${canvas.height} @ ${fps}fps`, 'info');
  }
  // 导出进度弹窗控制
  const expOverlay = document.getElementById('exportOverlay');
  const expFloat = document.getElementById('exportFloat');
  const expBar = document.getElementById('exportBarFill');
  const expPct = document.getElementById('exportPercent');
  const expFloatText = document.getElementById('exportFloatText');
  const expStatus = document.getElementById('exportStatus');
  function setExportProgress(pct, status) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    if (expBar) expBar.style.width = p + '%';
    if (expPct) expPct.textContent = p + '%';
    if (expFloatText) expFloatText.textContent = p + '%';
    if (status && expStatus) expStatus.textContent = status;
  }
  function showExportPanel() { if (expOverlay) expOverlay.classList.add('show'); if (expFloat) expFloat.classList.remove('show'); }
  function hideExportPanel() { if (expOverlay) expOverlay.classList.remove('show'); if (expFloat) expFloat.classList.add('show'); }
  function closeExportAll() { if (expOverlay) expOverlay.classList.remove('show'); if (expFloat) expFloat.classList.remove('show'); }
  if (document.getElementById('exportMinimize')) document.getElementById('exportMinimize').onclick = hideExportPanel;
  if (expFloat) expFloat.onclick = showExportPanel;

  const expHint = document.getElementById('exportHint');
  if (expHint) expHint.textContent = '导出期间请勿关闭窗口，完成后会弹出保存位置';

  let lastSavedPath = '';

  /* 编码结束 → 保存 → 关面板 → 结果写日志 */
  async function finishExport(out) {
    const ext = exportFormat === 'mp4' ? 'mp4' : 'webm';
    const mb = (out.bytes.byteLength / 1024 / 1024).toFixed(2);
    const durSec = out.durationUs ? out.durationUs / 1e6 : 0;   // durationUs 是微秒
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const safeName = String(pointName).replace(/[\\/:*?"<>|]/g, '_');
    const defaultName = `据点_${safeName}_${stamp}.${ext}`;

    setExportProgress(100, '编码完成，请选择保存位置...');
    let saved;
    try {
      saved = await saveVideoBytes(out.bytes, defaultName);
    } catch (e) {
      log('❌ [E309] 保存失败：' + e.message, 'err');
      closeExportAll();
      return;
    }
    if (saved.canceled) {
      log('已取消保存。', 'warn');
      closeExportAll();
      return;
    }
    lastSavedPath = saved.path || '';

    // 面板 + 悬浮圆窗立刻收掉，否则那个 100% 会一直挂在屏幕上
    closeExportAll();

    const durTxt = durSec ? ` · 时长 ${durSec.toFixed(1)}s` : '';
    const resumeTxt = out.frames ? ` · ${out.frames} 帧` : '';
    log(`✅ 视频已导出：${encoderLabel}${durTxt}${resumeTxt} · ${mb} MB`, 'ok');
    if (out.frames && durSec > 0.5) {
      const realFps = out.frames / durSec;
      if (realFps < fps * 0.6) {
        log(`⚠ 实际采样 ${realFps.toFixed(0)}fps（设定 ${fps}fps）：本机编码跟不上，画面会略卡。降低分辨率/帧率或改用 MP4（比 WebM 快）可缓解`, 'warn');
      }
    }

    // 路径写日志，并给一个能直接打开目录的入口（面板已经关了）
    if (lastSavedPath) {
      log(`📁 ${lastSavedPath}`, 'ok');
      const box = document.getElementById('logBox');
      if (box && window.electronAPI && window.electronAPI.revealFile) {
        const line = document.createElement('div');
        line.className = 'log-line';
        const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        line.innerHTML = `<span class="log-time">[${time}]</span><span class="log-info">📂 打开所在文件夹</span>`;
        line.style.cursor = 'pointer';
        line.onclick = () => window.electronAPI.revealFile(lastSavedPath);
        box.appendChild(line);
        box.scrollTop = box.scrollHeight;
      }
    }
    log(hasConvoy
      ? (exportFormat === 'webm'
        ? 'WebM 带透明 alpha 通道，叠到任意画面上直接用'
        : '纯紫幕 #990066（和页面录屏同一个抠像色），导入剪辑软件用"色度键"吸紫色即可抠掉')
      : (exportFormat === 'mp4'
        ? 'MP4 为标准封装（faststart），PR / 剪映 / 达芬奇 / 手机相册都能直接导入'
        : 'WebM 带透明通道，适合需要叠在其它画面上的场景'), 'info');
  }

  log('⏺ 开始录制，播放动画中...', 'info');
  showExportPanel();
  setExportProgress(5, `正在录制（${exportFormat === 'mp4' ? 'MP4' : 'WebM'}）...`);
  await renderer.runChain(processed, (idx, total, type) => {
    const pct = 5 + (idx / total) * 90;
    setExportProgress(pct, `正在播放事件 ${idx+1}/${total}：${type}`);
  });
  setExportProgress(96, '正在写入视频文件...');
  await new Promise(r => setTimeout(r, 300));   // 让最后几帧动画落进画面
  let out;
  try {
    out = await stopRecording();
  } catch (e) {
    log('❌ [E310] 视频编码失败：' + (e && e.message ? e.message : e), 'err');
    closeExportAll();
    return;
  }
  await finishExport(out);
});

// ===== 事件模板导出/导入 =====
function getCurrentBlocks() {
  if (currentMode === 'code') {
    try { return JSON.parse($('#chainEditor').value); }
    catch (e) { return null; }
  } else {
    return visualBlocks.length > 0 ? JSON.parse(JSON.stringify(visualBlocks)) : null;
  }
}

function setCurrentBlocks(blocks) {
  visualBlocks = JSON.parse(JSON.stringify(blocks));
  if (currentMode === 'code') {
    $('#chainEditor').value = JSON.stringify(blocks, null, 2);
  } else {
    renderVisualList();
  }
  if (window.neSyncFromBlocks) window.neSyncFromBlocks();
}

$('#btnExportTpl').addEventListener('click', () => {
  const blocks = getCurrentBlocks();
  if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
    log('❌ [E401] 当前事件链为空，无法导出模板', 'err'); return;
  }
  const pp = manager.preprocess(blocks);
  if (pp.error) { log('❌ [E402] 事件链校验失败: ' + pp.error, 'err'); return; }
  const tpl = {
    version: '3.0.0',
    name: '事件链模板',
    createdAt: new Date().toISOString(),
    blocks: blocks
  };
  const blob = new Blob([JSON.stringify(tpl, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `template_${Date.now()}.deltaTemplate`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  log(`✅ 模板已导出，共 ${blocks.length} 个积木`, 'ok');
});

$('#btnImportTpl').addEventListener('click', () => {
  $('#fileImportTpl').click();
});

$('#fileImportTpl').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      const blocks = Array.isArray(data) ? data : (data.blocks || null);
      if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
        log('❌ [E403] 模板格式错误：未找到事件链数据', 'err'); return;
      }
      const pp = manager.preprocess(blocks);
      if (pp.error) { log('❌ [E404] 模板校验失败: ' + pp.error, 'err'); return; }
      setCurrentBlocks(blocks);
      log(`✅ 模板已导入，共 ${blocks.length} 个积木`, 'ok');
    } catch (err) {
      log('❌ [E405] 模板解析失败: ' + err.message, 'err');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// 初始化：默认创建两个据点
window.addEventListener('load', () => {
  // 应用默认背景设置
  if (appSettings.initBg === 'chroma') document.body.classList.add('chroma-key');
  updateBgButtons();
  const id1 = manager.createPoint('B1');
  const id2 = manager.createPoint('B2');
  manager.setActive(id1);
  // 默认给B1绿色，B2红色（静态展示）
  manager.points[id1].setFullBorder('green');
  manager.points[id1].setNameText('B1', 'gti');
  manager.points[id2].setFullBorder('red');
  manager.points[id2].setNameText('B2', 'havvk');
  manager.renderPointList();
  log('系统就绪。默认创建 B1(GTI) 和 B2(HAVVK) 两个据点。', 'ok');
  log('提示：选择目标据点 → 编辑事件链 → 点击运行。', 'info');

  // ===== Electron桌面版菜单适配 =====
  if (window.electronAPI && window.electronAPI.onMenuAction) {
    window.electronAPI.onMenuAction((channel) => {
      switch (channel) {
        case 'menu-export':
          const btnExp = document.getElementById('btnExport');
          if (btnExp) btnExp.click();
          break;
        case 'menu-bg-white':
          const btnW = document.getElementById('btnBgWhite');
          if (btnW) btnW.click();
          break;
        case 'menu-bg-chroma':
          const btnC = document.getElementById('btnBgChroma');
          if (btnC) btnC.click();
          break;
        case 'menu-tutorial':
          const btnT = document.getElementById('btnTutorial');
          if (btnT) btnT.click();
          break;
        case 'menu-about':
          // 菜单「关于」直接打开设置面板并滚到关于区（和界面里的入口一致）
          const btnS = document.getElementById('btnSettings');
          if (btnS) btnS.click();
          setTimeout(() => {
            const box = document.querySelector('.about-card');
            if (box) box.scrollIntoView({ block: 'center' });
          }, 140);
          break;
      }
    });
    log('Electron桌面版已就绪，菜单栏快捷键可用', 'ok');
  }
});



// 检查更新已移到 js/70-update.js（走 GitHub Release，不再跳蓝奏云）