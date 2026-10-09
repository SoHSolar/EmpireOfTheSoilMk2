// =====================================================================
//  Research tree, diplomacy and game-over screens
// =====================================================================
'use strict';

function screenHeader(ctx, title, sub) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#24180e'); bg.addColorStop(1, '#0f0a06');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // faint soil texture strata
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 14; i++) { ctx.fillStyle = i % 2 ? '#c8a070' : '#000'; ctx.fillRect(0, 60 + i * 50 + Math.sin(i) * 10, W, 24); }
  ctx.globalAlpha = 1;
  const g = ctx.createLinearGradient(0, 0, 0, 46);
  g.addColorStop(0, 'rgba(36,24,14,1)'); g.addColorStop(1, 'rgba(20,13,8,1)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 46); ctx.fillStyle = COL.border; ctx.fillRect(0, 46, W, 1);
  button(ctx, 10, 7, 110, 32, '◀ Map', () => App.toMap(), { key: 'Esc' });
  text(ctx, title, 136, 9, { font: `bold 20px ${FONT_HEAD}`, color: COL.gold });
  if (sub) text(ctx, sub, W - 16, 15, { font: `13px ${FONT_BODY}`, align: 'right', color: COL.dim });
}

// ---------------------------------------------------------------------
class ResearchScene {
  constructor() { this.t = 0; this.hover = null; this.layout(); }
  layout() {
    this.pos = {};
    BRANCHES.forEach((b, bi) => {
      const colX = 24 + bi * 312;
      for (let tier = 0; tier < 4; tier++) {
        const ks = TECH_KEYS.filter(k => TECHS[k].branch === b.key && TECHS[k].tier === tier);
        const nw = 140, gap = 12, total = ks.length * nw + (ks.length - 1) * gap;
        ks.forEach((k, j) => { this.pos[k] = { x: colX + (296 - total) / 2 + j * (nw + gap), y: 112 + tier * 118, w: nw, h: 80 }; });
      }
    });
  }
  onKey(e) { if (e.key === 'Escape' || e.key.toLowerCase() === 'r') App.toMap(); if (e.key.toLowerCase() === 'c') App.setScene(new ColonyScene()); }
  draw(ctx, dt) {
    this.t += dt;
    const st = App.st, c = playerCol(st), inc = projectIncome(st, c);
    screenHeader(ctx, 'Research', `${fmt(c.rp)} research banked  •  +${fmt(inc.rp)} per turn (assign workers to Research, dig a Pheromone Archive)`);
    BRANCHES.forEach((b, bi) => {
      const x = 24 + bi * 312;
      panel(ctx, x - 6, 58, 308, 500, { passThrough: true, noShadow: true, c1: 'rgba(40,28,16,0.6)', c2: 'rgba(20,13,8,0.6)' });
      text(ctx, b.name, x + 148, 70, { font: `bold 17px ${FONT_HEAD}`, align: 'center', color: b.color });
    });
    // prerequisite links
    ctx.lineWidth = 2;
    for (const k of TECH_KEYS) for (const r of TECHS[k].req) {
      const a = this.pos[r], b = this.pos[k];
      const done = has(c, r);
      ctx.strokeStyle = done ? 'rgba(242,193,78,0.6)' : 'rgba(160,130,90,0.25)';
      ctx.beginPath(); ctx.moveTo(a.x + a.w / 2, a.y + a.h); ctx.bezierCurveTo(a.x + a.w / 2, a.y + a.h + 30, b.x + b.w / 2, b.y - 30, b.x + b.w / 2, b.y); ctx.stroke();
    }
    this.hover = null;
    for (const k of TECH_KEYS) {
      const T = TECHS[k], p = this.pos[k], br = BRANCHES.find(b => b.key === T.branch);
      const done = has(c, k), cur = c.tech === k, avail = techAvailable(c, k);
      const hov = UI.over(p.x, p.y, p.w, p.h);
      if (hov) this.hover = k;
      ctx.save();
      if (cur) { ctx.shadowColor = br.color; ctx.shadowBlur = 12 + Math.sin(this.t * 4) * 6; }
      roundRect(ctx, p.x, p.y, p.w, p.h, 8);
      const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      if (done) { g.addColorStop(0, '#6b5222'); g.addColorStop(1, '#3e2e10'); }
      else if (avail) { g.addColorStop(0, hov ? '#4e3a22' : '#3c2c1a'); g.addColorStop(1, '#22170d'); }
      else { g.addColorStop(0, '#262019'); g.addColorStop(1, '#17120d'); }
      ctx.fillStyle = g; ctx.fill(); ctx.restore();
      roundRect(ctx, p.x, p.y, p.w, p.h, 8);
      ctx.strokeStyle = done ? COL.gold : cur ? br.color : avail ? shade(br.color, 0.8) : '#3a3026'; ctx.lineWidth = cur || done ? 2 : 1; ctx.stroke();
      ctx.fillStyle = br.color; ctx.globalAlpha = done || avail ? 0.9 : 0.3; ctx.fillRect(p.x + 8, p.y + 8, 4, p.h - 16); ctx.globalAlpha = 1;
      ctx.font = `bold 13px ${FONT_BODY}`;
      const lines = wrapLines(ctx, T.name, p.w - 26);
      lines.forEach((l, i) => text(ctx, l, p.x + 18, p.y + 10 + i * 16, { font: `bold 13px ${FONT_BODY}`, color: done ? '#ffe9b0' : avail ? COL.text : COL.faint }));
      if (done) text(ctx, '✔ Discovered', p.x + 18, p.y + p.h - 22, { font: `12px ${FONT_BODY}`, color: COL.gold });
      else {
        text(ctx, `${T.cost} rp`, p.x + 18, p.y + p.h - 22, { font: `12px ${FONT_BODY}`, color: avail ? COL.rp : COL.faint });
        if (avail && inc.rp > 0) text(ctx, `~${Math.max(1, Math.ceil((T.cost - c.rp) / inc.rp))}t`, p.x + p.w - 10, p.y + p.h - 22, { font: `12px ${FONT_BODY}`, align: 'right', color: COL.dim });
        if (cur) bar(ctx, p.x + 18, p.y + p.h - 6, p.w - 30, 4, c.rp / T.cost, br.color);
      }
      if (avail && !done) UI.region(p.x, p.y, p.w, p.h, () => { if (c.tech !== k) Sound.sfx('select'); c.tech = k; App.toast(`Researching ${T.name}`, COL.rp); });
    }
    // details
    const k = this.hover || c.tech;
    panel(ctx, 18, 568, W - 36, 136);
    if (k) {
      const T = TECHS[k], br = BRANCHES.find(b => b.key === T.branch);
      text(ctx, T.name, 36, 582, { font: `bold 20px ${FONT_HEAD}`, color: br.color });
      text(ctx, `${br.name}  •  ${T.cost} research`, 36, 610, { font: `13px ${FONT_BODY}`, color: COL.dim });
      wrap(ctx, T.desc, 36, 634, 760, 19, { font: `15px ${FONT_BODY}` });
      if (T.req.length) text(ctx, 'Requires: ' + T.req.map(r => TECHS[r].name + (has(c, r) ? ' ✔' : '')).join(', '), 36, 680, { font: `12px ${FONT_BODY}`, color: COL.dim });
      const status = has(c, k) ? 'Already discovered.' : c.tech === k ? `In progress: ${fmt(c.rp)} / ${T.cost}` : techAvailable(c, k) ? 'Click to research.' : 'Locked - research the prerequisites first.';
      text(ctx, status, W - 40, 590, { font: `bold 14px ${FONT_BODY}`, align: 'right', color: COL.gold });
    } else text(ctx, 'Choose a research project. Hover a technique for details.', 36, 590, { font: `15px ${FONT_BODY}`, color: COL.dim });
  }
}

