// =====================================================================
//  Campaign map scene
// =====================================================================
'use strict';

class MapScene {
  constructor() {
    const st = App.st, p = playerCol(st);
    this.zi = 1;
    const ts = this.ts();
    this.cam = { x: p.nest.x * ts - W / 2, y: p.nest.y * ts - H / 2 };
    this.sel = { type: 'site', x: p.nest.x, y: p.nest.y };
    this.hover = null; this.pathCache = null; this.anim = null; this.drag = null;
    this.dialog = null; this.processing = 0; this.t = 0;
    this.routeGeo = new Map(); this.disp = new Map();
    this.overlayVer = -1;
    this.buildOverlays();
    this.clampCam();
    if (new.target === MapScene) App.terrain.pregen(ZOOMS[this.zi], this.cam.x, this.cam.y, W, H);
  }
  ts() { return TILE * ZOOMS[this.zi]; }
  enter() { this.buildOverlays(); this.updateMood(true); }
  updateMood(force) {
    const st = App.st, p = playerCol(st);
    const war = st.colonies.some(c => c.alive && c !== p && atWar(st, p.id, c.id));
    Sound.music(war ? 'war' : 'map');
    const si = seasonIdx(st.turn);
    if (force || this._amb !== si) { Sound.ambience('surface', si); this._amb = si; }
  }

  // ---------------- overlays ----------------
  buildOverlays() {
    const st = App.st, { w, h } = st;
    if (!this.terrCv) { this.terrCv = makeCanvas(w, h); this.fogCv = makeCanvas(w, h); }
    const tg = this.terrCv.getContext('2d'), fg = this.fogCv.getContext('2d');
    const ti = tg.createImageData(w, h), fi = fg.createImageData(w, h);
    const cols = {};
    for (const c of st.colonies) cols[c.id] = hexToRgb(c.color);
    for (let i = 0; i < w * h; i++) {
      const o = st.owner[i];
      if (o >= 0 && st.explored[i]) { const c = cols[o]; ti.data[i * 4] = c[0]; ti.data[i * 4 + 1] = c[1]; ti.data[i * 4 + 2] = c[2]; ti.data[i * 4 + 3] = 60; }
      fi.data[i * 4] = 12; fi.data[i * 4 + 1] = 8; fi.data[i * 4 + 2] = 5;
      fi.data[i * 4 + 3] = st.visible[i] ? 0 : st.explored[i] ? 110 : 245;
    }
    tg.putImageData(ti, 0, 0); fg.putImageData(fi, 0, 0);
  }
  clampCam() {
    const ts = this.ts(), st = App.st;
    const mw = st.w * ts, mh = st.h * ts;
    this.cam.x = mw < W ? (mw - W) / 2 : clamp(this.cam.x, -200, mw - W + 200);
    this.cam.y = mh < H ? (mh - H) / 2 : clamp(this.cam.y, -120, mh - H + 160);
  }
  centerOn(x, y) { const ts = this.ts(); this.cam.x = (x + 0.5) * ts - W / 2; this.cam.y = (y + 0.5) * ts - H / 2; this.clampCam(); }
  tileAt(mx, my) { const ts = this.ts(); return [Math.floor((mx + this.cam.x) / ts), Math.floor((my + this.cam.y) / ts)]; }
  scr(x, y) { const ts = this.ts(); return [(x + 0.5) * ts - this.cam.x, (y + 0.5) * ts - this.cam.y]; }

  selectedSwarm() { return this.sel && this.sel.type === 'swarm' ? App.st.swarms.find(s => s.id === this.sel.id) : null; }

  // ---------------- update ----------------
  update(dt) {
    this.t += dt;
    const st = App.st;
    // keyboard panning
    if (!this.dialog && !st.popups.length) this.panKeys(dt);
    // move animation
    if (this.anim) this.stepAnim(dt);
    this.moodT = (this.moodT || 0) + dt;
    if (this.moodT > 1) { this.moodT = 0; this.updateMood(false); }
    // sound for newly shown popups
    const top = st.popups[0];
    if (top && top !== this.lastPopup && !this.processing) {
      this.lastPopup = top;
      const bad = /Flood|Predation|Mites|Antlion|Famine|Queen is Dead/.test(top.title) && !/no losses|stays dry/i.test(top.text);
      Sound.sfx(top.title === 'War Declared!' ? 'war' : top.title === 'Discovery!' ? 'research' : top.kind === 'event' ? (bad ? 'bad' : 'event') : 'popup');
    }
    // turn processing (delayed one frame so the overlay is drawn)
    if (this.processing === 1) { this.processing = 2; }
    else if (this.processing === 2) {
      const p0 = playerCol(st), before = { techs: p0.techs.length, ch: CHAMBER_KEYS.reduce((a, k) => a + (p0.chambers[k] || 0), 0), si: seasonIdx(st.turn) };
      endTurn(st);
      this.processing = 0;
      const after = { techs: p0.techs.length, ch: CHAMBER_KEYS.reduce((a, k) => a + (p0.chambers[k] || 0), 0), si: seasonIdx(st.turn) };
      if (after.techs > before.techs) { /* popup plays the discovery sound */ }
      else if (after.ch > before.ch) Sound.sfx('built');
      else if (after.si !== before.si) Sound.sfx('season');
      else Sound.sfx('turn');
      App.save('auto');
      this.buildOverlays(); this.pathCache = null;
      const sw = this.selectedSwarm(); if (!sw && this.sel?.type === 'swarm') this.sel = null;
    }
    // battles to present
    if (!this.anim && !this.processing && st.pendingBattles.length && !this.dialog) {
      const list = st.pendingBattles.slice(); st.pendingBattles = [];
      App.setScene(new BattleScene(list, () => { App.toMap(); }));
      return;
    }
    if (st.gameOver && !this.anim && !this.processing && !st.pendingBattles.length && !st.popups.length) {
      App.setScene(new GameOverScene(st.gameOver));
    }
  }

  panKeys(dt) {
    const sp = 700 * dt, k = App.keys;
    if (k['a'] || k['arrowleft']) this.cam.x -= sp;
    if (k['d'] || k['arrowright']) this.cam.x += sp;
    if (k['w'] || k['arrowup']) this.cam.y -= sp;
    if (k['s'] || k['arrowdown']) this.cam.y += sp;
    this.clampCam();
  }
  dragStart() { return { cx: this.cam.x, cy: this.cam.y }; }
  dragTo(d, dx, dy) { this.cam.x = d.cx - dx; this.cam.y = d.cy - dy; this.clampCam(); }
  stepAnim(dt) {
    const a = this.anim, st = App.st;
    a.t += dt;
    if (a.t < 0.13) return;
    a.t = 0;
    const sw = st.swarms.find(s => s.id === a.id);
    if (!sw || !sw.path.length) { this.anim = null; this.afterMove(); return; }
    const [nx, ny] = sw.path[0];
    const from = [sw.x, sw.y];
    const r = stepSwarm(st, sw, nx, ny);
    if (!r.ok) {
      if (r.blocked === 'peace') { sw.path = []; App.toast(`${r.col.name} is at peace with you - declare war to attack.`, COL.bad); }
      else if (r.blocked !== 'mp') sw.path = [];
      this.anim = null; this.afterMove(); return;
    }
    sw.path.shift();
    Sound.sfx('step');
    this.disp.set(sw.id, { fx: from[0], fy: from[1], t: 0 });
    if (r.merged) { this.sel = { type: 'swarm', id: r.merged.id }; this.anim = null; this.afterMove(); return; }
    if (r.battle) { sw.path = []; this.anim = null; this.afterMove(); return; }
    recompute(st); this.buildOverlays();
    if (sw.mp <= 0.001) { this.anim = null; this.afterMove(); }
  }
  afterMove() { const st = App.st; recompute(st); updateRouteBlocks(st); this.buildOverlays(); this.pathCache = null; }

