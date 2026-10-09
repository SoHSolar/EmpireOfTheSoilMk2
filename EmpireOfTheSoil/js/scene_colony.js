// =====================================================================
//  Colony cross-section view: animated nest, workforce, chambers
// =====================================================================
'use strict';

const VW = 860, VH = 674, VY = 46, SURF = 118;
const CH_LAYOUT = {
  gates:     { x: 430, y: 182, rx: 62, ry: 24 },
  barracks:  { x: 205, y: 232, rx: 92, ry: 34 },
  aphids:    { x: 680, y: 210, rx: 88, ry: 30 },
  granary:   { x: 110, y: 356, rx: 82, ry: 36 },
  galleries: { x: 650, y: 330, rx: 112, ry: 40 },
  royal:     { x: 420, y: 428, rx: 108, ry: 50 },
  nursery:   { x: 715, y: 462, rx: 98, ry: 42 },
  archive:   { x: 200, y: 486, rx: 88, ry: 34 },
  fungus:    { x: 590, y: 590, rx: 125, ry: 44 },
  midden:    { x: 170, y: 612, rx: 72, ry: 28 },
};
const NODES = {
  surfL: [-30, SURF - 4], surfR: [VW + 30, SURF - 4], E: [430, SURF + 2], H1: [430, 285], H2: [290, 360], H3: [560, 400], H4: [400, 540],
};
const EDGES = [
  ['surfL', 'E', 'surface'], ['E', 'surfR', 'surface'], ['E', 'gates'], ['gates', 'H1'], ['H1', 'barracks'], ['H1', 'aphids'], ['H1', 'galleries'],
  ['H1', 'H2'], ['H2', 'granary'], ['H2', 'archive'], ['H1', 'royal'], ['royal', 'H3'], ['H3', 'nursery'], ['H3', 'galleries'],
  ['royal', 'H4'], ['H4', 'fungus'], ['H4', 'archive'], ['archive', 'midden'],
];
function chLevel(c, k) { return k === 'gates' || CH_LAYOUT[k] ? (c.chambers[k] || 0) : 1; }
function chGeom(c, k) {
  const L = CH_LAYOUT[k], lvl = c.chambers[k] || 0;
  const s = lvl ? 0.72 + 0.07 * lvl : 0.7;
  return { x: L.x, y: L.y, rx: L.rx * s, ry: L.ry * (lvl ? 0.8 + 0.05 * lvl : 0.8), lvl };
}

class ColonyScene {
  constructor() {
    this.tab = 'overview'; this.t = 0; this.selCh = null; this.soilKey = ''; this.dialog = null;
    this.ants = []; this.buildGraph();
  }
  leave() { if (this.v3) this.v3.dispose(); this.v3 = null; this.soilKey = ''; }
  enter() { this.refreshSoil(true); Sound.music('colony'); Sound.ambience('underground'); }
  col() { return this.colOverride || playerCol(App.st); }

