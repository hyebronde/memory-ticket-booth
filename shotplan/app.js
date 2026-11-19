'use strict';
/* DP Plans — top-down lighting, camera & shot planner. All data stays on the device (IndexedDB). */

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = v => Math.round(v * 100) / 100;
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const normDeg = d => ((d % 360) + 360) % 360;
const clone = o => JSON.parse(JSON.stringify(o));
const FONT = `'IBM Plex Sans Thai', Thonburi, 'Noto Sans Thai', 'Sarabun', system-ui, sans-serif`;
const PAPER = '#fbfaf7', INK = '#1f1f23', SETF = '#ebe7df', SETS = '#4a4a50';
const CAM_COLORS = ['#e5484d', '#2f7cf6', '#30a46c', '#8e4ec6', '#f76b15', '#0894b3'];
const PEN_COLORS = ['#e5484d', '#2f7cf6', '#1c1c1f', '#f5a524', '#30a46c'];
const PERSON_COLORS = ['#f5a524', '#e5484d', '#2f7cf6', '#30a46c', '#8e4ec6', '#8b8d98'];
const SENSORS = { ff: ['Full Frame', 36], s35: ['Super 35', 24.9], apsc: ['APS-C', 23.5], mft: ['Micro 4/3', 17.3], phone: ['มือถือ (ระยะเทียบ FF)', 36] };
const SHOT_SIZES = ['EWS', 'WS', 'FS', 'MS', 'MCU', 'CU', 'ECU', 'OTS', 'POV', '2-Shot', 'Insert'];
const ANGLES = ['ระดับสายตา', 'มุมสูง', 'มุมต่ำ', 'Top shot', 'Dutch'];
const MOVES = ['Static', 'Pan', 'Tilt', 'Dolly in', 'Dolly out', 'Truck / Slide', 'Handheld', 'Gimbal', 'Crane / Jib', 'Zoom', 'Orbit'];
const MODIFIERS = ['—', 'Softbox', 'Lantern', 'Dome', 'Grid', 'Umbrella', 'Fresnel lens', 'Diffusion', 'Barn doors'];
const TIMES = ['กลางวัน', 'กลางคืน', 'เช้า', 'เย็น / Golden hour', 'Blue hour', 'ในสตูดิโอ'];
const K_PRESETS = [2700, 3200, 4300, 5600, 6500];
const K_RAMP = [[2000, [255, 112, 36]], [2700, [255, 146, 54]], [3200, [255, 176, 88]], [4300, [255, 214, 130]], [5000, [214, 228, 214]], [5600, [150, 204, 255]], [6500, [118, 178, 255]], [10000, [96, 140, 255]]];
function kColor(k) {
  k = clamp(+k || 5600, 2000, 10000);
  for (let i = 1; i < K_RAMP.length; i++) if (k <= K_RAMP[i][0]) {
    const [k0, a] = K_RAMP[i - 1], [k1, b] = K_RAMP[i], t = (k - k0) / (k1 - k0);
    return '#' + a.map((v, j) => Math.round(v + (b[j] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  return '#608cff';
}

// ---------- item library (top view, front faces +x) ----------
const st = (w = .025) => `stroke="${SETS}" stroke-width="${w}"`;
const SHAPES = {
  fresnel: () => `<rect x="-.22" y="-.16" width=".34" height=".32" rx=".05" fill="${INK}"/><path d="M.12-.15L.27-.25V.25L.12.15z" fill="#5a5a62"/><rect x=".1" y="-.11" width=".04" height=".22" fill="#ffe7a8"/>`,
  hmi: () => `<g transform="scale(1.3)">${SHAPES.fresnel()}</g><text x="-.12" y=".07" font-size=".2" font-weight="700" fill="#fff" font-family="sans-serif">H</text>`,
  par: () => `<circle r=".18" fill="${INK}"/><rect x=".1" y="-.14" width=".1" height=".28" rx=".03" fill="#5a5a62"/><rect x=".18" y="-.1" width=".03" height=".2" fill="#ffe7a8"/>`,
  cob: () => `<rect x="-.34" y="-.09" width=".2" height=".18" rx=".03" fill="${INK}"/><path d="M-.14-.1L.1-.44H.14V.44H.1L-.14.1z" fill="#3c3c43"/><rect x=".12" y="-.45" width=".06" height=".9" rx=".02" fill="#fff" stroke="${INK}" stroke-width=".02"/>`,
  lantern: () => `<circle r=".32" fill="#fff" stroke="${INK}" stroke-width=".03"/><circle r=".2" fill="none" stroke="#c9c5bc" stroke-width=".015"/><circle r=".08" fill="${INK}"/>`,
  panel: () => `<rect x="-.06" y="-.3" width=".11" height=".6" rx=".02" fill="${INK}"/><rect x=".05" y="-.28" width=".035" height=".56" fill="#ffe7a8"/>`,
  tube: () => `<rect x="-.035" y="-.6" width=".07" height="1.2" rx=".035" fill="#fff" stroke="${INK}" stroke-width=".02"/>`,
  practical: () => `<circle r=".2" fill="#fff6d6" stroke="${INK}" stroke-width=".03"/><circle r=".07" fill="#f5a524"/>`,
  camera: it => `<rect x="-.24" y="-.13" width=".32" height=".26" rx=".04" fill="${it.color || CAM_COLORS[0]}"/><rect x=".08" y="-.08" width=".18" height=".16" rx=".02" fill="${INK}"/><rect x="-.32" y="-.06" width=".08" height=".12" fill="${INK}"/>`,
  monitor: () => `<rect x="-.05" y="-.26" width=".1" height=".52" rx=".02" fill="${INK}"/><rect x=".05" y="-.23" width=".02" height=".46" fill="#7fb8ff"/><circle cx="-.18" r=".06" fill="${INK}"/>`,
  talent: it => `<ellipse rx=".17" ry=".32" fill="${it.color || '#f5a524'}" opacity=".35"/><circle r=".2" fill="${it.color || '#f5a524'}" stroke="#fff" stroke-width=".03"/><path d="M.18-.09L.34 0L.18.09z" fill="${it.color || '#f5a524'}"/>`,
  crew: it => SHAPES.talent({ color: it.color || '#8b8d98' }),
  reflector: () => `<rect x="-.03" y="-.5" width=".06" height="1" rx=".02" fill="#fff" stroke="#8a8a90" stroke-width=".025"/><rect x=".03" y="-.48" width=".02" height=".96" fill="#d9d9de"/>`,
  bounce: () => `<rect x="-.04" y="-.5" width=".08" height="1" fill="#fff" stroke="${SETS}" stroke-width=".02"/>`,
  flag: () => `<rect x="-.04" y="-.5" width=".08" height="1" fill="#141416"/>`,
  diffusion: () => `<rect x="-.03" y="-.6" width=".06" height="1.2" fill="#fff" fill-opacity=".7" stroke="${INK}" stroke-width=".02" stroke-dasharray=".06 .04"/>`,
  cstand: () => `<path d="M0 0L.3 0M0 0L-.15.26M0 0L-.15-.26" stroke="${INK}" stroke-width=".035" stroke-linecap="round"/><circle r=".05" fill="${INK}"/>`,
  door: () => `<rect x="-.09" y="-.45" width=".18" height=".9" fill="${PAPER}"/><rect x="0" y="-.47" width=".9" height=".04" fill="${SETS}"/><path d="M.9-.45A.9.9 0 0 1 0 .45" fill="none" stroke="${SETS}" stroke-width=".015" stroke-dasharray=".05 .04"/><path d="M0-.45V.45" stroke="${SETS}" stroke-width=".02"/>`,
  window: () => `<rect x="-.09" y="-.6" width=".18" height="1.2" fill="${PAPER}"/><rect x="-.07" y="-.6" width=".14" height="1.2" fill="#dcecff" ${st(.02)}/><path d="M0-.6V.6" stroke="${SETS}" stroke-width=".015"/>`,
  chair: () => `<rect x="-.22" y="-.22" width=".44" height=".44" rx=".06" fill="${SETF}" ${st()}/><rect x="-.27" y="-.22" width=".09" height=".44" rx=".03" fill="${SETS}"/>`,
  armchair: () => `<rect x="-.4" y="-.4" width=".8" height=".8" rx=".1" fill="${SETF}" ${st()}/><rect x="-.4" y="-.4" width=".2" height=".8" rx=".06" fill="#d4cfc4" ${st()}/><rect x="-.3" y="-.4" width=".7" height=".14" rx=".05" fill="#d4cfc4" ${st()}/><rect x="-.3" y=".26" width=".7" height=".14" rx=".05" fill="#d4cfc4" ${st()}/>`,
  sofa: () => `<rect x="-.45" y="-1" width=".9" height="2" rx=".1" fill="${SETF}" ${st()}/><rect x="-.45" y="-1" width=".22" height="2" rx=".07" fill="#d4cfc4" ${st()}/><rect x="-.25" y="-1" width=".7" height=".18" rx=".06" fill="#d4cfc4" ${st()}/><rect x="-.25" y=".82" width=".7" height=".18" rx=".06" fill="#d4cfc4" ${st()}/><path d="M-.23 0H.45" ${st(.015)}/>`,
  table: () => `<rect x="-.45" y="-.75" width=".9" height="1.5" rx=".03" fill="#e2d6c3" ${st()}/>`,
  roundtable: () => `<circle r=".45" fill="#e2d6c3" ${st()}/>`,
  coffee: () => `<rect x="-.3" y="-.55" width=".6" height="1.1" rx=".08" fill="#e2d6c3" ${st()}/>`,
  desk: () => `<rect x="-.35" y="-.7" width=".7" height="1.4" rx=".03" fill="#e2d6c3" ${st()}/><rect x="-.3" y="-.2" width=".08" height=".4" fill="${SETS}"/>`,
  bed: () => `<rect x="-1" y="-.8" width="2" height="1.6" rx=".06" fill="#fff" ${st()}/><rect x="-.92" y="-.7" width=".3" height=".62" rx=".08" fill="${SETF}" ${st(.02)}/><rect x="-.92" y=".08" width=".3" height=".62" rx=".08" fill="${SETF}" ${st(.02)}/><rect x="-.45" y="-.8" width="1.45" height="1.6" rx=".04" fill="#dfe6ee" ${st(.02)}/>`,
  plant: () => `<circle r=".28" fill="#cfe3c2" stroke="#5a7d4a" stroke-width=".02"/><circle cx="-.08" cy="-.06" r=".11" fill="#a8cc93"/><circle cx=".1" cy=".05" r=".1" fill="#a8cc93"/><circle cx="-.02" cy=".12" r=".08" fill="#8dbb76"/>`,
  tv: () => `<rect x="-.04" y="-.6" width=".08" height="1.2" rx=".02" fill="#141416"/><rect x="-.16" y="-.15" width=".12" height=".3" fill="${SETS}"/>`,
  cabinet: () => `<rect x="-.25" y="-.5" width=".5" height="1" rx=".02" fill="${SETF}" ${st()}/><path d="M.25 0H-.25" ${st(.015)}/>`,
  lamp: () => SHAPES.practical(),
};
const LIB = [
  { cat: 'light', type: 'cob', name: 'Softbox (COB)', r: .48, d: { beam: 100, reach: 4.5, watt: 300, mode: 'bicolor', k: 5600, dim: 100, mod: 'Softbox' } },
  { cat: 'light', type: 'fresnel', name: 'Fresnel / Spot', r: .3, d: { beam: 30, reach: 7, watt: 300, mode: 'bicolor', k: 3200, dim: 100, mod: 'Fresnel lens' } },
  { cat: 'light', type: 'lantern', name: 'Lantern', r: .34, d: { beam: 360, reach: 3, watt: 300, mode: 'bicolor', k: 3200, dim: 100, mod: 'Lantern' } },
  { cat: 'light', type: 'panel', name: 'LED Panel', r: .32, d: { beam: 70, reach: 4, watt: 100, mode: 'bicolor', k: 5600, dim: 100, mod: '—' } },
  { cat: 'light', type: 'tube', name: 'Tube 4ft', r: .62, d: { beam: 150, reach: 2.5, watt: 30, mode: 'rgb', k: 3200, color: '#c86bff', dim: 100, mod: '—' } },
  { cat: 'light', type: 'par', name: 'PAR', r: .24, d: { beam: 25, reach: 9, watt: 575, mode: 'daylight', k: 5600, dim: 100, mod: '—' } },
  { cat: 'light', type: 'hmi', name: 'HMI', r: .4, d: { beam: 40, reach: 12, watt: 1800, mode: 'daylight', k: 5600, dim: 100, mod: 'Fresnel lens' } },
  { cat: 'light', type: 'practical', name: 'Practical (โคมในฉาก)', r: .22, d: { beam: 360, reach: 1.6, watt: 40, mode: 'bicolor', k: 2700, dim: 100, mod: '—' } },
  { cat: 'camera', type: 'camera', name: 'กล้อง', r: .32, d: { body: '', sensor: 'ff', lens: 35, reach: 4, height: 1.5 } },
  { cat: 'camera', type: 'monitor', name: 'มอนิเตอร์ / Video village', r: .27, d: {} },
  { cat: 'person', type: 'talent', name: 'นักแสดง / ตัวแบบ', r: .36, d: { role: 'talent', color: '#f5a524' } },
  { cat: 'person', type: 'crew', name: 'ทีมงาน', r: .36, d: { role: 'crew', color: '#8b8d98' } },
  { cat: 'grip', type: 'reflector', name: 'Reflector', r: .52, d: {} },
  { cat: 'grip', type: 'bounce', name: 'Bounce board', r: .52, d: {} },
  { cat: 'grip', type: 'flag', name: 'Flag / Neg fill', r: .52, d: {} },
  { cat: 'grip', type: 'diffusion', name: 'Diffusion frame', r: .62, d: {} },
  { cat: 'grip', type: 'cstand', name: 'C-stand', r: .32, d: {} },
  { cat: 'set', type: 'door', name: 'ประตู', r: .95, d: {} },
  { cat: 'set', type: 'window', name: 'หน้าต่าง (แสงธรรมชาติ)', r: .62, d: { sun: true, k: 5600, beam: 110, reach: 4 } },
  { cat: 'set', type: 'chair', name: 'เก้าอี้', r: .32, d: {} },
  { cat: 'set', type: 'armchair', name: 'อาร์มแชร์', r: .56, d: {} },
  { cat: 'set', type: 'sofa', name: 'โซฟา', r: 1.08, d: {} },
  { cat: 'set', type: 'table', name: 'โต๊ะ', r: .86, d: {} },
  { cat: 'set', type: 'roundtable', name: 'โต๊ะกลม', r: .47, d: {} },
  { cat: 'set', type: 'coffee', name: 'โต๊ะกาแฟ', r: .62, d: {} },
  { cat: 'set', type: 'desk', name: 'โต๊ะทำงาน', r: .78, d: {} },
  { cat: 'set', type: 'bed', name: 'เตียง', r: 1.26, d: {} },
  { cat: 'set', type: 'plant', name: 'ต้นไม้', r: .3, d: {} },
  { cat: 'set', type: 'tv', name: 'ทีวี', r: .62, d: {} },
  { cat: 'set', type: 'cabinet', name: 'ตู้ / ชั้น', r: .56, d: {} },
];
const LIBMAP = Object.fromEntries(LIB.map(d => [d.type, d]));
const LIB_TABS = [['light', 'ไฟ'], ['kit', 'ชุดไฟของฉัน'], ['camera', 'กล้อง'], ['person', 'คน'], ['grip', 'กริป'], ['set', 'ฉาก / พร็อพ']];
const DEFAULT_KIT = [
  { id: 'k1', model: 'Aputure 600d', type: 'cob', watt: 600, mode: 'daylight' },
  { id: 'k2', model: 'Amaran 200x', type: 'cob', watt: 200, mode: 'bicolor' },
  { id: 'k3', model: 'Nanlite Forza 300B', type: 'fresnel', watt: 300, mode: 'bicolor' },
  { id: 'k4', model: 'Nanlite PavoTube II 30X', type: 'tube', watt: 30, mode: 'rgb' },
];

// ---------- storage ----------
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('dpplans', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('projects', { keyPath: 'id' }); r.result.createObjectStore('meta'); };
      r.onsuccess = () => { DB.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  req(store, mode, fn) {
    return new Promise((res, rej) => {
      if (!DB.db) return res(null);
      try { const q = fn(DB.db.transaction(store, mode).objectStore(store)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); } catch (e) { rej(e); }
    });
  },
  all: () => DB.req('projects', 'readonly', s => s.getAll()),
  put: p => DB.req('projects', 'readwrite', s => s.put(p)),
  del: id => DB.req('projects', 'readwrite', s => s.delete(id)),
  getMeta: k => DB.req('meta', 'readonly', s => s.get(k)),
  setMeta: (k, v) => DB.req('meta', 'readwrite', s => s.put(v, k)),
};

// ---------- state ----------
const S = {
  projects: [], kit: clone(DEFAULT_KIT), proj: null, scene: null,
  sel: null, tool: 'select', view: { x: 0, y: 0, z: 60 }, tab: 'shots', labels: true,
  activeShot: null, pen: PEN_COLORS[0], preview: null, undo: [], redo: [],
};
let saveTimer = null;
function save() {
  if (!S.proj) return;
  S.proj.updated = Date.now();
  clearTimeout(saveTimer);
  const p = S.proj;
  saveTimer = setTimeout(() => DB.put(p).catch(() => toast('บันทึกไม่สำเร็จ (พื้นที่เครื่องอาจเต็ม)')), 350);
}
function snap() {
  if (!S.scene) return;
  S.undo.push(JSON.stringify({ plan: S.scene.plan, shots: S.scene.shots }));
  if (S.undo.length > 80) S.undo.shift();
  S.redo = [];
  updateUndo();
}
function undoRedo(dir) {
  const from = dir < 0 ? S.undo : S.redo, to = dir < 0 ? S.redo : S.undo;
  if (!from.length) return;
  to.push(JSON.stringify({ plan: S.scene.plan, shots: S.scene.shots }));
  const s = JSON.parse(from.pop());
  S.scene.plan = s.plan; S.scene.shots = s.shots;
  if (S.sel && !findSel()) S.sel = null;
  save(); render(); renderPanel(); updateUndo();
}
function updateUndo() { $('#btnUndo').disabled = !S.undo.length; $('#btnRedo').disabled = !S.redo.length; }

const newScene = (n, name) => ({ id: uid(), number: String(n), name: name || 'ซีนใหม่', location: '', time: TIMES[0], notes: '', plan: { walls: [], items: [], draws: [], bg: null }, shots: [] });
const newProject = (name, client, date) => ({ id: uid(), name: name || 'โปรเจกต์ใหม่', client: client || '', date: date || '', created: Date.now(), updated: Date.now(), scenes: [newScene(1, 'ซีนแรก')], photos: {} });
const P = () => S.scene.plan;
const items = () => P().items;
const getItem = id => items().find(i => i.id === id);
function findSel() {
  if (!S.sel) return null;
  const { t, id } = S.sel;
  return t === 'item' ? getItem(id) : t === 'wall' ? P().walls.find(w => w.id === id) : P().draws.find(d => d.id === id);
}
const cams = (sc = S.scene) => sc.plan.items.filter(i => i.type === 'camera');
const lights = (sc = S.scene) => sc.plan.items.filter(i => i.cat === 'light');
const hfov = it => 2 * deg(Math.atan((SENSORS[it.sensor] || SENSORS.ff)[1] / (2 * Math.max(4, +it.lens || 35))));
function lightColor(it) { return it.mode === 'rgb' ? (it.color || '#c86bff') : kColor(it.mode === 'daylight' ? 5600 : it.k); }
function itemName(it) {
  if (it.cat === 'light') return it.label || it.model || LIBMAP[it.type].name;
  if (it.type === 'camera') return (it.label || 'Cam') + (it.body ? ' · ' + it.body : '');
  if (it.cat === 'person') return it.label || LIBMAP[it.type].name;
  return it.label || LIBMAP[it.type]?.name || it.type;
}
function nextCamLabel(sc) {
  const used = new Set(cams(sc).map(c => c.label));
  for (const L of 'ABCDEFGHIJ') if (!used.has(L)) return L;
  return 'X';
}
function makeItem(type, x, y, extra = {}) {
  const def = LIBMAP[type];
  const it = { id: uid(), cat: def.cat, type, x: r2(x), y: r2(y), rot: 0, s: 1, label: '', ...clone(def.d), ...extra };
  if (type === 'camera' && !extra.label) {
    it.label = nextCamLabel(S.scene);
    it.color = CAM_COLORS[cams(S.scene).length % CAM_COLORS.length];
  }
  if (type === 'tube' && !extra.s) it.s = 1;
  return it;
}

// ---------- plan rendering (SVG, world units = meters) ----------
function wedge(x, y, dir, ang, r) {
  if (ang >= 359) return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
  const a0 = rad(dir - ang / 2), a1 = rad(dir + ang / 2);
  const p0 = [x + r * Math.cos(a0), y + r * Math.sin(a0)], p1 = [x + r * Math.cos(a1), y + r * Math.sin(a1)];
  return `M${x} ${y}L${p0[0].toFixed(3)} ${p0[1].toFixed(3)}A${r} ${r} 0 ${ang > 180 ? 1 : 0} 1 ${p1[0].toFixed(3)} ${p1[1].toFixed(3)}Z`;
}
function smoothPath(pts) {
  if (pts.length < 3) return 'M' + pts.map(p => p.map(v => v.toFixed(3)).join(' ')).join('L');
  let d = `M${pts[0][0].toFixed(3)} ${pts[0][1].toFixed(3)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${pts[i][0].toFixed(3)} ${pts[i][1].toFixed(3)} ${mx.toFixed(3)} ${my.toFixed(3)}`;
  }
  const l = pts[pts.length - 1];
  return d + `L${l[0].toFixed(3)} ${l[1].toFixed(3)}`;
}
const txt = (x, y, s, size, extra = '') => `<text x="${x.toFixed(3)}" y="${y.toFixed(3)}" font-size="${size}" font-family="${FONT}" text-anchor="middle" ${/\bfill=/.test(extra) ? '' : `fill="${INK}"`} stroke="${PAPER}" stroke-width="${size * .28}" paint-order="stroke" stroke-linejoin="round" ${extra}>${esc(s)}</text>`;

function planSVG(sc, o) {
  const p = sc.plan, px = o.px, edit = !!o.edit;
  let defs = PEN_COLORS.map(c => `<marker id="ar${c.slice(1)}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('');
  let out = '';
  if (o.grid) {
    const g = o.grid;
    defs += `<pattern id="gm" width=".5" height=".5" patternUnits="userSpaceOnUse"><path d="M.5 0H0V.5" fill="none" stroke="#e9e5dc" stroke-width="${px}"/></pattern><pattern id="gM" width="1" height="1" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="url(#gm)"/><path d="M1 0H0V1" fill="none" stroke="#dcd7cb" stroke-width="${px * 1.3}"/></pattern>`;
    out += `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" fill="url(#gM)"/>`;
  }
  if (p.bg && !o.noBg) {
    const src = (o.photos || S.proj?.photos || {})[p.bg.ph];
    if (src) out += `<image href="${src}" x="${p.bg.x}" y="${p.bg.y}" width="${p.bg.w}" height="${p.bg.h}" opacity="${p.bg.op ?? .6}" preserveAspectRatio="none"/>`;
  }
  // light & camera cones
  let cones = '';
  for (const it of p.items) {
    if (it.cat === 'light' || (it.type === 'window' && it.sun)) {
      const c = it.type === 'window' ? kColor(it.k) : lightColor(it), dim = (it.dim ?? 100) / 100, r = +it.reach || 3;
      defs += `<radialGradient id="lg${it.id}" gradientUnits="userSpaceOnUse" cx="${it.x}" cy="${it.y}" r="${r}"><stop offset="0" stop-color="${c}" stop-opacity="${(.62 * dim).toFixed(2)}"/><stop offset=".55" stop-color="${c}" stop-opacity="${(.3 * dim).toFixed(2)}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
      cones += `<path d="${wedge(it.x, it.y, it.rot, +it.beam || 60, r)}" fill="url(#lg${it.id})"/>`;
    } else if (it.type === 'camera') {
      const on = o.activeCam ? o.activeCam === it.id : true, r = +it.reach || 4, c = it.color || CAM_COLORS[0];
      cones += `<path d="${wedge(it.x, it.y, it.rot, hfov(it), r)}" fill="${c}" fill-opacity="${on ? (o.activeCam ? .16 : .08) : .03}" stroke="${c}" stroke-opacity="${on ? .75 : .2}" stroke-width="${Math.max(.012, px * 1.3)}" stroke-dasharray="${on && o.activeCam ? 'none' : '.08 .06'}"/>`;
    }
  }
  out += cones;
  // walls
  for (const w of p.walls) {
    out += `<line x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke="${INK}" stroke-width="${w.t || .12}" stroke-linecap="square"/>`;
  }
  // items
  for (const it of p.items) {
    const def = LIBMAP[it.type]; if (!def) continue;
    const hitR = Math.max(def.r * (it.s || 1), 20 * px);
    out += `<g data-id="${it.id}" transform="translate(${it.x} ${it.y}) rotate(${it.rot || 0}) scale(${it.s || 1})">${edit ? `<circle r="${hitR / (it.s || 1)}" fill="transparent"/>` : ''}${SHAPES[it.type](it)}</g>`;
  }
  // drawings
  for (const d of p.draws) {
    if (d.type === 'text') { out += `<g data-draw="${d.id}">${txt(d.pts[0][0], d.pts[0][1], d.text, .26 * (d.s || 1), `fill="${d.color || INK}" font-weight="600"`)}</g>`; continue; }
    if (d.type === 'dim') {
      const [a, b] = d.pts, len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const nx = -Math.sin(ang) * .08, ny = Math.cos(ang) * .08, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      let ta = deg(ang); if (ta > 90 || ta < -90) ta += 180;
      out += `<g data-draw="${d.id}"><path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}M${a[0] + nx} ${a[1] + ny}L${a[0] - nx} ${a[1] - ny}M${b[0] + nx} ${b[1] + ny}L${b[0] - nx} ${b[1] - ny}" stroke="#6b6860" stroke-width=".02" stroke-dasharray=".07 .04"/>${txt(mx, my - .06, len.toFixed(2) + ' m', .2, `transform="rotate(${ta.toFixed(1)} ${mx} ${my})" fill="#55524b" font-weight="600"`)}</g>`;
      continue;
    }
    const c = d.color || PEN_COLORS[0];
    out += `<g data-draw="${d.id}"><path d="${smoothPath(d.pts)}" fill="none" stroke="transparent" stroke-width="${Math.max(.2, 22 * px)}"/><path d="${smoothPath(d.pts)}" fill="none" stroke="${c}" stroke-width="${d.type === 'arrow' ? .045 : .03}" stroke-linecap="round" stroke-linejoin="round" ${d.type === 'arrow' ? `marker-end="url(#ar${c.slice(1)})"` : ''}/></g>`;
  }
  // labels
  if (o.labels) {
    for (const it of p.items) {
      const def = LIBMAP[it.type]; if (!def) continue;
      const y = it.y + def.r * (it.s || 1) + .2;
      if (it.cat === 'light') {
        out += txt(it.x, y, itemName(it), .17, 'font-weight="600"');
        out += txt(it.x, y + .19, `${it.watt || 0}W · ${it.mode === 'rgb' ? 'RGB' : (it.mode === 'daylight' ? 5600 : it.k) + 'K'}${(it.dim ?? 100) < 100 ? ' · ' + it.dim + '%' : ''}`, .14, 'fill="#6b6860"');
      } else if (it.type === 'camera') {
        out += txt(it.x, y, `${it.label || 'Cam'} · ${it.lens || 35}mm`, .18, `font-weight="700" fill="${it.color}"`);
      } else if (it.cat === 'person' || it.label) {
        out += txt(it.x, y, itemName(it), .17, 'font-weight="600"');
      }
    }
  }
  // edit overlays: selection + previews
  if (edit) {
    const ac = '#ff5a4e', sw = 2 * px;
    const s = S.sel && findSel();
    if (s && S.sel.t === 'item') {
      const def = LIBMAP[s.type], r = def.r * (s.s || 1) + .12, hr = r + .32, a = rad(s.rot || 0);
      const hx = s.x + Math.cos(a) * hr, hy = s.y + Math.sin(a) * hr;
      out += `<circle cx="${s.x}" cy="${s.y}" r="${r}" fill="none" stroke="${ac}" stroke-width="${sw}" stroke-dasharray="${6 * px} ${4 * px}"/>`;
      out += `<line x1="${s.x + Math.cos(a) * r}" y1="${s.y + Math.sin(a) * r}" x2="${hx}" y2="${hy}" stroke="${ac}" stroke-width="${sw}"/>`;
      out += `<circle data-handle="rot" cx="${hx}" cy="${hy}" r="${11 * px}" fill="#fff" stroke="${ac}" stroke-width="${sw * 1.2}"/><circle data-handle="rot" cx="${hx}" cy="${hy}" r="${22 * px}" fill="transparent"/>`;
    } else if (s && S.sel.t === 'wall') {
      const mx = (s.a[0] + s.b[0]) / 2, my = (s.a[1] + s.b[1]) / 2;
      out += `<line x1="${s.a[0]}" y1="${s.a[1]}" x2="${s.b[0]}" y2="${s.b[1]}" stroke="${ac}" stroke-width="${(s.t || .12) + 4 * px}" stroke-opacity=".45" stroke-linecap="square"/>`;
      for (const k of ['a', 'b']) out += `<circle data-handle="w${k}" cx="${s[k][0]}" cy="${s[k][1]}" r="${10 * px}" fill="#fff" stroke="${ac}" stroke-width="${sw}"/><circle data-handle="w${k}" cx="${s[k][0]}" cy="${s[k][1]}" r="${22 * px}" fill="transparent"/>`;
      out += txt(mx, my - .2, Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]).toFixed(2) + ' m', 15 * px, `fill="${ac}" font-weight="700"`);
    } else if (s && S.sel.t === 'draw') {
      const xs = s.pts.map(p => p[0]), ys = s.pts.map(p => p[1]), pad = .15;
      out += `<rect x="${Math.min(...xs) - pad}" y="${Math.min(...ys) - pad - (s.type === 'text' ? .2 : 0)}" width="${Math.max(...xs) - Math.min(...xs) + pad * 2}" height="${Math.max(...ys) - Math.min(...ys) + pad * 2 + (s.type === 'text' ? .2 : 0)}" fill="none" stroke="${ac}" stroke-width="${sw}" stroke-dasharray="${6 * px} ${4 * px}" rx="${6 * px}"/>`;
    }
    for (const w of p.walls) out += `<line data-wall="${w.id}" x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke="transparent" stroke-width="${Math.max(w.t || .12, 22 * px)}"/>`;
    const pv = S.preview;
    if (pv) {
      if (pv.type === 'wall' || pv.type === 'calib' || pv.type === 'dim') {
        const c = pv.type === 'calib' ? '#2f7cf6' : pv.type === 'dim' ? '#6b6860' : INK;
        const len = Math.hypot(pv.b[0] - pv.a[0], pv.b[1] - pv.a[1]);
        out += `<line x1="${pv.a[0]}" y1="${pv.a[1]}" x2="${pv.b[0]}" y2="${pv.b[1]}" stroke="${c}" stroke-width="${pv.type === 'wall' ? .12 : 3 * px}" stroke-opacity="${pv.type === 'wall' ? .55 : 1}" stroke-linecap="square"/>`;
        out += `<circle cx="${pv.a[0]}" cy="${pv.a[1]}" r="${5 * px}" fill="${ac}"/><circle cx="${pv.b[0]}" cy="${pv.b[1]}" r="${5 * px}" fill="${ac}"/>`;
        out += txt((pv.a[0] + pv.b[0]) / 2, (pv.a[1] + pv.b[1]) / 2 - 16 * px, len.toFixed(2) + ' m', 15 * px, `fill="${ac}" font-weight="700"`);
      } else if (pv.type === 'stroke' && pv.pts.length > 1) {
        out += `<path d="${smoothPath(pv.pts)}" fill="none" stroke="${pv.color}" stroke-width="${pv.arrow ? .045 : .03}" stroke-linecap="round" ${pv.arrow ? `marker-end="url(#ar${pv.color.slice(1)})"` : ''}/>`;
      }
      if (pv.snapPt) out += `<circle cx="${pv.snapPt[0]}" cy="${pv.snapPt[1]}" r="${9 * px}" fill="none" stroke="${ac}" stroke-width="${sw}"/>`;
    }
  }
  return `<defs>${defs}</defs>` + out;
}

function sceneBBox(sc, pad = .6) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y, r = 0) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  const p = sc.plan;
  p.walls.forEach(w => { add(...w.a, .1); add(...w.b, .1); });
  p.items.forEach(it => {
    const r = (LIBMAP[it.type]?.r || .4) * (it.s || 1);
    add(it.x, it.y, r + .5);
  });
  p.draws.forEach(d => d.pts.forEach(pt => add(pt[0], pt[1], .3)));
  if (p.bg) { add(p.bg.x, p.bg.y); add(p.bg.x + p.bg.w, p.bg.y + p.bg.h); }
  if (!isFinite(x0)) return { x: -3, y: -2.5, w: 6, h: 5 };
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const w = Math.max(3, x1 - x0), h = Math.max(2.5, y1 - y0);
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
}

