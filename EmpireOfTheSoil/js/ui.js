// =====================================================================
//  Immediate-mode UI helpers
// =====================================================================
'use strict';

const FONT_HEAD = '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';
const FONT_BODY = '"Segoe UI", "Trebuchet MS", Tahoma, Arial, sans-serif';
const COL = {
  gold: '#f2c14e', amber: '#d9a441', text: '#eadfc8', dim: '#a8977a', faint: '#6f6250',
  panel: 'rgba(28,19,12,0.93)', panel2: 'rgba(44,30,18,0.95)', border: '#6b4f2e', good: '#8fd16a', bad: '#ff6b5c',
  food: '#e8925a', mat: '#b8a06a', rp: '#c9a0ff', pop: '#e8dcc0',
};

const UI = {
  hits: [], tips: [], mx: -1, my: -1, down: false, hoverId: null, modal: false, time: 0, typed: null,
  begin() { this.hits = []; this.tips = []; },
  region(x, y, w, h, onClick, opts = {}) {
    this.hits.push({ x, y, w, h, onClick, onRight: opts.onRight, cursor: opts.cursor ?? (onClick ? 'pointer' : null), layer: this.modal ? 1 : 0 });
  },
  over(x, y, w, h) { return this.mx >= x && this.mx < x + w && this.my >= y && this.my < y + h; },
  // modal layering: anything registered after beginModal() is the only clickable layer
  beginModal() { this.hits = this.hits.filter(h => false); this.modal = true; },
  endModal() { this.modal = false; },
  click(x, y, right) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) {
        const fn = right ? h.onRight : h.onClick;
        if (fn) { fn(x - h.x, y - h.y); return true; }
        return !right;
      }
    }
    return false;
  },
  consumesPoint(x, y) { return this.hits.some(h => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h); },
  cursorAt(x, y) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h.cursor || 'default';
    }
    return null;
  },
  tip(x, y, w, h, text) { if (this.over(x, y, w, h)) this.tips.push(text); },
  drawTips(ctx) {
    if (!this.tips.length) return;
    const t = this.tips[this.tips.length - 1];
    ctx.font = `13px ${FONT_BODY}`;
    const lines = wrapLines(ctx, t, 300);
    const w = Math.min(320, Math.max(...lines.map(l => ctx.measureText(l).width)) + 20), h = lines.length * 17 + 14;
    let x = this.mx + 16, y = this.my + 14;
    if (App.lastTouch) { x = this.mx - w / 2; y = this.my - h - 46; if (y < 4) y = this.my + 46; x = clamp(x, 4, W - w - 4); }
    if (x + w > W - 4) x = this.mx - w - 10;
    if (y + h > H - 4) y = H - h - 4;
    roundRect(ctx, x, y, w, h, 6);
    ctx.fillStyle = 'rgba(16,11,7,0.97)'; ctx.fill();
    ctx.strokeStyle = COL.amber; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = COL.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, x + 10, y + 8 + i * 17));
  },
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function panel(ctx, x, y, w, h, opts = {}) {
  if (!opts.passThrough) UI.region(x, y, w, h, () => { });   // panels swallow clicks
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = opts.noShadow ? 0 : 14; ctx.shadowOffsetY = 4;
  roundRect(ctx, x, y, w, h, opts.r ?? 8);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, opts.c1 || 'rgba(48,33,20,0.95)'); g.addColorStop(1, opts.c2 || 'rgba(22,15,9,0.95)');
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, opts.r ?? 8);
  ctx.strokeStyle = opts.border || COL.border; ctx.lineWidth = 1; ctx.stroke();
  roundRect(ctx, x + 2.5, y + 2.5, w - 5, h - 5, Math.max(1, (opts.r ?? 8) - 2));
  ctx.strokeStyle = 'rgba(255,220,160,0.07)'; ctx.stroke();
  if (opts.title) {
    text(ctx, opts.title, x + 14, y + 12, { font: `bold 17px ${FONT_HEAD}`, color: COL.gold });
    ctx.fillStyle = 'rgba(217,164,65,0.35)'; ctx.fillRect(x + 12, y + 36, w - 24, 1);
  }
}
function text(ctx, s, x, y, o = {}) {
  ctx.font = o.font || `14px ${FONT_BODY}`;
  ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'top';
  if (o.shadow !== false) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(s, x + 1, y + 1); }
  ctx.fillStyle = o.color || COL.text; ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}