  orderMove(sw, tx, ty) {
    const st = App.st;
    if (this.anim) return;
    if (sw.x === tx && sw.y === ty) return;
    const p = playerCol(st);
    // peaceful target?
    const site = siteAt(st, tx, ty);
    const foe = site && site.col !== p ? site.col : (swarmsAt(st, tx, ty).find(s => s.owner !== p.id) ? colById(st, swarmsAt(st, tx, ty).find(s => s.owner !== p.id).owner) : null);
    if (foe && !atWar(st, p.id, foe.id)) {
      if (!site && swarmsAt(st, tx, ty).every(s => s.owner === p.id || !atWar(st, p.id, s.owner))) {
        // peaceful swarm in the way - only ask if the user explicitly targets it
      }
      this.dialog = new ConfirmDialog(`Attack ${foe.name}?`, `Attacking the ${foe.name} colony (${SPECIES[foe.species].name}) will declare war on them. Their opinion of you: ${Math.round(foe.rel[p.id].score)}.`, 'Declare War', () => {
        declareWar(st, p.id, foe.id); Sound.sfx('war'); this.dialog = null; this.orderMove(sw, tx, ty);
      }, () => this.dialog = null, true);
      return;
    }
    const path = findPath(st, sw.x, sw.y, tx, ty, p);
    if (!path) { App.toast('No route there.', COL.bad); return; }
    sw.path = path;
    if (sw.mp > 0) this.anim = { id: sw.id, t: 1 };
  }

