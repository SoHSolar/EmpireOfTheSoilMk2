// =====================================================================
//  Animated battle scene
// =====================================================================
'use strict';

const BZ = 2.6;   // terrain zoom for the battlefield

class BattleScene {
  constructor(list, onDone) {
    this.list = list; this.i = 0; this.onDone = onDone;
    this.setup();
  }
  setup() {
    const st = App.st, b = this.list[this.i];
    this.b = b; this.t = 0; this.phase = 'advance'; this.round = 0; this.roundT = 0; this.done = false;
    this.A = colById(st, b.atk); this.D = colById(st, b.def);
    const ts = TILE * BZ;
    this.cam = { x: (b.x + 0.5) * ts - W / 2, y: (b.y + 0.5) * ts - H / 2 - 30 };
    this.v3 = GL3D.active && App.mapScene && App.mapScene.v3 ? App.mapScene.v3 : null;
    this.uses3D = !!this.v3;
    if (!this.v3) App.terrain.pregen(BZ, this.cam.x, this.cam.y, W, H);
    const r0 = b.rounds[0];
    const tot = sumUnits(r0.a) + sumUnits(r0.d);
    this.scale = Math.max(1, Math.ceil(tot / 140));
    this.sprites = [];
    this.spawnSide(r0.a, 0); this.spawnSide(r0.d, 1);
    this.particles = [];
    this.counts = [Object.assign({}, r0.a), Object.assign({}, r0.d)];
    this.resultSounded = false;
    Sound.music('battle'); Sound.ambience('none'); Sound.sfx('battle_start');
  }
  spawnSide(units, side) {
    const order = ['major', 'soldier', 'scout', 'worker'];
    let col = 0;
    for (const k of order) {
      const n = Math.ceil((units[k] || 0) / this.scale);
      for (let i = 0; i < n; i++) {
        const rowN = 12, c = col + Math.floor(i / rowN), r = i % rowN;
        const x = side === 0 ? 330 - c * 34 : 950 + c * 34;
        const y = 260 + r * 30 + (c % 2) * 15;
        this.sprites.push({ side, caste: k, x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 8, hx: x, hy: y, alive: true, dead: 0, a: side ? Math.PI : 0, ph: Math.random() * 6, lunge: 0 });
      }
      if (n) col += Math.ceil(n / 12);
    }
  }
  skip() {
    const last = this.b.rounds[this.b.rounds.length - 1];
    this.applyCounts(last.a, 0); this.applyCounts(last.d, 1);
    this.counts = [Object.assign({}, last.a), Object.assign({}, last.d)];
    this.round = this.b.rounds.length - 1; this.phase = 'end';
  }
  applyCounts(units, side) {
    for (const k of CASTE_KEYS) {
      const want = Math.ceil((units[k] || 0) / this.scale);
      const alive = this.sprites.filter(s => s.side === side && s.caste === k && s.alive);
      // front-most die first
      alive.sort((p, q) => side === 0 ? q.x - p.x : p.x - q.x);
      for (let i = 0; i < alive.length - want; i++) {
        const s = alive[i]; s.alive = false; s.dead = 0.001;
        if (i < 3) Sound.sfx('crunch', { pan: s.x / W * 2 - 1 });
        for (let j = 0; j < 4; j++) this.particles.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 50, life: 0.6, col: 'rgba(220,200,160,0.6)', r: 3 });
      }
    }
  }
  next() {
    this.i++;
    if (this.i >= this.list.length) { this.onDone(); return; }
    this.setup();
  }
  onKey(e) { if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') { if (this.phase === 'end') this.next(); else this.skip(); } }
  update(dt) {
    this.t += dt;
    const fx = 640;
    if (this.phase === 'advance') {
      for (const s of this.sprites) {
        const tx = s.side === 0 ? s.hx + 250 : s.hx - 250;
        s.x += (tx - s.x) * Math.min(1, dt * 1.6);
        s.y += (s.hy - s.y) * dt;
      }
      if (this.t > 1.6) { this.phase = 'clash'; this.roundT = 0.4; }
    } else if (this.phase === 'clash') {
      this.roundT -= dt;
      if (this.roundT <= 0) {
        this.round++;
        const r = this.b.rounds[this.round];
        if (!r) { this.phase = 'end'; }
        else {
          Sound.sfx('clash');
          this.applyCounts(r.a, 0); this.applyCounts(r.d, 1);
          this.counts = [Object.assign({}, r.a), Object.assign({}, r.d)];
          this.roundT = 1.05;
          if (this.round === this.b.rounds.length - 1) this.roundT = 0.9;
        }
      }
      // brawling motion
      for (const s of this.sprites) {
        if (!s.alive) continue;
        s.ph += dt * 6;
        const front = s.side === 0 ? fx - 30 : fx + 30;
        const tx = s.side === 0 ? Math.min(front, s.hx + 300) : Math.max(front, s.hx - 300);
        s.x += (tx - s.x) * dt * 1.2 + Math.sin(s.ph) * 0.6;
        s.y += Math.cos(s.ph * 0.7) * 0.5;
        s.a = (s.side ? Math.PI : 0) + Math.sin(s.ph * 0.5) * 0.4;
        if (Math.random() < dt * 0.8 && Math.abs(s.x - fx) < 80) {
          const sp = s.side === 0 ? this.A.species : this.D.species;
          const acid = sp === 'wood' || sp === 'fire' || sp === 'bullet';
          if (acid && Math.random() < 0.1) Sound.sfx('spray', { pan: s.x / W * 2 - 1 });
          this.particles.push({ x: s.x + (s.side ? -14 : 14), y: s.y, vx: (s.side ? -1 : 1) * (40 + Math.random() * 60), vy: (Math.random() - 0.5) * 30, life: 0.5, col: acid ? 'rgba(230,240,140,0.55)' : 'rgba(255,240,210,0.5)', r: acid ? 4 : 2 });
        }
      }
      if (this.phase === 'end') { this.endT = 0; }
    }
    for (const s of this.sprites) if (!s.alive && s.dead < 1) s.dead += dt * 1.5;
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);
  }
  draw(ctx, dt) {
    const st = App.st, b = this.b;
    if (this.v3) this.drawWorld3D(ctx, dt); else this.drawWorld2D(ctx, dt);
    // banners
    this.drawBanner(ctx, 16, this.A, 'ATTACKER', this.counts[0], b.rounds[0].a);
    this.drawBanner(ctx, W - 416, this.D, b.kind === 'nest' ? 'DEFENDING NEST' : b.kind === 'outpost' ? 'DEFENDING OUTPOST' : 'DEFENDER', this.counts[1], b.rounds[0].d);
    const tname = TERRAIN[b.terrain].name;
    text(ctx, `Battle of the ${tname}`, W / 2, 20, { font: `bold 24px ${FONT_HEAD}`, align: 'center', color: COL.gold });
    text(ctx, this.phase === 'advance' ? 'The swarms advance...' : this.phase === 'clash' ? `Round ${Math.max(1, this.round)}` : '', W / 2, 52, { font: `14px ${FONT_BODY}`, align: 'center', color: COL.dim });
    if (this.scale > 1) text(ctx, `each figure = ${this.scale} ants`, W / 2, 72, { font: `11px ${FONT_BODY}`, align: 'center', color: COL.faint });
    if (this.phase !== 'end') button(ctx, W / 2 - 60, H - 56, 120, 36, 'Skip', () => this.skip(), { key: 'Space' });
    else this.drawResult(ctx);
  }
  drawWorld2D(ctx, dt) {
    const st = App.st, b = this.b;
    App.terrain.draw(ctx, BZ, this.cam.x, this.cam.y, W, H, 4);
    // nest backdrop
    if (b.kind === 'nest' || b.kind === 'outpost') {
      const m = moundSprite(b.kind === 'nest' ? 120 : 80, this.D.color, b.kind === 'outpost');
      ctx.drawImage(m, 1080 - m.width / 2, 430 - m.height * 0.58);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, W, H);
    // corpses first
    for (const s of this.sprites) {
      if (s.alive) continue;
      const sp = s.side === 0 ? this.A.species : this.D.species;
      ctx.save(); ctx.globalAlpha = Math.max(0.35, 1 - s.dead * 0.6);
      ctx.translate(s.x, s.y); ctx.scale(1, -1);
      drawAnt(ctx, sp, s.caste, 0, 0, s.a + 0.5, this.len(s.caste), 0);
      ctx.restore();
    }
    for (const s of this.sprites) {
      if (!s.alive) continue;
      const sp = s.side === 0 ? this.A.species : this.D.species;
      drawAnt(ctx, sp, s.caste, s.x, s.y, s.a, this.len(s.caste), Math.floor(this.t * 14 + s.ph) % 6);
    }
    for (const p of this.particles) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  len(caste) { return caste === 'major' ? 40 : caste === 'soldier' ? 30 : caste === 'scout' ? 24 : 22; }
  drawBanner(ctx, x, c, role, cur, start) {
    panel(ctx, x, 12, 400, 100, { border: c.color });
    text(ctx, role, x + 16, 22, { font: `bold 11px ${FONT_BODY}`, color: COL.dim });
    text(ctx, c.name, x + 16, 36, { font: `bold 20px ${FONT_HEAD}`, color: c.color });
    text(ctx, SPECIES[c.species].name, x + 384, 40, { font: `italic 13px ${FONT_HEAD}`, align: 'right', color: COL.dim });
    let bx = x + 16;
    for (const k of CASTE_KEYS) {
      if (!start[k]) continue;
      drawAnt(ctx, c.species, k, bx + 10, 84, -0.5, 18, 0);
      text(ctx, `${cur[k]}`, bx + 24, 76, { font: `bold 14px ${FONT_BODY}`, color: cur[k] < start[k] ? '#f0b090' : COL.text });
      bx += 80;
    }
    bar(ctx, x + 16, 100, 368, 5, sumUnits(cur) / Math.max(1, sumUnits(start)), c.color);
  }
  drawResult(ctx) {
    const st = App.st, b = this.b, pid = st.playerId;
    const playerAtk = b.atk === pid;
    const won = (b.winner === 'atk') === playerAtk;
    if (!this.resultSounded) { this.resultSounded = true; Sound.sfx(won ? 'victory' : 'defeat'); }
    const w = 520, h = 210, x = W / 2 - w / 2, y = H / 2 - 40;
    panel(ctx, x, y, w, h, { border: won ? COL.gold : '#c4523e' });
    const title = won ? 'VICTORY' : 'DEFEAT';
    text(ctx, title, W / 2, y + 16, { font: `bold 36px ${FONT_HEAD}`, align: 'center', color: won ? COL.gold : '#e06a50' });
    let sub = '';
    if (b.kind === 'nest') sub = b.winner === 'atk' ? `The nest of ${this.D.name} has been stormed!` : `${this.D.name} held their nest.`;
    else if (b.kind === 'outpost') sub = b.winner === 'atk' ? `The outpost of ${this.D.name} has fallen.` : `The outpost held.`;
    else sub = b.winner === 'atk' ? `${this.D.name}'s swarm was routed.` : `${this.A.name}'s attack was repelled.`;
    text(ctx, sub, W / 2, y + 64, { font: `15px ${FONT_BODY}`, align: 'center' });
    text(ctx, `${this.A.name} lost ${b.lossA}  •  ${this.D.name} lost ${b.lossD}`, W / 2, y + 92, { font: `14px ${FONT_BODY}`, align: 'center', color: COL.dim });
    if (b.plunder) text(ctx, `Plundered ${Math.round(b.plunder)} food${b.captured && b.captured !== 'outpost' ? `, captured ${b.captured} brood` : ''}`, W / 2, y + 116, { font: `14px ${FONT_BODY}`, align: 'center', color: COL.food });
    button(ctx, W / 2 - 80, y + h - 56, 160, 40, this.i < this.list.length - 1 ? 'Next battle' : 'Continue', () => this.next(), { primary: true });
  }
}