// ---------- editor render ----------
const svg = $('#plan'), stage = $('#stage');
let rafPending = false;
function render() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; renderNow(); });
}
function renderNow() {
  if (!S.scene) return;
  const { x, y, z } = S.view, W = stage.clientWidth, H = stage.clientHeight;
  const grid = { x: -x / z - 1, y: -y / z - 1, w: W / z + 2, h: H / z + 2 };
  grid.x = Math.floor(grid.x); grid.y = Math.floor(grid.y);
  const activeCam = S.activeShot ? S.scene.shots.find(s => s.id === S.activeShot)?.cam : null;
  svg.innerHTML = `<g transform="translate(${x} ${y}) scale(${z})">${planSVG(S.scene, { edit: true, px: 1 / z, grid, labels: S.labels, activeCam })}</g>`;
}
function fitView(sc = S.scene) {
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return;
  const narrow = innerWidth <= 820;
  const padL = 70, padB = narrow ? 70 : 20, padT = 56;
  const bb = sceneBBox(sc, .3);
  const z = clamp(Math.min((W - padL - 20) / bb.w, (H - padT - padB) / bb.h), 10, 400);
  S.view = { z, x: padL + (W - padL - 20) / 2 - (bb.x + bb.w / 2) * z, y: padT + (H - padT - padB) / 2 - (bb.y + bb.h / 2) * z };
  render();
}
function zoomAt(f, cx, cy) {
  const v = S.view, nz = clamp(v.z * f, 8, 600);
  v.x = cx - (cx - v.x) * nz / v.z; v.y = cy - (cy - v.y) * nz / v.z; v.z = nz;
  render();
}
function viewCenter() {
  const W = stage.clientWidth, H = stage.clientHeight * (innerWidth <= 820 ? .42 : .5);
  return [r2((W / 2 - S.view.x) / S.view.z), r2((H - S.view.y) / S.view.z)];
}

