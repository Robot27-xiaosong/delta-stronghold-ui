/* 30-samples.js — 示例事件链 */
/* ============================================================
   示例事件链
   ============================================================ */
const EXAMPLES = {
  capture: [
    {"type":"redState"},
    {"type":"redRetreat","duration":3},
    {"type":"standby","duration":0.5},
    {"type":"greenAdvance","duration":3}
  ],
  lose: [
    {"type":"greenState"},
    {"type":"greenRetreat","duration":3},
    {"type":"standby","duration":0.5},
    {"type":"redAdvance","duration":3}
  ],
  /* 中断示例：必须从中立（空边框）开始推进，否则满格绿再推进看不出任何变化，
     3 秒中断也就没有「保留一半进度」的效果 */
  interrupt: [
    {"type":"neutralState"},
    {"type":"greenAdvance","duration":7},
    {"type":"interrupt","triggerAt":3},
    {"type":"standby","duration":2},
    {"type":"greenRetreat","duration":4}
  ],
  big1: [
    {"type":"greenState"},
    {"type":"bigEvent","variant":1,"whiteDuration":2.5}
  ],
  big2: [
    {"type":"redState"},
    {"type":"bigEvent","variant":2,"whiteDuration":2.5,"greenDuration":2.5}
  ],
  big3: [
    {"type":"greenState"},
    {"type":"bigEvent","variant":3,"whiteDuration":2.5,"oldName":"尖塔","newName":"废墟","collapseDelay":2}
  ],
  big4: [
    {"type":"greenState"},
    {"type":"bigEvent","variant":4,"totalSeconds":60,"warningAt":10,
     "checkpoints":[{"remain":8,"bonus":20},{"remain":6,"bonus":15},{"remain":5,"bonus":0}],
     "tankStates":[{"seg":1,"at":10,"state":"repair"},{"seg":2,"at":4,"state":"arrow2"},{"seg":3,"at":2,"state":"none"},{"seg":3,"at":12,"state":"arrow3"}],
     "failMode":"none","failValue":0,"holdSeconds":2}
  ]
};