  // ---------------- input ----------------
  onMouseDown(x, y, btn) {
    if (this.dialog || App.st.popups.length) return;
    if (UI.consumesPoint(x, y)) return;
    this.drag = Object.assign({ x, y, btn, moved: false }, this.dragStart(btn));
  }
  onMouseMove(x, y) {
    if (this.drag) {
      const dx = x - this.drag.x, dy = y - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) this.drag.moved = true;
      if (this.drag.moved) this.dragTo(this.drag, dx, dy);
    }
    const t = this.tileAt(x, y);
    if (!this.hover || this.hover[0] !== t[0] || this.hover[1] !== t[1]) { this.hover = t; this.pathCache = null; }
  }
  onMouseUp(x, y, btn) {
    const d = this.drag; this.drag = null;
    return !!(d && d.moved);
  }
  onClick(x, y) {
    if (this.dialog || App.st.popups.length || this.processing) return;
    const st = App.st, p = playerCol(st);
    const [tx, ty] = this.tileAt(x, y);
    if (!inMap(st, tx, ty)) return;
    const vis = st.visible[idx(st, tx, ty)], exp = st.explored[idx(st, tx, ty)];
    const own = swarmsAt(st, tx, ty).filter(s => s.owner === p.id);
    const sw = this.selectedSwarm();
    if (own.length) {
      // cycle through own swarms on that tile
      const i = sw ? own.indexOf(sw) : -1;
      if (sw && i < 0 && !(siteAt(st, tx, ty))) { this.tapOrder(sw, tx, ty); return; }
      this.sel = { type: 'swarm', id: own[(i + 1) % own.length].id }; this.pathCache = null; this.pendingTap = null; return;
    }
    const site = exp ? siteAt(st, tx, ty) : null;
    const foeSwarm = vis ? swarmsAt(st, tx, ty).find(s => s.owner !== p.id) : null;
    if (sw && (!site || site.col !== p) ) { this.tapOrder(sw, tx, ty); return; }
    this.pendingTap = null;
    if (site) { this.sel = { type: 'site', x: tx, y: ty }; return; }
    if (foeSwarm) { this.sel = { type: 'enemy', id: foeSwarm.id }; return; }
    this.sel = { type: 'tile', x: tx, y: ty };
  }
  // On touchscreens the first tap previews the route, a second tap on the same spot confirms it
  tapOrder(sw, tx, ty) {
    if (!App.lastTouch || (this.pendingTap && this.pendingTap[0] === tx && this.pendingTap[1] === ty)) {
      this.pendingTap = null; this.orderMove(sw, tx, ty); return;
    }
    this.pendingTap = [tx, ty]; this.hover = [tx, ty]; this.pathCache = null;
    Sound.sfx('tab');
  }
  onPinch(ratio, cx, cy) {
    this._pz = (this._pz || 0) + Math.log(ratio);
    while (this._pz > 0.18) { this.onWheel(cx, cy, -1); this._pz -= 0.18; }
    while (this._pz < -0.18) { this.onWheel(cx, cy, 1); this._pz += 0.18; }
  }
  onTwoFingerPan(dx, dy) { this.cam.x -= dx; this.cam.y -= dy; this.clampCam(); }
  onRightClick(x, y) {
    if (this.dialog || App.st.popups.length) return;
    const sw = this.selectedSwarm();
    if (!sw) return;
    const [tx, ty] = this.tileAt(x, y);
    if (inMap(App.st, tx, ty)) this.orderMove(sw, tx, ty);
  }
  onWheel(x, y, dy) {
    if (this.dialog) return;
    const old = this.ts();
    const nz = clamp(this.zi + (dy > 0 ? 1 : -1), 0, ZOOMS.length - 1);
    if (nz === this.zi) return;
    const u = (x + this.cam.x) / old, v = (y + this.cam.y) / old;
    this.zi = nz;
    const ts = this.ts();
    this.cam.x = u * ts - x; this.cam.y = v * ts - y;
    this.clampCam();
  }
  onKey(e) {
    if (this.dialog) { this.dialog.onKey?.(e); return; }
    const st = App.st;
    if (st.popups.length) { if (e.key === 'Enter' || e.key === 'Escape') this.closePopup(st.popups[0], e.key === 'Enter'); return; }
    const k = e.key.toLowerCase();
    if (k === 'escape') { if (this.sel) this.sel = null; else this.openMenu(); }
    else if (k === ' ' || k === 'enter') this.endTurnClick();
    else if (k === 'c') App.setScene(new ColonyScene());
    else if (k === 'r') App.setScene(new ResearchScene());
    else if (k === 'p' || k === 'g') App.setScene(new DiplomacyScene());
    else if (k === 'n' || k === 'tab') this.nextSwarm();
    else if (k === 'h') { const p = playerCol(st); this.centerOn(p.nest.x, p.nest.y); }
    else if (k === '+' || k === '=') this.onWheel(W / 2, H / 2, -1);
    else if (k === '-') this.onWheel(W / 2, H / 2, 1);
    else if (k === 'f5') { e.preventDefault?.(); if (App.save('1')) App.toast('Quick-saved to slot 1'); }
  }
  openMenu() { this.dialog = new GameMenu(this); }
  endTurnClick() { if (!this.processing && !this.anim && !App.st.popups.length && !this.dialog) this.processing = 1; }
  nextSwarm() {
    const st = App.st;
    const list = st.swarms.filter(s => s.owner === st.playerId);
    if (!list.length) { App.toast('You have no swarms. Muster one from your nest.'); return; }
    const ready = list.filter(s => s.mp > 0 && !s.path.length);
    const pool = ready.length ? ready : list;
    const cur = this.selectedSwarm();
    const i = pool.indexOf(cur);
    const nx = pool[(i + 1) % pool.length];
    this.sel = { type: 'swarm', id: nx.id }; this.centerOn(nx.x, nx.y);
  }
  closePopup(p, accept) {
    const st = App.st;
    st.popups.shift();
    if (p.kind === 'peace' && accept) { makePeace(st, st.playerId, p.from); Sound.sfx('peace'); App.toast('Peace agreed.', COL.good); }
    if (p.kind === 'trade' && accept) { const e = createRoute(st, st.playerId, p.from); if (e) App.toast(e, COL.bad); else { Sound.sfx('trade'); App.toast('Trade route established!', COL.good); } recompute(st); this.buildOverlays(); }
  }

  // ---------------- drawing ----------------
  draw(ctx, dt) {
    const st = App.st;
    this.drawWorld(ctx, dt);
    this.drawHUD(ctx);
    if (this.processing) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
      panel(ctx, W / 2 - 200, H / 2 - 40, 400, 80);
      text(ctx, 'The colonies stir...', W / 2, H / 2 - 12, { font: `bold 20px ${FONT_HEAD}`, align: 'center', color: COL.gold });
      text(ctx, 'Rival queens lay eggs, swarms march', W / 2, H / 2 + 14, { font: `13px ${FONT_BODY}`, align: 'center', color: COL.dim });
    }
    if (st.popups.length && !this.dialog) this.drawPopup(ctx, st.popups[0]);
    if (this.dialog) this.dialog.draw(ctx);
    if (this.showIntro) this.drawIntro(ctx);
  }
  drawWorld(ctx, dt) {
    const st = App.st, ts = this.ts(), z = ZOOMS[this.zi];
    App.terrain.draw(ctx, ZOOMS[this.zi], this.cam.x, this.cam.y, W, H, 3);
    const x0 = Math.max(0, Math.floor(this.cam.x / ts)), y0 = Math.max(0, Math.floor(this.cam.y / ts));
    const x1 = Math.min(st.w - 1, Math.ceil((this.cam.x + W) / ts)), y1 = Math.min(st.h - 1, Math.ceil((this.cam.y + H) / ts));
    // territory tint
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrCv, -this.cam.x, -this.cam.y, st.w * ts, st.h * ts);
    ctx.imageSmoothingEnabled = true;
    this.drawBorders(ctx, x0, y0, x1, y1, ts);
    this.drawRoutes(ctx, ts);
    this.drawFeatures(ctx, x0, y0, x1, y1, ts, z);
    this.drawSites(ctx, ts, z);
    this.drawSwarms(ctx, ts, z, dt);
    this.drawPathPreview(ctx, ts);
    // fog of war
    ctx.drawImage(this.fogCv, -this.cam.x, -this.cam.y, st.w * ts, st.h * ts);
    this.drawWaterGlints(ctx, x0, y0, x1, y1, ts);
    // darkness beyond the edge of the world
    {
      const mx0 = -this.cam.x, my0 = -this.cam.y, mx1 = st.w * ts - this.cam.x, my1 = st.h * ts - this.cam.y;
      ctx.fillStyle = '#0b0705';
      if (mx0 > 0) ctx.fillRect(0, 0, mx0, H);
      if (mx1 < W) ctx.fillRect(mx1, 0, W - mx1, H);
      if (my0 > 0) ctx.fillRect(0, 0, W, my0);
      if (my1 < H) ctx.fillRect(0, my1, W, H - my1);
    }
    // season tint
    ctx.fillStyle = season(st.turn).tint; ctx.fillRect(0, 0, W, H);
    this.drawSelection(ctx, ts);
  }

  drawBorders(ctx, x0, y0, x1, y1, ts) {
    const st = App.st, w = st.w, own = st.owner;
    const byCol = {};
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x, o = own[i];
      if (o < 0 || !st.explored[i]) continue;
      const px = x * ts - this.cam.x, py = y * ts - this.cam.y;
      const segs = byCol[o] || (byCol[o] = []);
      if (x === 0 || own[i - 1] !== o) segs.push(px, py, px, py + ts);
      if (x === w - 1 || own[i + 1] !== o) segs.push(px + ts, py, px + ts, py + ts);
      if (y === 0 || own[i - w] !== o) segs.push(px, py, px + ts, py);
      if (y === st.h - 1 || own[i + w] !== o) segs.push(px, py + ts, px + ts, py + ts);
    }
    ctx.lineCap = 'round';
    for (const id in byCol) {
      const c = colById(st, +id), segs = byCol[id];
      for (const pass of [0, 1]) {
        ctx.strokeStyle = pass ? c.color : 'rgba(0,0,0,0.45)'; ctx.lineWidth = pass ? 2 : 4;
        ctx.beginPath();
        for (let k = 0; k < segs.length; k += 4) { ctx.moveTo(segs[k], segs[k + 1]); ctx.lineTo(segs[k + 2], segs[k + 3]); }
        ctx.stroke();
      }
    }
  }

  routeGeom(r) {
    let g = this.routeGeo.get(r.id);
    if (!g) {
      const pts = r.path.map(([x, y]) => [x + 0.5, y + 0.5]);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      g = { pts, cum, len: cum[cum.length - 1] };
      this.routeGeo.set(r.id, g);
    }
    return g;
  }
  posOnRoute(g, s) {
    const d = s * g.len;
    let lo = 0, hi = g.cum.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (g.cum[m] <= d) lo = m; else hi = m; }
    const seg = g.cum[hi] - g.cum[lo] || 1, t = (d - g.cum[lo]) / seg;
    const a = g.pts[lo], b = g.pts[hi];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
  drawRoutes(ctx, ts) {
    const st = App.st;
    for (const r of st.routes) {
      const g = this.routeGeom(r);
      const known = r.a === st.playerId || r.b === st.playerId || st.explored[idx(st, ...r.path[0])] || st.explored[idx(st, ...r.path[r.path.length - 1])];
      if (!known) continue;
      const mine = r.a === st.playerId || r.b === st.playerId;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      g.pts.forEach(([x, y], i) => { const sx = x * ts - this.cam.x, sy = y * ts - this.cam.y; i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(3, ts * 0.22); ctx.stroke();
      ctx.strokeStyle = r.blocked ? 'rgba(255,80,60,0.7)' : mine ? 'rgba(255,214,120,0.55)' : 'rgba(220,200,160,0.35)';
      ctx.lineWidth = Math.max(1.5, ts * 0.1);
      ctx.setLineDash([ts * 0.3, ts * 0.25]); ctx.lineDashOffset = -this.t * ts * 0.8;
      ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      if (r.blocked) {
        const [bx, by] = this.posOnRoute(g, 0.5);
        text(ctx, '✖ trail cut', bx * ts - this.cam.x, by * ts - this.cam.y - 16, { font: `bold 12px ${FONT_BODY}`, align: 'center', color: '#ff8a70' });
        continue;
      }
      // trader ants
      const A = colById(st, r.a), B = colById(st, r.b);
      const n = Math.min(14, Math.ceil(g.len / 3));
      const spd = 0.7 / g.len;
      for (let i = 0; i < n; i++) {
        const fwd = i % 2 === 0;
        let s = (this.t * spd + i / n) % 1; if (!fwd) s = 1 - s;
        const [x, y, a] = this.posOnRoute(g, s);
        const tx = Math.floor(x), ty = Math.floor(y);
        if (!inMap(st, tx, ty) || !st.visible[idx(st, tx, ty)]) continue;
        const sx = x * ts - this.cam.x + Math.sin(i * 3.1) * ts * 0.12, sy = y * ts - this.cam.y + Math.cos(i * 2.3) * ts * 0.12;
        if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
        const sp = fwd ? A.species : B.species, ang = a + (fwd ? 0 : Math.PI);
        drawAnt(ctx, sp, 'worker', sx, sy, ang, ts * 0.42, Math.floor(this.t * 14 + i) % 6);
        if (ts >= 22) { ctx.save(); ctx.translate(sx + Math.cos(ang) * ts * 0.17, sy + Math.sin(ang) * ts * 0.17); ctx.scale(ts / 50, ts / 50); ctx.drawImage(item(fwd ? 'droplet' : 'crumb'), -6, -6); ctx.restore(); }
      }
    }
  }

  drawFeatures(ctx, x0, y0, x1, y1, ts, z) {
    const st = App.st;
    for (const f of st.features) {
      if (f.x < x0 - 1 || f.x > x1 + 1 || f.y < y0 - 1 || f.y > y1 + 1) continue;
      if (!st.explored[idx(st, f.x, f.y)]) continue;
      const [sx, sy] = this.scr(f.x, f.y);
      const s = ts / 32;
      ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
      const r = mulberry32(f.x * 31 + f.y * 17);
      switch (f.type) {
        case 'aphids': {
          ctx.strokeStyle = '#3e6a1e'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-10, 12); ctx.quadraticCurveTo(-2, 0, 6, -12); ctx.stroke();
          ctx.strokeStyle = '#6aa83a'; ctx.lineWidth = 1; ctx.stroke();
          for (let i = 0; i < 6; i++) { const t = i / 6; ctx.drawImage(item('aphid'), -10 + t * 16 - 7 + (i % 2) * 5, 12 - t * 24 - 6); }
          break;
        }
        case 'seeds': for (let i = 0; i < 9; i++) ctx.drawImage(item(i % 3 ? 'seed' : 'seed2'), (r() - 0.5) * 20 - 3, (r() - 0.5) * 16 - 2); break;
        case 'fruit': {
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(4, 8, 14, 8, 0, 0, 6.28); ctx.fill();
          ctx.drawImage(item('berry'), -17, -17);
          if (f.ttl < 4) { ctx.fillStyle = 'rgba(60,40,20,0.4)'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 6.28); ctx.fill(); }
          break;
        }
        case 'carcass': ctx.rotate(0.7); ctx.drawImage(item('beetle'), -20, -15); break;
        case 'picnic': for (let i = 0; i < 6; i++) { ctx.save(); ctx.translate((r() - 0.5) * 22, (r() - 0.5) * 18); ctx.scale(1.4, 1.4); ctx.drawImage(item('crumb'), -7, -6); ctx.restore(); } break;
      }
      ctx.restore();
      if (UI.over(sx - ts / 2, sy - ts / 2, ts, ts)) UI.tip(sx - ts / 2, sy - ts / 2, ts, ts, `${FEATURES[f.type].name} (+${f.food} food/turn)${f.ttl ? ` - lasts ${f.ttl} more turns` : ''}\n${FEATURES[f.type].desc}`);
    }
  }

  drawSites(ctx, ts, z) {
    const st = App.st;
    for (const c of st.colonies) {
      if (!c.alive) continue;
      const list = [{ x: c.nest.x, y: c.nest.y, nest: true }, ...c.outposts.map(o => ({ x: o.x, y: o.y, nest: false, o }))];
      for (const s of list) {
        if (!st.explored[idx(st, s.x, s.y)]) continue;
        const [sx, sy] = this.scr(s.x, s.y);
        if (sx < -80 || sy < -80 || sx > W + 80 || sy > H + 80) continue;
        const size = Math.round(ts * (s.nest ? 1.0 : 0.62));
        const m = moundSprite(Math.max(6, size), c.color, !s.nest);
        ctx.drawImage(m, sx - m.width / 2, sy - m.height * 0.58);
        // a few ants milling around the entrance
        if (st.visible[idx(st, s.x, s.y)] && ts >= 18) {
          for (let i = 0; i < (s.nest ? 5 : 2); i++) {
            const a = this.t * 0.6 * (i % 2 ? 1 : -1) + i * 1.3, rr = size * (0.75 + 0.15 * Math.sin(this.t + i));
            drawAnt(ctx, c.species, 'worker', sx + Math.cos(a) * rr, sy + Math.sin(a) * rr * 0.75, a + (i % 2 ? Math.PI / 2 : -Math.PI / 2), ts * 0.3, Math.floor(this.t * 12 + i) % 6);
          }
        }
        if (s.nest && ts >= 16) {
          const label = c.name + (c.isPlayer ? '' : '');
          ctx.font = `bold ${Math.max(11, Math.round(13 * Math.min(1.2, z + 0.2)))}px ${FONT_HEAD}`;
          const tw = ctx.measureText(label).width + 16;
          roundRect(ctx, sx - tw / 2, sy - size - 26, tw, 20, 10);
          ctx.fillStyle = 'rgba(15,10,6,0.78)'; ctx.fill(); ctx.strokeStyle = c.color; ctx.lineWidth = 1.5; ctx.stroke();
          text(ctx, label, sx, sy - size - 16, { font: ctx.font, align: 'center', base: 'middle', color: c.isPlayer ? COL.gold : '#f0e6d0' });
          if (!c.isPlayer) {
            const p = playerCol(st);
            if (atWar(st, p.id, c.id)) text(ctx, '⚔ WAR', sx, sy - size - 38, { font: `bold 11px ${FONT_BODY}`, align: 'center', color: '#ff7a5c' });
          }
        }
      }
    }
  }

  swarmDisplayPos(sw, ts, dt) {
    const d = this.disp.get(sw.id);
    let x = sw.x, y = sw.y, moving = false;
    if (d) {
      d.t += dt / 0.13;
      if (d.t >= 1) this.disp.delete(sw.id);
      else { const t = smooth(d.t); x = d.fx + (sw.x - d.fx) * t; y = d.fy + (sw.y - d.fy) * t; moving = true; }
    }
    return [(x + 0.5) * ts - this.cam.x, (y + 0.5) * ts - this.cam.y, moving, d ? Math.atan2(sw.y - d.fy, sw.x - d.fx) : 0];
  }
  drawSwarms(ctx, ts, z, dt) {
    const st = App.st;
    const stackIdx = {};
    for (const sw of st.swarms) {
      const vis = sw.owner === st.playerId || st.visible[idx(st, sw.x, sw.y)];
      if (!vis) continue;
      const c = colById(st, sw.owner);
      const key = sw.x + ',' + sw.y; const si = stackIdx[key] = (stackIdx[key] ?? -1) + 1;
      let [sx, sy, moving, ang] = this.swarmDisplayPos(sw, ts, dt);
      sx += si * ts * 0.25; sy -= si * ts * 0.12;
      if (sx < -60 || sy < -60 || sx > W + 60 || sy > H + 60) continue;
      const tot = sumUnits(sw.units);
      const n = clamp(Math.round(Math.sqrt(tot) * 0.9), 3, 11);
      // ground ring
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(sx + 2, sy + ts * 0.1 + 2, Math.max(14, ts * 0.52), Math.max(10, ts * 0.36), 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = withAlpha(c.color, 0.32);
      ctx.beginPath(); ctx.ellipse(sx, sy + ts * 0.1, Math.max(14, ts * 0.52), Math.max(10, ts * 0.36), 0, 0, 6.28); ctx.fill();
      ctx.strokeStyle = c.color; ctx.lineWidth = 2.5; ctx.stroke();
      const castes = [];
      for (const k of ['major', 'soldier', 'scout', 'worker']) for (let i = 0; i < Math.ceil(n * (sw.units[k] || 0) / Math.max(1, tot)); i++) castes.push(k);
      for (let i = 0; i < Math.min(n, castes.length); i++) {
        const r = mulberry32(sw.id * 13 + i);
        const ox = (r() - 0.5) * ts * 0.85, oy = (r() - 0.5) * ts * 0.55;
        let a, x = sx + ox, y = sy + oy;
        if (moving) a = ang + (r() - 0.5) * 0.4;
        else { const ph = this.t * (0.5 + r() * 0.6) + i; a = ph + Math.PI / 2; x += Math.cos(ph) * ts * 0.06; y += Math.sin(ph) * ts * 0.05; }
        const len = Math.max(9, ts * (castes[i] === 'major' ? 0.6 : castes[i] === 'soldier' ? 0.5 : 0.42));
        drawAnt(ctx, c.species, castes[i], x, y, a, len, Math.floor(this.t * (moving ? 18 : 6) + i) % 6);
      }
      // badge
      const bt = fmt(tot);
      ctx.font = `bold 11px ${FONT_BODY}`;
      const bw = Math.max(22, ctx.measureText(bt).width + 10);
      roundRect(ctx, sx - bw / 2, sy + ts * 0.32, bw, 15, 7);
      ctx.fillStyle = 'rgba(12,8,5,0.85)'; ctx.fill(); ctx.strokeStyle = c.color; ctx.lineWidth = 1; ctx.stroke();
      text(ctx, bt, sx, sy + ts * 0.32 + 7.5, { font: ctx.font, align: 'center', base: 'middle', color: '#fff', shadow: false });
      if (sw.owner === st.playerId && sw.mp > 0 && !sw.path.length) {
        ctx.fillStyle = '#9fe07a'; ctx.beginPath(); ctx.arc(sx + bw / 2 + 4, sy + ts * 0.32 + 7.5, 3, 0, 6.28); ctx.fill();
      }
      if (sw.owner !== st.playerId && atWar(st, st.playerId, sw.owner)) {
        text(ctx, '⚔', sx - bw / 2 - 10, sy + ts * 0.32, { font: `bold 12px ${FONT_BODY}`, color: '#ff7a5c' });
      }
    }
  }

  drawPathPreview(ctx, ts) {
    const st = App.st, sw = this.selectedSwarm();
    if (!sw) return;
    let path = null, ghost = false;
    if (sw.path && sw.path.length) path = sw.path;
    else if (this.hover && inMap(st, ...this.hover) && !this.anim && !(UI.consumesPoint(UI.mx, UI.my))) {
      const key = this.hover.join(',');
      if (!this.pathCache || this.pathCache.key !== key) this.pathCache = { key, path: findPath(st, sw.x, sw.y, this.hover[0], this.hover[1], playerCol(st), { maxNodes: 15000 }) };
      path = this.pathCache.path; ghost = true;
      if (!path && !(sw.x === this.hover[0] && sw.y === this.hover[1])) {
        const [sx, sy] = this.scr(...this.hover);
        text(ctx, '✖', sx, sy, { font: `bold 18px ${FONT_BODY}`, align: 'center', base: 'middle', color: '#ff6b5c' });
      }
    }
    if (!path || !path.length) return;
    const c = playerCol(st);
    let mp = sw.mp, turn = 0, px = sw.x, py = sw.y;
    const full = swarmMaxMP(st, sw);
    ctx.save();
    for (let i = 0; i < path.length; i++) {
      const [x, y] = path[i];
      const cost = moveCostStep(st, px, py, x, y, c);
      if (mp + 1e-6 < cost && !(mp >= full - 1e-6)) { turn++; mp = full; }
      mp -= cost; px = x; py = y;
      const [sx, sy] = this.scr(x, y);
      const col = turn === 0 ? '#a8f07a' : turn === 1 ? '#f2d24e' : '#f09a4e';
      ctx.globalAlpha = ghost ? 0.85 : 0.6;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(sx + 1, sy + 1, Math.max(2.5, ts * 0.09), 0, 6.28); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, Math.max(2, ts * 0.08), 0, 6.28); ctx.fill();
      if (i === path.length - 1) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, ts * 0.35, 0, 6.28); ctx.stroke();
        const site = siteAt(st, x, y), foe = swarmsAt(st, x, y).find(s => s.owner !== st.playerId);
        let label = (site && site.col !== c) || foe ? '⚔ Attack' : turn ? `${turn + 1} turns` : '';
        if (this.pendingTap && this.pendingTap[0] === x && this.pendingTap[1] === y) label = (label ? label + ' - ' : '') + 'tap again to confirm';
        if (label) text(ctx, label, sx, sy - ts * 0.6, { font: `bold 12px ${FONT_BODY}`, align: 'center', color: col });
      }
    }
    ctx.restore();
  }

  drawWaterGlints(ctx, x0, y0, x1, y1, ts) {
    const st = App.st;
    if (ts < 14) return;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * st.w + x;
      if (st.terrain[i] !== T_WATER || !st.visible[i]) continue;
      const h = hash2(x, y, 9);
      const ph = (this.t * 0.6 + h * 10) % 3;
      if (ph > 1) continue;
      const a = Math.sin(ph * Math.PI);
      ctx.globalAlpha = a * 0.7;
      const sx = (x + hash2(x, y, 3)) * ts - this.cam.x, sy = (y + hash2(x, y, 4)) * ts - this.cam.y;
      ctx.beginPath(); ctx.ellipse(sx, sy, ts * 0.12 * (0.5 + a), ts * 0.03, 0, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawSelection(ctx, ts) {
    const st = App.st, s = this.sel;
    if (!s) return;
    let x, y;
    if (s.type === 'swarm' || s.type === 'enemy') {
      const sw = st.swarms.find(q => q.id === s.id); if (!sw) { this.sel = null; return; }
      [x, y] = this.swarmDisplayPos(sw, ts, 0);
    } else[x, y] = this.scr(s.x, s.y);
    const pulse = 1 + Math.sin(this.t * 5) * 0.06;
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]); ctx.lineDashOffset = -this.t * 20;
    ctx.beginPath(); ctx.ellipse(x, y + ts * 0.08, ts * 0.62 * pulse, ts * 0.44 * pulse, 0, 0, 6.28); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---------------- HUD ----------------
  drawHUD(ctx) {
    const st = App.st, p = playerCol(st), inc = projectIncome(st, p);
    // top bar
    const g = ctx.createLinearGradient(0, 0, 0, 46);
    g.addColorStop(0, 'rgba(36,24,14,0.96)'); g.addColorStop(1, 'rgba(20,13,8,0.96)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 46);
    ctx.fillStyle = COL.border; ctx.fillRect(0, 46, W, 1);
    UI.region(0, 0, W, 46, () => { });
    let x = 14;
    const res = (icon, val, sub, col, tip, wdt) => {
      drawIcon(ctx, icon, x + 9, 23, 18);
      text(ctx, val, x + 24, 8, { font: `bold 15px ${FONT_BODY}`, color: col });
      text(ctx, sub, x + 24, 27, { font: `11px ${FONT_BODY}`, color: sub.startsWith('-') ? COL.bad : COL.dim });
      UI.tip(x, 0, wdt, 46, tip);
      x += wdt;
    };
    const cap = storageCap(st, p);
    res('food', `${fmt(p.food)} / ${fmt(cap)}`, `${signed(inc.food)} / turn`, COL.food,
      `FOOD\nForaging: +${fmt(inc.forage)} (territory supplies up to ${fmt(inc.cap)})\nFungus & aphids: +${fmt(inc.foodIn - inc.forage)}\nTrade: +${fmt(inc.trade)}\nUpkeep: -${fmt(inc.upkeep)}\nStorage: ${cap} (build a Granary for more)`, 160);
    res('mat', fmt(p.materials), `${signed(inc.mat)} / turn`, COL.mat, 'MATERIALS\nSoil, leaf fragments and twigs used to excavate chambers and found outposts. Produced by workers on the Excavate job.', 110);
    const T = p.tech ? TECHS[p.tech] : null;
    res('rp', T ? `${T.name}` : 'No research', T ? `${fmt(p.rp)} / ${T.cost}  (+${fmt(inc.rp)})` : `${fmt(p.rp)} banked (+${fmt(inc.rp)})`, COL.rp, 'RESEARCH\nClick the Research button (R) to choose a project.', 190);
    const pop = population(st, p), pc = popCap(st, p);
    res('pop', `${fmt(pop)} / ${fmt(pc)}`, `${p.adults.worker} workers`, pop > pc ? COL.bad : COL.pop,
      `POPULATION\nIn nest: ${p.adults.worker} workers, ${p.adults.soldier} soldiers, ${p.adults.major} majors, ${p.adults.scout} scouts\nIn swarms & outposts: ${pop - sumUnits(p.adults)}\nCapacity ${pc} (Worker Galleries, Barracks, outposts)`, 130);
    res('brood', fmt(broodCount(p)), `+${inc.eggs} eggs/turn`, '#f3ead8', `BROOD\nEggs, larvae and pupae: ${broodCount(p)} / ${chVal(p, 'nursery')} nursery capacity.\nNurses can tend ${fmt(inc.nurseSupport)} brood.`, 110);
    // date
    const si = seasonIdx(st.turn);
    text(ctx, dateStr(st.turn), 860, 8, { font: `bold 14px ${FONT_HEAD}`, color: ['#a8e07a', '#f2d24e', '#e8964a', '#bcd8f0'][si], align: 'right' });
    text(ctx, `Turn ${st.turn + 1}  •  ${Math.round(p._tiles / st.landTiles * 100)}% of land`, 860, 27, { font: `11px ${FONT_BODY}`, color: COL.dim, align: 'right' });
    UI.tip(700, 0, 170, 46, `Seasons: Spring (more eggs), Summer (best foraging), Autumn, Winter (foraging & laying nearly stop).\nVictory: destroy all rivals or control 40% of the land.`);
    let bx = 880;
    button(ctx, bx, 7, 92, 32, 'Colony', () => App.setScene(new ColonyScene()), { key: 'C' }); bx += 98;
    button(ctx, bx, 7, 92, 32, 'Research', () => App.setScene(new ResearchScene()), { key: 'R', primary: !p.tech && TECH_KEYS.some(k => techAvailable(p, k)) && Math.floor(this.t * 1.5) % 2 === 0 }); bx += 98;
    button(ctx, bx, 7, 100, 32, 'Diplomacy', () => App.setScene(new DiplomacyScene()), { key: 'P' }); bx += 106;
    button(ctx, bx, 7, 80, 32, 'Menu', () => this.openMenu(), { key: 'Esc' });
    this.drawInfoPanel(ctx);
    this.drawMinimap(ctx);
    this.drawLog(ctx);
    // end turn
    button(ctx, W - 196, H - 66, 182, 52, 'End Turn', () => this.endTurnClick(), { primary: true, size: 18, key: 'Space' });
    const ready = st.swarms.filter(s => s.owner === st.playerId && s.mp > 0 && !s.path.length).length;
    button(ctx, W - 196, H - 104, 182, 32, ready ? `Next swarm (${ready} ready)` : 'Next swarm', () => this.nextSwarm(), { size: 13, key: 'N' });
    button(ctx, W - 196, H - 140, 64, 30, 'Home', () => this.centerOn(p.nest.x, p.nest.y), { size: 12, key: 'H' });
    button(ctx, W - 126, H - 140, 36, 30, Sound.settings.muted ? '\u266A\u0338' : '\u266A', () => { this.dialog = new SoundDialog(() => this.dialog = null); }, { size: 15, tip: 'Sound settings (F9 mutes)' });
    button(ctx, W - 84, H - 140, 34, 30, '+', () => this.onWheel(W / 2, H / 2, -1), { size: 16 });
    button(ctx, W - 48, H - 140, 34, 30, '-', () => this.onWheel(W / 2, H / 2, 1), { size: 16 });
  }

  drawInfoPanel(ctx) {
    this._drawInfoPanel(ctx);
    if (this.sel && !(this.sel.type === 'tile' && !inMap(App.st, this.sel.x, this.sel.y)))
      button(ctx, 10 + 290 - 32, 56 + 9, 24, 24, '\u2715', () => { this.sel = null; this.pendingTap = null; }, { size: 12, tip: 'Close' });
  }
  _drawInfoPanel(ctx) {
    const st = App.st, p = playerCol(st), s = this.sel;
    if (!s) return;
    const x = 10, y = 56, w = 290;
    if (s.type === 'swarm' || s.type === 'enemy') {
      const sw = st.swarms.find(q => q.id === s.id); if (!sw) return;
      const c = colById(st, sw.owner), mine = sw.owner === p.id;
      const h = mine ? 300 : 190;
      panel(ctx, x, y, w, h, { title: mine ? 'Your Swarm' : `${c.name} Swarm` });
      let yy = y + 46;
      for (const k of CASTE_KEYS) {
        if (!sw.units[k]) continue;
        drawAnt(ctx, c.species, k, x + 26, yy + 10, -0.4, k === 'major' ? 26 : 20, 0);
        text(ctx, `${sw.units[k]} ${CASTES[k].name}`, x + 50, yy + 2, { font: `14px ${FONT_BODY}` });
        yy += 26;
      }
      const pw = power(st, c, sw.units);
      text(ctx, `Strength ${fmt(pw)}`, x + 16, yy + 4, { font: `bold 13px ${FONT_BODY}`, color: '#f0b080' });
      if (mine) {
        text(ctx, `Movement ${fmt(sw.mp)} / ${swarmMaxMP(st, sw)}`, x + 150, yy + 4, { font: `13px ${FONT_BODY}`, color: COL.dim });
        yy += 26;
        const terr = st.owner[idx(st, sw.x, sw.y)] === p.id;
        text(ctx, terr ? 'Supplied by your territory' : 'Outside territory: attrition each turn', x + 16, yy, { font: `12px ${FONT_BODY}`, color: terr ? COL.good : '#f0a070' });
        yy += 22;
        if (sw.path.length) { text(ctx, `Marching: ${sw.path.length} tiles to go`, x + 16, yy, { font: `12px ${FONT_BODY}`, color: COL.gold }); yy += 18; }
        else { text(ctx, App.touch ? 'Tap the map twice to march there' : 'Click / right-click the map to move', x + 16, yy, { font: `italic 12px ${FONT_BODY}`, color: COL.dim }); yy += 18; }
        const by = y + h - 84;
        const site = siteAt(st, sw.x, sw.y);
        const onOwn = site && site.col === p;
        const err = canFoundOutpost(st, sw);
        button(ctx, x + 12, by, 130, 32, onOwn ? (site.kind === 'nest' ? 'Disband' : 'Garrison') : 'Return home', () => {
          if (onOwn) { disbandSwarm(st, sw); this.sel = { type: 'site', x: sw.x, y: sw.y }; recompute(st); this.buildOverlays(); App.toast(site.kind === 'nest' ? 'Swarm returned to the nest.' : 'Swarm garrisoned in the outpost.'); }
          else this.orderMove(sw, p.nest.x, p.nest.y);
        }, { tip: onOwn ? 'Merge these ants back into the colony.' : 'March back to the home nest.' });
        button(ctx, x + 148, by, 130, 32, 'Found Outpost', () => {
          const e = foundOutpost(st, sw); if (e) App.toast(e, COL.bad); else { Sound.sfx('outpost'); this.sel = { type: 'site', x: sw.x, y: sw.y }; this.buildOverlays(); App.toast('Satellite nest founded!', COL.good); }
        }, { disabled: !!err || onOwn, tip: err || 'Establish a satellite nest here (30 materials). The workers stay as its garrison and the land becomes yours.' });
        button(ctx, x + 12, by + 40, 130, 32, 'Stop', () => { sw.path = []; }, { disabled: !sw.path.length });
        button(ctx, x + 148, by + 40, 130, 32, 'Split in half', () => {
          const half = {}; for (const k of CASTE_KEYS) half[k] = Math.floor(sw.units[k] / 2);
          if (sumUnits(half) < 1) return;
          for (const k of CASTE_KEYS) sw.units[k] -= half[k];
          const ns = createSwarm(st, p, half, sw.x, sw.y); ns.mp = sw.mp; this.sel = { type: 'swarm', id: ns.id };
        }, { disabled: sumUnits(sw.units) < 2 });
      } else {
        yy += 26;
        const rel = c.rel[p.id];
        text(ctx, `${SPECIES[c.species].name}  •  ${atWar(st, p.id, c.id) ? 'AT WAR' : 'at peace'}`, x + 16, yy, { font: `13px ${FONT_BODY}`, color: atWar(st, p.id, c.id) ? COL.bad : COL.dim });
        text(ctx, `Opinion of you: ${Math.round(rel.score)}`, x + 16, yy + 20, { font: `12px ${FONT_BODY}`, color: COL.dim });
      }
      return;
    }
    if (s.type === 'site') {
      const site = siteAt(st, s.x, s.y); if (!site) { this.sel = { type: 'tile', x: s.x, y: s.y }; return; }
      const c = site.col, mine = c === p;
      if (mine && site.kind === 'nest') {
        panel(ctx, x, y, w, 236, { title: `${c.name} - Home Nest` });
        let yy = y + 48;
        const line = (a, b, col) => { text(ctx, a, x + 16, yy, { font: `13px ${FONT_BODY}`, color: COL.dim }); text(ctx, b, x + w - 16, yy, { font: `bold 13px ${FONT_BODY}`, align: 'right', color: col || COL.text }); yy += 20; };
        line('Queen', 'alive and laying', COL.good);
        line('Workers / Soldiers', `${c.adults.worker} / ${c.adults.soldier}`);
        line('Majors / Scouts', `${c.adults.major} / ${c.adults.scout}`);
        line('Brood', `${broodCount(c)}`);
        line('Territory', `${c._tiles} tiles`);
        line('Outposts', `${c.outposts.length} / ${cstats(st, c).maxOutposts}`);
        button(ctx, x + 12, y + 188, 130, 34, 'Enter Colony', () => App.setScene(new ColonyScene()), { primary: true });
        button(ctx, x + 148, y + 188, 130, 34, 'Muster Swarm', () => { this.dialog = new MusterDialog(this); });
      } else if (mine) {
        const o = site.outpost;
        panel(ctx, x, y, w, 190, { title: 'Satellite Nest' });
        let yy = y + 48;
        for (const k of CASTE_KEYS) if (o.units[k]) { text(ctx, `${o.units[k]} ${CASTES[k].name} garrisoned`, x + 16, yy, { font: `13px ${FONT_BODY}` }); yy += 20; }
        text(ctx, `Defence x${(1.2 * cstats(st, c).defense).toFixed(2)}  •  +25 population cap`, x + 16, yy + 4, { font: `12px ${FONT_BODY}`, color: COL.dim });
        text(ctx, 'Garrison workers forage the land around it.', x + 16, yy + 22, { font: `12px ${FONT_BODY}`, color: COL.dim });
        button(ctx, x + 12, y + 146, 266, 32, 'Withdraw garrison as swarm', () => {
          const sw = withdrawGarrison(st, c, o); if (sw) { this.sel = { type: 'swarm', id: sw.id }; } else App.toast('Not enough ants to withdraw.', COL.bad);
        }, { tip: 'Leaves 5 workers behind to keep the outpost.' });
      } else {
        const known = p.met[c.id];
        panel(ctx, x, y, w, 196, { title: site.kind === 'nest' ? `${c.name} Nest` : `${c.name} Outpost` });
        let yy = y + 48;
        drawAnt(ctx, c.species, 'soldier', x + 40, yy + 26, -0.5, 46, Math.floor(this.t * 4) % 6);
        text(ctx, SPECIES[c.species].name, x + 80, yy + 4, { font: `bold 14px ${FONT_HEAD}`, color: c.color });
        text(ctx, SPECIES[c.species].latin, x + 80, yy + 24, { font: `italic 12px ${FONT_HEAD}`, color: COL.dim });
        yy += 56;
        const war = atWar(st, p.id, c.id);
        text(ctx, war ? 'Status: AT WAR' : `Status: peace${routeBetween(st, p.id, c.id) ? ' (trading)' : ''}`, x + 16, yy, { font: `13px ${FONT_BODY}`, color: war ? COL.bad : COL.good }); yy += 20;
        if (known) text(ctx, `Opinion of you: ${Math.round(c.rel[p.id].score)}`, x + 16, yy, { font: `13px ${FONT_BODY}`, color: COL.dim }); yy += 20;
        if (st.visible[idx(st, s.x, s.y)]) text(ctx, site.kind === 'nest' ? `Estimated defenders: ~${Math.round(sumUnits(c.adults) / 10) * 10}` : `Garrison: ~${sumUnits(site.outpost.units) + 4}`, x + 16, yy, { font: `13px ${FONT_BODY}`, color: '#f0b080' });
        button(ctx, x + 12, y + 154, 266, 32, 'Diplomacy', () => App.setScene(new DiplomacyScene(c.id)));
      }
      return;
    }
    if (s.type === 'tile') {
      if (!inMap(st, s.x, s.y)) return;
      const i = idx(st, s.x, s.y);
      if (!st.explored[i]) { panel(ctx, x, y, w, 80, { title: 'Unexplored' }); text(ctx, 'Send a swarm or scouts to explore.', x + 16, y + 48, { font: `13px ${FONT_BODY}`, color: COL.dim }); return; }
      const T = TERRAIN[st.terrain[i]], f = featureAt(st, s.x, s.y), o = st.owner[i];
      panel(ctx, x, y, w, f ? 190 : 140, { title: T.name });
      let yy = y + 48;
      const S = cstats(st, p);
      text(ctx, T.pass ? `Food ${T.food * (S.terrain[T.key] || 1)}  •  Materials ${T.mat}  •  Move ${T.move}` : (S.swim ? 'Your fire ants can raft across (move 3)' : 'Impassable to most ants'), x + 16, yy, { font: `13px ${FONT_BODY}` }); yy += 20;
      if (T.def) { text(ctx, `Defender bonus +${Math.round(T.def * 100)}%`, x + 16, yy, { font: `13px ${FONT_BODY}`, color: COL.dim }); yy += 20; }
      text(ctx, o >= 0 ? `Territory of ${colById(st, o).name}` : 'Unclaimed land', x + 16, yy, { font: `13px ${FONT_BODY}`, color: o >= 0 ? colById(st, o).color : COL.dim }); yy += 24;
      if (f) {
        text(ctx, `${FEATURES[f.type].name}: +${f.food} food/turn`, x + 16, yy, { font: `bold 13px ${FONT_BODY}`, color: COL.food }); yy += 18;
        wrap(ctx, FEATURES[f.type].desc + (f.ttl ? ` (${f.ttl} turns left)` : ''), x + 16, yy, w - 32, 16, { font: `12px ${FONT_BODY}`, color: COL.dim });
      }
    }
  }

  drawMinimap(ctx) {
    const st = App.st;
    const mw = 230, mh = Math.round(mw * st.h / st.w);
    const x = 10, y = H - mh - 10;
    panel(ctx, x - 4, y - 4, mw + 8, mh + 8, { r: 6 });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(App.terrain.mini, x, y, mw, mh);
    ctx.drawImage(this.terrCv, x, y, mw, mh);
    ctx.drawImage(this.terrCv, x, y, mw, mh);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogCv, x, y, mw, mh);
    const sx = mw / st.w, sy = mh / st.h;
    for (const c of st.colonies) {
      if (!c.alive || !st.explored[idx(st, c.nest.x, c.nest.y)]) continue;
      ctx.fillStyle = c.color; ctx.strokeStyle = '#000';
      ctx.beginPath(); ctx.arc(x + (c.nest.x + 0.5) * sx, y + (c.nest.y + 0.5) * sy, 3.5, 0, 6.28); ctx.fill(); ctx.stroke();
    }
    for (const sw of st.swarms) {
      if (sw.owner !== st.playerId && !st.visible[idx(st, sw.x, sw.y)]) continue;
      ctx.fillStyle = colById(st, sw.owner).color;
      ctx.fillRect(x + sw.x * sx - 1, y + sw.y * sy - 1, 3, 3);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, mw, mh); ctx.clip();
    this.drawMinimapView(ctx, x, y, sx, sy);
    ctx.restore();
    UI.region(x, y, mw, mh, (lx, ly) => { this.centerOn(Math.floor(lx / sx), Math.floor(ly / sy)); });
  }

  drawMinimapView(ctx, x, y, sx, sy) {
    const ts = this.ts();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.strokeRect(x + this.cam.x / ts * sx, y + this.cam.y / ts * sy, W / ts * sx, H / ts * sy);
  }
  drawLog(ctx) {
    const st = App.st;
    const lines = st.log.slice(-5);
    const x = 256, w = 560, y = H - 14 - lines.length * 18;
    if (!lines.length) return;
    ctx.fillStyle = 'rgba(10,6,3,0.55)';
    roundRect(ctx, x - 8, y - 6, w, lines.length * 18 + 10, 6); ctx.fill();
    lines.forEach((l, i) => {
      const age = st.turn - l.turn;
      ctx.globalAlpha = age <= 0 ? 1 : age === 1 ? 0.75 : 0.5;
      ctx.font = `12px ${FONT_BODY}`;
      let s = l.text; while (ctx.measureText(s).width > w - 20 && s.length > 10) s = s.slice(0, -4) + '...';
      text(ctx, s, x, y + i * 18, { font: `12px ${FONT_BODY}`, color: l.color });
    });
    ctx.globalAlpha = 1;
    UI.region(x - 8, y - 6, w, lines.length * 18 + 10, () => { this.dialog = new LogDialog(() => this.dialog = null); });
    UI.tip(x - 8, y - 6, w, lines.length * 18 + 10, 'Click to open the full chronicle.');
  }

  drawPopup(ctx, p) {
    modalBackdrop(ctx);
    const w = 520;
    ctx.font = `14px ${FONT_BODY}`;
    const lines = wrapLines(ctx, p.text, w - 48);
    const h = 120 + lines.length * 20;
    const x = W / 2 - w / 2, y = H / 2 - h / 2;
    panel(ctx, x, y, w, h, { border: p.col || COL.amber });
    text(ctx, p.title, W / 2, y + 18, { font: `bold 22px ${FONT_HEAD}`, align: 'center', color: p.col || COL.gold });
    lines.forEach((l, i) => text(ctx, l, x + 24, y + 58 + i * 20, { font: `14px ${FONT_BODY}` }));
    if (p.kind === 'peace' || p.kind === 'trade') {
      button(ctx, W / 2 - 150, y + h - 52, 140, 38, 'Accept', () => this.closePopup(p, true), { primary: true });
      button(ctx, W / 2 + 10, y + h - 52, 140, 38, 'Decline', () => this.closePopup(p, false));
    } else button(ctx, W / 2 - 70, y + h - 52, 140, 38, 'Continue', () => this.closePopup(p, false), { primary: true });
  }

  drawIntro(ctx) {
    modalBackdrop(ctx);
    const p = playerCol(App.st), sp = SPECIES[p.species];
    const x = W / 2 - 340, y = 120, w = 680, h = 450;
    panel(ctx, x, y, w, h, { border: COL.gold });
    drawAnt(ctx, p.species, 'queen', x + 110, y + 110, -0.3, 120, Math.floor(this.t * 3) % 6);
    text(ctx, `The Founding of ${p.name}`, x + 220, y + 30, { font: `bold 24px ${FONT_HEAD}`, color: COL.gold });
    text(ctx, `${sp.name} - ${sp.latin}`, x + 220, y + 64, { font: `italic 14px ${FONT_HEAD}`, color: COL.dim });
    wrap(ctx, 'After her nuptial flight your queen tore off her wings and dug a sealed chamber. Living on her own fat reserves she raised a first brood of tiny workers. Now the nest opens to the world.', x + 220, y + 92, 430, 19, { font: `14px ${FONT_BODY}` });
    const tips = [
      '1. Open the COLONY view (C) to set jobs, choose what the queen\'s eggs become, and dig new chambers.',
      '2. Pick a RESEARCH project (R). Pheromone Trails is a strong start.',
      '3. MUSTER a swarm from your nest to explore. Swarms of 10+ workers can found OUTPOSTS that claim new land.',
      '4. Watch your food. Every ant eats, and winter nearly stops foraging - fill the granary in autumn.',
      '5. Rival colonies will grow hostile as you compete for land. Trade with friends, crush enemies.',
    ];
    let yy = y + 210;
    for (const t of tips) yy += wrap(ctx, t, x + 40, yy, w - 80, 19, { font: `14px ${FONT_BODY}`, color: '#e8dcc0' }) + 6;
    button(ctx, W / 2 - 100, y + h - 58, 200, 42, 'Begin', () => this.showIntro = false, { primary: true, size: 17 });
  }
}

