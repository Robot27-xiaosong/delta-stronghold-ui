/* 20-chain.js — EventChainManager 事件链调度 */
/* ============================================================
   EventChainManager 事件链管理器
   ============================================================ */
class EventChainManager {
  constructor() {
    this.points = {};           // id -> StrongholdPoint
    this.activePointId = null;
    this.isRunning = false;
    this._stopRequested = false;
    this._bigEventCount = 0;
    this._stopSignalResolve = null;
    this._runToken = 0;          // 每轮运行的令牌，停止/重跑后让旧循环立即失效
  }

  /* ---------- 据点管理 ---------- */
  createPoint(name, pointType = 'normal') {
    if (Object.keys(this.points).length >= 6) {
      log('❌ 最多只能创建 6 个据点，请先删除多余据点', 'err');
      return null;
    }
    const id = uid();
    const pt = new StrongholdPoint(id, name, pointType);
    this.points[id] = pt;
    const typeLabel = pointType === 'satellite' ? '附属据点' : '普通据点';
    log(`✓ 新建${typeLabel} [${name}] ID=${id}`, 'ok');
    this.renderPointList();
    return id;
  }

  removePoint(id) {
    if (this.points[id]) {
      this.points[id].destroy();
      delete this.points[id];
      if (this.activePointId === id) this.activePointId = null;
      this.renderPointList();
    }
  }

  setActive(id) {
    this.activePointId = id;
    Object.values(this.points).forEach(p => {
      p.element.classList.toggle('running', p.id === id && this.isRunning);
    });
    this.renderPointList();
    // 附属据点不能加/跑大事件，切据点时同步下拉
    if (typeof syncBigEventAvailability === 'function') syncBigEventAvailability();
  }