// ---------- tools ----------
const IC = {
  select: '<path d="M5 3l14 8-6 1.5L10 19z"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  room: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 13h6v7M14 4v6h6"/>',
  wall: '<path d="M4 20L20 4" stroke-width="4"/>',
  arrow: '<path d="M4 18c4-1 6-8 14-11"/><path d="M13 6l5 1-2 5"/>',
  pen: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
  dim: '<path d="M3 15l12-12 6 6L9 21z"/><path d="M7 11l2 2M10 8l2 2M13 5l2 2"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  labels: '<path d="M4 7h16M4 12h10M4 17h13"/>',
};
const TOOLS = [
  { id: 'select', t: 'เลือก / ย้าย / หมุน' },
  { id: 'add', t: 'เพิ่มไฟ กล้อง คน พร็อพ', act: () => openLibrary() },
  { id: 'room', t: 'สร้างห้อง / นำเข้าแปลนสแกน', act: () => openRoom() },
  { sep: 1 },
  { id: 'wall', t: 'วาดผนัง' },
  { id: 'arrow', t: 'ลูกศรการเคลื่อนไหว' },
  { id: 'pen', t: 'ปากกา' },
  { id: 'dim', t: 'วัดระยะ' },
  { id: 'text', t: 'ข้อความ' },
  { sep: 1 },
  { id: 'color', t: 'สีปากกา / ลูกศร', act: () => { S.pen = PEN_COLORS[(PEN_COLORS.indexOf(S.pen) + 1) % PEN_COLORS.length]; renderTools(); } },
  { id: 'labels', t: 'แสดง / ซ่อนป้ายชื่อ', act: () => { S.labels = !S.labels; renderTools(); render(); } },
];
const HINTS = {
  wall: 'ลากเพื่อวาดผนัง · ปลายผนังจะดูดติดกันและล็อกมุม 45°',
  arrow: 'ลากเพื่อวาดเส้นการเดินของนักแสดง / การเคลื่อนกล้อง',
  pen: 'วาดโน้ตด้วยมือได้อิสระ',
  dim: 'ลากเพื่อวัดระยะ (เมตร)',
  text: 'แตะตรงที่ต้องการใส่ข้อความ',
  calib: 'ลากเส้นทับระยะที่รู้ความยาวจริงบนภาพ เช่น ความกว้างผนัง',
};
function renderTools() {
  $('#tools').innerHTML = TOOLS.map(t => {
    if (t.sep) return '<div class="tsep"></div>';
    const on = S.tool === t.id || (t.id === 'labels' && S.labels);
    const inner = t.id === 'color' ? `<span class="dot" style="background:${S.pen}"></span>` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[t.id]}</svg>`;
    return `<button class="tool${on ? ' on' : ''}" data-tool="${t.id}" title="${t.t}" aria-label="${t.t}">${inner}</button>`;
  }).join('');
  $('#hint').textContent = HINTS[S.tool] || '';
}
$('#tools').addEventListener('click', e => {
  const b = e.target.closest('[data-tool]'); if (!b) return;
  const t = TOOLS.find(x => x.id === b.dataset.tool);
  if (t.act) return t.act();
  setTool(t.id);
});
function setTool(id) { S.tool = id; S.preview = null; renderTools(); render(); }

// ---------- pointer interaction ----------
const ptrs = new Map();
let op = null, pinch = null;
function toWorld(cx, cy) { const r = svg.getBoundingClientRect(); return [(cx - r.left - S.view.x) / S.view.z, (cy - r.top - S.view.y) / S.view.z]; }
function local(cx, cy) { const r = svg.getBoundingClientRect(); return [cx - r.left, cy - r.top]; }
function wallEnds(exclude) { const pts = []; P().walls.forEach(w => { if (w.id !== exclude) pts.push(w.a, w.b); }); return pts; }
function snapPoint(w, from, exclude) {
  const tol = 14 / S.view.z;
  let best = null, bd = tol;
  for (const p of wallEnds(exclude)) { const d = Math.hypot(p[0] - w[0], p[1] - w[1]); if (d < bd) { bd = d; best = p; } }
  if (best) return { pt: [best[0], best[1]], snapped: true };
  let p = [Math.round(w[0] * 20) / 20, Math.round(w[1] * 20) / 20];
  if (from) {
    const ang = deg(Math.atan2(p[1] - from[1], p[0] - from[0])), len = Math.hypot(p[0] - from[0], p[1] - from[1]);
    const near = Math.round(ang / 45) * 45;
    if (Math.abs(ang - near) < 7) p = [r2(from[0] + Math.cos(rad(near)) * len), r2(from[1] + Math.sin(rad(near)) * len)];
  }
  return { pt: p, snapped: false };
}
function selectThing(sel) {
  const changed = JSON.stringify(sel) !== JSON.stringify(S.sel);
  S.sel = sel;
  if (changed) { renderPanel(); if (sel) openPanel(); }
  render();
}
svg.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  svg.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    if (op && op.kind === 'stroke') S.preview = null;
    op = null;
    const [a, b] = [...ptrs.values()];
    const m = local((a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), m, v: { ...S.view } };
    return;
  }
  if (ptrs.size > 2) return;
  const w = toWorld(e.clientX, e.clientY), t = e.target;
  const start = { cx: e.clientX, cy: e.clientY, w };
  const tool = S.tool;
  if (tool === 'select') {
    const h = t.closest('[data-handle]'), g = t.closest('[data-id]'), wl = t.closest('[data-wall]'), dr = t.closest('[data-draw]');
    if (h) {
      const hd = h.dataset.handle;
      op = hd === 'rot' ? { kind: 'rot', ...start } : { kind: 'wallEnd', end: hd[1], ...start };
    } else if (g) {
      const it = getItem(g.dataset.id);
      selectThing({ t: 'item', id: it.id });
      op = { kind: 'move', off: [w[0] - it.x, w[1] - it.y], ...start };
    } else if (dr) {
      const d = P().draws.find(x => x.id === dr.dataset.draw);
      selectThing({ t: 'draw', id: d.id });
      op = { kind: 'moveDraw', orig: clone(d.pts), ...start };
    } else if (wl) {
      const wa = P().walls.find(x => x.id === wl.dataset.wall);
      selectThing({ t: 'wall', id: wa.id });
      op = { kind: 'moveWall', orig: { a: [...wa.a], b: [...wa.b] }, ...start };
    } else {
      if (S.sel) selectThing(null);
      if (S.activeShot) { S.activeShot = null; renderPanel(); }
      op = { kind: 'pan', v: { ...S.view }, ...start };
    }
  } else if (tool === 'wall' || tool === 'dim' || tool === 'calib') {
    const a = snapPoint(w).pt;
    op = { kind: tool, a, ...start };
    S.preview = { type: tool, a, b: a };
  } else if (tool === 'arrow' || tool === 'pen') {
    op = { kind: 'stroke', ...start };
    S.preview = { type: 'stroke', pts: [w], color: S.pen, arrow: tool === 'arrow' };
  } else if (tool === 'text') {
    op = { kind: 'text', ...start };
  }
  render();
});
svg.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), m = local((a.x + b.x) / 2, (a.y + b.y) / 2);
    const z = clamp(pinch.v.z * d / pinch.d, 8, 600);
    const wx = (pinch.m[0] - pinch.v.x) / pinch.v.z, wy = (pinch.m[1] - pinch.v.y) / pinch.v.z;
    S.view = { z, x: m[0] - wx * z, y: m[1] - wy * z };
    render(); return;
  }
  if (!op) return;
  const w = toWorld(e.clientX, e.clientY);
  const moved = Math.hypot(e.clientX - op.cx, e.clientY - op.cy) > 3;
  if (!moved && !op.moved) return;
  const first = !op.moved; op.moved = true;
  const s = findSel();
  switch (op.kind) {
    case 'pan': S.view.x = op.v.x + e.clientX - op.cx; S.view.y = op.v.y + e.clientY - op.cy; break;
    case 'move': if (first) snap(); s.x = r2(w[0] - op.off[0]); s.y = r2(w[1] - op.off[1]); break;
    case 'rot': {
      if (first) snap();
      let a = deg(Math.atan2(w[1] - s.y, w[0] - s.x));
      const n = Math.round(a / 15) * 15; if (Math.abs(a - n) < 4) a = n;
      s.rot = Math.round(normDeg(a)); break;
    }
    case 'wallEnd': {
      if (first) snap();
      const other = op.end === 'a' ? s.b : s.a, r = snapPoint(w, other, s.id);
      s[op.end] = r.pt; S.preview = r.snapped ? { type: 'none', snapPt: r.pt } : null; break;
    }
    case 'moveWall': {
      if (first) snap();
      const dx = Math.round((w[0] - op.w[0]) * 20) / 20, dy = Math.round((w[1] - op.w[1]) * 20) / 20;
      s.a = [r2(op.orig.a[0] + dx), r2(op.orig.a[1] + dy)]; s.b = [r2(op.orig.b[0] + dx), r2(op.orig.b[1] + dy)]; break;
    }
    case 'moveDraw': {
      if (first) snap();
      const dx = w[0] - op.w[0], dy = w[1] - op.w[1];
      s.pts = op.orig.map(p => [r2(p[0] + dx), r2(p[1] + dy)]); break;
    }
    case 'wall': case 'dim': case 'calib': {
      const r = snapPoint(w, op.a);
      S.preview = { type: op.kind, a: op.a, b: r.pt, snapPt: r.snapped ? r.pt : null }; break;
    }
    case 'stroke': {
      const pts = S.preview.pts, l = pts[pts.length - 1];
      if (Math.hypot(w[0] - l[0], w[1] - l[1]) > 4 / S.view.z) pts.push([r2(w[0]), r2(w[1])]);
      break;
    }
  }
  render();
  if (op.kind === 'move' || op.kind === 'rot') syncInspectorPos();
});
function endPointer(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; op = null; return; }
  if (!op) return;
  const o = op; op = null;
  const pv = S.preview;
  if (o.kind === 'wall' && pv) {
    if (Math.hypot(pv.b[0] - pv.a[0], pv.b[1] - pv.a[1]) >= .1) { snap(); P().walls.push({ id: uid(), a: pv.a, b: pv.b, t: .12 }); save(); }
    S.preview = null;
  } else if (o.kind === 'dim' && pv) {
    if (Math.hypot(pv.b[0] - pv.a[0], pv.b[1] - pv.a[1]) >= .1) { snap(); P().draws.push({ id: uid(), type: 'dim', pts: [pv.a, pv.b] }); save(); }
    S.preview = null;
  } else if (o.kind === 'calib' && pv) {
    S.preview = null;
    const len = Math.hypot(pv.b[0] - pv.a[0], pv.b[1] - pv.a[1]);
    setTool('select');
    if (len > .05) calibrate(pv.a, len);
  } else if (o.kind === 'stroke' && pv) {
    if (pv.pts.length > 1) { snap(); P().draws.push({ id: uid(), type: S.tool === 'arrow' ? 'arrow' : 'pen', pts: simplify(pv.pts), color: pv.color }); save(); }
    S.preview = null;
  } else if (o.kind === 'text') {
    const t = prompt('ข้อความบนแปลน');
    if (t && t.trim()) { snap(); const d = { id: uid(), type: 'text', pts: [[r2(o.w[0]), r2(o.w[1])]], text: t.trim(), color: S.pen === PEN_COLORS[0] ? INK : S.pen }; P().draws.push(d); save(); setTool('select'); selectThing({ t: 'draw', id: d.id }); }
  } else if (o.moved && ['move', 'rot', 'wallEnd', 'moveWall', 'moveDraw'].includes(o.kind)) {
    if (o.kind === 'wallEnd') S.preview = null;
    save(); renderPanel();
  }
  render();
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener('wheel', e => {
  e.preventDefault();
  const [cx, cy] = local(e.clientX, e.clientY);
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * .01), cx, cy);
  else if (e.deltaMode === 0 && Math.abs(e.deltaY) < 50 && !Number.isInteger(e.deltaY) || e.shiftKey) { S.view.x -= e.deltaX; S.view.y -= e.deltaY; render(); }
  else zoomAt(Math.exp(-e.deltaY * .0015), cx, cy);
}, { passive: false });
function simplify(pts) {
  const out = [pts[0]];
  for (const p of pts) { const l = out[out.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > .08) out.push(p); }
  const last = pts[pts.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
$('#zoom').addEventListener('click', e => {
  const z = e.target.closest('[data-z]')?.dataset.z; if (!z) return;
  if (z === 'fit') return fitView();
  zoomAt(z === 'in' ? 1.25 : .8, stage.clientWidth / 2, stage.clientHeight / 2);
});
addEventListener('keydown', e => {
  if ($('#editor').hidden || e.target.closest('input,textarea,select') || $('.mback')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undoRedo(e.shiftKey ? 1 : -1); }
  else if (mod && e.key.toLowerCase() === 'd' && S.sel?.t === 'item') { e.preventDefault(); duplicateSel(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { e.preventDefault(); deleteSel(); }
  else if (e.key === 'Escape') { setTool('select'); selectThing(null); }
  else if (e.key.toLowerCase() === 'r' && S.sel?.t === 'item') { snap(); findSel().rot = normDeg((findSel().rot || 0) + (e.shiftKey ? -15 : 15)); save(); render(); syncInspectorPos(); }
  else if (!mod) { const m = { v: 'select', w: 'wall', a: 'arrow', p: 'pen', m: 'dim', t: 'text' }[e.key.toLowerCase()]; if (m) setTool(m); }
});
new ResizeObserver(() => render()).observe(stage);

function deleteSel() {
  const s = S.sel; if (!s) return;
  snap();
  if (s.t === 'item') {
    P().items = P().items.filter(i => i.id !== s.id);
    S.scene.shots.forEach(sh => { if (sh.cam === s.id) sh.cam = null; });
  } else if (s.t === 'wall') P().walls = P().walls.filter(w => w.id !== s.id);
  else P().draws = P().draws.filter(d => d.id !== s.id);
  S.sel = null; save(); render(); renderPanel();
}
function duplicateSel() {
  const it = findSel(); if (!it || S.sel.t !== 'item') return;
  snap();
  const n = { ...clone(it), id: uid(), x: r2(it.x + .5), y: r2(it.y + .5) };
  if (n.type === 'camera') { n.label = nextCamLabel(S.scene); n.color = CAM_COLORS[cams().length % CAM_COLORS.length]; }
  P().items.push(n); save(); selectThing({ t: 'item', id: n.id });
}

// ---------- panel ----------
const panel = $('#panel'), pbody = $('.pbody');
function openPanel() { panel.classList.remove('min'); }
$('.ptabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) { panel.classList.toggle('min'); return; }
  if (innerWidth <= 820 && S.tab === b.dataset.tab && !S.sel && !panel.classList.contains('min')) { panel.classList.add('min'); return; }
  S.tab = b.dataset.tab; S.sel = null; openPanel(); renderPanel(); render();
});
function fieldHTML(f, v) {
  const u = f.unit ? ` ${f.unit}` : '';
  const lab = `<span>${f.label}${f.type === 'range' ? ` <b data-out="${f.k}">${v ?? ''}${u}</b>` : ''}</span>`;
  switch (f.type) {
    case 'select': return `<label class="fld">${lab}<select data-k="${f.k}">${f.opts.map(o => { const [val, name] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(name)}</option>`; }).join('')}</select></label>`;
    case 'range': return `<label class="fld">${lab}<input type="range" data-k="${f.k}" data-unit="${f.unit || ''}" min="${f.min}" max="${f.max}" step="${f.step || 1}" value="${v ?? f.min}"></label>`;
    case 'textarea': return `<label class="fld">${lab}<textarea data-k="${f.k}" placeholder="${esc(f.ph || '')}">${esc(v)}</textarea></label>`;
    case 'check': return `<label class="fld chk"><input type="checkbox" data-k="${f.k}"${v ? ' checked' : ''}><span style="color:var(--text)">${f.label}</span></label>`;
    case 'color': return `<label class="fld">${lab}<input type="color" data-k="${f.k}" value="${esc(v || '#ffffff')}" style="height:40px;padding:4px"></label>`;
    default: return `<label class="fld">${lab}<input type="${f.type || 'text'}" data-k="${f.k}" value="${esc(v)}" ${f.type === 'number' ? `step="${f.step || 'any'}" inputmode="decimal"` : ''} placeholder="${esc(f.ph || '')}"></label>`;
  }
}
function bindFields(root, obj, onChange, undoable = true) {
  $$('[data-k]', root).forEach(el => {
    let snapped = false;
    const start = () => { if (!snapped && undoable) { snap(); snapped = true; } };
    el.addEventListener('focus', start);
    el.addEventListener('pointerdown', start);
    el.addEventListener('blur', () => { snapped = false; });
    el.addEventListener('change', () => { snapped = false; });
    el.addEventListener('input', () => {
      start();
      let v = el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range') ? parseFloat(el.value) : el.value;
      if (typeof v === 'number' && Number.isNaN(v)) return;
      obj[el.dataset.k] = v;
      const out = $(`[data-out="${el.dataset.k}"]`, root);
      if (out) out.textContent = v + (el.dataset.unit ? ' ' + el.dataset.unit : '');
      onChange && onChange(el.dataset.k, v);
      save(); render();
    });
  });
}
function miniIcon(type, it) {
  const d = LIBMAP[type], k = .62 / d.r;
  const obj = it || { ...d.d, color: type === 'camera' ? CAM_COLORS[0] : d.d.color };
  return `<svg viewBox="-.75 -.75 1.5 1.5" xmlns="http://www.w3.org/2000/svg"><g transform="scale(${k})${['tube', 'reflector', 'bounce', 'flag', 'diffusion', 'tv', 'sofa', 'table', 'desk', 'cabinet', 'window', 'door'].includes(type) ? ' rotate(0)' : ''}">${SHAPES[type](obj)}</g></svg>`;
}
function renderPanel() {
  if (!S.scene) return;
  $$('.ptabs [data-tab]').forEach(b => b.classList.toggle('on', !S.sel && b.dataset.tab === S.tab));
  const s = findSel();
  if (s) return renderInspector(s);
  if (S.tab === 'shots') return renderShots();
  if (S.tab === 'lights') return renderLights();
  return renderSceneTab();
}
function syncInspectorPos() {
  const s = findSel(); if (!s || S.sel.t !== 'item') return;
  const r = $('[data-k="rot"]', pbody); if (r && document.activeElement !== r) r.value = s.rot;
}
function inspectorFields(it) {
  const base = [];
  if (it.cat === 'light') {
    base.push(
      { k: 'label', label: 'ชื่อ / หน้าที่', ph: 'เช่น Key, Fill, Back light' },
      { k: 'model', label: 'ยี่ห้อ / รุ่น', ph: 'เช่น Aputure 300x' },
      { row: [{ k: 'watt', label: 'วัตต์', type: 'number', unit: 'W' }, { k: 'mode', label: 'ประเภทสี', type: 'select', opts: [['daylight', 'Daylight'], ['bicolor', 'Bi-color'], ['rgb', 'RGB']] }] },
    );
    if (it.mode === 'bicolor') base.push({ k: 'k', label: 'อุณหภูมิสี', type: 'range', min: 2700, max: 6500, step: 100, unit: 'K', chips: true });
    if (it.mode === 'rgb') base.push({ row: [{ k: 'color', label: 'สี', type: 'color' }, { k: 'k', label: 'หรือ CCT (K)', type: 'number' }] });
    base.push(
      { k: 'dim', label: 'Dimmer', type: 'range', min: 0, max: 100, unit: '%' },
      { k: 'mod', label: 'Modifier', type: 'select', opts: MODIFIERS },
      { row: [{ k: 'beam', label: 'มุมลำแสง', type: 'range', min: 10, max: 360, step: 5, unit: '°' }, { k: 'reach', label: 'ระยะแสง', type: 'range', min: .5, max: 15, step: .5, unit: 'm' }] },
    );
  } else if (it.type === 'camera') {
    base.push(
      { row: [{ k: 'label', label: 'ชื่อกล้อง', ph: 'A' }, { k: 'body', label: 'บอดี้', ph: 'เช่น FX3, BMPCC 6K' }] },
      { row: [{ k: 'sensor', label: 'เซนเซอร์', type: 'select', opts: Object.entries(SENSORS).map(([k, v]) => [k, v[0]]) }, { k: 'lens', label: 'เลนส์', type: 'number', unit: 'mm' }] },
      { k: 'reach', label: 'ระยะแสดง FOV', type: 'range', min: 1, max: 12, step: .5, unit: 'm' },
      { k: 'height', label: 'ความสูงกล้อง', type: 'number', unit: 'm', step: .1 },
      { k: 'color', label: 'สีกล้อง', type: 'select', opts: CAM_COLORS.map((c, i) => [c, ['แดง', 'น้ำเงิน', 'เขียว', 'ม่วง', 'ส้ม', 'ฟ้า'][i]]) },
    );
  } else if (it.cat === 'person') {
    base.push({ k: 'label', label: 'ชื่อ / บทบาท', ph: 'เช่น แขกรับเชิญ, Director' }, { k: 'color', label: 'สี', type: 'select', opts: PERSON_COLORS.map((c, i) => [c, ['เหลือง', 'แดง', 'น้ำเงิน', 'เขียว', 'ม่วง', 'เทา'][i]]) });
  } else if (it.type === 'window') {
    base.push({ k: 'label', label: 'ชื่อ', ph: 'เช่น หน้าต่างทิศตะวันตก' }, { k: 'sun', label: 'แสดงแสงที่เข้ามาจากหน้าต่าง', type: 'check' }, { k: 'k', label: 'อุณหภูมิแสง', type: 'range', min: 2700, max: 7500, step: 100, unit: 'K', chips: true }, { row: [{ k: 'beam', label: 'มุมแสง', type: 'range', min: 30, max: 180, step: 5, unit: '°' }, { k: 'reach', label: 'ระยะ', type: 'range', min: 1, max: 10, step: .5, unit: 'm' }] });
  } else {
    base.push({ k: 'label', label: 'ชื่อ / ป้าย', ph: 'แสดงบนแปลน (ถ้าใส่)' });
  }
  base.push({ row: [{ k: 'rot', label: 'หมุน', type: 'number', unit: '°' }, { k: 's', label: it.type === 'tube' ? 'ความยาว (×1.2 m)' : 'ขนาด (เท่า)', type: 'number', step: .1 }] });
  if (it.cat === 'light' || it.type === 'camera') base.push({ k: 'notes', label: 'โน้ต', type: 'textarea' });
  return base;
}
function renderInspector(s) {
  const t = S.sel.t;
  if (t === 'wall') {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    pbody.innerHTML = `<div class="insp-head"><div class="grow"><b>ผนัง</b><small class="muted">ยาว ${len.toFixed(2)} m · ลากจุดปลายเพื่อปรับ</small></div></div>
      <div class="grid2">${fieldHTML({ k: 'len', label: 'ความยาว', type: 'number', unit: 'm', step: .05 }, r2(len))}${fieldHTML({ k: 't', label: 'ความหนา', type: 'number', unit: 'm', step: .01 }, s.t || .12)}</div>
      <div class="acts"><button class="btn danger" data-act="del">ลบผนัง</button><button class="btn" data-act="done">เสร็จ</button></div>`;
    const proxy = { len: r2(len), t: s.t || .12 };
    bindFields(pbody, proxy, (k, v) => {
      if (k === 't') s.t = clamp(v, .02, .6);
      else if (v > .05) { const a = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]); s.b = [r2(s.a[0] + Math.cos(a) * v), r2(s.a[1] + Math.sin(a) * v)]; }
    });
  } else if (t === 'draw') {
    const name = { arrow: 'ลูกศรการเคลื่อนไหว', pen: 'เส้นปากกา', dim: 'เส้นวัดระยะ', text: 'ข้อความ' }[s.type];
    pbody.innerHTML = `<div class="insp-head"><div class="grow"><b>${name}</b><small class="muted">ลากเพื่อย้าย</small></div></div>
      ${s.type === 'text' ? fieldHTML({ k: 'text', label: 'ข้อความ' }, s.text) + fieldHTML({ k: 's', label: 'ขนาดตัวอักษร (เท่า)', type: 'number', step: .1 }, s.s || 1) : ''}
      ${s.type !== 'dim' ? `<div class="fld"><span>สี</span><div class="chipk">${PEN_COLORS.map(c => `<button data-color="${c}" style="${s.color === c ? 'border-color:' + c : ''}"><i style="background:${c}"></i>${c === s.color ? '✓' : ''}</button>`).join('')}</div></div>` : ''}
      <div class="acts"><button class="btn danger" data-act="del">ลบ</button><button class="btn" data-act="done">เสร็จ</button></div>`;
    bindFields(pbody, s);
    $$('[data-color]', pbody).forEach(b => b.onclick = () => { snap(); s.color = b.dataset.color; save(); render(); renderPanel(); });
  } else {
    const def = LIBMAP[s.type];
    const fields = inspectorFields(s);
    let html = `<div class="insp-head"><div class="ico">${miniIcon(s.type, s)}</div><div class="grow"><b>${esc(itemName(s))}</b><small class="muted">${def.name}</small></div><button class="ib" data-act="done" aria-label="ปิด"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;
    for (const f of fields) {
      if (f.row) html += `<div class="grid2">${f.row.map(x => fieldHTML(x, s[x.k])).join('')}</div>`;
      else {
        html += fieldHTML(f, s[f.k]);
        if (f.chips) html += `<div class="chipk">${K_PRESETS.map(k => `<button data-kset="${k}"><i style="background:${kColor(k)}"></i>${k}K</button>`).join('')}</div>`;
      }
    }
    if (s.type === 'camera') {
      const linked = S.scene.shots.filter(sh => sh.cam === s.id);
      html += `<div class="note">มุมรับภาพแนวนอน ≈ <b style="color:var(--text)">${hfov(s).toFixed(1)}°</b> (${SENSORS[s.sensor]?.[0] || ''}, ${s.lens}mm)</div>
        <h4>ช็อตจากกล้องตัวนี้ (${linked.length})</h4><div class="list">${linked.map(shotCard).join('') || '<small class="muted">ยังไม่มีช็อต</small>'}</div>
        <div class="acts"><button class="btn primary" data-act="addshot">+ เพิ่มช็อตจากกล้องนี้</button></div>`;
    }
    html += `<h4>จัดการ</h4><div class="acts"><button class="btn" data-act="rot90">หมุน 90°</button><button class="btn" data-act="dup">ทำซ้ำ</button>${s.cat === 'light' ? '<button class="btn" data-act="tokit">บันทึกลงชุดไฟ</button>' : ''}<button class="btn danger" data-act="del">ลบ</button></div>`;
    pbody.innerHTML = html;
    bindFields(pbody, s, k => {
      if (k === 'mode' || k === 'sun') renderPanel();
      if (k === 's') s.s = clamp(s.s, .2, 8);
      if (['label', 'body', 'lens', 'sensor'].includes(k)) {
        const hb = $('.insp-head b', pbody); if (hb) hb.textContent = itemName(s);
        if (k === 'lens' || k === 'sensor') { const n = $('.note b', pbody); if (n) n.textContent = hfov(s).toFixed(1) + '°'; }
      }
    });
    $$('[data-kset]', pbody).forEach(b => b.onclick = () => { snap(); s.k = +b.dataset.kset; save(); render(); renderPanel(); });
    bindShotCards(pbody);
  }
  $$('[data-act]', pbody).forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'del') deleteSel();
    else if (a === 'done') selectThing(null);
    else if (a === 'dup') duplicateSel();
    else if (a === 'rot90') { snap(); s.rot = normDeg((s.rot || 0) + 90); save(); render(); renderPanel(); }
    else if (a === 'addshot') addShot(s.id);
    else if (a === 'tokit') { S.kit.push({ id: uid(), model: s.model || s.label || LIBMAP[s.type].name, type: s.type, watt: s.watt, mode: s.mode }); DB.setMeta('kit', S.kit); toast('บันทึกลงชุดไฟของฉันแล้ว'); }
  });
}

// shots
function shotCard(sh) {
  const cam = getItem(sh.cam), src = sh.photo && S.proj.photos[sh.photo];
  const c = cam?.color || '#8b8d98';
  return `<div class="li shot${S.activeShot === sh.id ? ' on' : ''}" data-shot="${sh.id}" role="button" tabindex="0">
    <div class="th" style="${src ? `background-image:url(${src})` : `background:${c}`}"><em>${esc(sh.num)}</em>${src ? '' : esc(cam ? cam.label : '—')}</div>
    <div class="grow"><b><span class="sw" style="background:${c}"></span>${esc(sh.num)} · ${esc(sh.size)}${sh.lens ? ' · ' + sh.lens + 'mm' : ''}</b><small>${esc([sh.move, sh.angle, cam ? 'กล้อง ' + cam.label : 'ยังไม่ผูกกล้อง'].filter(Boolean).join(' · '))}</small>${sh.desc ? `<p>${esc(sh.desc)}</p>` : ''}</div>
    <button class="ib" data-editshot="${sh.id}" aria-label="แก้ไขช็อต"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1L19 8l-3-3L5 16z"/></svg></button></div>`;
}
function bindShotCards(root) {
  $$('[data-shot]', root).forEach(el => el.addEventListener('click', e => {
    if (e.target.closest('[data-editshot]')) return openShot(el.dataset.shot);
    S.activeShot = S.activeShot === el.dataset.shot ? null : el.dataset.shot;
    $$('[data-shot]', root).forEach(x => x.classList.toggle('on', x.dataset.shot === S.activeShot));
    render();
  }));
}
function renderShots() {
  const sc = S.scene, list = sc.shots;
  pbody.innerHTML = `<h3>Shot list <small class="muted">${list.length} ช็อต</small><span class="sp"></span><button class="btn primary sm" id="addShot">+ ช็อต</button></h3>
    ${list.length ? `<div class="list">${list.map(shotCard).join('')}</div><p class="muted" style="font-size:12px;margin-top:12px">แตะการ์ดเพื่อไฮไลต์มุมกล้องบนแปลน · แตะดินสอเพื่อแก้ไข ใส่ภาพบล็อก / reference</p>`
      : `<div class="note">ยังไม่มีช็อตในซีนนี้<br>วางกล้องบนแปลน แล้วกด <b>+ ช็อต</b> ช็อตจะผูกกับกล้อง เลนส์ และมุมที่วางไว้ แนบภาพบล็อกช็อตหรือภาพ reference ได้</div>`}`;
  $('#addShot').onclick = () => addShot();
  bindShotCards(pbody);
}
function addShot(camId) {
  const sc = S.scene;
  const cam = camId ? getItem(camId) : (S.sel?.t === 'item' && findSel()?.type === 'camera' ? findSel() : cams()[0]);
  snap();
  const letter = String.fromCharCode(65 + (sc.shots.length % 26));
  const sh = { id: uid(), num: `${sc.number || ''}${letter}`, size: 'MS', angle: ANGLES[0], move: 'Static', lens: cam ? cam.lens : 35, cam: cam ? cam.id : null, subject: '', desc: '', setup: '', notes: '', photo: null };
  sc.shots.push(sh); save();
  S.activeShot = sh.id;
  renderPanel(); render();
  openShot(sh.id, true);
}

function renderLights() {
  const sc = S.scene, L = lights(), total = L.reduce((a, l) => a + (+l.watt || 0), 0);
  const draw = L.reduce((a, l) => a + (+l.watt || 0) * (l.dim ?? 100) / 100, 0);
  const others = sc.plan.items.filter(i => i.cat !== 'light' && i.cat !== 'set');
  pbody.innerHTML = `<h3>ไฟในซีนนี้</h3>
    <div class="stat"><div><b>${total.toLocaleString()} W</b><small>รวมวัตต์ทั้งหมด (${L.length} ดวง)</small></div><div><b>${(draw / 220).toFixed(1)} A</b><small>กระแสโดยประมาณที่ 220V (ตาม dimmer)</small></div></div>
    <div class="list">${L.map(l => `<button class="li" data-pick="${l.id}"><span class="sw" style="background:${lightColor(l)};box-shadow:0 0 0 1px #0002"></span><span class="grow"><b>${esc(itemName(l))}</b><small>${esc([l.model && l.label ? l.model : '', LIBMAP[l.type].name, l.watt + 'W', l.mode === 'rgb' ? 'RGB' : (l.mode === 'daylight' ? 5600 : l.k) + 'K', (l.dim ?? 100) + '%', l.mod !== '—' ? l.mod : ''].filter(Boolean).join(' · '))}</small></span></button>`).join('') || '<div class="note">ยังไม่มีไฟ กด + ที่แถบเครื่องมือเพื่อเพิ่มไฟ หรือเลือกจากชุดไฟของคุณ</div>'}</div>
    <div class="acts" style="margin-top:10px"><button class="btn primary sm" id="addLight">+ เพิ่มไฟ</button><button class="btn sm" id="editKit">ชุดไฟของฉัน (${S.kit.length})</button></div>
    <h4>กล้อง คน และกริป</h4>
    <div class="list">${others.map(o => `<button class="li" data-pick="${o.id}"><span class="sw" style="background:${o.color || '#8b8d98'}"></span><span class="grow"><b>${esc(itemName(o))}</b><small>${esc(LIBMAP[o.type].name)}${o.type === 'camera' ? ' · ' + o.lens + 'mm · FOV ' + hfov(o).toFixed(0) + '°' : ''}</small></span></button>`).join('') || '<small class="muted">—</small>'}</div>`;
  $$('[data-pick]', pbody).forEach(b => b.onclick = () => selectThing({ t: 'item', id: b.dataset.pick }));
  $('#addLight').onclick = () => openLibrary('light');
  $('#editKit').onclick = openKit;
}
function renderSceneTab() {
  const sc = S.scene, bg = sc.plan.bg;
  pbody.innerHTML = `<h3>รายละเอียดซีน</h3>
    <div class="grid2" style="grid-template-columns:90px 1fr">${fieldHTML({ k: 'number', label: 'ซีนที่' }, sc.number)}${fieldHTML({ k: 'name', label: 'ชื่อซีน' }, sc.name)}</div>
    <div class="grid2">${fieldHTML({ k: 'location', label: 'โลเคชัน / ห้อง', ph: 'เช่น บ้าน · ห้องนั่งเล่น' }, sc.location)}${fieldHTML({ k: 'time', label: 'ช่วงเวลา', type: 'select', opts: TIMES }, sc.time)}</div>
    ${fieldHTML({ k: 'notes', label: 'โน้ตซีน', type: 'textarea', ph: 'โทนภาพ, mood, สิ่งที่ทีมต้องรู้' }, sc.notes)}
    <h4>แปลนห้อง</h4>
    <div class="acts"><button class="btn sm" id="sRoom">สร้างห้อง / นำเข้าแปลน</button>${bg ? '<button class="btn sm" id="sCalib">ตั้งสเกลภาพ</button><button class="btn sm danger" id="sBgDel">ลบภาพพื้นหลัง</button>' : ''}</div>
    ${bg ? `<div style="margin-top:10px">${fieldHTML({ k: 'op', label: 'ความชัดภาพพื้นหลัง', type: 'range', min: .1, max: 1, step: .05 }, bg.op ?? .6)}</div>` : ''}
    <h4>ซีน</h4>
    <div class="acts"><button class="btn sm" id="sDup">ทำซ้ำซีนนี้ (คัดลอกแปลน)</button><button class="btn sm danger" id="sDel">ลบซีน</button></div>`;
  bindFields(pbody, sc, k => { if (k === 'name' || k === 'number') updateTitle(); });
  if (bg) {
    const opEl = $('[data-k="op"]', pbody);
    opEl.oninput = () => { sc.plan.bg.op = +opEl.value; $('[data-out="op"]', pbody).textContent = opEl.value; save(); render(); };
    $('#sCalib').onclick = startCalib;
    $('#sBgDel').onclick = () => { snap(); sc.plan.bg = null; save(); render(); renderPanel(); };
  }
  $('#sRoom').onclick = openRoom;
  $('#sDup').onclick = () => duplicateScene(sc);
  $('#sDel').onclick = () => deleteScene(sc);
}

// ---------- modals ----------
function modal(html, { wide, onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'mback';
  back.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog">${html}</div>`;
  document.body.appendChild(back);
  const m = back.firstChild;
  const close = () => { back.remove(); onClose && onClose(); };
  back.addEventListener('pointerdown', e => { if (e.target === back) back.dataset.down = 1; });
  back.addEventListener('click', e => { if (e.target === back && back.dataset.down) close(); delete back.dataset.down; });
  $$('[data-close]', m).forEach(b => b.onclick = close);
  m.close = close;
  return m;
}
const closeX = '<button class="ib x" data-close aria-label="ปิด"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 2200); }
function pickFile(accept) {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.style.display = 'none';
    i.onchange = () => { res(i.files[0] || null); i.remove(); };
    document.body.appendChild(i); i.click();
  });
}
async function fileToJPEG(file, max = 1400, q = .82) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { src: c.toDataURL('image/jpeg', q), w: c.width, h: c.height };
  } finally { URL.revokeObjectURL(url); }
}
function addPhoto(src) { const id = uid(); S.proj.photos[id] = src; return id; }