// ---------------------------------------------------------------------
class ConfirmDialog {
  constructor(title, body, okLabel, onOk, onCancel, danger) { Object.assign(this, { title, body, okLabel, onOk, onCancel, danger }); }
  draw(ctx) {
    modalBackdrop(ctx);
    const w = 480, h = 210, x = W / 2 - w / 2, y = H / 2 - h / 2;
    panel(ctx, x, y, w, h, { title: this.title, border: this.danger ? '#c4523e' : COL.amber });
    wrap(ctx, this.body, x + 20, y + 52, w - 40, 19);
    button(ctx, x + w - 290, y + h - 54, 130, 38, this.okLabel, this.onOk, { danger: this.danger, primary: !this.danger });
    button(ctx, x + w - 150, y + h - 54, 130, 38, 'Cancel', this.onCancel);
  }
  onKey(e) { if (e.key === 'Escape') this.onCancel(); if (e.key === 'Enter') this.onOk(); }
}

class GameMenu {
  constructor(scene) { this.scene = scene; this.sub = null; }
  draw(ctx) {
    if (this.sub) { this.sub.draw(ctx); return; }
    modalBackdrop(ctx);
    const w = 320, h = 64 + 48 * (6 + (App.canFullscreen ? 1 : 0) + (App.isElectron ? 1 : 0)), x = W / 2 - w / 2, y = H / 2 - h / 2;
    panel(ctx, x, y, w, h, { title: 'Menu' });
    let yy = y + 56;
    const b = (label, fn, o) => { button(ctx, x + 30, yy, w - 60, 40, label, fn, o); yy += 48; };
    b('Resume', () => this.scene.dialog = null, { primary: true });
    b('Save / Load', () => this.sub = new SaveLoadDialog(true, () => this.sub = null));
    b('How to Play', () => App.setScene(new HelpScene(App.mapScene)));
    b('Graphics Settings', () => this.sub = new GraphicsDialog(() => this.sub = null));
    b('Sound Settings', () => this.sub = new SoundDialog(() => this.sub = null));
    if (App.canFullscreen) b(App.touch ? 'Toggle Fullscreen' : 'Toggle Fullscreen (F11)', () => App.toggleFullscreen());
    b('Quit to Title', () => { App.save('auto'); App.setScene(new TitleScene()); });
    if (App.isElectron) b('Exit Game', () => { App.save('auto'); App.quit(); });
  }
  onKey(e) { if (this.sub) { this.sub.onKey?.(e); return; } if (e.key === 'Escape') this.scene.dialog = null; }
}