  renderPointList() {
    const list = $('#pointList');
    list.innerHTML = '';
    Object.values(this.points).forEach(p => {
      const item = document.createElement('div');
      item.className = 'point-item' + (p.id === this.activePointId ? ' active' : '');
      // 从中立据点往上占的过程中，外框已经是阵营色，但据点名还是白的，列表里标一下
      const baseLabel = { green: 'GTI', red: 'HAVVK', none: '中立', white: '大事件', convoy: '护送' }[p.borderState] || '-';
      const stateLabel = p._advancingNeutral ? baseLabel + ' 占领中' : baseLabel;
      const typeBadge = p.pointType === 'satellite' ? '<span class="ptype-badge satellite">附属</span>' : '';
      item.innerHTML = `
        <span class="pname">${p.name}${typeBadge}</span>
        <span style="display:flex;align-items:center;gap:6px;">
          <span class="pstate ${p.borderState === 'none' ? 'none' : p.borderState}">${stateLabel}</span>
          <button class="btn small danger point-del-btn" data-id="${p.id}" style="padding:1px 7px;line-height:1;">×</button>
        </span>
      `;
      item.addEventListener('click', () => this.setActive(p.id));
      item.querySelector('.point-del-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.isRunning && this.activePointId === p.id) {
          log('❌ 该据点正在运行事件链，无法删除', 'err');
          return;
        }
        this.removePoint(p.id);
      });
      list.appendChild(item);
    });
  }

  /* ---------- 事件链预处理：合并 interrupt 到前一个事件 ---------- */
  preprocess(blocks) {
    const result = [];
    for (const b of blocks) {
      if (b.type === 'interrupt') {
        if (result.length === 0) {
          return { error: '[E101] interrupt 不能作为链首，必须依附前一个动画事件' };
        }
        const prev = result[result.length - 1];
        if (!['greenAdvance','redAdvance','greenRetreat','redRetreat'].includes(prev.type)) {
          return { error: `[E102] interrupt 只能依附动画事件(advance/retreat)，当前前一个是 ${prev.type}` };
        }
        prev.interruptAt = b.triggerAt;
      } else {
        result.push({ ...b });
      }
    }
    return { blocks: result };
  }

  /* ---------- 合法性校验 ---------- */
  validate(blocks, pointType) {
    if (!blocks || blocks.length === 0) return '[E001] 事件链为空';

    // 链首校验
    const first = blocks[0];
    if (!['greenState','redState','neutralState'].includes(first.type)) {
      return `[E002] 链首必须是 greenState / redState / neutralState，当前为 ${first.type}`;
    }

    let state = first.type === 'greenState' ? 'green' : (first.type === 'redState' ? 'red' : 'none');
    let bigEventCount = 0;

    for (let i = 1; i < blocks.length; i++) {
      const b = blocks[i];
      switch (b.type) {
        case 'greenState':
        case 'redState':
        case 'neutralState':
          return `[E003] ${b.type} 仅允许作为链首，不能出现在第 ${i+1} 位`;

        case 'greenAdvance':
          if (state === 'red') return `[E004] greenAdvance 不能在 red 状态执行（需先 redRetreat 清空边框），当前状态=${state}`;
          state = 'green';
          break;
        case 'redAdvance':
          if (state === 'green') return `[E005] redAdvance 不能在 green 状态执行（需先 greenRetreat 清空边框），当前状态=${state}`;
          state = 'red';
          break;
        case 'greenRetreat':
          if (state !== 'green') return `[E006] greenRetreat 仅允许在 green 状态执行，当前状态=${state}`;
          state = b.interruptAt != null ? 'green' : 'none';
          break;
        case 'redRetreat':
          if (state !== 'red') return `[E007] redRetreat 仅允许在 red 状态执行，当前状态=${state}`;
          state = b.interruptAt != null ? 'red' : 'none';
          break;

        case 'standby':
          // 不改变状态
          break;

        case 'bigEvent':
          // 附属据点没有文字元素（改名/倒塌/护送都无意义），设计上只跑边框类事件
          if (pointType === 'satellite') return '[E014] 附属据点不支持大事件，请把大事件放到普通据点上';
          bigEventCount++;
          if (bigEventCount > 1) return '[E008] 单条事件链最多允许 1 个大事件';
          if (![1,2,3,4].includes(b.variant)) return `[E009] bigEvent variant 必须是 1|2|3|4，当前=${b.variant}`;
          if (b.variant === 3) {
            if (!b.oldName || !b.newName) return '[E010] bigEvent 变种3必须提供 oldName 和 newName';
            if (typeof b.collapseDelay !== 'number' || isNaN(b.collapseDelay) || b.collapseDelay < 0)
              return '[E011] bigEvent 变种3必须提供 collapseDelay(倒塌延时秒数，0 = 闭合后立刻替换)';
          }
          if (b.variant === 4) {
            if (typeof b.totalSeconds !== 'number' || b.totalSeconds <= 0) return '[E012] bigEvent 变种4必须提供 totalSeconds(初始时间秒数，如270表示4分30秒)';
            // 检查点 / 失败位置只在「新版大事件4」下才有意义（旧版固定 3 个等分检查点、匀速）
            if (isNewBig4()) {
              if (!Array.isArray(b.checkpoints) || !b.checkpoints.length) return '[E015] 变种4的检查点列表不能为空（至少要有撤离点）';
            }
            const p4 = buildEscortPlan(b);
            if (p4.issues && p4.issues.length) return '[E015] ' + p4.issues[0];
            if (isNewBig4() && Array.isArray(b.checkpoints)) {
              if (b.failMode === 'checkpoint' && (b.failValue < 1 || b.failValue > b.checkpoints.length))
                return '[E016] 失败检查点序号超出范围（1~' + b.checkpoints.length + '）';
              if (b.failMode === 'route' && (b.failValue <= 0 || b.failValue >= 100))
                return '[E016] 途中失败进度必须在 1~99 之间（百分数）';
            }
          }
          // 大事件结束后刷新状态
          if (b.variant === 1) state = 'none';
          else if (b.variant === 2) state = 'green';
          else if (b.variant === 3) state = 'red';
          else if (b.variant === 4) state = 'green';
          break;

        default:
          return `[E013] 未知事件类型: ${b.type}`;
      }
    }
    return null; // 校验通过
  }

  /* ---------- 运行事件链 ---------- */
  async runEventChain(targetPointId, blocks) {
    if (this.isRunning) {
      log('❌ [E210] 已有事件链正在运行，请先停止', 'err');
      return;
    }
    const point = this.points[targetPointId];
    if (!point) { log(`❌ 目标据点 ${targetPointId} 不存在`, 'err'); return; }

    // 预处理
    const pp = this.preprocess(blocks);
    if (pp.error) { log('❌ 预处理失败: ' + pp.error, 'err'); return; }
    const processed = pp.blocks;

    // 校验
    const err = this.validate(processed, point.pointType);
    if (err) { log('❌ 校验失败: ' + err, 'err'); return; }

    this.isRunning = true;
    this._stopRequested = false;
    this.activePointId = targetPointId;
    const runToken = ++this._runToken;
    point.element.classList.add('running');
    log(`▶ 开始在据点 [${point.name}] 上运行事件链 (${processed.length} 个积木)`, 'info');

    // 停止信号：stop()时resolve，让Promise.race立即跳出
    const stopSignal = new Promise(r => { this._stopSignalResolve = r; });

    for (let i = 0; i < processed.length; i++) {
      if (this._stopRequested || runToken !== this._runToken) break;
      const b = processed[i];
      log(`  [${i+1}/${processed.length}] ${b.type}${b.duration?` (${b.duration}s)`:''}${b.interruptAt?` [中断@${b.interruptAt}s]`:''}`, 'info');
      await Promise.race([this._executeBlock(point, b), stopSignal]);
    }

    // 已经被新一轮运行接管（或已被 stop 清场）时，不要回头改状态
    if (runToken !== this._runToken) return;

    const wasStopped = this._stopRequested;
    // 正常跑完时不清定时器：占领脉冲还在闪，清了会把闪光掐掉
    this._cleanupPoints(point, wasStopped);
    this.isRunning = false;
    this._stopRequested = false;
    this._stopSignalResolve = null;
    this.renderPointList();
    log(wasStopped ? '⏹ 事件链已停止' : '✅ 事件链执行完毕', wasStopped ? 'warn' : 'ok');
  }

  /**
   * 收尾：恢复护送UI、按边框状态重置文字、去掉运行高亮
   * @param {object} activePoint 当前据点
   * @param {boolean} hard true=强制停止，连脉冲/闪烁定时器一起清；false=正常结束，保留脉冲
   */
  _cleanupPoints(activePoint, hard) {
    Object.values(this.points).forEach(p => {
      if (p._savedHTML) p.restorePointUI();
      if (hard) p._clearTimers();
      p.element.style.display = '';
      p.element.classList.remove('running');
      p.resetText(hard);
    });
    if (activePoint) activePoint.element.classList.remove('running');
  }

  stop() {
    // 没在跑但据点还在报警闪烁时，停止键也当成「复位」用
    const blinking = Object.values(this.points).some(p => p.textMode === 'alert' || p.textMode === 'bigEvent');
    if (!this.isRunning && !blinking) return;
    const wasRunning = this.isRunning;
    this._runToken++;              // 让正在跑的循环立刻失效，避免它退出时把新状态覆盖掉
    this._stopRequested = true;
    this.isRunning = false;
    this._cleanupPoints(this.points[this.activePointId], true);
    if (this._stopSignalResolve) { this._stopSignalResolve(); this._stopSignalResolve = null; }
    this.renderPointList();
    log(wasRunning ? '⏹ 已强制停止，清理所有定时器，恢复据点显示' : '⏹ 已复位，清掉残留的警报闪烁', 'warn');
  }

  /* ---------- 执行单个积木 ---------- */
  _executeBlock(point, b) {
    return new Promise((resolve) => {
      if (this._stopRequested) { resolve(); return; }

      switch (b.type) {
        /* ---- 状态设置（链首） ---- */
        case 'greenState':
          point.setFullBorder('green');
          point.setNameText(point.name, 'gti');
          log('    → 设置完整 GTI 绿色据点', 'ok');
          this.renderPointList();
          resolve();
          break;

        case 'redState':
          point.setFullBorder('red');
          point.setNameText(point.name, 'havvk');
          log('    → 设置完整 HAVVK 红色据点', 'ok');
          this.renderPointList();
          resolve();
          break;

        case 'neutralState':
          point.clearBorder();
          point.setNameText(point.name, 'neutral');
          log('    → 设置中立据点（无边框，白色文字）', 'info');
          this.renderPointList();
          resolve();
          break;

        /* ---- 绿色后退（伴随警报闪烁） ---- */
        case 'greenRetreat': {
          // 中立据点被占到一半又退回来：名称还是白的，也不该报警（据点本来就没丢）
          const keepWhiteG = !!point._advancingNeutral;
          point._setBorderColor('green');
          point._showBorder();
          // 只要据点不是中立（边框还有进度）就开始警报闪烁，别只认满边框
          if (!keepWhiteG && point._borderProgress > 0.01) point.startAlertBlink();
          point.animateBorder('retreat', b.duration, (interrupted) => {
            if (!interrupted) {
              point.stopAlertBlink();
              point._hideBorder();
              point.borderState = 'none';
              point._advancingNeutral = false;
              point.setNameText(point.name, 'neutral');
              log(keepWhiteG
                ? '    → 中立占领被放弃，边框消退，回到白色中立据点'
                : '    → 绿色边框完全消退，警报停止，文字纯白，状态=none', 'ok');
            } else {
              if (keepWhiteG) point.setTextColor('neutral');
              log(keepWhiteG
                ? '    → 中立占领中途停下，名称仍是白色，据点还是中立'
                : '    → 绿色后退被中断，保留部分边框，警报继续闪烁', 'warn');
            }
            this.renderPointList();
            resolve();
          }, b.interruptAt);
          break;
        }

        /* ---- 红色后退 ---- */
        case 'redRetreat': {
          const keepWhiteR = !!point._advancingNeutral;
          point._setBorderColor('red');
          point._showBorder();
          point.animateBorder('retreat', b.duration, (interrupted) => {
            if (!interrupted) {
              point._hideBorder();
              point.borderState = 'none';
              point._advancingNeutral = false;
              point.setNameText(point.name, 'neutral');
              log(keepWhiteR
                ? '    → 中立占领被放弃，边框消退，回到白色中立据点'
                : '    → 红色边框完全消退，文字纯白，状态=none', 'ok');
            } else {
              point.setNameText(point.name, keepWhiteR ? 'neutral' : 'havvk');
              log(keepWhiteR
                ? '    → 中立占领中途停下，名称仍是白色，据点还是中立'
                : '    → 红色后退被中断，保留部分边框', 'warn');
            }
            this.renderPointList();
            resolve();
          }, b.interruptAt);
          break;
        }

        /* ---- 绿色推进 ---- */
        case 'greenAdvance': {
          point.stopAlertBlink();
          // 从中立据点开始占领：外框照常是绿色走进度，但名称保持白色，占满才变绿
          const startWhiteG = point.borderState === 'none';
          point._advancingNeutral = startWhiteG;
          point._setBorderColor('green');
          point._showBorder();
          point.borderState = 'green';
          point.setTextColor(startWhiteG ? 'neutral' : 'gti');
          point.animateBorder('advance', b.duration, (interrupted) => {
            if (!interrupted) {
              if (startWhiteG) {
                point._advancingNeutral = false;
                point.setTextColor('gti');
                log('    → 中立据点被完全占领，名称文字变为 GTI 绿', 'ok');
              } else {
                log('    → 绿色边框闭合，触发绿光脉冲', 'ok');
              }
              point.pulse('green', () => {});
            } else {
              log('    → 绿色推进被中断，保留部分边框，名称保持' + (startWhiteG ? '白色（仍未占领）' : '绿色'), 'warn');
            }
            this.renderPointList();
            resolve();
          }, b.interruptAt);
          break;
        }

        /* ---- 红色推进 ---- */
        case 'redAdvance': {
          point.stopAlertBlink();
          const startWhiteR = point.borderState === 'none';
          point._advancingNeutral = startWhiteR;
          point._setBorderColor('red');
          point._showBorder();
          point.borderState = 'red';
          point.setTextColor(startWhiteR ? 'neutral' : 'havvk');
          point.animateBorder('advance', b.duration, (interrupted) => {
            if (!interrupted) {
              if (startWhiteR) {
                point._advancingNeutral = false;
                point.setTextColor('havvk');
                log('    → 中立据点被完全占领，名称文字变为 HAVVK 红', 'ok');
              } else {
                log('    → 红色边框闭合，触发红光脉冲', 'ok');
              }
              point.pulse('red', () => {});
            } else {
              log('    → 红色推进被中断，保留部分边框，名称保持' + (startWhiteR ? '白色（仍未占领）' : '红色'), 'warn');
            }
            this.renderPointList();
            resolve();
          }, b.interruptAt);
          break;
        }

        /* ---- 对峙等待 ---- */
        case 'standby':
          log(`    → 对峙等待 ${b.duration}s`, 'info');
          point._addTimer(resolve, b.duration * 1000);
          break;

        /* ---- 大事件 ---- */
        case 'bigEvent':
          this._executeBigEvent(point, b, resolve);
          break;

        default:
          resolve();
      }
    });
  }

  /* ---------- 大事件执行 ---------- */
  _executeBigEvent(point, b, resolve) {
    log(`    💥 大事件变种${b.variant} 触发`, 'warn');

    // 变种4：护送车队（独立UI，不走白色边框逻辑）
    if (b.variant === 4) {
      // 素材已是透明底PNG：不再强制紫底；导出背景由导出面板决定（透明 WebM / 紫幕 MP4）
      // 隐藏其他据点，只保留当前护送车队UI
      const otherPoints = Object.values(this.points).filter(p => p.id !== point.id);
      otherPoints.forEach(p => p.element.style.display = 'none');

      point.startConvoyMission(b, () => {
        const plan = buildEscortPlan(b);
        log(plan.failTime != null
          ? `    → 变种4结束：时间耗尽，护送失败（定格 ${plan.holdSeconds}s）`
          : '    → 变种4完成：护送车队到达撤离点', plan.failTime != null ? 'warn' : 'ok');
        // 恢复其他据点显示
        otherPoints.forEach(p => p.element.style.display = '');
        this.renderPointList();
        resolve();
      });
      return;
    }

    const oldName = b.oldName || point.name;

    // 第一阶段（所有变种共有）：清除原边框，白色边框顺时针包围，文字闪烁
    point.clearBorder();
    point.startBigEventBlink(oldName);
    point._setBorderColor('white');
    point._showBorder();
    point._setBorderProgress(0);
    point.borderState = 'white';

    const whiteDur = b.whiteDuration || 2.5;
    point.animateBorder('advance', whiteDur, () => {
      log('    → 白色边框闭合', 'info');
      // 白色边框闭合后
      if (b.variant === 1) {
        // 变种1：白色边框消失，切换中立，停止闪烁，显示名称纯白
        point._hideBorder();
        point.stopBigEventBlink();
        point.setNameText(oldName, 'neutral');
        point.borderState = 'none';
        log('    → 变种1完成：据点变为中立', 'ok');
        this.renderPointList();
        resolve();
      }
      else if (b.variant === 2) {
        // 变种2：白色边框消失，绿色边框顺时针生长，文字继续闪烁
        point._hideBorder();
        point._setBorderColor('green');
        point._showBorder();
        point._setBorderProgress(0);
        const greenDur = b.greenDuration || b.whiteDuration || 2.5;
        point.animateBorder('advance', greenDur, () => {
          point.stopBigEventBlink();
          point.setNameText(oldName, 'gti');
          point.borderState = 'green';
          log('    → 变种2完成：自动归属 GTI，触发绿光脉冲', 'ok');
          point.pulse('green', () => {});
          this.renderPointList();
          resolve();
        });
      }
      else if (b.variant === 3) {
        // 变种3：白色边框闭合后继续闪烁，等待倒塌延时（0 = 不等待，立刻替换）
        const cd = Math.max(0, Number(b.collapseDelay) || 0);
        log(cd > 0 ? `    → 等待倒塌延时 ${cd}s...` : '    → 倒塌延时 0s：闭合后直接替换', 'info');
        point._addTimer(() => {
          // 延时结束：直接切换完整红色边框，停止闪烁，文字替换为新名称，无脉冲
          point.stopBigEventBlink();
          point.setFullBorder('red');
          point.setNameText(b.newName, 'havvk');
          point.borderState = 'red';
          log(`    → 变种3完成：据点替换为 [${b.newName}] HAVVK 占领（无脉冲）`, 'ok');
          this.renderPointList();
          resolve();
        }, cd * 1000);
      }
    });
  }
}