function wrapLines(ctx, s, maxW) {
  const out = [];
  for (const para of String(s).split('\n')) {
    if (!para) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}
function wrap(ctx, s, x, y, maxW, lh, o = {}) {
  ctx.font = o.font || `14px ${FONT_BODY}`;
  const lines = wrapLines(ctx, s, maxW);
  lines.forEach((l, i) => text(ctx, l, x, y + i * lh, o));
  return lines.length * lh;
}
function button(ctx, x, y, w, h, label, onClick, o = {}) {
  const hov = UI.over(x, y, w, h) && !o.disabled;
  const press = hov && UI.down;
  ctx.save();
  roundRect(ctx, x, y, w, h, o.r ?? 6);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  if (o.disabled) { g.addColorStop(0, '#3a332b'); g.addColorStop(1, '#2a241e'); }
  else if (o.primary) { g.addColorStop(0, hov ? '#f5c85e' : '#e2ac44'); g.addColorStop(1, hov ? '#b9802a' : '#9c6a1f'); }
  else if (o.danger) { g.addColorStop(0, hov ? '#c4523e' : '#a8432f'); g.addColorStop(1, hov ? '#7a2a1c' : '#5e2014'); }
  else if (o.active) { g.addColorStop(0, '#7a5a30'); g.addColorStop(1, '#4e3618'); }
  else { g.addColorStop(0, hov ? '#6e4f2e' : '#55391f'); g.addColorStop(1, hov ? '#43301b' : '#33230f'); }
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = o.active ? COL.gold : o.primary ? '#ffe39a' : hov ? '#a8834e' : '#7a5a34';
  ctx.lineWidth = o.active ? 1.5 : 1; ctx.stroke();
  if (!o.disabled && !press) { ctx.fillStyle = 'rgba(255,240,200,0.10)'; roundRect(ctx, x + 2, y + 2, w - 4, h * 0.42, Math.max(1, (o.r ?? 6) - 2)); ctx.fill(); }
  ctx.restore();
  const col = o.disabled ? '#7a6e60' : o.primary ? '#2a1a08' : COL.text;
  let tx = x + w / 2;
  if (o.icon) { drawIcon(ctx, o.icon, x + 16, y + h / 2, 16); tx += 8; }
  text(ctx, label, tx, y + h / 2 + (press ? 1 : 0), { font: o.font || `${o.bold === false ? '' : 'bold '}${o.size || 14}px ${FONT_BODY}`, align: 'center', base: 'middle', color: col, shadow: !o.primary });
  if (o.tip) UI.tip(x, y, w, h, o.tip);
  if (o.key) text(ctx, o.key, x + w - 6, y + 4, { font: `10px ${FONT_BODY}`, align: 'right', color: o.primary ? '#5a3a10' : COL.faint, shadow: false });
  // finger-sized hit areas on touchscreens (visuals unchanged)
  let hx = x, hy = y, hw = w, hh = h;
  if (App.touch) { const ex = Math.max(0, (44 - w) / 2), ey = Math.max(0, (40 - h) / 2); hx -= ex; hy -= ey; hw += ex * 2; hh += ey * 2; }
  UI.region(hx, hy, hw, hh, o.disabled ? (o.disabledClick || (() => Sound.sfx('error'))) : (onClick ? (...a) => { Sound.sfx(o.sound || 'click'); onClick(...a); } : null));
}
function bar(ctx, x, y, w, h, frac, color, bg = 'rgba(0,0,0,0.45)') {
  roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
  const fw = Math.max(0, Math.min(1, frac)) * w;
  if (fw > 1) {
    roundRect(ctx, x, y, Math.max(h, fw), h, h / 2);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(color, 1.3)); g.addColorStop(1, shade(color, 0.75));
    ctx.fillStyle = g; ctx.fill();
  }
}
function stepper(ctx, x, y, label, value, onMinus, onPlus, o = {}) {
  text(ctx, label, x, y + 5, { font: `13px ${FONT_BODY}`, color: o.color || COL.text });
  const bx = x + (o.labelW || 110);
  button(ctx, bx, y, 26, 24, '-', onMinus, { disabled: o.disabled, size: 16 });
  text(ctx, value, bx + 26 + (o.valW || 60) / 2, y + 5, { font: `bold 13px ${FONT_BODY}`, align: 'center' });
  button(ctx, bx + 26 + (o.valW || 60), y, 26, 24, '+', onPlus, { disabled: o.disabled, size: 16 });
}
function modalBackdrop(ctx) {
  ctx.fillStyle = 'rgba(5,3,2,0.6)'; ctx.fillRect(0, 0, W, H);
  UI.beginModal();
  UI.region(0, 0, W, H, () => { });
}