class LogDialog {
  constructor(onClose) { this.onClose = onClose; this.scroll = 0; }
  draw(ctx) {
    modalBackdrop(ctx);
    const st = App.st, w = 760, h = 560, x = W / 2 - w / 2, y = H / 2 - h / 2;
    panel(ctx, x, y, w, h, { title: 'Chronicle of the Colony' });
    const lines = st.log.slice().reverse();
    const per = 24, start = this.scroll;
    ctx.save(); ctx.beginPath(); ctx.rect(x + 10, y + 44, w - 20, h - 104); ctx.clip();
    lines.slice(start, start + 20).forEach((l, i) => {
      text(ctx, dateStr(l.turn).split(' (')[0], x + 20, y + 52 + i * per, { font: `11px ${FONT_BODY}`, color: COL.faint });
      ctx.font = `13px ${FONT_BODY}`;
      let s = l.text; while (ctx.measureText(s).width > w - 200 && s.length > 10) s = s.slice(0, -4) + '...';
      text(ctx, s, x + 160, y + 51 + i * per, { font: `13px ${FONT_BODY}`, color: l.color });
    });
    ctx.restore();
    button(ctx, x + 20, y + h - 50, 110, 36, 'Newer', () => this.scroll = Math.max(0, this.scroll - 20), { disabled: this.scroll === 0 });
    button(ctx, x + 140, y + h - 50, 110, 36, 'Older', () => this.scroll = Math.min(Math.max(0, lines.length - 20), this.scroll + 20), { disabled: this.scroll + 20 >= lines.length });
    button(ctx, x + w - 130, y + h - 50, 110, 36, 'Close', this.onClose, { primary: true });
  }
  onKey(e) { if (e.key === 'Escape') this.onClose(); }
}