function openLibrary(tab = 'light') {
  const m = modal(`<h3>เพิ่มลงแปลน ${closeX}</h3><div class="libtabs">${LIB_TABS.map(([k, n]) => `<button data-lt="${k}">${n}</button>`).join('')}</div><div class="libgrid"></div>`, { wide: true });
  const grid = $('.libgrid', m);
  const show = t => {
    $$('[data-lt]', m).forEach(b => b.classList.toggle('on', b.dataset.lt === t));
    if (t === 'kit') {
      grid.innerHTML = S.kit.map(k => `<button data-kit="${k.id}">${miniIcon(k.type)}${esc(k.model)}<small>${k.watt}W · ${k.mode}</small></button>`).join('') + `<button data-kitedit>${'<svg viewBox="0 0 24 24" fill="none" stroke="#8a8780" stroke-width="1.6"><path d="M12 5v14M5 12h14"/></svg>'}แก้ไขชุดไฟ<small>เพิ่มไฟที่มีจริง</small></button>`;
    } else grid.innerHTML = LIB.filter(d => d.cat === t).map(d => `<button data-add="${d.type}">${miniIcon(d.type)}${d.name}${d.cat === 'light' ? `<small>${d.d.watt}W · ${d.d.beam === 360 ? 'รอบทิศ' : d.d.beam + '°'}</small>` : ''}</button>`).join('');
  };
  $('.libtabs', m).onclick = e => { const b = e.target.closest('[data-lt]'); if (b) show(b.dataset.lt); };
  grid.onclick = e => {
    const a = e.target.closest('[data-add]'), k = e.target.closest('[data-kit]');
    if (e.target.closest('[data-kitedit]')) { m.close(); return openKit(); }
    if (!a && !k) return;
    const [x, y] = viewCenter();
    let it;
    if (a) it = makeItem(a.dataset.add, x, y);
    else {
      const kd = S.kit.find(z => z.id === k.dataset.kit);
      it = makeItem(kd.type, x, y, { model: kd.model, watt: kd.watt, mode: kd.mode, k: kd.mode === 'daylight' ? 5600 : LIBMAP[kd.type].d.k });
    }
    snap(); P().items.push(it); save();
    m.close(); setTool('select'); selectThing({ t: 'item', id: it.id });
  };
  show(tab);
}
function openKit() {
  const m = modal(`<h3>ชุดไฟของฉัน ${closeX}</h3><p class="muted" style="margin-top:-6px">ใส่ไฟที่มีจริง แล้วเลือกวางบนแปลนได้ทันทีจากแท็บ “ชุดไฟของฉัน”</p>
    <div class="kitrow kithead"><span>ยี่ห้อ / รุ่น</span><span>ประเภท</span><span>วัตต์</span><span>สี</span><span></span></div><div id="kitRows"></div>
    <div class="acts"><button class="btn" id="kitAdd">+ เพิ่มไฟ</button><span class="sp"></span><button class="btn primary" data-close>เสร็จ</button></div>`, { wide: true, onClose: () => { DB.setMeta('kit', S.kit); if (S.scene) renderPanel(); } });
  const rows = $('#kitRows', m);
  const draw = () => {
    rows.innerHTML = S.kit.map(k => `<div class="kitrow" data-row="${k.id}"><input data-f="model" value="${esc(k.model)}" placeholder="เช่น Aputure 300x"><select data-f="type">${LIB.filter(d => d.cat === 'light').map(d => `<option value="${d.type}"${d.type === k.type ? ' selected' : ''}>${d.name}</option>`).join('')}</select><input data-f="watt" type="number" inputmode="numeric" value="${k.watt}"><select data-f="mode">${[['daylight', 'Daylight'], ['bicolor', 'Bi-color'], ['rgb', 'RGB']].map(([v, n]) => `<option value="${v}"${v === k.mode ? ' selected' : ''}>${n}</option>`).join('')}</select><button class="ib" data-rm aria-label="ลบ">✕</button></div>`).join('');
  };
  rows.addEventListener('input', e => { const r = e.target.closest('[data-row]'), k = S.kit.find(z => z.id === r.dataset.row), f = e.target.dataset.f; k[f] = f === 'watt' ? +e.target.value : e.target.value; });
  rows.addEventListener('click', e => { if (!e.target.closest('[data-rm]')) return; const id = e.target.closest('[data-row]').dataset.row; S.kit = S.kit.filter(z => z.id !== id); draw(); });
  $('#kitAdd', m).onclick = () => { S.kit.push({ id: uid(), model: '', type: 'cob', watt: 100, mode: 'bicolor' }); draw(); $('#kitRows input:last-of-type', m); rows.lastElementChild?.querySelector('input')?.focus(); };
  draw();
}