  nodePos(n) { const c = this.col(); if (NODES[n]) return NODES[n]; const g = chGeom(c, n); return [g.x, g.y + g.ry * 0.45]; }
  isOpen(n) {
    const c = this.col(), b = k => (c.chambers[k] || 0) > 0;
    if (n === 'H2') return b('granary') || b('archive');
    if (n === 'H4') return b('fungus') || (b('archive') && !b('granary'));
    if (NODES[n] || n === 'gates') return true;
    return b(n);
  }
  buildGraph() {
    this.edgePts = {};
    for (const [a, b, kind] of EDGES) {
      const pa = this.nodePos(a), pb = this.nodePos(b);
      const pts = [];
      const mx = (pa[0] + pb[0]) / 2 + (kind ? 0 : (pb[1] - pa[1]) * 0.12), my = (pa[1] + pb[1]) / 2 + (kind ? 0 : (pa[0] - pb[0]) * 0.08);
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        pts.push([(1 - t) * (1 - t) * pa[0] + 2 * (1 - t) * t * mx + t * t * pb[0], (1 - t) * (1 - t) * pa[1] + 2 * (1 - t) * t * my + t * t * pb[1]]);
      }
      this.edgePts[a + '>' + b] = pts; this.edgePts[b + '>' + a] = pts.slice().reverse();
    }
  }
  neighbors(n) { const out = []; for (const [a, b] of EDGES) { if (a === n && this.isOpen(b)) out.push(b); if (b === n && this.isOpen(a)) out.push(a); } return out; }
  route(from, to) {
    const prev = { [from]: null }, q = [from];
    while (q.length) { const c = q.shift(); if (c === to) break; for (const nb of this.neighbors(c)) if (!(nb in prev)) { prev[nb] = c; q.push(nb); } }
    if (!(to in prev)) return null;
    const path = []; let c = to; while (c) { path.push(c); c = prev[c]; }
    return path.reverse();
  }

  refreshSoil(force) {
    const c = this.col();
    const key = CHAMBER_KEYS.map(k => c.chambers[k] || 0).join('') + c.species;
    if (!force && key === this.soilKey) return;
    this.soilKey = key;
    this.buildGraph();
    const mask = makeCanvas(VW, VH), g = mask.getContext('2d');
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [a, b, kind] of EDGES) {
      if (kind || !this.isOpen(a) || !this.isOpen(b)) continue;
      const pts = this.edgePts[a + '>' + b];
      g.lineWidth = 18; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    }
    g.lineWidth = 20; g.beginPath(); g.moveTo(430, SURF - 6); g.lineTo(430, 190); g.lineTo(430, 285); g.stroke();
    for (const k of CHAMBER_KEYS) {
      const G = chGeom(c, k); if (!G.lvl) continue;
      g.beginPath(); g.ellipse(G.x, G.y, G.rx, G.ry, 0, 0, 6.28); g.fill();
      // flat floor bulge
      g.beginPath(); g.ellipse(G.x, G.y + G.ry * 0.25, G.rx * 0.96, G.ry * 0.8, 0, 0, 6.28); g.fill();
    }
    for (const n of ['H1', 'H2', 'H3', 'H4']) { if (!this.isOpen(n)) continue; const [x, y] = NODES[n]; g.beginPath(); g.arc(x, y, 14, 0, 6.28); g.fill(); }
    this.soil = paintSoil(VW, VH, App.st.seed % 1000 + 17, SURF, mask);
    if (GL3D.active) {
      if (!this.v3) { this.v3 = new ColonyView3D(this); this.uses3D = true; }
      this.v3.rebuild(c, this.soil, mask);
    }
    // seed the animated ants
    this.spawnAnts();
  }
  spawnAnts() {
    const c = this.col(), a = c.adults;
    const tot = sumUnits(a);
    const n = clamp(Math.round(Math.sqrt(tot) * 3.2), 6, 95);
    const castes = [];
    for (const k of CASTE_KEYS) for (let i = 0; i < Math.round(n * a[k] / Math.max(1, tot)); i++) castes.push(k);
    if (!castes.length) castes.push('worker');
    this.ants = castes.map((k, i) => {
      const start = pick(Math.random, ['H1', 'H2', 'royal', 'E', 'H3'].filter(x => this.isOpen(x)));
      const p = this.nodePos(start);
      return { caste: k, at: start, x: p[0] + (Math.random() - 0.5) * 20, y: p[1], a: 0, path: [], pts: [], wait: Math.random() * 3, carry: null, sp: 32 + Math.random() * 18, frame: Math.random() * 6 };
    });
  }
  chooseDest(ant) {
    const c = this.col(), r = Math.random();
    const open = k => (c.chambers[k] || 0) > 0;
    let d;
    if (ant.caste === 'worker') {
      if (r < 0.3) d = Math.random() < 0.5 ? 'surfL' : 'surfR';
      else if (r < 0.48) d = 'nursery';
      else if (r < 0.6) d = 'royal';
      else if (r < 0.7) d = open('granary') ? 'granary' : 'galleries';
      else if (r < 0.8) d = 'galleries';
      else d = pick(Math.random, ['fungus', 'aphids', 'archive', 'midden', 'H2', 'H3'].filter(k => NODES[k] || open(k)));
    } else if (ant.caste === 'scout') d = Math.random() < 0.7 ? (Math.random() < 0.5 ? 'surfL' : 'surfR') : 'H1';
    else d = r < 0.4 ? 'gates' : r < 0.75 ? (open('barracks') ? 'barracks' : 'H1') : r < 0.9 ? 'royal' : 'E';
    if (!this.isOpen(d)) d = 'H1';
    return d;
  }
  updateAnts(dt) {
    for (const ant of this.ants) {
      ant.frame += dt * 12;
      if (ant.wait > 0) {
        ant.wait -= dt;
        if (ant.wander) {   // mill about inside a chamber
          const w = ant.wander;
          const dx = w.tx - ant.x, dy = w.ty - ant.y, d = Math.hypot(dx, dy);
          if (d < 2) { const G = chGeom(this.col(), ant.at); w.tx = G.x + (Math.random() - 0.5) * G.rx * 1.4; w.ty = G.y + G.ry * (0.1 + Math.random() * 0.45); }
          else { ant.a = Math.atan2(dy, dx); ant.x += dx / d * ant.sp * 0.4 * dt; ant.y += dy / d * ant.sp * 0.4 * dt; }
        } else ant.frame -= dt * 12;
        continue;
      }
      if (!ant.pts.length) {
        if (ant.path.length > 1) {
          const a = ant.path.shift(), b = ant.path[0];
          ant.pts = (this.edgePts[a + '>' + b] || []).slice();
          if (!ant.pts.length) { ant.path = []; }
          continue;
        }
        if (ant.path.length === 1) { ant.at = ant.path[0]; ant.path = []; this.arrive(ant); continue; }
        const dest = this.chooseDest(ant);
        const r = this.route(ant.at, dest);
        if (!r || r.length < 2) { ant.wait = 1; continue; }
        // walk to the chamber's tunnel mouth first
        ant.path = r;
        continue;
      }
      const [tx, ty] = ant.pts[0];
      const dx = tx - ant.x, dy = ty - ant.y, d = Math.hypot(dx, dy);
      const step = ant.sp * dt * (ant.caste === 'scout' ? 1.5 : ant.caste === 'major' ? 0.75 : 1);
      if (d <= step) { ant.x = tx; ant.y = ty; ant.pts.shift(); }
      else {
        const na = Math.atan2(dy, dx);
        let da = na - ant.a; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
        ant.a += da * Math.min(1, dt * 10);
        ant.x += dx / d * step; ant.y += dy / d * step;
      }
    }
  }
  arrive(ant) {
    const c = this.col();
    ant.wander = null;
    if (ant.at === 'surfL' || ant.at === 'surfR') {
      ant.carry = c.species === 'leafcutter' ? 'leafbit' : pick(Math.random, ['seed', 'crumb', 'seed2', 'droplet', 'berry_s']);
      ant.wait = 0.5;
      ant.wander = null;
      return;
    }
    if (CH_LAYOUT[ant.at]) {
      if (ant.carry && (ant.at === 'granary' || ant.at === 'fungus' || ant.at === 'nursery')) ant.carry = null;
      const G = chGeom(c, ant.at);
      ant.wander = { tx: G.x, ty: G.y + G.ry * 0.3 };
      ant.wait = 2 + Math.random() * 5;
      ant.after = true;
    } else ant.wait = Math.random() * 0.4;
    if (ant.carry && ant.at !== 'surfL' && ant.at !== 'surfR' && Math.random() < 0.15) ant.carry = null;
  }

  // ---------------- input ----------------
  onKey(e) {
    if (this.dialog) { this.dialog.onKey?.(e); return; }
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'c' || k === 'm') App.toMap();
    if (k === '1') this.tab = 'overview'; if (k === '2') this.tab = 'work'; if (k === '3') this.tab = 'nest';
    if (k === 'r') App.setScene(new ResearchScene());
  }
  chamberAt(x, y) {   // logical screen point -> chamber key
    if (x >= VW || y < VY) return null;
    let lx = x, ly = y - VY;
    if (this.v3) [lx, ly] = this.v3.layoutAt(x, y);
    const c = this.col();
    for (const k of CHAMBER_KEYS) {
      const G = chGeom(c, k);
      const dx = (lx - G.x) / G.rx, dy = (ly - G.y) / G.ry;
      if (dx * dx + dy * dy < 1.15) return k;
    }
    return null;
  }
  onMouseDown(x, y, btn) {
    if (this.dialog || !this.v3 || x >= VW || y < VY) return;
    this.drag = { x, y, yaw: this.v3.cam.yaw, pitch: this.v3.cam.pitch, moved: false };
  }
  onMouseMove(x, y) {
    const d = this.drag; if (!d) return;
    if (Math.abs(x - d.x) + Math.abs(y - d.y) > 5) d.moved = true;
    if (d.moved) { this.v3.cam.yaw = clamp(d.yaw - (x - d.x) * 0.004, -0.75, 0.75); this.v3.cam.pitch = clamp(d.pitch + (y - d.y) * 0.003, 0.02, 0.6); }
  }
  onMouseUp() { const d = this.drag; this.drag = null; return !!(d && d.moved); }
  onPinch(ratio) { if (this.v3) this.v3.cam.dist = clamp(this.v3.cam.dist / ratio, 6, 24); }
  onWheel(x, y, dy) { if (this.v3 && x < VW) this.v3.cam.dist = clamp(this.v3.cam.dist * (dy > 0 ? 1.1 : 1 / 1.1), 6, 24); }
  onClick(x, y) {
    if (this.dialog) return;
    const k = this.chamberAt(x, y);
    if (k) { if (this.selCh !== k) Sound.sfx('tab'); this.selCh = k; this.tab = 'nest'; }
  }
  _unusedOnClick(x, y) {
    const c = this.col();
    for (const k of CHAMBER_KEYS) {
      const G = chGeom(c, k);
      const dx = (x - G.x) / G.rx, dy = (y - VY - G.y) / G.ry;
      if (dx * dx + dy * dy < 1.2) { if (this.selCh !== k) Sound.sfx('tab'); this.selCh = k; this.tab = 'nest'; return; }
    }
  }

  // ---------------- drawing ----------------
  draw(ctx, dt) {
    this.t += dt;
    const st = App.st, c = this.col();
    this.refreshSoil(false);
    if (Math.abs(this.ants.length - clamp(Math.round(Math.sqrt(sumUnits(c.adults)) * 3.2), 6, 95)) > 8) this.spawnAnts();
    this.updateAnts(dt);
    if (this.v3) this.drawView3D(ctx, dt);
    else this.drawView2D(ctx, dt);
    this.drawHeader(ctx);
    this.drawPanel(ctx);
    if (this.dialog) this.dialog.draw(ctx);
  }
  drawView3D(ctx, dt) {
    const c = this.col(), v = this.v3;
    v.render(dt);
    const hov = !this.dialog && !this.drag?.moved ? this.chamberAt(UI.mx, UI.my) : null;
    const ellipse = (G, dash, color, width) => {
      ctx.save(); ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      for (let i = 0; i <= 36; i++) { const a = i / 36 * 6.283, p = v.screenOf(G.x + Math.cos(a) * (G.rx + 3), G.y + Math.sin(a) * (G.ry + 3)); if (p) i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.stroke(); ctx.restore();
    };
    ctx.save(); ctx.beginPath(); ctx.rect(0, VY, VW, VH); ctx.clip();
    for (const k of CHAMBER_KEYS) {
      const G = chGeom(c, k), Ch = CHAMBERS[k], bld = c.builds.find(b => b.key === k);
      if (!G.lvl) {
        const avail = !Ch.req || has(c, Ch.req);
        ellipse(G, [5, 5], hov === k || this.selCh === k ? 'rgba(255,220,150,0.85)' : 'rgba(255,230,190,0.3)', 1.5);
        const p = v.screenOf(G.x, G.y);
        if (p) text(ctx, (avail ? '+ ' : '\u{1F512} ') + Ch.name, p[0], p[1] - 7, { font: `12px ${FONT_BODY}`, align: 'center', color: avail ? 'rgba(255,235,200,0.7)' : 'rgba(255,235,200,0.35)' });
        if (p && bld) text(ctx, `digging... ${bld.left} turn${bld.left > 1 ? 's' : ''}`, p[0], p[1] + 9, { font: `bold 11px ${FONT_BODY}`, align: 'center', color: COL.gold });
        if (hov === k) UI.tip(UI.mx - 4, UI.my - 4, 8, 8, `${Ch.name} (not dug)\n${Ch.desc}\n${App.touch ? 'Tap' : 'Click'} to plan excavation.`);
        continue;
      }
      if (hov === k || this.selCh === k) ellipse(G, [], this.selCh === k ? COL.gold : 'rgba(255,220,150,0.6)', 2);
      const p = v.screenOf(G.x, G.y - G.ry - 2);
      if (p) {
        const label = `${Ch.name} ${['I', 'II', 'III', 'IV', 'V'][G.lvl - 1]}`;
        ctx.font = `bold 11px ${FONT_BODY}`;
        const tw = ctx.measureText(label).width + 12;
        roundRect(ctx, p[0] - tw / 2, p[1] - 8, tw, 16, 8); ctx.fillStyle = 'rgba(15,10,6,0.72)'; ctx.fill();
        text(ctx, label, p[0], p[1], { font: ctx.font, align: 'center', base: 'middle', color: '#f0e0c0', shadow: false });
        if (bld) { const q = v.screenOf(G.x, G.y + G.ry + 6); if (q) text(ctx, `digging... ${bld.left} turn${bld.left > 1 ? 's' : ''}`, q[0], q[1], { font: `11px ${FONT_BODY}`, align: 'center', color: COL.gold }); }
      }
      if (hov === k) UI.tip(UI.mx - 4, UI.my - 4, 8, 8, `${Ch.name} - level ${G.lvl}\n${Ch.fmt(Ch.values[G.lvl - 1])}\n${Ch.desc}`);
    }
    text(ctx, App.touch ? 'Drag to turn the nest  \u2022  pinch to zoom' : 'Drag to turn the nest  \u2022  wheel to zoom', 12, H - 22, { font: `11px ${FONT_BODY}`, color: 'rgba(255,240,210,0.55)' });
    ctx.restore();
  }
  drawView2D(ctx, dt) {
    const st = App.st, c = this.col();
    ctx.save(); ctx.translate(0, VY);
    ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();
    drawSky(ctx, VW, SURF, seasonIdx(st.turn), this.t);
    ctx.drawImage(this.soil, 0, 0);
    this.drawSurface(ctx);
    for (const k of CHAMBER_KEYS) this.drawChamber(ctx, k);
    // ants
    for (const ant of this.ants) {
      const len = ant.caste === 'major' ? 30 : ant.caste === 'soldier' ? 24 : ant.caste === 'scout' ? 20 : 19;
      drawAnt(ctx, c.species, ant.caste, ant.x, ant.y, ant.a, len, Math.floor(ant.frame) % 6);
      if (ant.carry) {
        ctx.save(); ctx.translate(ant.x + Math.cos(ant.a) * len * 0.62, ant.y + Math.sin(ant.a) * len * 0.62);
        ctx.rotate(ant.a); ctx.drawImage(item(ant.carry), -5, -6, 10, 9); ctx.restore();
      }
    }
    for (const k of CHAMBER_KEYS) this.drawLabel(ctx, k);
    // season mood
    if (seasonIdx(st.turn) === 3) { ctx.fillStyle = 'rgba(150,180,220,0.12)'; ctx.fillRect(0, 0, VW, VH); }
    // vignette
    const vg = ctx.createRadialGradient(VW / 2, VH / 2, 200, VW / 2, VH / 2, 560);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, SURF, VW, VH);
    ctx.restore();
  }

  drawSurface(ctx) {
    const c = this.col();
    // ground strip
    ctx.fillStyle = '#5a7a34'; ctx.fillRect(0, SURF - 6, VW, 8);
    ctx.strokeStyle = '#7fa848';
    for (let i = 0; i < 160; i++) {
      const x = i * 5.4 + hash2(i, 1, 2) * 4, h = 6 + hash2(i, 2, 2) * 12, sway = Math.sin(this.t * 1.3 + i * 0.7) * 2;
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, SURF); ctx.quadraticCurveTo(x + sway * 0.5, SURF - h * 0.6, x + sway, SURF - h); ctx.stroke();
    }
    // mound
    const mx = 430, my = SURF;
    const lvl = c.chambers.galleries + c.chambers.royal;
    const mw = 70 + lvl * 9, mh = 22 + lvl * 4;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(mx, my, mw, mh, 0, Math.PI, 0); ctx.closePath();
    const g = ctx.createRadialGradient(mx - mw * 0.3, my - mh * 0.8, 4, mx, my, mw);
    g.addColorStop(0, c.species === 'wood' ? '#a07a4a' : '#9a7650'); g.addColorStop(0.6, '#6e4f30'); g.addColorStop(1, '#3e2a18');
    ctx.fillStyle = g; ctx.fill(); ctx.clip();
    const r = mulberry32(5);
    for (let i = 0; i < 260; i++) {
      const a = Math.PI + r() * Math.PI, rr = Math.sqrt(r());
      const x = mx + Math.cos(a) * mw * rr, y = my + Math.sin(a) * mh * rr;
      ctx.strokeStyle = r() < 0.5 ? 'rgba(40,25,12,0.6)' : 'rgba(190,150,100,0.4)'; ctx.lineWidth = 1;
      if (c.species === 'wood') { const t = r() * 3.14; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(t) * 5, y + Math.sin(t) * 3); ctx.stroke(); }
      else { ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x, y, 1.5, 1.5); }
    }
    ctx.restore();
    ctx.fillStyle = '#120a04'; ctx.beginPath(); ctx.ellipse(mx, my - 3, 11, 6, 0, 0, 6.28); ctx.fill();
    // banner
    ctx.strokeStyle = '#3a2810'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx + mw * 0.6, my - mh * 0.5); ctx.lineTo(mx + mw * 0.6, my - mh - 30); ctx.stroke();
    ctx.fillStyle = c.color;
    const wv = Math.sin(this.t * 3) * 3;
    ctx.beginPath(); ctx.moveTo(mx + mw * 0.6, my - mh - 30); ctx.quadraticCurveTo(mx + mw * 0.6 + 14, my - mh - 30 + wv, mx + mw * 0.6 + 26, my - mh - 24); ctx.lineTo(mx + mw * 0.6, my - mh - 16); ctx.fill();
  }

  drawChamber(ctx, k) {
    const c = this.col(), G = chGeom(c, k), Ch = CHAMBERS[k];
    const hov = !this.dialog && UI.over(G.x - G.rx, G.y - G.ry + VY, G.rx * 2, G.ry * 2) && UI.mx < VW;
    if (!G.lvl) {
      const avail = !Ch.req || has(c, Ch.req);
      ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = hov ? 'rgba(255,220,150,0.8)' : 'rgba(255,230,190,0.25)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(G.x, G.y, G.rx, G.ry, 0, 0, 6.28); ctx.stroke(); ctx.restore();
      if (hov || this.selCh === k) { ctx.fillStyle = 'rgba(255,230,190,0.08)'; ctx.beginPath(); ctx.ellipse(G.x, G.y, G.rx, G.ry, 0, 0, 6.28); ctx.fill(); }
      text(ctx, (avail ? '+ ' : '\u{1F512} ') + Ch.name, G.x, G.y - 7, { font: `12px ${FONT_BODY}`, align: 'center', color: avail ? 'rgba(255,235,200,0.55)' : 'rgba(255,235,200,0.3)' });
      if (hov) UI.tip(G.x - G.rx, G.y - G.ry + VY, G.rx * 2, G.ry * 2, `${Ch.name} (not dug)\n${Ch.desc}\n${App.touch ? 'Tap' : 'Click'} to plan excavation.`);
      return;
    }
    const rng = mulberry32(k.length * 97 + 3);
    const floorY = G.y + G.ry * 0.62;
    const fill = (n, fn) => { for (let i = 0; i < n; i++) fn(i, rng); };
    switch (k) {
      case 'royal': {
        const bc = broodCount(c);
        fill(Math.min(22, 4 + bc / 4), (i, r) => ctx.drawImage(item('egg'), G.x - G.rx * 0.75 + r() * G.rx * 0.45, floorY - 4 - r() * 8));
        drawAnt(ctx, c.species, 'queen', G.x + 4, G.y + G.ry * 0.25, Math.sin(this.t * 0.4) * 0.05, 44 + G.lvl * 3, Math.floor(this.t * 2) % 6);
        const att = [[-48, 18, 0.2], [48, 22, Math.PI - 0.3], [10, -18, 1.5], [60, -4, Math.PI]];
        att.forEach(([dx, dy, a], i) => drawAnt(ctx, c.species, 'worker', G.x + dx, G.y + G.ry * 0.25 + dy, a + Math.sin(this.t * 2 + i) * 0.15, 16, Math.floor(this.t * 3 + i) % 6));
        break;
      }
      case 'nursery': {
        let eggs = 0, larvae = 0, pupae = 0;
        for (const b of c.brood) { const tt = CASTES[b.caste].time; if (b.left > tt * 0.66) eggs += b.n; else if (b.left > tt * 0.33) larvae += b.n; else pupae += b.n; }
        const sc = n => Math.min(26, Math.ceil(n / 2));
        fill(sc(eggs), (i, r) => ctx.drawImage(item('egg'), G.x - G.rx * 0.8 + r() * G.rx * 0.5, floorY - 3 - r() * 10));
        fill(sc(larvae), (i, r) => ctx.drawImage(item('larva'), G.x - G.rx * 0.25 + r() * G.rx * 0.5, floorY - 10 - r() * 12));
        fill(sc(pupae), (i, r) => { ctx.save(); ctx.translate(G.x + G.rx * 0.35 + r() * G.rx * 0.45, floorY - 4 - r() * 12); ctx.rotate((r() - 0.5) * 0.8); ctx.drawImage(item('pupa'), -7, -4); ctx.restore(); });
        break;
      }
      case 'granary': {
        const frac = clamp(c.food / storageCap(App.st, c), 0, 1);
        const n = Math.round(frac * 60);
        const kinds = c.species === 'honeypot' ? null : ['seed', 'seed2', 'crumb', 'seed'];
        if (c.species === 'honeypot') {
          fill(Math.max(1, Math.round(frac * 9)), (i, r) => drawAnt(ctx, 'honeypot', 'replete', G.x - G.rx * 0.7 + i * G.rx * 0.18, G.y - G.ry * 0.4 + (i % 2) * 8, Math.PI / 2 + (r() - 0.5) * 0.3, 20, 0));
        } else fill(n, (i, r) => { const px = (r() - 0.5) * 2, hgt = (1 - px * px) * G.ry * 0.9 * Math.sqrt(frac + 0.1); ctx.drawImage(item(kinds[i % 4]), G.x + px * G.rx * 0.75 - 4, floorY - r() * hgt - 3); });
        break;
      }
      case 'galleries': fill(Math.min(14, Math.ceil(c.adults.worker / 12)), (i, r) => drawAnt(ctx, c.species, 'worker', G.x - G.rx * 0.75 + r() * G.rx * 1.5, floorY - 3 - r() * 10, (r() - 0.5) * 0.6 + (r() < 0.5 ? Math.PI : 0), 15, 0)); break;
      case 'barracks': {
        const ns = Math.min(10, Math.ceil(c.adults.soldier / 6)), nm = Math.min(4, Math.ceil(c.adults.major / 4));
        for (let i = 0; i < ns; i++) drawAnt(ctx, c.species, 'soldier', G.x - G.rx * 0.7 + i * (G.rx * 1.4 / Math.max(1, ns)), floorY - 6 - (i % 2) * 8, Math.PI * 0 + Math.sin(this.t + i) * 0.05, 20, 0);
        for (let i = 0; i < nm; i++) drawAnt(ctx, c.species, 'major', G.x - G.rx * 0.4 + i * 30, G.y - G.ry * 0.15, Math.PI, 28, 0);
        break;
      }
      case 'archive': {
        for (let i = 0; i < 9 + G.lvl * 3; i++) {
          const a = i * 2.4 + this.t * 0.4, rr = (i / (9 + G.lvl * 3)) * G.rx * 0.7;
          const x = G.x + Math.cos(a) * rr, y = G.y + Math.sin(a) * rr * (G.ry / G.rx) * 0.9;
          const pul = 0.5 + 0.5 * Math.sin(this.t * 3 + i);
          const gr = ctx.createRadialGradient(x, y, 0, x, y, 8 + pul * 4);
          gr.addColorStop(0, `rgba(230,190,255,${0.7 * pul + 0.2})`); gr.addColorStop(1, 'rgba(160,90,220,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 12, 0, 6.28); ctx.fill();
        }
        break;
      }
      case 'fungus': {
        const f = item('fungus');
        fill(4 + G.lvl * 3, (i, r) => ctx.drawImage(f, G.x - G.rx * 0.85 + r() * G.rx * 1.45, floorY - 26 - r() * 14));
        fill(8, (i, r) => ctx.drawImage(item('leafbit'), G.x - G.rx * 0.6 + r() * G.rx * 1.2, floorY - 34 - r() * 8, 10, 9));
        break;
      }
      case 'aphids': {
        ctx.strokeStyle = '#5a3b20'; ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(G.x - G.rx * 1.1, G.y - G.ry * 1.2); ctx.quadraticCurveTo(G.x, G.y + G.ry * 0.6, G.x + G.rx * 1.1, G.y - G.ry * 0.8); ctx.stroke();
        ctx.strokeStyle = 'rgba(180,140,90,0.5)'; ctx.lineWidth = 2; ctx.stroke();
        fill(5 + G.lvl * 3, (i, r) => { const t = 0.15 + r() * 0.7; const x = (1 - t) * (1 - t) * (G.x - G.rx * 1.1) + 2 * (1 - t) * t * G.x + t * t * (G.x + G.rx * 1.1); const y = (1 - t) * (1 - t) * (G.y - G.ry * 1.2) + 2 * (1 - t) * t * (G.y + G.ry * 0.6) + t * t * (G.y - G.ry * 0.8); ctx.drawImage(item('aphid'), x - 7, y - 4); });
        break;
      }
      case 'midden': {
        fill(30, (i, r) => { const px = (r() - 0.5) * 2; ctx.fillStyle = pick(r, ['#2a1f16', '#3a2a1c', '#4a3828', '#1e1610']); ctx.beginPath(); ctx.ellipse(G.x + px * G.rx * 0.7, floorY - r() * (1 - px * px) * G.ry * 0.8, 3 + r() * 3, 2 + r() * 2, r() * 3, 0, 6.28); ctx.fill(); });
        break;
      }
      case 'gates': {
        fill(6 + G.lvl * 2, (i, r) => { const side = i % 2 ? -1 : 1; ctx.drawImage(item('pebble'), G.x + side * (G.rx * 0.45 + r() * G.rx * 0.4) - 9, G.y - G.ry * 0.6 + r() * G.ry * 1.2 - 6); });
        drawAnt(ctx, c.species, 'soldier', G.x - 18, G.y + 4, -Math.PI / 2 + 0.3, 20, 0);
        break;
      }
    }
    if (hov || this.selCh === k) {
      ctx.strokeStyle = this.selCh === k ? COL.gold : 'rgba(255,220,150,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(G.x, G.y, G.rx + 3, G.ry + 3, 0, 0, 6.28); ctx.stroke();
    }
    if (hov) UI.tip(G.x - G.rx, G.y - G.ry + VY, G.rx * 2, G.ry * 2, `${Ch.name} - level ${G.lvl}\n${Ch.fmt(Ch.values[G.lvl - 1])}\n${Ch.desc}`);
  }

  drawLabel(ctx, k) {
    const c = this.col(), G = chGeom(c, k), Ch = CHAMBERS[k];
    const bld = c.builds.find(b => b.key === k);
    if (!G.lvl) { if (bld) text(ctx, `digging... ${bld.left} turn${bld.left > 1 ? 's' : ''}`, G.x, G.y + 8, { font: `bold 11px ${FONT_BODY}`, align: 'center', color: COL.gold }); return; }
    const label = `${Ch.name} ${['I', 'II', 'III', 'IV', 'V'][G.lvl - 1]}`;
    ctx.font = `bold 11px ${FONT_BODY}`;
    const tw = ctx.measureText(label).width + 12;
    roundRect(ctx, G.x - tw / 2, G.y - G.ry - 9, tw, 16, 8); ctx.fillStyle = 'rgba(15,10,6,0.7)'; ctx.fill();
    text(ctx, label, G.x, G.y - G.ry - 1, { font: ctx.font, align: 'center', base: 'middle', color: '#f0e0c0', shadow: false });
    if (bld) text(ctx, `digging... ${bld.left} turn${bld.left > 1 ? 's' : ''}`, G.x, G.y + G.ry + 4, { font: `11px ${FONT_BODY}`, align: 'center', color: COL.gold });
  }

  drawHeader(ctx) {
    const st = App.st, c = this.col(), inc = projectIncome(st, c);
    const g = ctx.createLinearGradient(0, 0, 0, 46);
    g.addColorStop(0, 'rgba(36,24,14,1)'); g.addColorStop(1, 'rgba(20,13,8,1)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 46); ctx.fillStyle = COL.border; ctx.fillRect(0, 46, W, 1);
    button(ctx, 10, 7, 110, 32, '◀ Map', () => App.toMap(), { key: 'Esc' });
    text(ctx, c.name, 136, 8, { font: `bold 18px ${FONT_HEAD}`, color: COL.gold });
    text(ctx, `${SPECIES[c.species].name}  •  ${dateStr(st.turn)}`, 136, 28, { font: `11px ${FONT_BODY}`, color: COL.dim });
    let x = 470;
    const r = (icon, a, b, col) => { drawIcon(ctx, icon, x + 9, 23, 18); text(ctx, a, x + 24, 8, { font: `bold 14px ${FONT_BODY}`, color: col }); text(ctx, b, x + 24, 27, { font: `11px ${FONT_BODY}`, color: b.startsWith('-') ? COL.bad : COL.dim }); x += 130; };
    r('food', `${fmt(c.food)}/${fmt(storageCap(st, c))}`, `${signed(inc.food)}/turn`, COL.food);
    r('mat', fmt(c.materials), `${signed(inc.mat)}/turn`, COL.mat);
    r('pop', `${fmt(population(st, c))}/${fmt(popCap(st, c))}`, 'population', COL.pop);
    r('brood', `${broodCount(c)}/${chVal(c, 'nursery')}`, 'brood', '#f3ead8');
    button(ctx, W - 160, 7, 150, 32, 'Muster Swarm', () => { this.dialog = new MusterDialog(App.mapScene, this); }, { primary: true });
  }

  drawPanel(ctx) {
    const st = App.st, c = this.col();
    const x = VW, y = 47, w = W - VW, h = H - 47;
    ctx.fillStyle = '#1a110a'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = COL.border; ctx.fillRect(x, y, 1, h);
    const tabs = [['overview', 'Overview'], ['work', 'Workforce'], ['nest', 'Chambers']];
    tabs.forEach(([k, l], i) => button(ctx, x + 10 + i * 134, y + 10, 128, 32, l, () => this.tab = k, { active: this.tab === k, key: String(i + 1) }));
    const px = x + 16, py = y + 56, pw = w - 32;
    if (this.tab === 'overview') this.panelOverview(ctx, px, py, pw);
    else if (this.tab === 'work') this.panelWork(ctx, px, py, pw);
    else this.panelNest(ctx, px, py, pw);
  }

  panelOverview(ctx, x, y, w) {
    const st = App.st, c = this.col(), inc = projectIncome(st, c), S = cstats(st, c);
    const sec = t => { text(ctx, t, x, y, { font: `bold 15px ${FONT_HEAD}`, color: COL.gold }); y += 22; };
    const line = (a, b, col, tip) => { text(ctx, a, x + 6, y, { font: `13px ${FONT_BODY}`, color: COL.dim }); text(ctx, b, x + w, y, { font: `bold 13px ${FONT_BODY}`, align: 'right', color: col || COL.text }); if (tip) UI.tip(x, y, w, 18, tip); y += 19; };
    sec('Food (per turn)');
    line('Foraging', `+${fmt(inc.forage)}`, COL.good, `${fmt(inc.foragers)} foragers could gather ${fmt(inc.foragers * 0.8 * S.forage)}, territory supplies up to ${fmt(inc.cap)}.\nSeason multiplier x${seasonalForage(S, st.turn).toFixed(2)}.`);
    if (inc.foodIn - inc.forage > 0) line('Fungus gardens & aphids', `+${fmt(inc.foodIn - inc.forage)}`, COL.good);
    if (inc.trade > 0) line('Trade routes', `+${fmt(inc.trade)}`, COL.good);
    line('Upkeep of adults & brood', `-${fmt(inc.upkeep)}`, COL.bad);
    line('Net', signed(inc.food), inc.food >= 0 ? COL.good : COL.bad);
    line('Eggs laid cost', `~${fmt(inc.eggs * 1.2)} more`, COL.dim, 'Each egg costs food when laid (workers 1, soldiers 2.5, majors 6, scouts 1.5).');
    y += 6;
    sec('Brood pipeline');
    const stages = {};
    for (const b of c.brood) { const key = b.caste; stages[key] = stages[key] || [0, 0, 0, 0, 0, 0]; stages[key][Math.min(5, b.left)] += b.n; }
    if (!c.brood.length) line('No brood', c.food < 5 ? 'not enough food!' : 'nursery empty', COL.bad);
    for (const k in stages) line(CASTES[k].name, stages[k].map((n, i) => n ? `${n} in ${i}t` : '').filter(Boolean).join(', '));
    const bc = broodCount(c);
    if (inc.nurseSupport < bc) line('⚠ Too few nurses', `${fmt(inc.nurseSupport)} / ${bc}`, COL.bad, 'Brood beyond what nurses can tend stops developing. Assign more workers to Nurse.');
    line('Queen lays', `${inc.eggs} eggs / turn`, COL.text, 'Limited by the Royal Chamber, season, nursery space, population cap and food.');
    y += 6;
    sec('Population');
    for (const k of CASTE_KEYS) if (c.adults[k] || casteUnlocked(c, k)) line(`${CASTES[k].name} in nest`, String(c.adults[k]));
    const pop = population(st, c), pc = popCap(st, c);
    line('Total (incl. swarms/outposts)', `${pop} / ${pc}`, pop > pc ? COL.bad : COL.text, pop > pc ? 'Overcrowded! Mortality rises sharply. Dig more Worker Galleries.' : null);
    line('Mortality', `${Math.max(0.5, S.mortality).toFixed(1)}% / turn`, COL.dim, 'Natural deaths. A Refuse Midden and Ventilation Shafts reduce it.');
    y += 6;
    sec('Military');
    line('Attack / Health multipliers', `x${S.atk.toFixed(2)} / x${S.hp.toFixed(2)}`);
    line('Nest defence', `x${nestDefMult(st, c).toFixed(2)}`);
    line('Garrison strength', fmt(power(st, c, c.adults, nestDefMult(st, c))));
    if (c.starving) { y += 6; text(ctx, '⚠ FAMINE - the colony is starving!', x, y, { font: `bold 14px ${FONT_BODY}`, color: COL.bad }); }
  }

  panelWork(ctx, x, y, w) {
    const st = App.st, c = this.col(), inc = projectIncome(st, c), S = cstats(st, c);
    text(ctx, 'Worker Jobs', x, y, { font: `bold 15px ${FONT_HEAD}`, color: COL.gold }); y += 22;
    wrap(ctx, `Assign the ${c.adults.worker} workers in the nest. Shares are rebalanced automatically.`, x, y, w, 16, { font: `12px ${FONT_BODY}`, color: COL.dim }); y += 36;
    const J = normJobs(c.jobs);
    const effect = {
      forage: `+${fmt(inc.forage)} food (land supplies ${fmt(inc.cap)})`,
      build: `+${fmt(c.adults.worker * J.build * 0.6 * S.build)} materials`,
      nurse: `tends ${fmt(inc.nurseSupport)} brood (have ${broodCount(c)})`,
      research: `+${fmt(inc.rp)} research`,
    };
    for (const k of JOB_KEYS) {
      const adj = d => {
        const nj = Object.assign({}, J);
        nj[k] = clamp(nj[k] + d, 0, 1);
        const rest = JOB_KEYS.filter(q => q !== k), rs = rest.reduce((a, q) => a + nj[q], 0);
        const left = 1 - nj[k];
        for (const q of rest) nj[q] = rs > 0 ? nj[q] / rs * left : left / rest.length;
        c.jobs = nj;
      };
      text(ctx, JOBS[k].name, x, y + 4, { font: `bold 14px ${FONT_BODY}` });
      UI.tip(x, y, 100, 22, JOBS[k].desc);
      button(ctx, x + w - 150, y, 28, 24, '-', () => adj(-0.05), { size: 16 });
      text(ctx, `${Math.round(J[k] * 100)}%  (${Math.round(J[k] * c.adults.worker)})`, x + w - 82, y + 5, { font: `bold 13px ${FONT_BODY}`, align: 'center' });
      button(ctx, x + w - 28, y, 28, 24, '+', () => adj(0.05), { size: 16 });
      bar(ctx, x, y + 30, w, 7, J[k], { forage: '#8fd16a', build: '#c8a060', nurse: '#f3ead8', research: '#b48ef0' }[k]);
      text(ctx, effect[k], x, y + 42, { font: `12px ${FONT_BODY}`, color: COL.dim });
      y += 66;
    }
    y += 4;
    text(ctx, 'Caste Mix of New Eggs', x, y, { font: `bold 15px ${FONT_HEAD}`, color: COL.gold }); y += 22;
    wrap(ctx, 'Larval feeding decides what each egg becomes. Larger castes cost more food and take longer.', x, y, w, 16, { font: `12px ${FONT_BODY}`, color: COL.dim }); y += 36;
    const M = normMix(c);
    for (const k of CASTE_KEYS) {
      const locked = !casteUnlocked(c, k);
      const adj = d => {
        const nm = Object.assign({}, M);
        nm[k] = clamp(nm[k] + d, 0, 1);
        const rest = CASTE_KEYS.filter(q => q !== k && casteUnlocked(c, q)), rs = rest.reduce((a, q) => a + nm[q], 0);
        const left = 1 - nm[k];
        for (const q of rest) nm[q] = rs > 0 ? nm[q] / rs * left : left / rest.length;
        c.mix = nm;
      };
      drawAnt(ctx, c.species, k, x + 14, y + 11, -0.4, k === 'major' ? 24 : 18, 0, locked ? 0.3 : 1);
      text(ctx, CASTES[k].name, x + 34, y + 4, { font: `bold 13px ${FONT_BODY}`, color: locked ? COL.faint : COL.text });
      UI.tip(x, y, 140, 24, `${CASTES[k].desc}\nAttack ${CASTES[k].atk}, health ${CASTES[k].hp}, costs ${CASTES[k].cost} food, ${Math.max(1, CASTES[k].time + S.broodTime)} turns to mature.${locked ? '\nRequires ' + TECHS[CASTES[k].req].name : ''}`);
      if (locked) { text(ctx, 'requires ' + TECHS[CASTES[k].req].name, x + w, y + 5, { font: `12px ${FONT_BODY}`, align: 'right', color: COL.faint }); y += 34; continue; }
      button(ctx, x + w - 150, y, 28, 24, '-', () => adj(-0.05), { size: 16 });
      text(ctx, `${Math.round(M[k] * 100)}%`, x + w - 82, y + 5, { font: `bold 13px ${FONT_BODY}`, align: 'center' });
      button(ctx, x + w - 28, y, 28, 24, '+', () => adj(0.05), { size: 16 });
      y += 34;
    }
  }

  panelNest(ctx, x, y, w) {
    const st = App.st, c = this.col(), S = cstats(st, c);
    text(ctx, 'Excavation', x, y, { font: `bold 15px ${FONT_HEAD}`, color: COL.gold });
    text(ctx, `${c.builds.length}/${S.buildSlots} crews busy  •  ${fmt(c.materials)} materials`, x + w, y + 2, { font: `12px ${FONT_BODY}`, align: 'right', color: COL.dim });
    y += 26;
    for (const k of CHAMBER_KEYS) {
      const Ch = CHAMBERS[k], lvl = c.chambers[k] || 0, sel = this.selCh === k;
      const hgt = 56;
      roundRect(ctx, x - 6, y - 4, w + 12, hgt - 4, 6);
      ctx.fillStyle = sel ? 'rgba(217,164,65,0.18)' : 'rgba(255,255,255,0.03)'; ctx.fill();
      if (sel) { ctx.strokeStyle = COL.gold; ctx.stroke(); }
      UI.region(x - 6, y - 4, w - 110, hgt - 4, () => this.selCh = k);
      text(ctx, `${Ch.name}`, x, y, { font: `bold 13px ${FONT_BODY}`, color: lvl ? COL.text : COL.dim });
      text(ctx, lvl ? `Lv ${lvl}` : 'not dug', x + 150, y + 1, { font: `12px ${FONT_BODY}`, color: lvl ? COL.gold : COL.faint });
      const cur = lvl ? Ch.fmt(Ch.values[lvl - 1]) : 'none';
      const nxt = lvl < 5 ? Ch.fmt(Ch.values[lvl]) : 'max';
      text(ctx, `${cur}  →  ${nxt}`, x, y + 20, { font: `12px ${FONT_BODY}`, color: COL.dim });
      UI.tip(x - 6, y - 4, w - 110, hgt - 4, `${Ch.name}\n${Ch.desc}`);
      const bld = c.builds.find(b => b.key === k);
      if (bld) {
        bar(ctx, x + w - 100, y + 6, 100, 8, 1 - bld.left / bld.total, COL.amber);
        text(ctx, `${bld.left} turn${bld.left > 1 ? 's' : ''}`, x + w - 50, y + 20, { font: `12px ${FONT_BODY}`, align: 'center', color: COL.gold });
      } else {
        const err = canBuild(st, c, k);
        const cost = lvl < 5 ? chamberCost(k, lvl + 1) : 0;
        button(ctx, x + w - 100, y + 2, 100, 34, lvl >= 5 ? 'Max level' : lvl ? `Dig ${cost}` : `Excavate ${cost}`, () => {
          const e = startBuild(st, c, k); if (e) App.toast(e, COL.bad); else { Sound.sfx('dig'); App.toast(`Workers begin excavating: ${Ch.name}`); }
        }, { disabled: !!err, primary: !err && sel, size: 12, tip: err || `Costs ${cost} materials, takes ${chamberTime(k, lvl + 1)} turns.` });
      }
      y += hgt;
    }
  }
}