class MusterDialog {
  constructor(scene, fromColony) {
    this.scene = scene; this.fromColony = fromColony;
    const p = playerCol(App.st);
    this.u = { worker: 0, soldier: Math.floor(p.adults.soldier * 0.75), major: Math.floor(p.adults.major * 0.75), scout: p.adults.scout };
    if (sumUnits(this.u) === 0) this.u.worker = Math.min(12, Math.floor(p.adults.worker / 2));
  }
  close() { if (this.fromColony) this.fromColony.dialog = null; else this.scene.dialog = null; }
  draw(ctx) {
    const st = App.st, p = playerCol(st);
    modalBackdrop(ctx);
    const w = 520, h = 400, x = W / 2 - w / 2, y = H / 2 - h / 2;
    panel(ctx, x, y, w, h, { title: 'Muster a Swarm' });
    text(ctx, 'Choose which ants leave the nest. Shift-click for steps of 10.', x + 20, y + 48, { font: `13px ${FONT_BODY}`, color: COL.dim });
    let yy = y + 80;
    for (const k of CASTE_KEYS) {
      const avail = p.adults[k], locked = !casteUnlocked(p, k);
      drawAnt(ctx, p.species, k, x + 36, yy + 12, -0.4, k === 'major' ? 30 : 24, 0, locked ? 0.3 : 1);
      text(ctx, CASTES[k].name, x + 66, yy + 4, { font: `bold 14px ${FONT_BODY}`, color: locked ? COL.faint : COL.text });
      text(ctx, locked ? `requires ${TECHS[CASTES[k].req].name}` : `${avail} in nest`, x + 66, yy + 22, { font: `11px ${FONT_BODY}`, color: COL.dim });
      const step = () => App.keys['shift'] ? 10 : 1;
      button(ctx, x + 250, yy + 4, 30, 28, '-', () => this.u[k] = Math.max(0, this.u[k] - step()), { disabled: locked });
      text(ctx, String(this.u[k]), x + 315, yy + 10, { font: `bold 15px ${FONT_BODY}`, align: 'center' });
      button(ctx, x + 350, yy + 4, 30, 28, '+', () => this.u[k] = Math.min(avail, this.u[k] + step()), { disabled: locked });
      button(ctx, x + 390, yy + 4, 50, 28, 'All', () => this.u[k] = avail, { disabled: locked, size: 12 });
      button(ctx, x + 446, yy + 4, 50, 28, 'None', () => this.u[k] = 0, { disabled: locked, size: 12 });
      yy += 50;
    }
    const pw = power(st, p, this.u);
    const tmp = { owner: p.id, units: this.u };
    text(ctx, `Strength ${fmt(pw)}   •   Movement ${sumUnits(this.u) ? swarmMaxMP(st, tmp) : '-'}   •   ${this.u.worker >= 10 ? 'can found an outpost' : 'needs 10 workers to found an outpost'}`, x + 20, yy + 6, { font: `13px ${FONT_BODY}`, color: '#f0b080' });
    button(ctx, x + w - 290, y + h - 54, 130, 38, 'March Out', () => {
      const sw = musterSwarm(st, p, this.u);
      if (!sw) { App.toast('Choose at least one ant.', COL.bad); return; }
      Sound.sfx('march');
      this.close();
      if (this.fromColony) App.toMap();
      App.mapScene.sel = { type: 'swarm', id: sw.id };
      App.mapScene.centerOn(sw.x, sw.y);
      App.toast(App.touch ? 'The swarm pours out of the nest. Tap a spot, then tap again to march.' : 'The swarm pours out of the nest. Click the map to march.');
    }, { primary: true, disabled: sumUnits(this.u) === 0 });
    button(ctx, x + w - 150, y + h - 54, 130, 38, 'Cancel', () => this.close());
  }
  onKey(e) { if (e.key === 'Escape') this.close(); }
}