function openRoom() {
  const m = modal(`<h3>สร้างห้อง ${closeX}</h3>
    <div class="note" style="margin-bottom:14px"><b style="color:var(--text)">สแกนห้องด้วย LiDAR:</b> เวอร์ชัน iOS จะใช้ Apple RoomPlan สแกนผนัง ประตู หน้าต่าง และเฟอร์นิเจอร์อัตโนมัติ ตอนนี้ในเว็บ ให้สแกนด้วยแอปที่ส่งออกแปลนเป็นภาพได้ (เช่น แอปสแกนห้องบน iPhone Pro) แล้วนำเข้าภาพด้านล่าง จากนั้นตั้งสเกลให้ตรงกับขนาดจริง</div>
    <h4 style="margin-top:0">ห้องสี่เหลี่ยม</h4>
    <div class="grid2">${fieldHTML({ k: 'w', label: 'กว้าง', type: 'number', unit: 'm', step: .1 }, 5)}${fieldHTML({ k: 'h', label: 'ยาว', type: 'number', unit: 'm', step: .1 }, 4)}</div>
    <label class="fld chk"><input type="checkbox" id="rmReplace" checked><span style="color:var(--text)">แทนที่ผนังเดิม</span></label>
    <div class="acts"><button class="btn primary" id="rmMake">สร้างห้อง</button></div>
    <h4>นำเข้าแปลน / ภาพสแกน / ภาพถ่ายมุมบน</h4>
    <div class="acts"><button class="btn" id="rmImg">เลือกภาพแปลน</button></div>`);
  $('#rmMake', m).onclick = () => {
    const w = parseFloat($('[data-k="w"]', m).value), h = parseFloat($('[data-k="h"]', m).value);
    if (!(w > .5 && h > .5)) return toast('ใส่ขนาดห้องให้ถูกต้อง');
    snap();
    if ($('#rmReplace', m).checked) P().walls = [];
    const x0 = r2(-w / 2), y0 = r2(-h / 2), x1 = r2(w / 2), y1 = r2(h / 2);
    [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]].forEach(([a, b]) => P().walls.push({ id: uid(), a, b, t: .12 }));
    save(); m.close(); fitView();
  };
  $('#rmImg', m).onclick = async () => {
    const f = await pickFile('image/*'); if (!f) return;
    const img = await fileToJPEG(f, 2200, .85);
    snap();
    const w = 8, h = w * img.h / img.w, [cx, cy] = viewCenter();
    P().bg = { ph: addPhoto(img.src), x: r2(cx - w / 2), y: r2(cy - h / 2), w, h: r2(h), op: .6 };
    save(); m.close(); fitView(); renderPanel();
    toast('นำเข้าแล้ว ลากเส้นทับระยะที่รู้ขนาดจริงเพื่อตั้งสเกล');
    startCalib();
  };
}
function startCalib() { selectThing(null); setTool('calib'); }
function calibrate(a, len) {
  const real = parseFloat(prompt(`เส้นนี้ยาว ${len.toFixed(2)} m บนภาพ\nความยาวจริงคือกี่เมตร?`, len.toFixed(2)));
  if (!(real > 0)) return;
  const bg = P().bg; if (!bg) return;
  snap();
  const f = real / len;
  bg.x = r2(a[0] + (bg.x - a[0]) * f); bg.y = r2(a[1] + (bg.y - a[1]) * f); bg.w = r2(bg.w * f); bg.h = r2(bg.h * f);
  save(); fitView(); toast('ตั้งสเกลแล้ว ใช้เครื่องมือผนังลากตามแนวผนังในภาพได้');
}

