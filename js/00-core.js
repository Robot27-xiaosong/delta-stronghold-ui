/* 00-core.js — 工具函数 */
/* ============================================================
   工具函数
   ============================================================ */
const $ = (sel) => document.querySelector(sel);
const uid = () => 'pt_' + Math.random().toString(36).slice(2, 9);

function log(msg, type = 'info') {
  const box = $('#logBox');
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-time">[${time}]</span><span class="log-${type}">${msg}</span>`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

/* ============================================================
   事件类型元数据：中文名 + 参数字段定义
   —— 节点版、可视化列表、参数编辑器都从这里取，避免各处硬编码导致
      某个变种（比如 bigEvent 变种3/4）漏掉必填字段
   ============================================================ */
const EVENT_VARIANT_NAMES = {
  1: '炸毁变中立',
  2: '自动归属 GTI',
  3: '替换敌方据点',
  4: '护送车队'
};

const EVENT_META = {
  greenState:   { label: '绿色据点（链首）', short: '绿色据点', params: [] },
  redState:     { label: '红色据点（链首）', short: '红色据点', params: [] },
  neutralState: { label: '中立据点（链首）', short: '中立据点', params: [] },

  greenAdvance: { label: '绿色推进（占领）', short: '绿色推进', params: [
    { key: 'duration', label: '推进时长(秒)', kind: 'number', def: 3, min: 0.1, step: 0.1 } ] },
  redAdvance:   { label: '红色推进（占领）', short: '红色推进', params: [
    { key: 'duration', label: '推进时长(秒)', kind: 'number', def: 3, min: 0.1, step: 0.1 } ] },
  greenRetreat: { label: '绿色后退（丢失）', short: '绿色后退', params: [
    { key: 'duration', label: '后退时长(秒)', kind: 'number', def: 3, min: 0.1, step: 0.1 } ] },
  redRetreat:   { label: '红色后退（丢失）', short: '红色后退', params: [
    { key: 'duration', label: '后退时长(秒)', kind: 'number', def: 3, min: 0.1, step: 0.1 } ] },
  standby:      { label: '对峙等待（不变色）', short: '对峙等待', params: [
    { key: 'duration', label: '等待时长(秒)', kind: 'number', def: 3, min: 0.1, step: 0.1 } ] },

  bigEvent: {
    label: '大事件',
    short: '大事件',
    params: [],
    // 每个变种需要哪些字段：切变种时自动补齐 / 清掉，避免出现「改了变种缺参数跑不了」
    variantParams: {
      1: [ { key: 'whiteDuration', label: '白色推进(秒)', kind: 'number', def: 2.5, min: 0.1, step: 0.1 } ],
      2: [
        { key: 'whiteDuration', label: '白色推进(秒)', kind: 'number', def: 2.5, min: 0.1, step: 0.1 },
        { key: 'greenDuration', label: '绿色推进(秒)', kind: 'number', def: 2.5, min: 0.1, step: 0.1 } ],
      3: [
        { key: 'whiteDuration', label: '白色推进(秒)', kind: 'number', def: 2.5, min: 0.1, step: 0.1 },
        { key: 'oldName',   label: '原名称',       kind: 'text', def: '尖塔', req: true },
        { key: 'newName',   label: '新名称',       kind: 'text', def: '废墟', req: true },
        { key: 'collapseDelay', label: '倒塌延时(秒)', kind: 'number', def: 2, min: 0, step: 0.1, req: true,
          hint: '白色边框闭合后等多久才替换成新名称。填 0 = 没有延时，闭合后立刻替换' } ],
      4: [
        { key: 'totalSeconds', label: '初始时间(秒)', kind: 'int', def: 270, min: 1, step: 1, req: true },
        { key: 'warningAt',    label: '变红倒计时(秒)', kind: 'int', def: 10, min: 0, step: 1 },
        /* 阵营决定坦克/棋子的颜色：GTI 绿坦克红棋子，HAVVK（敌方车队 / 阻击车队）反过来 */
        { key: 'faction', label: '阵营', kind: 'select', def: 'gti', options: [
          { v: 'gti',   t: 'GTI（坦克绿 · 棋子红）' },
          { v: 'havvk', t: 'HAVVK / 敌方车队（坦克红 · 棋子绿）' } ] },
        { key: 'label', label: '名称', kind: 'text', def: '护送车队' },
        /* 只填「走到这个检查点时还剩多少秒 / 到点加多少秒」，路径和时长全部推导出来，
           这样「一定在指定时间到撤离点」是算出来的，不受坦克状态影响 */
        { key: 'checkpoints',  label: '检查点', kind: 'list', req: true,
          hint: '每行：走到该点时剩几秒 / 到点加几秒。最后一行是撤离点（不加时）。撤离点填 0 ＝ 掐着 0 秒到达（卡点成功，不算失败）；要让车队中途耗尽，用下面的「失败位置」',
          cols: [
            { key: 'remain', label: '到时剩余', kind: 'int', def: 60, min: 0, step: 1, unit: 's' },
            { key: 'bonus',  label: '到时加时', kind: 'int', def: 45, min: 0, step: 1, unit: 's' }
          ],
          def: [ { remain: 180, bonus: 45 }, { remain: 135, bonus: 45 }, { remain: 60, bonus: 0 } ] },
        /* 坦克前方的小图标：随时可以换，按「第几段 + 段内第几秒」填 */
        { key: 'tankStates',   label: '坦克状态（按段）', kind: 'list',
          hint: '「第几段」看上面的时刻表（1 = 起点到第 1 个检查点那段），「段内第几秒」从这段开头算。加时、改检查点都不用手算；段填 0 ＝ 用全程绝对秒（老写法）。不填 = 全程正常速度、不显示图标',
          cols: [
            { key: 'seg', label: '第几段', kind: 'number', def: 1, min: 0, step: 1 },
            { key: 'at', label: '段内秒', kind: 'number', def: 0, min: 0, step: 1, unit: 's' },
            { key: 'state', label: '状态', kind: 'select', def: 'none', options: [
              { v: 'none',   t: '无（正常）' },
              { v: 'arrow1', t: '单箭头 加速' },
              { v: 'arrow2', t: '双箭头 更快' },
              { v: 'arrow3', t: '三箭头 冲刺' },
              { v: 'repair', t: '修理（停住）' },
              { v: 'warn',   t: '感叹号（几乎停）' } ] }
          ],
          def: [] },
        { key: 'failMode',  label: '失败位置', kind: 'select', def: 'none', options: [
          { v: 'none',       t: '不失败（正常到撤离点）' },
          { v: 'checkpoint', t: '到达第 N 个检查点时耗尽' },
          { v: 'route',      t: '途中某进度耗尽' } ] },
        { key: 'failValue', label: '失败点（检查点序号 / 进度%）', kind: 'number', def: 0, min: 0, step: 1 },
        { key: 'holdSeconds', label: '归零后定格(秒)', kind: 'number', def: 2, min: 0, step: 0.1 }
      ]
    }
  },

  interrupt: { label: '中断（依附前一个动画）', short: '中断', params: [
    { key: 'triggerAt', label: '中断时间(秒)', kind: 'number', def: 3, min: 0.1, step: 0.1 } ] }
};

function eventMeta(type) {
  return EVENT_META[type] || { label: type, short: type, params: [] };
}

/** 当前类型/变种需要编辑哪些字段（bigEvent 会带一个变种下拉） */
function eventFields(type, params) {
  const meta = eventMeta(type);
  if (type === 'bigEvent') {
    const v = Number(params && params.variant) || 1;
    // 变种4 走实验开关：旧版只给「初始时间 / 变红倒计时」，检查点那些新版字段不出现
    const fields = v === 4 ? escortFields() : (meta.variantParams[v] || meta.variantParams[1]);
    return [{ key: 'variant', label: '变种', kind: 'variant' }].concat(fields);
  }
  return (meta.params || []).slice();
}

/** 补齐缺省字段；bigEvent 切换变种时把用不到的旧字段清掉 */
function normalizeEventParams(type, params) {
  const p = params || {};
  p.type = type;
  if (type === 'bigEvent') {
    let v = Number(p.variant);
    if (![1, 2, 3, 4].includes(v)) v = 1;
    p.variant = v;
  } else {
    delete p.variant;   // 只有大事件有变种，其他类型别带这个字段污染代码
  }
  const fields = eventFields(type, p);
  if (type === 'bigEvent') {
    const allowed = new Set(['type'].concat(fields.map(f => f.key)));
    Object.keys(p).forEach(k => { if (!allowed.has(k)) delete p[k]; });
  }
  fields.forEach(f => {
    if (f.kind === 'variant') return;
    if (f.kind === 'list') { p[f.key] = normalizeList(f, p[f.key]); return; }
    const cur = p[f.key];
    if (cur === undefined || cur === null || cur === '') {
      p[f.key] = f.def;
    } else if (f.kind === 'number' || f.kind === 'int') {
      const n = Number(cur);
      p[f.key] = isNaN(n) ? f.def : n;
    }
  });
  return p;
}

/** 列表参数的规范化：undefined → 用默认行；显式 [] → 保持空；最多 24 行 */
function normalizeList(field, val) {
  let rows;
  if (val === undefined || val === null) {
    rows = JSON.parse(JSON.stringify(field.def || []));
  } else if (Array.isArray(val)) {
    rows = val;
  } else {
    rows = JSON.parse(JSON.stringify(field.def || []));
  }
  return rows.slice(0, 24).map(raw => {
    const row = {};
    (field.cols || []).forEach(c => {
      const v = raw ? raw[c.key] : undefined;
      if (c.kind === 'select') {
        row[c.key] = (c.options || []).some(o => o.v === v) ? v : c.def;
      } else {
        const n = Number(v);
        row[c.key] = (v === undefined || v === null || v === '' || isNaN(n)) ? c.def : n;
      }
    });
    /* 老数据只有 at（全程绝对秒、没有 seg）：补成 seg=0，别把旧模板解释成「第 1 段」 */
    if (field.key === 'tankStates' && raw && raw.seg === undefined && raw.at !== undefined) row.seg = 0;
    return row;
  });
}

/** 卡片上显示的一行参数摘要 */
function eventParamText(type, params) {
  const p = params || {};
  const parts = [];
  eventFields(type, p).forEach(f => {
    const empty = (p[f.key] === undefined || p[f.key] === null || p[f.key] === '');
    if (f.kind === 'variant') {
      parts.push('变种' + p[f.key] + ' · ' + (EVENT_VARIANT_NAMES[p[f.key]] || ''));
      return;
    }
    if (empty) {
      // 必填但没填：在卡片上标红，避免误以为参数已经有了、结果跑不起来
      if (f.req) parts.push('<span style="color:#ff8080">' + f.label + ': 未填</span>');
      return;
    }
    if (f.kind === 'list') {
      const rows = Array.isArray(p[f.key]) ? p[f.key] : [];
      if (!rows.length) { parts.push(f.label + ': 空'); return; }
      if (f.key === 'checkpoints') {
        parts.push('检查点 ' + rows.length + ' 个（剩 ' + rows.map(r => r.remain).join('/') + 's）');
      } else if (f.key === 'tankStates') {
        parts.push('状态 ' + rows.length + ' 段');
      } else {
        parts.push(f.label + ': ' + rows.length + ' 项');
      }
      return;
    }
    parts.push(f.label + ': ' + p[f.key]);
  });
  // 规范字段之外的自定义键也照原样显示，避免「看不见就以为丢了」
  const known = new Set(eventFields(type, p).map(f => f.key));
  Object.keys(p).forEach(k => {
    if (k === 'type' || known.has(k)) return;
    parts.push(k + ': ' + p[k]);
  });
  return parts.join('<br>');
}

/* ============================================================
   护送车队（bigEvent 变种 4）时间轴
   —— 这里只填「走到每个检查点时还剩多少秒 / 到点加多少秒」，
      每段耗时 = 上一点（加时后）剩余 − 本点剩余，路径由它推出来，
      所以「一定在指定时间到撤离点」是算出来的，不受坦克状态影响
   —— 坦克状态是独立时间轴（第几秒换哪个图标），速度系数只影响段内的
      位移分布，段末会被归一化回检查点位置，到点时间一秒不差
   —— 页面和导出共用这一份计划，两边不会漂移
   ============================================================ */
const CONVOY_SPEED = { none: 1, arrow1: 1.5, arrow2: 2, arrow3: 3, repair: 0, warn: 0.15 };
const CONVOY_STATE_NAMES = {
  none: '无（正常）', arrow1: '单箭头', arrow2: '双箭头', arrow3: '三箭头', repair: '修理', warn: '感叹号'
};

/* 护送素材的版面参数（页面与导出共用这一份，调大小只改这里）
   —— 单位是设计稿像素：画布按 H/220 等比缩放，页面就是 1:1
   —— 图片是白色剪影，上色靠 mask（页面）/ source-in（导出）
   —— 纵向全部相对进度条中线算：坦克在下面 tankGap 处，棋子杆底正好落在点上 */
const CONVOY_ART = {
  tankH: 18,          // 坦克高度（宽按原图比例）
  tankRatio: 959 / 384,
  tankGap: 9,         // 坦克顶边到进度条中线的距离（往下沉一点）
  flagH: 26,          // 棋子高度
  flagRatio: 379 / 512,
  flagPole: 27.5 / 379,   // 旗杆中心在旗子宽度上的位置（原图杆占 x≈11~44）
  flagPad: 15 / 512,      // 原图底部透明边：让杆底正好落在点上
  stH: 8,             // 状态小图标高度
  stGap: 4            // 状态图标与坦克之间的间隙
};

/** 阵营 → 坦克 / 棋子颜色（GTI 绿坦克红棋子，HAVVK 反过来） */
function convoyColors(faction) {
  return faction === 'havvk'
    ? { tank: '#ff5050', flag: '#40ff70' }
    : { tank: '#40ff70', flag: '#ff5050' };
}

/* ---------- 实验性开关：新版 / 旧版大事件4 ----------
   设置里「实验性：新版大事件4」不开 = 旧版（3.0.0 之前的行为）：只有初始时间 + 变红倒计时，
   固定 3 个等分检查点、坦克匀速、没有状态图标、不会中途失败。
   开了 = 新版：检查点加时、坦克状态、失败位置全部可用。
   颜色（阵营 / 名称）两版都保留，外观完全一致。 */
const BIG4_LEGACY_KEYS = ['totalSeconds', 'warningAt', 'faction', 'label'];

/** 读设置里的开关（appSettings 定义在 40-ui.js，运行时才求值；TDZ 用 try 兜住） */
function isNewBig4() {
  try { return typeof appSettings !== 'undefined' && !!appSettings && !!appSettings.experimentalBig4; }
  catch (e) { return false; }
}

/** 大事件4 当前该编辑哪些字段（可视化面板和节点编辑器都从这里取） */
function escortFields() {
  const all = EVENT_META.bigEvent.variantParams[4];
  return isNewBig4() ? all.slice() : all.filter(f => BIG4_LEGACY_KEYS.indexOf(f.key) >= 0);
}

/** 把事件参数换算成「旧版大事件4」：固定 3 个等分检查点、匀速、无状态、不失败
    （阵营 / 名称照留，颜色和新版一模一样） */
function legacyBig4Params(src) {
  const p = Object.assign({}, src || {});
  const total = Math.max(1, Number(p.totalSeconds) || 270);
  p.checkpoints = [
    { remain: Math.round(total * 2 / 3), bonus: 0 },
    { remain: Math.round(total / 3), bonus: 0 },
    { remain: 0, bonus: 0 }
  ];
  p.tankStates = [];
  p.failMode = 'none';
  p.failValue = 0;
  p.holdSeconds = 0;
  return p;
}

/** 某一时刻的坦克状态（取最后一个 at <= t 的条目） */
function escortStateAt(states, t) {
  let cur = 'none';
  if (!states || !states.length) return cur;
  for (const s of states) {
    if (s.at <= t + 1e-6) cur = s.state; else break;
  }
  return cur;
}

function buildEscortPlan(params, opts) {
  // opts.raw = 不管实验开关，一律按「新版」算（冲突检测要用原始参数看时间轴）
  const forceRaw = !!(opts && opts.raw);
  const legacy = !forceRaw && !isNewBig4();
  const p = legacy ? legacyBig4Params(params) : (params || {});
  const total = Math.max(1, Number(p.totalSeconds) || 270);
  const warningAt = Math.max(0, Number(p.warningAt) || 0);
  const hold = Math.max(0, p.holdSeconds === undefined ? 2 : (Number(p.holdSeconds) || 0));
  const issues = [];

  let cps = (Array.isArray(p.checkpoints) ? p.checkpoints : [])
    .map(c => ({
      remain: Math.max(0, Number(c && c.remain) || 0),
      bonus: Math.max(0, Number(c && c.bonus) || 0)
    }));
  if (!cps.length) { cps = [{ remain: 0, bonus: 0 }]; issues.push('检查点为空，已按「直接到撤离点」处理'); }

  const failMode = ['none', 'checkpoint', 'route'].includes(p.failMode) ? p.failMode : 'none';
  const failValue = Number(p.failValue) || 0;
  let explicitFailIdx = -1;   // 显式指定「到这点耗尽」，哪怕它是最后一个点也算失败
  if (failMode === 'checkpoint') {
    const idx = Math.min(cps.length - 1, Math.max(0, Math.round(failValue) - 1));
    cps[idx].remain = 0;      // 到这一点时间正好耗尽
    explicitFailIdx = idx;
  }

  const n = cps.length;
  const legs = [];
  let prevRemain = total;
  for (let i = 0; i < n; i++) {
    const startRemain = prevRemain;
    const endRemain = cps[i].remain;
    let dur = startRemain - endRemain;
    if (dur <= 0.05) {
      issues.push('第 ' + (i + 1) + ' 个检查点剩余 ' + endRemain + 's，比前一点（' + startRemain +
        's）还多，时间轴不成立');
      dur = 0.05;
    }
    const isExit = i === n - 1;
    legs.push({
      idx: i,
      startP: i / n * 100,
      endP: (i + 1) / n * 100,
      startRemain, endRemain,
      dur,
      bonus: isExit ? 0 : cps[i].bonus,
      isExit
    });
    prevRemain = endRemain + (isExit ? 0 : cps[i].bonus);
  }

  /* 途中失败：命中那一段拉长到「走到该进度时刚好归零」 */
  let failLeg = null;
  let failP = null;
  if (failMode === 'route') {
    const target = Math.min(99.9, Math.max(0.5, failValue || 50));
    const leg = legs.find(l => target < l.endP - 1e-6) || legs[legs.length - 1];
    const frac = Math.max(0.02, Math.min(1, (target - leg.startP) / (leg.endP - leg.startP)));
    leg.dur = leg.startRemain / frac;
    failLeg = leg;
    failP = target;
    legs.length = legs.indexOf(leg) + 1;
  }

  /* 时间自然耗尽（某检查点剩余 0）＝ 到那儿失败
     —— 但**最后一个点（撤离点）填 0 不算失败**，那是「掐着 0 秒到撤离点」＝卡点成功 */
  let failTime = null;
  if (failLeg) {
    failTime = legs.slice(0, legs.indexOf(failLeg)).reduce((a, l) => a + l.dur, 0) + failLeg.dur;
  } else {
    const zero = legs.findIndex(l => l.endRemain <= 0.001);
    if (zero >= 0 && (zero < legs.length - 1 || zero === explicitFailIdx)) {
      failTime = legs.slice(0, zero + 1).reduce((a, l) => a + l.dur, 0);
      failP = legs[zero].endP;      // 停在那个检查点上
    }
  }

  /* 先只排绝对时间，段内状态要拿它换算 */
  let clock = 0;
  legs.forEach(l => {
    l.startTime = clock;
    clock += l.dur;
    l.endTime = clock;
  });

  /* 坦克状态 → 绝对时间。
     现在按「第几段 + 段内第几秒」填（seg 从 1 开始），加时/改检查点都不用手算；
     seg = 0 是旧的「全程绝对秒」写法，老模板导入还能照原样跑 */
  const states = (Array.isArray(p.tankStates) ? p.tankStates : [])
    .map(s => {
      const seg = Number(s && s.seg);
      const at = Math.max(0, Number(s && s.at) || 0);
      let abs = at;
      if (seg >= 1 && seg <= legs.length) {
        abs = legs[seg - 1].startTime + at;
      }
      return {
        abs: Math.min(abs, legs[legs.length - 1].endTime),
        state: Object.prototype.hasOwnProperty.call(CONVOY_SPEED, s && s.state) ? s.state : 'none'
      };
    })
    .sort((a, b) => a.abs - b.abs);

  legs.forEach(l => {
    const segs = [];
    let cur = l.startTime;
    let curState = escortStateAt(states.map(s => ({ at: s.abs, state: s.state })), l.startTime);
    states.filter(s => s.abs > l.startTime + 1e-6 && s.abs < l.endTime - 1e-6).forEach(ch => {
      segs.push({ t0: cur, t1: ch.abs, f: CONVOY_SPEED[curState] });
      cur = ch.abs;
      curState = ch.state;
    });
    segs.push({ t0: cur, t1: l.endTime, f: CONVOY_SPEED[curState] });
    let dist = 0;
    segs.forEach(s => {
      s.d0 = dist;
      s.len = s.f * Math.max(0, s.t1 - s.t0);
      dist += s.len;
      s.d1 = dist;
    });
    l.segs = segs;
    l.dist = dist;
    if (dist <= 1e-6) {
      issues.push('第 ' + (l.idx + 1) + ' 段全程停住（状态一直是修理 / 感叹号），坦克走不动');
    }
  });

  const endTime = failTime != null ? failTime : legs[legs.length - 1].endTime;
  const duration = endTime + (failTime != null ? hold : 0);
  const cpPositions = [];
  for (let i = 0; i < n; i++) cpPositions.push((i + 1) / n * 100);

  /* 配速提示（不是错误，只提醒「这段会看起来突然快/慢」）：
     卡在检查点的前提下，一段的平均速度 = 段长 / 段时长，
     也就是由填的「到时剩余」差值决定，跟状态图标无关；
     图标只在同一段内部改变快慢分布（停住/加速）。
     所以某段时长明显短于别段时，看着就会突然窜一下 */
  const warnings = [];
  const avgSpeed = 100 / Math.max(1e-6, endTime);
  legs.forEach((l, i) => {
    const s = (l.endP - l.startP) / Math.max(1e-6, l.dur);
    if (avgSpeed > 0 && (s > avgSpeed * 1.6 || s < avgSpeed / 1.6)) {
      warnings.push(`第 ${i + 1} 段平均 ${s.toFixed(2)}%/秒，全程平均 ${avgSpeed.toFixed(2)}%/秒，` +
        `这段会看起来${s > avgSpeed ? '明显窜快' : '明显变慢'}（想让某段更快，就把该段「到时剩余」的差值写小）`);
    }
  });

  const legAt = (tt) => {
    for (const l of legs) if (tt < l.endTime - 1e-9) return l;
    return legs[legs.length - 1];
  };

  /** 坦克在整条进度条上的位置（0~100） */
  const positionAt = (tt) => {
    if (tt >= endTime - 1e-9) return failP != null ? failP : 100;
    if (tt <= 0) return 0;
    const l = legAt(tt);
    /* ⚠ l.segs 里的 t0/t1 是**绝对时间**（和 checkpoints 同一根时间轴）。
       这里必须拿绝对时间比，之前用「段内相对时间」（tt - l.startTime）去比，
       第二段开始就永远取不到任何分段（tIn <= s.t0 直接 break），
       结果坦克停在检查点不动、到整段末尾才瞬移过去 */
    const tIn = Math.max(l.startTime, Math.min(l.endTime, tt));
    let frac;
    if (l.dist > 1e-6) {
      let d = 0;
      for (const s of l.segs) {
        if (tIn >= s.t1 - 1e-9) { d = s.d1; continue; }
        if (tIn <= s.t0) { d = s.d0; break; }
        d = s.d0 + s.f * (tIn - s.t0);
        break;
      }
      frac = d / l.dist;
    } else {
      frac = (tIn - l.startTime) / l.dur;   // 走不动时退回按时间均分，至少不卡在起点
    }
    return l.startP + Math.max(0, Math.min(1, frac)) * (l.endP - l.startP);
  };

  /** 剩余秒数（加时会往上跳） */
  const remainAt = (tt) => {
    if (tt >= endTime - 1e-9) return 0;
    const l = legAt(tt);
    return Math.max(0, l.startRemain - Math.max(0, tt - l.startTime));
  };

  const stateAt = (tt) => escortStateAt(states.map(s => ({ at: s.abs, state: s.state })), Math.min(tt, endTime));

  /** 已通过几个检查点（旗子据此前移） */
  const passedCount = (tt) => {
    const pos = positionAt(tt);
    let k = 0;
    cpPositions.forEach((cp, i) => { if (pos >= cp - 1e-6) k = i + 1; });
    return k;
  };

  return {
    totalSeconds: total, warningAt, holdSeconds: hold,
    faction: p.faction === 'havvk' ? 'havvk' : 'gti',
    colors: convoyColors(p.faction),
    label: (typeof p.label === 'string' && p.label.trim()) ? p.label.trim() : '护送车队',
    checkpoints: cpPositions, legs, endTime, duration,
    failTime, failP, failMode, issues, warnings, states,
    legacy,
    positionAt, remainAt, stateAt, passedCount
  };
}

/* ============================================================
   护送：坦克状态 ↔ 检查点时间设定 的冲突检测
   —— 只提示、不拦运行（真正算不出时间轴的问题在 buildEscortPlan 的 issues 里，
      那条会直接报错）。这里管的是「能跑，但画面不是你想要的样子」：
      段号写超、段内秒超过这段时长（永远不生效）、两条状态挤在同一秒、
      状态排在时间归零之后（视频里看不到）、整段被修理/感叹号堵死……
      每条都给一句「怎么改」
   ============================================================ */
function checkEscortConflicts(params) {
  const p = params || {};
  // raw = 不看实验开关，永远按新版时间轴算（否则旧版会把填好的检查点整个换掉）
  const plan = buildEscortPlan(p, { raw: true });
  const rows = Array.isArray(p.tankStates) ? p.tankStates : [];
  const legs = plan.legs;
  const out = [];
  const fmt = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  const push = (text, fix) => out.push({ text, fix });

  /* 段号 → 绝对时间（和 buildEscortPlan 里同一套规则：seg=0 或没填 ＝ 全程绝对秒） */
  const absOf = (r) => {
    const seg = Number(r && r.seg) || 0;
    const at = Math.max(0, Number(r && r.at) || 0);
    if (seg >= 1 && seg <= legs.length) return legs[seg - 1].startTime + at;
    return at;
  };
  /* 失败点之后的段根本没跑（时间归零就收工），别再对它报「段内秒越界 / 堵死」这种噪音 */
  const reachable = (seg1) => {
    if (plan.failTime == null) return true;
    const l = legs[seg1 - 1];
    return l && l.startTime < plan.failTime - 1e-6;
  };

  const resolved = [];   // { i, abs, state }
  rows.forEach((r, i) => {
    const seg = Number(r && r.seg) || 0;
    const at = Math.max(0, Number(r && r.at) || 0);
    const state = (r && r.state) || 'none';
    const name = '第 ' + (i + 1) + ' 条状态';
    const abs = absOf(r);
    resolved.push({ i, abs, state });

    // 1) 段号超出总段数
    if (seg >= 1 && seg > legs.length) {
      push(name + '填的是第 ' + seg + ' 段，但整条链只有 ' + legs.length + ' 段（' + legs.length + ' 个检查点＝' + legs.length + ' 段）',
        '把「第几段」改成 ' + legs.length + '，或者删掉这一条');
      return;
    }
    // 2) 段内秒超过这一段时长（到点就已经到检查点了，这条永远轮不到）
    if (seg >= 1 && at > legs[seg - 1].dur + 0.5 && reachable(seg)) {
      const l = legs[seg - 1];
      const rest = Math.max(0, Math.round(at - l.dur));
      const toNext = seg + 1 <= legs.length
        ? '，或者挪到第 ' + (seg + 1) + ' 段段内 ' + rest + ' 秒'
        : '，或者把这一条删掉（已经是最后一段了）';
      push(name + '是「第 ' + seg + ' 段段内 ' + at + ' 秒」，可这一段从开始到检查点只有 ' + Math.round(l.dur) +
        ' 秒，' + Math.round(l.dur) + ' 秒时坦克已经到检查点了，这条永远不会生效',
        '把「段内秒」改成 ' + Math.max(0, Math.floor(l.dur) - 1) + ' 以内' + toNext);
    }
    // 3) 老写法（全程绝对秒）超出总时长
    if (seg === 0 && at > plan.endTime + 0.5) {
      push(name + '填的是「全程第 ' + at + ' 秒」，但整场只有 ' + Math.round(plan.endTime) + ' 秒，这条永远不会生效',
        '改成 ' + Math.round(plan.endTime) + ' 秒以内，或者把「第几段」填成具体段号（推荐，改检查点不用重算）');
    }
  });

  // 4) 两条状态挤在同一时刻：后一条会直接盖掉前一条
  const sorted = resolved.slice().sort((a, b) => a.abs - b.abs);
  for (let k = 1; k < sorted.length; k++) {
    const a = sorted[k - 1], b = sorted[k];
    if (b.abs - a.abs < 0.5) {
      push('第 ' + (a.i + 1) + ' 条和第 ' + (b.i + 1) + ' 条都在 ' + fmt(b.abs) + ' 生效，' +
        '前一条会被后一条盖掉（等于白填' + (a.state === b.state ? '，两条状态还一样' : '') + '）',
        '把其中一条往后错开 1 秒以上，或者删掉一条' +
        (b.abs > plan.endTime - 1 ? '（注意已经快到末尾了）' : ''));
    }
  }

  // 5) 状态排在时间归零之后：视频在归零那一刻就定格收工了
  if (plan.failTime != null) {
    resolved.forEach(r => {
      if (r.abs > plan.failTime + 0.5) {
        push('第 ' + (r.i + 1) + ' 条在 ' + fmt(r.abs) + ' 才生效，但 ' + fmt(plan.failTime) +
          ' 时间就归零了（失败定格 ' + plan.holdSeconds + ' 秒后结束），这条在成片里看不到',
          '挪到 ' + fmt(Math.max(0, plan.failTime - 1)) + ' 之前，或者删掉这一条');
      }
    });
  }

  // 6) 整段被「修理 / 感叹号」堵死：坦克在这段一步都不走
  legs.forEach((l, i) => {
    if (l.dist > 1e-6 || !reachable(i + 1)) return;
    const mid = Math.max(1, Math.round(l.dur / 2));
    push('第 ' + (i + 1) + ' 段从头到尾都是「修理 / 感叹号」，坦克在这段一步都不走（会在段末突然跳到下一个检查点）',
      '在这一段中间补一条状态，比如「第 ' + (i + 1) + ' 段段内 ' + mid + ' 秒 → 无（正常）」，让坦克先停一会儿再走');
  });

  // 7) 一段太短却塞了好几条状态：来不及看清
  legs.forEach((l, i) => {
    if (!reachable(i + 1)) return;
    const cnt = rows.filter(r => (Number(r && r.seg) || 0) === i + 1).length;
    if (cnt > 1 && l.dur / cnt < 1.5) {
      push('第 ' + (i + 1) + ' 段只有 ' + l.dur.toFixed(1) + ' 秒，却排了 ' + cnt + ' 条状态，' +
        '平均每条不到 ' + (l.dur / cnt).toFixed(1) + ' 秒，成片里几乎看不清图标变化',
        '把这一段的「到时剩余」和上一点拉开（让这段长一点），或者只留最关键的 1 条');
    }
  });

  return out;
}

/** 从参数编辑区（可视化面板 / 节点卡片）读出护送参数 */
function collectEscortParams(root) {
  if (!root) return null;
  const val = k => {
    const el = root.querySelector('[data-key="' + k + '"]');
    return el ? el.value : undefined;
  };
  const num = (k, d) => {
    const v = Number(val(k));
    return Number.isFinite(v) ? v : d;
  };
  const cpField = findListField('checkpoints');
  const stField = findListField('tankStates');
  return {
    totalSeconds: num('totalSeconds', 270),
    warningAt: num('warningAt', 10),
    checkpoints: cpField ? collectListValue(root, cpField) : [],
    tankStates: stField ? collectListValue(root, stField) : [],
    failMode: val('failMode') || 'none',
    failValue: num('failValue', 0),
    holdSeconds: num('holdSeconds', 2)
  };
}

/** 把冲突渲染到参数区那个 ⚠ 盒子（没有就跳过，旧版没有这个盒子） */
function refreshEscortConflicts(root) {
  if (!root) return;
  const box = root.querySelector('[data-conflicts]');
  if (!box) return;
  const params = collectEscortParams(root);
  const list = params ? checkEscortConflicts(params) : [];
  if (!list.length) {
    box.innerHTML = '';
    box.style.display = 'none';
    return;
  }
  box.style.display = '';
  box.innerHTML =
    '<div class="plist-conflict-title">⚠ 检测到 ' + list.length + ' 处「坦克状态」和检查点时间对不上（不影响运行，但画面不是你想的那样）</div>' +
    list.map(c =>
      '<div class="plist-conflict">' +
        '<div class="plist-conflict-text">⚠ ' + c.text + '</div>' +
        '<div class="plist-conflict-fix">→ 怎么改：' + c.fix + '</div>' +
      '</div>').join('');
}

/* ============================================================
   列表参数的行内编辑器（可视化面板与节点卡片共用）
   —— 每行几个窄输入框 + 删除按钮，底下一行「+ 添加」
   ============================================================ */
function listRowHtml(field, r) {
  const cols = field.cols || [];
  return '<div class="plist-row">' + cols.map(c => {
    if (c.kind === 'select') {
      return '<select data-col="' + c.key + '" title="' + c.label + '">' +
        (c.options || []).map(o => '<option value="' + o.v + '"' +
          (o.v === (r ? r[c.key] : c.def) ? ' selected' : '') + '>' + o.t + '</option>').join('') +
        '</select>';
    }
    const v = r ? r[c.key] : c.def;
    return '<input type="number" data-col="' + c.key + '" title="' + c.label + '" value="' + v +
      '" min="' + (c.min === undefined ? 0 : c.min) + '" step="' + (c.step || 1) + '">';
  }).join('') + '<button type="button" class="plist-del" data-del title="删除这一行">✕</button></div>';
}

function listEditorHtml(field, rows) {
  const cols = field.cols || [];
  const list = Array.isArray(rows) ? rows.slice(0, 24) : [];
  const heads = cols.map(c => '<span class="plist-head">' + c.label +
    (c.unit ? '(' + c.unit + ')' : '') + '</span>').join('');
  return '<div class="plist" data-list="' + field.key + '">' +
    '<div class="plist-title">' + field.label + (field.req ? ' <i>*</i>' : '') + '</div>' +
    (field.hint ? '<div class="plist-hint">' + field.hint + '</div>' : '') +
    '<div class="plist-heads">' + heads + '<span></span></div>' +
    '<div class="plist-rows">' + (list.length ? list : [null]).map(r => listRowHtml(field, r)).join('') + '</div>' +
    '<button type="button" class="plist-add" data-add>+ 添加一行</button>' +
    (field.key === 'checkpoints' ? '<div class="plist-legs" data-legs></div>' : '') +
    (field.key === 'tankStates' ? '<div class="plist-conflicts" data-conflicts style="display:none"></div>' : '') +
    '</div>';
}

/** 按 key 反查列表字段定义（checkpoints / tankStates 等） */
function findListField(key) {
  for (const type of Object.keys(EVENT_META)) {
    const meta = EVENT_META[type];
    const pools = [meta.params || []];
    if (meta.variantParams) Object.keys(meta.variantParams).forEach(v => pools.push(meta.variantParams[v]));
    for (const pool of pools) {
      const hit = (pool || []).find(f => f.key === key && f.kind === 'list');
      if (hit) return hit;
    }
  }
  return null;
}

/** 重新算并显示「每段时刻表」：填的秒数对应到绝对时间轴的哪一刻，
    这样坦克状态里的「第几秒」不用自己心算（加时会把倒计时往上跳，别看倒计时填） */
function refreshLegSummary(root) {
  if (!root) return;
  const box = root.querySelector('.plist[data-list="checkpoints"]');
  const out = box && box.querySelector('[data-legs]');
  if (!out) return;
  const field = findListField('checkpoints');
  const cps = collectListValue(root, field);      // 注意传 root：collectListValue 内部自己查 .plist
  const tEl = root.querySelector('[data-key="totalSeconds"]');
  const total = tEl ? Number(tEl.value) : undefined;
  if (!cps.length) { out.innerHTML = ''; return; }
  const plan = buildEscortPlan({ totalSeconds: total, checkpoints: cps, tankStates: [], failMode: 'none' });
  const fmt = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  out.innerHTML =
    '<div class="plist-legs-title">按这些数字算出来的分段（下面「坦克状态」填第几段就照这个段号，段内秒从段开头算）</div>' +
    plan.legs.map((l, i) =>
      '<div class="plist-leg"><b>段' + (i + 1) + '</b> ' + fmt(l.startTime) + '→' + fmt(l.endTime) +
      ' · 剩 ' + l.startRemain + '→' + l.endRemain + 's' +
      (l.bonus ? ' ＋' + l.bonus + 's' : '') +
      (l.isExit ? ' <i>撤离点</i>' : '') + '</div>').join('') +
    '<div class="plist-leg">合计 ' + fmt(plan.duration) + '</div>';
}

/** 给容器里的列表控件挂上增删事件（重复调用安全） */
function bindListEditors(container) {
  if (!container) return;
  if (container.dataset.legsBound !== '1') {   // 改数字就重算时刻表 + 重查冲突
    container.dataset.legsBound = '1';
    const upd = () => { refreshLegSummary(container); refreshEscortConflicts(container); };
    container.addEventListener('input', upd);
    container.addEventListener('change', upd);
  }
  container.querySelectorAll('.plist').forEach(box => {
    if (box.dataset.bound === '1') return;
    box.dataset.bound = '1';
    const field = findListField(box.dataset.list);
    box.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('click', ev => ev.stopPropagation());
    });
    const add = box.querySelector('.plist-add');
    if (add) add.addEventListener('click', ev => {
      ev.stopPropagation();
      const rows = box.querySelector('.plist-rows');
      if (!rows || rows.children.length >= 24) return;
      rows.insertAdjacentHTML('beforeend', listRowHtml(field, null));
      rows.lastElementChild.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('click', e2 => e2.stopPropagation());
      });
      refreshLegSummary(container);
      refreshEscortConflicts(container);
    });
    box.addEventListener('click', ev => {
      const del = ev.target.closest('.plist-del');
      if (!del) return;
      ev.stopPropagation();
      const rows = box.querySelector('.plist-rows');
      if (rows && rows.children.length > 1) del.closest('.plist-row').remove();
      refreshLegSummary(container);
      refreshEscortConflicts(container);
    });
  });
  refreshLegSummary(container);
  refreshEscortConflicts(container);
}