// ---------------------------------------------------------------------
class DiplomacyScene {
  constructor(selId) { this.sel = selId ?? null; this.t = 0; this.msg = null; }
  onKey(e) { if (e.key === 'Escape' || e.key.toLowerCase() === 'p') App.toMap(); }
  draw(ctx, dt) {
    this.t += dt;
    const st = App.st, p = playerCol(st);
    const known = st.colonies.filter(c => c !== p && p.met[c.id]);
    screenHeader(ctx, 'Diplomacy', `Trade routes: ${routeCount(st, p.id)} / ${cstats(st, p).maxRoutes}`);
    if (!known.length) {
      panel(ctx, W / 2 - 300, 200, 600, 160);
      wrap(ctx, 'You have not met any other colonies yet. Send swarms or scouts out to explore - colonies are introduced the moment your ants sense their territory or their swarms.', W / 2 - 270, 230, 540, 22, { font: `15px ${FONT_BODY}` });
      return;
    }
    if (this.sel === null || !known.find(c => c.id === this.sel)) this.sel = known[0].id;
    let y = 60;
    for (const c of known) {
      const on = c.id === this.sel, r = c.rel[p.id], war = atWar(st, p.id, c.id);
      roundRect(ctx, 16, y, 380, 64, 8);
      ctx.fillStyle = on ? 'rgba(217,164,65,0.18)' : UI.over(16, y, 380, 64) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.3)'; ctx.fill();
      ctx.strokeStyle = on ? COL.gold : c.alive ? c.color : '#3a3026'; ctx.lineWidth = on ? 2 : 1; ctx.stroke();
      ctx.globalAlpha = c.alive ? 1 : 0.4;
      drawAnt(ctx, c.species, 'worker', 50, y + 32, -0.4, 36, on ? Math.floor(this.t * 8) % 6 : 0);
      text(ctx, c.name, 86, y + 10, { font: `bold 16px ${FONT_HEAD}`, color: c.color });
      text(ctx, c.alive ? SPECIES[c.species].name : 'Destroyed', 86, y + 34, { font: `12px ${FONT_BODY}`, color: COL.dim });
      if (c.alive) {
        text(ctx, war ? '⚔ WAR' : routeBetween(st, p.id, c.id) ? 'Trading' : 'Peace', 384, y + 10, { font: `bold 13px ${FONT_BODY}`, align: 'right', color: war ? COL.bad : COL.good });
        bar(ctx, 270, y + 40, 114, 8, (r.score + 100) / 200, r.score > 20 ? '#8fd16a' : r.score < -20 ? '#e0603f' : '#d9b46a');
      }
      ctx.globalAlpha = 1;
      UI.region(16, y, 380, 64, () => { this.sel = c.id; this.msg = null; });
      y += 70;
      if (y > H - 80) break;
    }
    const c = colById(st, this.sel), r = c.rel[p.id], war = atWar(st, p.id, c.id);
    const x = 414, w = W - x - 16;
    panel(ctx, x, 60, w, H - 76);
    // portrait
    if (GL3D.active) {
      ctx.save(); roundRect(ctx, x + 18, 78, 240, 180, 10); ctx.clip(); ctx.clearRect(x + 18, 78, 240, 180); ctx.restore();
      GL3D.portrait({ x: x + 18, y: 78, w: 240, h: 180 }, c.species, 'soldier', this.t, { tint: rgbf(c.color) });
    } else {
    ctx.save(); roundRect(ctx, x + 18, 78, 240, 180, 10); ctx.clip();
    const bg = ctx.createRadialGradient(x + 138, 168, 10, x + 138, 168, 160);
    bg.addColorStop(0, shade(c.color, 0.45)); bg.addColorStop(1, '#120c07');
    ctx.fillStyle = bg; ctx.fillRect(x + 18, 78, 240, 180);
    drawAnt(ctx, c.species, 'soldier', x + 138, 168, -0.35 + Math.sin(this.t) * 0.05, 120, Math.floor(this.t * 5) % 6);
    ctx.restore();
    }
    roundRect(ctx, x + 18, 78, 240, 180, 10); ctx.strokeStyle = c.color; ctx.lineWidth = 2; ctx.stroke();
    text(ctx, c.name, x + 280, 80, { font: `bold 28px ${FONT_HEAD}`, color: c.color });
    text(ctx, `${SPECIES[c.species].name} (${SPECIES[c.species].latin})`, x + 282, 118, { font: `italic 14px ${FONT_HEAD}`, color: COL.dim });
    if (!c.alive) { text(ctx, 'This colony has been destroyed.', x + 282, 150, { font: `15px ${FONT_BODY}`, color: COL.bad }); return; }
    let yy = 148;
    const line = (a, b, col) => { text(ctx, a, x + 282, yy, { font: `13px ${FONT_BODY}`, color: COL.dim }); text(ctx, b, x + 520, yy, { font: `bold 13px ${FONT_BODY}`, color: col || COL.text }); yy += 20; };
    line('Status', war ? 'AT WAR' : routeBetween(st, p.id, c.id) ? 'Peace, trading' : 'Peace', war ? COL.bad : COL.good);
    const mood = r.score > 50 ? 'Friendly' : r.score > 15 ? 'Cordial' : r.score > -15 ? 'Wary' : r.score > -45 ? 'Hostile' : 'Bitter enemies';
    line('Opinion of you', `${Math.round(r.score)} (${mood})`, r.score > 15 ? COL.good : r.score < -15 ? COL.bad : COL.gold);
    const ratio = militaryPower(st, c) / Math.max(1, militaryPower(st, p));
    line('Military strength', ratio > 1.6 ? 'Far stronger than you' : ratio > 1.15 ? 'Stronger than you' : ratio > 0.85 ? 'Evenly matched' : ratio > 0.5 ? 'Weaker than you' : 'Far weaker than you', ratio > 1.15 ? COL.bad : ratio < 0.85 ? COL.good : COL.gold);
    line('Territory', `${c._tiles} tiles, ${c.outposts.length} outposts`);
    const wars = st.colonies.filter(o => o.alive && o !== c && atWar(st, c.id, o.id) && (o === p || p.met[o.id])).map(o => o.name);
    line('At war with', wars.length ? wars.join(', ') : 'nobody you know');
    wrap(ctx, SPECIES[c.species].desc, x + 18, 290, w - 36, 19, { font: `14px ${FONT_BODY}`, color: '#d8ccb0' });
    text(ctx, 'Known traits: ' + SPECIES[c.species].strengths.join('; '), x + 18, 380, { font: `12px ${FONT_BODY}`, color: '#b8d0a0' });
    text(ctx, 'Weaknesses: ' + SPECIES[c.species].weaknesses.join('; '), x + 18, 398, { font: `12px ${FONT_BODY}`, color: '#e0b0a0' });
    // actions
    const ay = 440;
    text(ctx, 'Actions', x + 18, ay, { font: `bold 16px ${FONT_HEAD}`, color: COL.gold });
    const route = routeBetween(st, p.id, c.id);
    if (war) {
      button(ctx, x + 18, ay + 30, 240, 40, 'Propose Peace', () => { const res = proposePeace(st, c.id); this.msg = res; Sound.sfx(res.ok ? 'peace' : 'error'); }, { primary: true });
    } else {
      button(ctx, x + 18, ay + 30, 240, 40, 'Declare War', () => {
        this.confirm = new ConfirmDialog(`Declare war on ${c.name}?`, 'Your swarms will be able to attack their swarms, outposts and nest. Other colonies will think less of you.', 'Declare War', () => { declareWar(st, p.id, c.id); Sound.sfx('war'); this.confirm = null; this.msg = { ok: true, msg: 'War is declared! Alarm pheromones flood your tunnels.' }; }, () => this.confirm = null, true);
      }, { danger: true });
      if (route) button(ctx, x + 270, ay + 30, 240, 40, 'Cancel Trade Route', () => { cancelRoute(st, c.id); this.msg = { ok: true, msg: 'The trail fades. Trade has stopped.' }; App.mapScene.buildOverlays(); });
      else {
        const err = canTrade(st, p.id, c.id);
        button(ctx, x + 270, ay + 30, 240, 40, 'Propose Trade Route', () => { const res = proposeTrade(st, c.id); this.msg = res; Sound.sfx(res.ok ? 'trade' : 'error'); recompute(st); App.mapScene.buildOverlays(); }, { primary: !err, disabled: !!err, tip: err || 'Lay a pheromone trail between your nests. Both sides gain food and research every turn.' });
      }
    }
    if (route) {
      const inc = routeIncome(st, route, p.id);
      text(ctx, `Trade income: +${fmt(inc.food)} food, +${fmt(inc.rp)} research per turn${route.blocked ? ' (CUT by an enemy swarm!)' : ''}`, x + 18, ay + 82, { font: `13px ${FONT_BODY}`, color: route.blocked ? COL.bad : COL.good });
    }
    button(ctx, x + 18, ay + 110, 160, 36, 'Gift 25 food', () => { this.msg = giftFood(st, c.id, 25) ? { ok: true, msg: `${c.name} accepts the food gratefully.` } : { ok: false, msg: 'Not enough food.' }; }, { disabled: p.food < 25 || war });
    button(ctx, x + 188, ay + 110, 160, 36, 'Gift 100 food', () => { this.msg = giftFood(st, c.id, 100) ? { ok: true, msg: `${c.name} is impressed by your generosity.` } : { ok: false, msg: 'Not enough food.' }; }, { disabled: p.food < 100 || war });
    button(ctx, x + 358, ay + 110, 152, 36, 'Show on map', () => { App.toMap(); App.mapScene.centerOn(c.nest.x, c.nest.y); App.mapScene.sel = { type: 'site', x: c.nest.x, y: c.nest.y }; }, { disabled: !st.explored[idx(st, c.nest.x, c.nest.y)] });
    if (this.msg) text(ctx, this.msg.msg, x + 18, ay + 166, { font: `bold 14px ${FONT_BODY}`, color: this.msg.ok ? COL.good : COL.bad });
    if (this.confirm) this.confirm.draw(ctx);
  }
}