function openShot(id, isNew) {
  const sh = S.scene.shots.find(s => s.id === id); if (!sh) return;
  const camOpts = [['', '— ไม่ผูกกล้อง —'], ...cams().map(c => [c.id, `กล้อง ${c.label}${c.body ? ' · ' + c.body : ''} (${c.lens}mm)`])];
  const m = modal(`<h3>ช็อต ${esc(sh.num)} ${closeX}</h3>
    <div class="photo-box" id="phBox"><span class="muted" id="phEmpty">ภาพบล็อกช็อต / reference / สตอรีบอร์ด</span><div class="row"><button class="btn sm" id="phPick">${sh.photo ? 'เปลี่ยนภาพ' : 'ถ่าย / เลือกภาพ'}</button>${sh.photo ? '<button class="btn sm danger" id="phDel">ลบภาพ</button>' : ''}</div></div>
    <div class="grid3">${fieldHTML({ k: 'num', label: 'เลขช็อต' }, sh.num)}${fieldHTML({ k: 'size', label: 'ขนาดภาพ', type: 'select', opts: SHOT_SIZES }, sh.size)}${fieldHTML({ k: 'lens', label: 'เลนส์', type: 'number', unit: 'mm' }, sh.lens)}</div>
    <div class="grid2">${fieldHTML({ k: 'angle', label: 'มุมกล้อง', type: 'select', opts: ANGLES }, sh.angle)}${fieldHTML({ k: 'move', label: 'การเคลื่อนกล้อง', type: 'select', opts: MOVES }, sh.move)}</div>
    ${fieldHTML({ k: 'cam', label: 'กล้องบนแปลน', type: 'select', opts: camOpts }, sh.cam || '')}
    ${fieldHTML({ k: 'subject', label: 'ตัวแบบ / สิ่งที่อยู่ในเฟรม', ph: 'เช่น แขกรับเชิญ, มือถือแก้วกาแฟ' }, sh.subject)}
    ${fieldHTML({ k: 'desc', label: 'คำอธิบายช็อต / แอ็กชัน', type: 'textarea', ph: 'เกิดอะไรในช็อตนี้' }, sh.desc)}
    <div class="grid2">${fieldHTML({ k: 'setup', label: 'ชุดไฟ / Lighting setup', ph: 'เช่น Setup A: Key + Fill' }, sh.setup)}${fieldHTML({ k: 'notes', label: 'โน้ตเพิ่มเติม', ph: 'เสียง, props, wardrobe' }, sh.notes)}</div>
    <div class="acts"><button class="btn" id="shUp">เลื่อนขึ้น</button><button class="btn" id="shDown">เลื่อนลง</button><button class="btn danger" id="shDel">ลบช็อต</button><span class="sp"></span><button class="btn primary" data-close>เสร็จ</button></div>`,
    { onClose: () => { renderPanel(); render(); } });
  const box = $('#phBox', m);
  const showPh = () => { const src = sh.photo && S.proj.photos[sh.photo]; box.style.backgroundImage = src ? `url(${src})` : ''; $('#phEmpty', m).hidden = !!src; };
  showPh();
  bindFields(m, sh, k => {
    if (k === 'cam') { const c = getItem(sh.cam); if (c && isNew) { sh.lens = c.lens; $('[data-k="lens"]', m).value = c.lens; } if (!sh.cam) sh.cam = null; }
    if (k === 'lens') { const c = getItem(sh.cam); if (c && cams().length) { /* keep plan in sync: shot lens drives its camera */ c.lens = sh.lens; } }
    if (k === 'num') $('h3', m).firstChild.textContent = 'ช็อต ' + sh.num + ' ';
  });
  $('#phPick', m).onclick = async () => {
    const f = await pickFile('image/*'); if (!f) return;
    const img = await fileToJPEG(f);
    snap(); sh.photo = addPhoto(img.src); save(); showPh(); $('#phPick', m).textContent = 'เปลี่ยนภาพ';
  };
  const del = $('#phDel', m); if (del) del.onclick = () => { snap(); sh.photo = null; save(); showPh(); del.remove(); };
  const move = d => { const L = S.scene.shots, i = L.indexOf(sh), j = i + d; if (j < 0 || j >= L.length) return; snap(); [L[i], L[j]] = [L[j], L[i]]; save(); toast(`ย้ายไปลำดับ ${j + 1}`); };
  $('#shUp', m).onclick = () => move(-1);
  $('#shDown', m).onclick = () => move(1);
  $('#shDel', m).onclick = () => { if (!confirm('ลบช็อตนี้?')) return; snap(); S.scene.shots = S.scene.shots.filter(s => s.id !== sh.id); if (S.activeShot === sh.id) S.activeShot = null; save(); m.close(); };
}

// ---------- scenes & projects ----------
function sceneTitle(sc) { return `${sc.number ? sc.number + ' · ' : ''}${sc.name}`; }
function updateTitle() { $('#projName').textContent = S.proj.name + (S.proj.client ? ' · ' + S.proj.client : ''); $('#sceneName').textContent = sceneTitle(S.scene) + ' ▾'; }
function openScenes() {
  const p = S.proj;
  const m = modal(`<h3>ซีนทั้งหมด ${closeX}</h3>
    <div class="list" id="scList">${p.scenes.map((sc, i) => `<div class="li${sc === S.scene ? ' on' : ''}" data-sc="${sc.id}" role="button"><span class="grow"><b>${esc(sceneTitle(sc))}</b><small>${esc([sc.location, sc.time, sc.shots.length + ' ช็อต', lights(sc).length + ' ไฟ'].filter(Boolean).join(' · '))}</small></span><button class="ib" data-mv="-1" aria-label="ขึ้น"${i === 0 ? ' disabled' : ''}>↑</button><button class="ib" data-mv="1" aria-label="ลง"${i === p.scenes.length - 1 ? ' disabled' : ''}>↓</button></div>`).join('')}</div>
    <div class="acts" style="margin-top:12px"><button class="btn primary" id="scNew">+ ซีนใหม่</button></div>
    <h4>โปรเจกต์</h4>
    <div class="grid2">${fieldHTML({ k: 'name', label: 'ชื่อโปรเจกต์' }, p.name)}${fieldHTML({ k: 'client', label: 'ลูกค้า' }, p.client)}</div>
    ${fieldHTML({ k: 'date', label: 'วันถ่าย', type: 'date' }, p.date)}`, { onClose: updateTitle });
  bindFields($$('.grid2', m)[0].parentNode, p, null, false);
  $('#scList', m).onclick = e => {
    const row = e.target.closest('[data-sc]'); if (!row) return;
    const mv = e.target.closest('[data-mv]');
    const i = p.scenes.findIndex(s => s.id === row.dataset.sc);
    if (mv) { const j = i + +mv.dataset.mv; [p.scenes[i], p.scenes[j]] = [p.scenes[j], p.scenes[i]]; save(); m.close(); return openScenes(); }
    m.close(); switchScene(p.scenes[i]);
  };
  $('#scNew', m).onclick = () => {
    const n = Math.max(0, ...p.scenes.map(s => parseInt(s.number) || 0)) + 1;
    const sc = newScene(n, 'ซีน ' + n);
    const last = S.scene;
    if (last.plan.walls.length && confirm('ใช้แปลนห้องเดิม (ผนัง) จากซีนปัจจุบันไหม?')) sc.plan.walls = clone(last.plan.walls).map(w => ({ ...w, id: uid() }));
    p.scenes.push(sc); save(); m.close(); switchScene(sc);
  };
}
function duplicateScene(sc) {
  const p = S.proj, n = Math.max(0, ...p.scenes.map(s => parseInt(s.number) || 0)) + 1;
  const c = clone(sc); c.id = uid(); c.number = String(n); c.name = sc.name + ' (สำเนา)';
  const map = {};
  c.plan.items.forEach(it => { const o = it.id; it.id = uid(); map[o] = it.id; });
  c.plan.walls.forEach(w => w.id = uid()); c.plan.draws.forEach(d => d.id = uid());
  c.shots = c.shots.map((s, i) => ({ ...s, id: uid(), cam: map[s.cam] || null, num: `${n}${String.fromCharCode(65 + i)}` }));
  p.scenes.splice(p.scenes.indexOf(sc) + 1, 0, c); save(); switchScene(c); toast('ทำซ้ำซีนแล้ว');
}
function deleteScene(sc) {
  const p = S.proj;
  if (p.scenes.length === 1) return toast('ต้องมีอย่างน้อย 1 ซีน');
  if (!confirm(`ลบซีน “${sceneTitle(sc)}” ?`)) return;
  const i = p.scenes.indexOf(sc); p.scenes.splice(i, 1); save(); switchScene(p.scenes[Math.max(0, i - 1)]);
}
function switchScene(sc) {
  S.scene = sc; S.sel = null; S.activeShot = null; S.undo = []; S.redo = []; S.preview = null;
  updateTitle(); updateUndo(); renderPanel(); requestAnimationFrame(() => fitView());
}
function openProject(p) {
  S.proj = p; p.photos = p.photos || {};
  $('#home').hidden = true; $('#editor').hidden = false;
  S.tool = 'select'; renderTools();
  switchScene(p.scenes[0]);
  if (innerWidth > 820) openPanel();
}
function gcPhotos(p) {
  const used = new Set();
  p.scenes.forEach(sc => { sc.shots.forEach(s => s.photo && used.add(s.photo)); if (sc.plan.bg) used.add(sc.plan.bg.ph); });
  Object.keys(p.photos).forEach(k => { if (!used.has(k)) delete p.photos[k]; });
}
async function goHome() {
  if (S.proj) { gcPhotos(S.proj); clearTimeout(saveTimer); await DB.put(S.proj).catch(() => { }); }
  S.proj = null; S.scene = null;
  $('#editor').hidden = true; $('#home').hidden = false;
  await loadProjects();
}
async function loadProjects() {
  S.projects = (await DB.all().catch(() => null)) || S.projects;
  S.projects.sort((a, b) => b.updated - a.updated);
  renderHome();
}
function coverOf(p) {
  for (const sc of p.scenes) for (const s of sc.shots) if (s.photo && p.photos[s.photo]) return p.photos[s.photo];
  return null;
}
function renderHome() {
  const L = S.projects, el = $('#projList');
  if (!L.length) {
    el.innerHTML = `<div class="empty"><h2>วางแผนการถ่ายจากมุมบน</h2><p class="muted" style="max-width:560px;margin:0 auto">สร้างห้อง วางไฟ กล้อง และนักแสดง ผูกภาพบล็อกช็อตเข้ากับ Shot list แล้วส่งออกเป็น PDF หรือภาพให้ทีมงานในคลิกเดียว</p>
      <div class="feat"><div><b>ห้อง & แปลน</b>สร้างห้องตามขนาดจริง หรือนำเข้าภาพแปลนจากการสแกนแล้วตั้งสเกล</div><div><b>ไฟ & ชุดไฟของคุณ</b>ลำแสงตามมุม ระยะ อุณหภูมิสี และ dimmer รวมวัตต์ให้อัตโนมัติ</div><div><b>กล้อง & FOV</b>มุมรับภาพคำนวณจากเซนเซอร์และเลนส์จริง</div><div><b>Shot list + ภาพบล็อก</b>ทุกช็อตผูกกับกล้องบนแปลน แนบภาพ reference ได้</div><div><b>ส่งออกให้ทีม</b>PDF breakdown, PNG, CSV, รายการอุปกรณ์</div></div>
      <div class="row" style="justify-content:center;margin-top:16px"><button class="btn" id="demo">เปิดโปรเจกต์ตัวอย่าง</button><button class="btn primary" id="new2">+ เริ่มโปรเจกต์ใหม่</button></div></div>`;
    $('#demo').onclick = async () => { const p = demoProject(); await DB.put(p); S.projects.push(p); openProject(p); };
    $('#new2').onclick = newProjectFlow;
    return;
  }
  el.innerHTML = `<div class="proj-grid">${L.map(p => {
    const cov = coverOf(p), shots = p.scenes.reduce((a, s) => a + s.shots.length, 0);
    return `<div class="pcard" data-p="${p.id}">${cov ? `<img class="cover" src="${cov}" alt="">` : (() => { const bb = sceneBBox(p.scenes[0], .3); return `<svg class="cover" viewBox="${bb.x} ${bb.y} ${bb.w} ${bb.h}" preserveAspectRatio="xMidYMid meet" style="padding:10px">${planSVG(p.scenes[0], { px: bb.w / 300, labels: false, photos: p.photos })}</svg>`; })()}
      <div class="meta"><b>${esc(p.name)}</b><small class="muted">${esc([p.client, p.date, p.scenes.length + ' ซีน', shots + ' ช็อต'].filter(Boolean).join(' · '))}</small></div>
      <div class="acts"><button class="btn sm primary" data-open>เปิด</button><button class="btn sm" data-dup>ทำซ้ำ</button><button class="btn sm danger" data-del>ลบ</button></div></div>`;
  }).join('')}</div><p class="muted" style="font-size:12px;margin-top:18px">ข้อมูลทั้งหมดเก็บในเครื่องนี้เท่านั้น · ส่งต่อให้ทีมด้วยไฟล์โปรเจกต์ (เมนูส่งออก)</p>`;
  $$('[data-p]').forEach(c => {
    const p = L.find(x => x.id === c.dataset.p);
    c.querySelector('.cover').onclick = () => openProject(p);
    c.querySelector('[data-open]').onclick = () => openProject(p);
    c.querySelector('[data-dup]').onclick = async () => { const n = clone(p); n.id = uid(); n.name += ' (สำเนา)'; n.updated = Date.now(); await DB.put(n); loadProjects(); };
    c.querySelector('[data-del]').onclick = async () => { if (!confirm(`ลบโปรเจกต์ “${p.name}” ? กู้คืนไม่ได้`)) return; await DB.del(p.id); S.projects = S.projects.filter(x => x !== p); loadProjects(); };
  });
}
function newProjectFlow() {
  const m = modal(`<h3>โปรเจกต์ใหม่ ${closeX}</h3>${fieldHTML({ k: 'name', label: 'ชื่อโปรเจกต์', ph: 'เช่น สัมภาษณ์ CEO, MV เพลงใหม่' }, '')}<div class="grid2">${fieldHTML({ k: 'client', label: 'ลูกค้า' }, '')}${fieldHTML({ k: 'date', label: 'วันถ่าย', type: 'date' }, '')}</div><div class="acts"><span class="sp"></span><button class="btn primary" id="npGo">สร้าง</button></div>`);
  const v = {}; bindFields(m, v, null, false);
  setTimeout(() => $('[data-k="name"]', m).focus(), 50);
  $('#npGo', m).onclick = async () => {
    const p = newProject(v.name, v.client, v.date);
    const sc = p.scenes[0];
    [[[-2.5, -2], [2.5, -2]], [[2.5, -2], [2.5, 2]], [[2.5, 2], [-2.5, 2]], [[-2.5, 2], [-2.5, -2]]].forEach(([a, b]) => sc.plan.walls.push({ id: uid(), a, b, t: .12 }));
    await DB.put(p); S.projects.push(p); m.close(); openProject(p);
  };
}
$('#btnNew').onclick = newProjectFlow;
$('#btnHome').onclick = goHome;
$('#btnScenes').onclick = openScenes;
$('#btnUndo').onclick = () => undoRedo(-1);
$('#btnRedo').onclick = () => undoRedo(1);
$('#btnExport').onclick = () => openExport();
$('#btnImport').onclick = async () => {
  const f = await pickFile('.json,.dpplans,application/json'); if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const p = data.project || data;
    if (!p.scenes) throw new Error('bad');
    if (S.projects.some(x => x.id === p.id)) { p.id = uid(); p.name += ' (นำเข้า)'; }
    p.updated = Date.now(); p.photos = p.photos || {};
    await DB.put(p); S.projects.push(p); renderHome(); toast('นำเข้าโปรเจกต์แล้ว');
  } catch { toast('ไฟล์ไม่ถูกต้อง'); }
};