/** 读出某个列表字段当前的值 */
function collectListValue(container, field) {
  const box = container && container.querySelector('.plist[data-list="' + field.key + '"]');
  if (!box) return [];
  return [...box.querySelectorAll('.plist-rows .plist-row')].map(row => {
    const o = {};
    (field.cols || []).forEach(c => {
      const el = row.querySelector('[data-col="' + c.key + '"]');
      if (!el) return;
      o[c.key] = c.kind === 'select' ? el.value : (Number(el.value) || 0);
    });
    return o;
  });
}

/* ============================================================
   附属据点图标（官方高清图）
   —— 用现成的高清图标图（1920×1920，深底白图）直接抠出来：亮度→alpha，
      面积平均缩小到 512×512，形状就是那张图本身，不做任何描摹/拟合
      想换图：node tools/icon-from-image.js <图片路径> 512
      （会自动重写 tools/satellite-icon.png 和下面的 base64）
   —— 页面用 CSS mask + currentColor 上色，Canvas 导出用离屏 canvas 的 source-in 上色，
      两边共用同一份 PNG，颜色依旧只有 CSS 变量一处
   ============================================================ */
window.SATELLITE_ICON_IMG = (function () {
  const im = new Image();
  im.src = window.SATELLITE_ICON_PNG;   // 页面刚加载就解码，导出时不用等异步
  // CSS 那边靠 --sat-icon-mask 上色，变量必须在这里注入（base64 只存这一份）
  document.documentElement.style.setProperty('--sat-icon-mask', `url("${window.SATELLITE_ICON_PNG}")`);
  return im;
})();

/* ============================================================
   大事件「据点被摧毁」叉号（高清剪影图）
   —— 同样是深底白图抠成白色 + alpha：tools/x-from-image.js 生成
      想换图：node tools/x-from-image.js <图片路径> 256
   —— 页面用 mask + currentColor 上色（颜色跟着据点文字色走），
      导出用离屏 canvas 的 source-in 染成当前文字色
   ============================================================ */
window.BIGEVENT_X_IMG = (function () {
  const im = new Image();
  if (window.BIGEVENT_X_PNG) {
    im.src = window.BIGEVENT_X_PNG;
    document.documentElement.style.setProperty('--bigevent-x-mask', `url("${window.BIGEVENT_X_PNG}")`);
  }
  return im;
})();