// ---------------------------------------------------------------------
class GameOverScene {
  constructor(res) { this.res = res; this.t = 0; }
  enter() { Sound.music(this.res.win ? 'victory' : 'defeat'); Sound.ambience('none'); Sound.sfx(this.res.win ? 'victory' : 'defeat'); }
  draw(ctx, dt) {
    this.t += dt;
    const st = App.st, p = playerCol(st);
    const bg = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 700);
    bg.addColorStop(0, this.res.win ? '#4a3612' : '#3a120c'); bg.addColorStop(1, '#0b0705');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 18; i++) {
      const a = this.t * 0.2 + i / 18 * 6.283;
      drawAnt(ctx, p.species, i % 4 ? 'worker' : 'soldier', W / 2 + Math.cos(a) * 300, H / 2 + Math.sin(a) * 220, a + Math.PI / 2, 24, Math.floor(this.t * 10 + i) % 6, this.res.win ? 1 : 0.4);
    }
    drawAnt(ctx, p.species, 'queen', W / 2, 190, -Math.PI / 2, 80, this.res.win ? Math.floor(this.t * 3) % 6 : 0, this.res.win ? 1 : 0.5);
    text(ctx, this.res.win ? 'VICTORY' : 'THE COLONY HAS FALLEN', W / 2, 360, { font: `bold 52px ${FONT_HEAD}`, align: 'center', color: this.res.win ? COL.gold : '#e06a50' });
    wrap(ctx, this.res.reason, W / 2, 430, 600, 22, { font: `16px ${FONT_BODY}`, align: 'center' });
    const s = p.stats;
    text(ctx, `Survived ${st.turn} turns (into year ${yearOf(st.turn)})  •  Peak population ${s.peakPop}  •  Enemies slain ${s.kills}  •  Battles won ${s.battlesWon}`, W / 2, 490, { font: `14px ${FONT_BODY}`, align: 'center', color: COL.dim });
    if (this.res.win) button(ctx, W / 2 - 260, 560, 250, 46, 'Keep Playing', () => { st.gameOver = null; st.victoryAck = true; App.toMap(); }, { primary: true });
    button(ctx, this.res.win ? W / 2 + 10 : W / 2 - 125, 560, 250, 46, 'Return to Title', () => { if (!this.res.win) try { localStorage.removeItem(App.saveKey('auto')); localStorage.removeItem(App.saveKey('auto') + '_meta'); } catch (e) { } App.setScene(new TitleScene()); });
  }
}