// ---------- demo ----------
function demoProject() {
  const p = newProject('สัมภาษณ์ · Founder Talk', 'Studio Hoya', new Date().toISOString().slice(0, 10));
  const sc = p.scenes[0];
  Object.assign(sc, { number: '1', name: 'สัมภาษณ์ – ห้องนั่งเล่น', location: 'บ้านลูกค้า · ห้องนั่งเล่น', time: 'กลางวัน', notes: 'โทนอบอุ่น ธรรมชาติ ให้แสงหน้าต่างเป็นแสงหลักของพื้นหลัง ปิดไฟเพดานทั้งหมด' });
  S.scene = sc;
  const W = (a, b) => sc.plan.walls.push({ id: uid(), a, b, t: .12 });
  W([-3, -2.5], [3, -2.5]); W([3, -2.5], [3, 2.5]); W([3, 2.5], [-3, 2.5]); W([-3, 2.5], [-3, -2.5]);
  const add = (t, x, y, rot, ex = {}) => { const it = makeItem(t, x, y, ex); it.rot = rot; sc.plan.items.push(it); return it; };
  add('window', .6, -2.5, 90, { label: 'หน้าต่างบานใหญ่', reach: 3.6 });
  add('door', -3, 1.5, 0);
  add('armchair', -.75, 0, 0); add('armchair', .75, 0, 180);
  add('talent', -.75, 0, 0, { label: 'ผู้สัมภาษณ์', color: '#2f7cf6' });
  add('talent', .75, 0, 180, { label: 'แขกรับเชิญ', color: '#f5a524' });
  add('coffee', 0, .95, 90, { s: .7 });
  add('plant', 2.5, -2, 0); add('cabinet', 2.72, .6, 180);
  add('practical', 2.55, 1.9, 0, { label: 'โคมตั้งพื้น', k: 2700, watt: 40 });
  add('cob', 2.1, -1.35, 147, { label: 'Key', model: 'Aputure 600d', watt: 600, mode: 'daylight', k: 5600, dim: 70 });
  add('lantern', -2.1, -1.6, 37, { label: 'Fill', model: 'Amaran 200x', watt: 200, k: 4300, dim: 40 });
  add('fresnel', -2.2, 1.9, -30, { label: 'Back light', model: 'Nanlite Forza 300B', watt: 300, k: 3200, dim: 55, beam: 25 });
  add('tube', -2.75, -.2, 0, { label: 'BG accent', model: 'PavoTube II 30X', s: 1, color: '#ff8a3d', dim: 60 });
  add('flag', 1.55, -1.55, 120, { s: .8 });
  const A = add('camera', -1.9, .55, -12, { label: 'A', body: 'Sony FX3', lens: 50, color: CAM_COLORS[0] });
  const B = add('camera', 1.85, .75, 198, { label: 'B', body: 'Sony FX30', sensor: 'apsc', lens: 56, color: CAM_COLORS[1] });
  const C = add('camera', 0, 2.05, -90, { label: 'C', body: 'BMPCC 6K', sensor: 's35', lens: 24, color: CAM_COLORS[2] });
  add('monitor', -1.6, 2.1, -60);
  sc.plan.draws.push({ id: uid(), type: 'dim', pts: [[-.75, -.55], [.75, -.55]] });
  sc.plan.draws.push({ id: uid(), type: 'text', pts: [[.6, -1.95]], text: 'แสงบ่ายเข้าทางนี้', color: '#2f7cf6' });
  sc.plan.draws.push({ id: uid(), type: 'arrow', pts: [[-.4, 2.05], [-.1, 1.95], [.3, 1.95], [.55, 2.05]], color: '#2f7cf6' });
  sc.shots = [
    { id: uid(), num: '1A', size: '2-Shot', angle: ANGLES[0], move: 'Truck / Slide', lens: 24, cam: C.id, subject: 'ทั้งสองคน', desc: 'Wide establishing สไลด์ช้าๆ จากซ้ายไปขวา เห็นหน้าต่างเป็นพื้นหลัง', setup: 'Setup A', notes: '', photo: null },
    { id: uid(), num: '1B', size: 'MCU', angle: ANGLES[0], move: 'Static', lens: 50, cam: A.id, subject: 'แขกรับเชิญ', desc: 'Single ของแขก มองข้ามไหล่ผู้สัมภาษณ์เล็กน้อย Key จากหน้าต่างฝั่งขวาเฟรม', setup: 'Setup A', notes: 'เช็คแสงสะท้อนแว่น', photo: null },
    { id: uid(), num: '1C', size: 'CU', angle: ANGLES[0], move: 'Static', lens: 56, cam: B.id, subject: 'ผู้สัมภาษณ์', desc: 'Reaction / คำถาม ของผู้สัมภาษณ์', setup: 'Setup A', notes: '', photo: null },
  ];
  // scene 2
  const s2 = newScene(2, 'B-roll – โต๊ะทำงาน'); s2.location = 'บ้านลูกค้า · ห้องทำงาน'; s2.time = 'เย็น / Golden hour';
  p.scenes.push(s2); S.scene = s2;
  const W2 = (a, b) => s2.plan.walls.push({ id: uid(), a, b, t: .12 });
  W2([-2, -1.75], [2, -1.75]); W2([2, -1.75], [2, 1.75]); W2([2, 1.75], [-2, 1.75]); W2([-2, 1.75], [-2, -1.75]);
  const add2 = (t, x, y, rot, ex = {}) => { const it = makeItem(t, x, y, ex); it.rot = rot; s2.plan.items.push(it); return it; };
  add2('window', 2, 0, 180, { label: 'หน้าต่างทิศตะวันตก', k: 3800, reach: 3.2 });
  add2('desk', .9, 0, 180); add2('chair', .25, 0, 0); add2('talent', .25, 0, 0, { label: 'Founder', color: '#f5a524' });
  add2('panel', -1.2, -1.2, 40, { label: 'Fill', watt: 60, k: 3800, dim: 30 });
  const A2 = add2('camera', -1.2, .9, -30, { label: 'A', body: 'Sony FX3', lens: 35, color: CAM_COLORS[0] });
  s2.plan.draws.push({ id: uid(), type: 'arrow', pts: [[-1.5, 1.3], [-1.1, 1.1], [-.7, .85]], color: '#e5484d' });
  s2.shots = [{ id: uid(), num: '2A', size: 'MS', angle: 'มุมสูง', move: 'Dolly in', lens: 35, cam: A2.id, subject: 'Founder ที่โต๊ะ', desc: 'Push-in ช้าๆ ขณะพิมพ์งาน แสงเย็นจากหน้าต่าง', setup: 'Setup B', notes: '', photo: null }];
  S.scene = null;
  return p;
}

// ---------- export: sheets ----------
const SW = 2480, SH = 1754, SM = 90;
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
// Minimal PDF writer: one full-page JPEG per page (A4 landscape). No external dependency, works offline.
async function pagesToPDF(canvases) {
  const enc = new TextEncoder(), chunks = [], offsets = [];
  let len = 0;
  const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); len += u.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const W = 841.89, H = 595.28, n = canvases.length;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const pageIds = canvases.map((_, i) => 3 + i * 3);
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] >>`));
  for (let i = 0; i < n; i++) {
    const c = canvases[i], id = pageIds[i];
    const jpg = new Uint8Array(await (await toBlob(c, 'image/jpeg', .9)).arrayBuffer());
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(id, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`));
    obj(id + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(id + 2, () => { push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream'); });
  }
  const total = 3 + n * 3, xref = len;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}
async function planCanvas(sc, bw, bh, { scaleBar = true, fitTo } = {}) {
  const bb = fitTo || sceneBBox(sc);
  if (!bw) { const k = Math.min(3200 / bb.w, 3200 / bb.h, 260); bw = Math.round(bb.w * k); bh = Math.round(bb.h * k); }
  const k = Math.min(bw / bb.w, bh / bb.h);
  const c = document.createElement('canvas'); c.width = bw; c.height = bh;
  const ctx = c.getContext('2d');
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, bw, bh);
  const ox = (bw - bb.w * k) / 2 - bb.x * k, oy = (bh - bb.h * k) / 2 - bb.y * k;
  const bg = sc.plan.bg;
  if (bg && S.proj.photos[bg.ph]) {
    const im = await loadImg(S.proj.photos[bg.ph]);
    ctx.globalAlpha = bg.op ?? .6; ctx.drawImage(im, ox + bg.x * k, oy + bg.y * k, bg.w * k, bg.h * k); ctx.globalAlpha = 1;
  }
  const vb = [-ox / k, -oy / k, bw / k, bh / k];
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}" viewBox="${vb.join(' ')}">${planSVG(sc, { px: 1 / k, grid: { x: Math.floor(vb[0]), y: Math.floor(vb[1]), w: vb[2] + 2, h: vb[3] + 2 }, noBg: true, labels: true })}</svg>`;
  const im = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s));
  ctx.drawImage(im, 0, 0, bw, bh);
  if (scaleBar) {
    let m = 1; while (m * k < 70) m *= 2;
    const x = 24, y = bh - 28;
    ctx.fillStyle = INK; ctx.fillRect(x, y, m * k, 6); ctx.fillStyle = '#fff'; ctx.fillRect(x + m * k / 2, y + 1, m * k / 2 - 1, 4);
    ctx.font = `600 ${Math.max(18, bw / 90)}px ${FONT}`; ctx.fillStyle = INK; ctx.fillText(`${m} m`, x + m * k + 10, y + 7);
  }
  return c;
}
function segs(t) {
  t = String(t || '');
  try { if (window.Intl?.Segmenter) return [...new Intl.Segmenter('th', { granularity: 'word' }).segment(t)].map(s => s.segment); } catch { }
  return t.split(/(\s+)/);
}
function wrap(ctx, t, w, max = 99) {
  const lines = []; let cur = '';
  for (const piece of String(t || '').split('\n')) {
    for (const s of segs(piece)) {
      if (ctx.measureText(cur + s).width > w && cur) { lines.push(cur.trimEnd()); cur = s.trimStart(); } else cur += s;
    }
    lines.push(cur); cur = '';
  }
  if (lines.length > max) { const l = lines.slice(0, max); l[max - 1] = l[max - 1].replace(/.{0,2}$/, '…'); return l; }
  return lines;
}
function coverDraw(ctx, im, x, y, w, h, r = 10) {
  ctx.save(); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.clip();
  const k = Math.max(w / im.width, h / im.height), iw = im.width * k, ih = im.height * k;
  ctx.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); ctx.restore();
}
function sheetHeader(ctx, sc, cont) {
  const p = S.proj;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SW, SH);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = '#86827a'; ctx.font = `500 30px ${FONT}`;
  ctx.fillText([p.name, p.client, p.date && fmtDate(p.date)].filter(Boolean).join('  ·  '), SM, SM + 20);
  ctx.fillStyle = INK; ctx.font = `700 66px ${FONT}`;
  ctx.fillText(sceneTitle(sc) + (cont ? '  (ต่อ)' : ''), SM, SM + 105);
  ctx.fillStyle = '#6b6860'; ctx.font = `500 32px ${FONT}`;
  ctx.fillText([sc.location, sc.time].filter(Boolean).join('  ·  '), SM, SM + 155);
  ctx.textAlign = 'right'; ctx.fillStyle = INK; ctx.font = `700 34px ${FONT}`; ctx.fillText('DP Plans', SW - SM, SM + 20);
  ctx.fillStyle = '#86827a'; ctx.font = `500 24px ${FONT}`; ctx.fillText('Lighting & shot plan', SW - SM, SM + 54);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e6e2d9'; ctx.fillRect(SM, SM + 190, SW - SM * 2, 3);
}
function fmtDate(d) { try { return new Date(d + 'T00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } }
async function sceneSheets(sc) {
  const top = SM + 225, bottom = SH - SM - 30;
  const photos = {};
  for (const s of sc.shots) if (s.photo && S.proj.photos[s.photo]) photos[s.id] = await loadImg(S.proj.photos[s.photo]).catch(() => null);
  const pages = [];
  const mk = cont => { const c = document.createElement('canvas'); c.width = SW; c.height = SH; const ctx = c.getContext('2d'); sheetHeader(ctx, sc, cont); pages.push(c); return ctx; };
  let ctx = mk(false);
  // plan
  const pw = 1400, ph = bottom - top;
  const pc = await planCanvas(sc, pw, ph);
  ctx.save(); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(SM, top, pw, ph, 18) : ctx.rect(SM, top, pw, ph); ctx.clip(); ctx.drawImage(pc, SM, top); ctx.restore();
  ctx.strokeStyle = '#e1ddd3'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(SM, top, pw, ph, 18) : ctx.rect(SM, top, pw, ph); ctx.stroke();
  // blocks
  const blocks = [];
  const head = (t, n) => blocks.push({ keep: true, h: () => 64, draw: (c, x, y, w) => { c.fillStyle = INK; c.font = `700 34px ${FONT}`; c.fillText(t, x, y + 40); if (n != null) { c.fillStyle = '#86827a'; c.font = `500 28px ${FONT}`; c.textAlign = 'right'; c.fillText(n, x + w, y + 40); c.textAlign = 'left'; } c.fillStyle = '#ece8e0'; c.fillRect(x, y + 56, w, 2); } });
  const line = (t, opts = {}) => blocks.push({
    h: (c, w) => { c.font = `${opts.w || 500} ${opts.size || 27}px ${FONT}`; return wrap(c, t, w - (opts.sw ? 36 : 0)).length * (opts.size || 27) * 1.45 + 10; },
    draw: (c, x, y, w) => {
      c.font = `${opts.w || 500} ${opts.size || 27}px ${FONT}`;
      if (opts.sw) { c.fillStyle = opts.sw; c.beginPath(); c.arc(x + 11, y + 22, 11, 0, 7); c.fill(); c.strokeStyle = '#0002'; c.lineWidth = 1; c.stroke(); }
      c.fillStyle = opts.color || '#3a3833';
      wrap(c, t, w - (opts.sw ? 36 : 0)).forEach((l, i) => c.fillText(l, x + (opts.sw ? 36 : 0), y + 30 + i * (opts.size || 27) * 1.45));
    }
  });
  head('ช็อต', `${sc.shots.length} ช็อต`);
  if (!sc.shots.length) line('— ยังไม่มีช็อต —', { color: '#9b978e' });
  sc.shots.forEach(sh => {
    const cam = sc.plan.items.find(i => i.id === sh.cam), col = cam?.color || '#8b8d98', im = photos[sh.id];
    blocks.push({
      h: () => 152,
      draw: (c, x, y, w) => {
        const tw = 210, th = 118;
        if (im) coverDraw(c, im, x, y + 8, tw, th);
        else { c.fillStyle = col; c.globalAlpha = .14; c.beginPath(); c.roundRect ? c.roundRect(x, y + 8, tw, th, 10) : c.rect(x, y + 8, tw, th); c.fill(); c.globalAlpha = 1; c.fillStyle = col; c.font = `700 30px ${FONT}`; c.textAlign = 'center'; c.fillText(cam ? 'CAM ' + cam.label : '—', x + tw / 2, y + 78); c.textAlign = 'left'; }
        const tx = x + tw + 24, tw2 = w - tw - 24;
        c.fillStyle = col; c.beginPath(); c.arc(tx + 10, y + 30, 10, 0, 7); c.fill();
        c.fillStyle = INK; c.font = `700 32px ${FONT}`; c.fillText(sh.num, tx + 30, y + 41);
        const nw = c.measureText(sh.num).width;
        c.font = `600 26px ${FONT}`; c.fillStyle = '#55524b';
        c.fillText([sh.size, sh.lens ? sh.lens + 'mm' : '', sh.move, cam ? 'Cam ' + cam.label : ''].filter(Boolean).join(' · '), tx + 30 + nw + 16, y + 40);
        c.font = `500 25px ${FONT}`; c.fillStyle = '#3a3833';
        wrap(c, [sh.subject, sh.desc].filter(Boolean).join(' — '), tw2, 2).forEach((l, i) => c.fillText(l, tx, y + 82 + i * 34));
        c.fillStyle = '#efebe3'; c.fillRect(x, y + 144, w, 2);
      }
    });
  });
  const people = sc.plan.items.filter(i => i.cat === 'person');
  if (people.length) { head('นักแสดง / คน', people.length); people.forEach(pp => line(itemName(pp) + (pp.type === 'crew' ? '  (ทีมงาน)' : ''), { sw: pp.color })); }
  const L = lights(sc);
  if (L.length) {
    head('ไฟ', `${L.reduce((a, l) => a + (+l.watt || 0), 0).toLocaleString()} W`);
    L.forEach(l => line(`${itemName(l)} — ${[l.model && l.label ? l.model : '', LIBMAP[l.type].name, l.watt + 'W', l.mode === 'rgb' ? 'RGB' : (l.mode === 'daylight' ? 5600 : l.k) + 'K', (l.dim ?? 100) + '%', l.mod !== '—' ? l.mod : ''].filter(Boolean).join(' · ')}`, { sw: lightColor(l), size: 25 }));
  }
  const grip = sc.plan.items.filter(i => i.cat === 'grip' || i.type === 'monitor');
  const C = cams(sc);
  if (C.length || grip.length) {
    head('กล้อง & กริป');
    C.forEach(c => line(`Cam ${c.label}${c.body ? ' · ' + c.body : ''} · ${c.lens}mm · ${SENSORS[c.sensor]?.[0] || ''}${c.height ? ' · สูง ' + c.height + ' m' : ''}`, { sw: c.color, size: 25 }));
    const g = {}; grip.forEach(x => { const n = LIBMAP[x.type].name; g[n] = (g[n] || 0) + 1; });
    if (grip.length) line(Object.entries(g).map(([n, c]) => `${n} ×${c}`).join(' · '), { size: 25 });
  }
  if (sc.notes) { head('โน้ต'); line(sc.notes, { size: 25 }); }
  // flow into columns
  let cols = [{ x: SM + pw + 60, y: top, w: SW - SM - (SM + pw + 60), h: bottom - top }], ci = 0, y = cols[0].y;
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi], nx = blocks[bi + 1];
    let col = cols[ci], h = b.h(ctx, col.w);
    const need = h + (b.keep && nx ? nx.h(ctx, col.w) : 0);
    if (y + need > col.y + col.h && y > col.y) {
      ci++;
      if (ci >= cols.length) { ctx = mk(true); const cw = (SW - SM * 2 - 100) / 2; cols = [{ x: SM, y: top, w: cw, h: bottom - top }, { x: SM + cw + 100, y: top, w: cw, h: bottom - top }]; ci = 0; }
      col = cols[ci]; y = col.y; h = b.h(ctx, col.w);
    }
    b.draw(ctx, col.x, y, col.w);
    y += h + 6;
  }
  return pages;
}
async function buildSheets(scenes) {
  await document.fonts?.ready;
  try { await document.fonts.load(`700 40px 'IBM Plex Sans Thai'`, 'ไทย'); await document.fonts.load(`500 40px 'IBM Plex Sans Thai'`, 'ไทย'); } catch { }
  const pages = [];
  for (const sc of scenes) pages.push(...await sceneSheets(sc));
  pages.forEach((c, i) => {
    const ctx = c.getContext('2d'); ctx.textAlign = 'right'; ctx.fillStyle = '#9b978e'; ctx.font = `500 24px ${FONT}`;
    ctx.fillText(`${i + 1} / ${pages.length}`, SW - SM, SH - SM + 40);
    ctx.textAlign = 'left'; ctx.fillText(`สร้างด้วย DP Plans · ${new Date().toLocaleDateString('th-TH')}`, SM, SH - SM + 40);
  });
  return pages;
}
const toBlob = (c, type = 'image/png', q) => new Promise(r => c.toBlob(r, type, q));
const fileSafe = s => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60) || 'dpplans';

function csvOf(scenes) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Scene', 'Scene name', 'Location', 'Time', 'Shot', 'Size', 'Angle', 'Movement', 'Lens (mm)', 'Camera', 'Body', 'Subject', 'Description', 'Lighting setup', 'Notes']];
  scenes.forEach(sc => sc.shots.forEach(sh => { const c = sc.plan.items.find(i => i.id === sh.cam); rows.push([sc.number, sc.name, sc.location, sc.time, sh.num, sh.size, sh.angle, sh.move, sh.lens, c?.label || '', c?.body || '', sh.subject, sh.desc, sh.setup, sh.notes]); }));
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
}
function gearOf(scenes) {
  const L = {}, Cm = {}, G = {};
  let maxW = 0;
  scenes.forEach(sc => {
    const sl = {}, sg = {};
    lights(sc).forEach(l => { const n = `${l.model || LIBMAP[l.type].name}${l.model ? '' : ' (' + l.watt + 'W)'}${l.mod && l.mod !== '—' ? ' + ' + l.mod : ''}`; sl[n] = (sl[n] || 0) + 1; });
    Object.entries(sl).forEach(([n, c]) => L[n] = Math.max(L[n] || 0, c));
    cams(sc).forEach(c => { const n = c.body || 'กล้อง ' + c.label; (Cm[n] = Cm[n] || new Set()).add(c.lens + 'mm'); });
    sc.plan.items.filter(i => i.cat === 'grip' || i.type === 'monitor').forEach(x => { const n = LIBMAP[x.type].name; sg[n] = (sg[n] || 0) + 1; });
    Object.entries(sg).forEach(([n, c]) => G[n] = Math.max(G[n] || 0, c));
    maxW = Math.max(maxW, lights(sc).reduce((a, l) => a + (+l.watt || 0), 0));
  });
  const p = S.proj;
  let t = `รายการอุปกรณ์ — ${p.name}${p.date ? ' (' + fmtDate(p.date) + ')' : ''}\n${scenes.length > 1 ? scenes.length + ' ซีน' : sceneTitle(scenes[0])}\n\n`;
  t += `ไฟ\n${Object.entries(L).map(([n, c]) => `  □ ${n} ×${c}`).join('\n') || '  —'}\n  กำลังไฟสูงสุดต่อซีน ≈ ${maxW.toLocaleString()} W (${(maxW / 220).toFixed(1)} A @220V)\n\n`;
  t += `กล้อง & เลนส์\n${Object.entries(Cm).map(([n, s]) => `  □ ${n} — เลนส์ ${[...s].join(', ')}`).join('\n') || '  —'}\n\n`;
  t += `กริป\n${Object.entries(G).map(([n, c]) => `  □ ${n} ×${c}`).join('\n') || '  —'}\n`;
  return t;
}

function openExport() {
  const many = S.proj.scenes.length > 1;
  let scope = 'scene';
  const m = modal(`<h3>ส่งออกให้ทีม ${closeX}</h3>
    ${many ? `<div class="seg" id="exScope"><button data-s="scene" class="on">ซีนนี้</button><button data-s="all">ทุกซีน (${S.proj.scenes.length})</button></div>` : ''}
    <div class="preview" id="exPrev"><small class="muted">กำลังสร้างตัวอย่าง…</small></div>
    <div class="exgrid">
      <button class="main" data-ex="pdf">PDF Breakdown<small>A4 แนวนอน · แปลนไฟ + shot list + ภาพบล็อก + รายการไฟ ซีนละหน้า</small></button>
      <button data-ex="sheet">ภาพสรุป (PNG)<small>แผ่นเดียวกับ PDF ส่งในแชตได้ทันที</small></button>
      <button data-ex="plan">ภาพแปลนอย่างเดียว<small>PNG ความละเอียดสูง</small></button>
      <button data-ex="csv">Shot list → Sheets<small>ไฟล์ CSV เปิดใน Google Sheets / Excel</small></button>
      <button data-ex="gear">รายการอุปกรณ์<small>เช็กลิสต์ไฟ กล้อง เลนส์ กริป</small></button>
      <button data-ex="json">ไฟล์โปรเจกต์<small>ส่งให้ทีมเปิดแก้ไขต่อใน DP Plans</small></button>
    </div><div class="ready" hidden id="exReady"></div>`, { wide: true });
  const scenes = () => scope === 'all' ? S.proj.scenes : [S.scene];
  const prev = async () => {
    const box = $('#exPrev', m);
    try { const [pg] = await buildSheets([S.scene]); pg.style.width = '100%'; box.innerHTML = ''; box.appendChild(pg); } catch (e) { box.innerHTML = '<small class="muted">สร้างตัวอย่างไม่ได้</small>'; console.error(e); }
  };
  prev();
  if (many) $('#exScope', m).onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; scope = b.dataset.s; $$('#exScope button', m).forEach(x => x.classList.toggle('on', x === b)); };
  const ready = $('#exReady', m);
  const offer = (files, label, extra = '') => {
    ready.hidden = false;
    ready.innerHTML = `<b>${label}</b>${extra}<div class="row"><button class="btn primary" id="rShare">แชร์ / AirDrop</button><button class="btn" id="rSave">บันทึกไฟล์</button></div>`;
    const canShare = navigator.canShare && navigator.canShare({ files });
    if (!canShare) $('#rShare', m).hidden = true;
    $('#rShare', m).onclick = () => navigator.share({ files, title: S.proj.name }).catch(() => { });
    $('#rSave', m).onclick = () => files.forEach((f, i) => setTimeout(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, i * 300));
    ready.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  $('.exgrid', m).onclick = async e => {
    const b = e.target.closest('[data-ex]'); if (!b) return;
    const kind = b.dataset.ex, sc = scenes(), base = fileSafe(S.proj.name + (scope === 'scene' ? ' - ' + sceneTitle(S.scene) : ''));
    ready.hidden = false; ready.innerHTML = '<b>กำลังสร้างไฟล์…</b>';
    try {
      if (kind === 'pdf') {
        const pages = await buildSheets(sc);
        offer([new File([await pagesToPDF(pages)], base + '.pdf', { type: 'application/pdf' })], `PDF พร้อมแล้ว · ${pages.length} หน้า`);
      } else if (kind === 'sheet') {
        const pages = await buildSheets(sc);
        const files = await Promise.all(pages.map(async (c, i) => new File([await toBlob(c)], `${base}${pages.length > 1 ? '-' + (i + 1) : ''}.png`, { type: 'image/png' })));
        offer(files, `ภาพสรุปพร้อมแล้ว · ${files.length} ภาพ`);
      } else if (kind === 'plan') {
        const files = [];
        for (const s of sc) { const c = await planCanvas(s); files.push(new File([await toBlob(c)], fileSafe(S.proj.name + ' - ' + sceneTitle(s) + ' - plan') + '.png', { type: 'image/png' })); }
        offer(files, `ภาพแปลนพร้อมแล้ว · ${files.length} ภาพ`);
      } else if (kind === 'csv') {
        offer([new File([csvOf(sc)], base + ' - shot list.csv', { type: 'text/csv' })], 'Shot list (CSV) พร้อมแล้ว', '<p class="muted" style="margin:0 0 8px;font-size:13px">Google Sheets: ไฟล์ → นำเข้า → อัปโหลดไฟล์นี้</p>');
      } else if (kind === 'gear') {
        const t = gearOf(sc);
        offer([new File([t], base + ' - gear list.txt', { type: 'text/plain' })], 'รายการอุปกรณ์', `<textarea readonly style="width:100%;min-height:180px;border-radius:10px;border:1px solid var(--line);background:var(--surface);padding:10px;font-size:13px;margin-bottom:8px">${esc(t)}</textarea><button class="btn sm" id="rCopy" style="margin-bottom:8px">คัดลอกข้อความ</button>`);
        $('#rCopy', m).onclick = () => navigator.clipboard.writeText(t).then(() => toast('คัดลอกแล้ว'), () => toast('คัดลอกไม่ได้'));
      } else if (kind === 'json') {
        gcPhotos(S.proj);
        offer([new File([JSON.stringify({ app: 'dpplans', v: 1, project: S.proj })], fileSafe(S.proj.name) + '.dpplans.json', { type: 'application/json' })], 'ไฟล์โปรเจกต์พร้อมแล้ว', '<p class="muted" style="margin:0 0 8px;font-size:13px">ทีมเปิด DP Plans → นำเข้าไฟล์โปรเจกต์</p>');
      }
    } catch (err) {
      console.error(err);
      ready.innerHTML = `<b>สร้างไฟล์ไม่สำเร็จ</b><small class="muted">${esc(err.message || err)}</small>`;
    }
  };
}

// ---------- boot ----------
(async function boot() {
  try { await DB.open(); } catch { toast('เบราว์เซอร์นี้บันทึกข้อมูลไม่ได้ ข้อมูลจะหายเมื่อปิดหน้า'); }
  const kit = await DB.getMeta('kit').catch(() => null);
  if (Array.isArray(kit)) S.kit = kit;
  await loadProjects();
  renderTools();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { });
})();
window.addEventListener('pagehide', () => { if (S.proj) DB.put(S.proj); });
