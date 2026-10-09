// =====================================================================
//  Title, setup, help and save/load screens
// =====================================================================
'use strict';

// Painted soil cross-section (shared by title + colony view)
function paintSoil(w, h, seed, surfaceY, carveMask) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const img = g.createImageData(w, h), d = img.data;
  const strata = [[96, 66, 42], [112, 78, 48], [88, 60, 40], [120, 92, 60], [78, 54, 36], [102, 74, 50]];
  let mask = null, blur = null;
  if (carveMask) {
    mask = carveMask.getContext('2d').getImageData(0, 0, w, h).data;
    const bc = makeCanvas(w, h), bg = bc.getContext('2d');
    bg.filter = 'blur(7px)'; bg.drawImage(carveMask, 0, 0);
    blur = bg.getImageData(0, 0, w, h).data;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (y < surfaceY - 4) { d[i + 3] = 0; continue; }
      const depth = (y - surfaceY) / (h - surfaceY);
      const wob = fbm(x * 0.006, y * 0.01, seed, 3) * 60;
      const layer = Math.floor((y + wob) / 70) % strata.length;
      const base = strata[layer];
      const n = fbm(x * 0.03, y * 0.03, seed + 5, 4);
      const grain = hash2(x, y, seed) * 0.16;
      let k = 0.72 + n * 0.45 + grain - depth * 0.28;
      let r = base[0] * k, gg = base[1] * k, b = base[2] * k;
      if (y < surfaceY + 10) { const t = (y - surfaceY + 4) / 14; r *= 0.75 + t * 0.25; gg *= 0.8 + t * 0.2; b *= 0.8 + t * 0.2; }
      if (mask) {
        const m = mask[i + 3] / 255, bl = blur[i + 3] / 255;
        // emboss: light from above -> floors lit, ceilings shadowed
        const up = y > 4 ? blur[i - w * 4 * 4 + 3] / 255 : bl, dn = y < h - 5 ? blur[i + w * 4 * 4 + 3] / 255 : bl;
        const relief = (dn - up);
        if (m > 0.02) {
          const ao = 0.35 + 0.4 * (1 - bl) + 0.18 * (1 - m);
          const inner = 0.42 + bl * 0.18;
          r = lerp(r, r * inner * 0.9 + 6, m) * (1 + relief * 0.15); gg = lerp(gg, gg * inner * 0.85 + 4, m); b = lerp(b, b * inner * 0.8 + 2, m);
          r *= 1 - ao * 0.15 * m; gg *= 1 - ao * 0.15 * m; b *= 1 - ao * 0.15 * m;
        } else {
          // rim around tunnels: highlight lower lip, dark upper lip
          const s = 1 + clamp(-relief * 1.4, -0.45, 0.35) - bl * 0.25;
          r *= s; gg *= s; b *= s;
        }
      }
      d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // roots and stones
  const rng = mulberry32(seed + 3);
  for (let k = 0; k < 6; k++) {
    let x = rng() * w, y = surfaceY, ang = Math.PI / 2 + (rng() - 0.5) * 0.6;
    const wd = 3 + rng() * 5;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let s = 0; s < 16; s++) {
      ang += (rng() - 0.5) * 0.5; ang = clamp(ang, 0.5, Math.PI - 0.5);
      const l = 14 + rng() * 10, nx = x + Math.cos(ang) * l, ny = y + Math.sin(ang) * l;
      if (mask && mask[((Math.min(h - 1, ny | 0)) * w + Math.min(w - 1, Math.max(0, nx | 0))) * 4 + 3] > 20) break;
      const ww = wd * (1 - s / 17);
      g.strokeStyle = 'rgba(30,18,10,0.5)'; g.lineWidth = ww + 2; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      g.strokeStyle = '#6b4a2c'; g.lineWidth = ww; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      g.strokeStyle = 'rgba(190,150,100,0.3)'; g.lineWidth = ww * 0.3; g.beginPath(); g.moveTo(x - 1, y - 1); g.lineTo(nx - 1, ny - 1); g.stroke();
      x = nx; y = ny;
    }
  }
  for (let k = 0; k < 26; k++) {
    const x = rng() * w, y = surfaceY + 20 + rng() * (h - surfaceY - 20);
    if (mask && mask[((y | 0) * w + (x | 0)) * 4 + 3] > 10) continue;
    const r = 4 + rng() * 12;
    const grd = g.createRadialGradient(x - r * 0.35, y - r * 0.4, 1, x, y, r);
    const t = 110 + rng() * 50;
    grd.addColorStop(0, `rgb(${t + 60},${t + 55},${t + 45})`); grd.addColorStop(0.6, `rgb(${t},${t - 5},${t - 15})`); grd.addColorStop(1, `rgb(${t * 0.4},${t * 0.38},${t * 0.33})`);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 2, y + 3, r, r * 0.75, 0, 0, 6.28); g.fill();
    g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, r, r * 0.75, rng(), 0, 6.28); g.fill();
  }
  return c;
}

function drawSky(ctx, w, surfaceY, si, t) {
  const s = SEASONS[si];
  const g = ctx.createLinearGradient(0, 0, 0, surfaceY);
  g.addColorStop(0, s.sky[0]); g.addColorStop(1, s.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, surfaceY + 2);
  // distant giant grass silhouettes
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = layer ? (si === 3 ? '#8a9a8a' : si === 2 ? '#8a7a3a' : '#5d8a3a') : (si === 3 ? '#a9b4ad' : si === 2 ? '#b09a5a' : '#8fb86a');
    for (let i = 0; i < 70; i++) {
      const x = (i * 23.7 + layer * 11) % w, hh = 30 + hash2(i, layer, 4) * (layer ? 70 : 45);
      const sway = Math.sin(t * 0.8 + i) * 4;
      ctx.beginPath(); ctx.moveTo(x - 4, surfaceY); ctx.quadraticCurveTo(x + sway * 0.5, surfaceY - hh * 0.6, x + sway, surfaceY - hh); ctx.quadraticCurveTo(x + 2, surfaceY - hh * 0.5, x + 4, surfaceY); ctx.fill();
    }
  }
  if (si === 3) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 40; i++) { const x = (i * 97 + t * 20 * (1 + i % 3)) % w, y = (i * 53 + t * 30) % surfaceY; ctx.beginPath(); ctx.arc(x, y, 1.5 + i % 2, 0, 6.28); ctx.fill(); }
  }
}

// ---------------------------------------------------------------------
class TitleScene {
  leave() { if (this.demo) this.demo.leave(); this.demo = null; }
  enter() {
    Sound.music('title'); Sound.ambience('surface', 1);
    this.soil = null; this.t = 0;
    this.ants = [];
    for (let i = 0; i < 26; i++) this.ants.push({ s: Math.random(), v: 0.018 + Math.random() * 0.01, sp: pick(Math.random, SPECIES_KEYS), lane: i % 3, carry: Math.random() < 0.5 });
    this.saves = App.listSaves();
    this.dialog = null;
  }
  path(lane, s) {   // tunnel paths across the screen
    const y0 = [430, 540, 640][lane];
    const x = -60 + s * (W + 120);
    const y = y0 + Math.sin(s * 6.28 * (1 + lane * 0.3) + lane) * 40;
    return [x, y];
  }
  ensureSoil() {
    if (this.soil) return;
    const mask = makeCanvas(W, H), g = mask.getContext('2d');
    g.strokeStyle = '#fff'; g.lineCap = 'round';
    for (let lane = 0; lane < 3; lane++) {
      g.lineWidth = 26; g.beginPath();
      for (let s = 0; s <= 1; s += 0.01) { const [x, y] = this.path(lane, s); s === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(980, 520, 120, 60, 0, 0, 6.28); g.fill();
    g.beginPath(); g.ellipse(250, 600, 90, 45, 0, 0, 6.28); g.fill();
    this.soil = paintSoil(W, H, 77, 300, mask);
  }
  draw(ctx, dt) {
    this.t += dt;
    if (GL3D.active) { this.uses3D = true; this.draw3DBackground(ctx, dt); }
    else { this.uses3D = false; this.draw2DBackground(ctx, dt); }
    this.drawMenu(ctx);
  }
  draw2DBackground(ctx, dt) {
    this.ensureSoil();
    drawSky(ctx, W, 300, 1, this.t);
    ctx.drawImage(this.soil, 0, 0);
    // queen in the chamber
    drawAnt(ctx, 'leafcutter', 'queen', 980, 520, Math.sin(this.t * 0.3) * 0.05, 52, Math.floor(this.t * 2) % 6);
    for (let i = 0; i < 9; i++) ctx.drawImage(item('egg'), 920 + i * 9, 548 + (i % 2) * 4);
    for (let i = 0; i < 5; i++) ctx.drawImage(item('larva'), 1015 + i * 15, 540 + (i % 2) * 6);
    for (let i = 0; i < 4; i++) ctx.drawImage(item('pupa'), 210 + i * 18, 600 + (i % 2) * 6);
    for (const a of this.ants) {
      a.s += a.v * dt; if (a.s > 1) a.s -= 1;
      const [x, y] = this.path(a.lane, a.s), [x2, y2] = this.path(a.lane, a.s + 0.002);
      const ang = Math.atan2(y2 - y, x2 - x);
      drawAnt(ctx, a.sp, 'worker', x, y, ang, 27, Math.floor(this.t * 12 + a.s * 100) % 6);
      if (a.carry) { ctx.save(); ctx.translate(x + Math.cos(ang) * 12, y + Math.sin(ang) * 12); ctx.rotate(ang); ctx.drawImage(item(a.sp === 'leafcutter' ? 'leafbit' : 'seed'), -6, -9); ctx.restore(); }
    }
  }
  drawMenu(ctx) {
    // title
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 20;
    text(ctx, 'EMPIRE OF THE SOIL', W / 2, 70, { font: `bold 64px ${FONT_HEAD}`, align: 'center', color: '#f6d27a' });
    ctx.restore();
    text(ctx, 'A grand strategy of ants', W / 2, 146, { font: `italic 22px ${FONT_HEAD}`, align: 'center', color: this.uses3D ? '#f3e3c0' : '#3a2510', shadow: !!this.uses3D });
    const bx = W / 2 - 130; let by = 330;
    const hasAuto = this.saves.find(s => s.slot === 'auto' && s.meta);
    panel(ctx, bx - 20, by - 20, 300, hasAuto ? 348 : 296, { c1: 'rgba(30,20,12,0.85)', c2: 'rgba(16,10,6,0.9)' });
    if (hasAuto) {
      button(ctx, bx, by, 260, 44, 'Continue', () => { if (!App.load('auto')) App.toast('Could not load autosave', COL.bad); }, { primary: true, size: 17, tip: `${hasAuto.meta.name} - ${hasAuto.meta.date}` });
      by += 52;
    }
    button(ctx, bx, by, 260, 44, 'New Campaign', () => App.setScene(new SetupScene()), { primary: !hasAuto, size: 17 }); by += 52;
    button(ctx, bx, by, 260, 44, 'Load Game', () => { this.dialog = new SaveLoadDialog(false, () => this.dialog = null); }, { size: 16 }); by += 52;
    button(ctx, bx, by, 260, 44, 'How to Play', () => App.setScene(new HelpScene(this)), { size: 16 }); by += 52;
    button(ctx, bx, by, 126, 40, 'Graphics', () => { this.dialog = new GraphicsDialog(() => this.dialog = null); }, { size: 14 });
    button(ctx, bx + 134, by, 126, 40, 'Sound', () => { this.dialog = new SoundDialog(() => this.dialog = null); }, { size: 14 }); by += 48;
    if (App.isElectron) {
      button(ctx, bx, by, 126, 40, 'Fullscreen', () => App.toggleFullscreen(), { size: 14, key: 'F11' });
      button(ctx, bx + 134, by, 126, 40, 'Quit', () => App.quit(), { size: 14 });
    } else button(ctx, bx, by, 260, 40, App.canFullscreen ? 'Fullscreen' : (App.touch ? 'Tip: Share > Add to Home Screen' : 'Fullscreen'), () => { if (App.canFullscreen) App.toggleFullscreen(); else App.toast('In Safari, tap Share then "Add to Home Screen" to play full-screen.'); }, { size: App.canFullscreen ? 14 : 12, key: App.touch ? '' : 'F11' });
    text(ctx, 'v1.0  -  all art is generated procedurally', W - 12, H - 22, { font: `11px ${FONT_BODY}`, align: 'right', color: 'rgba(255,230,190,0.5)' });
    if (this.dialog) this.dialog.draw(ctx);
  }
  onKey(e) { if (this.dialog) this.dialog.onKey?.(e); }
}

// ---------------------------------------------------------------------
class SetupScene {
  enter() {
    this.sel = 'leafcutter'; this.size = 'standard'; this.diff = 'normal';
    this.name = 'Queen’s Hollow'; this.t = 0; this.editing = false;
    this.portrait = null;
  }
  statRows(sp) {
    const m = Object.assign({}, DEFAULT_MODS, SPECIES[sp].mods);
    return [
      ['Attack', m.atk], ['Health', m.hp], ['Breeding', m.lay * (m.broodTime < 0 ? 1.15 : 1)], ['Foraging', m.forage],
      ['Building', m.build], ['Research', m.research], ['Nest defence', m.defense], ['Speed', 1 + m.move * 0.25],
      ['Food storage', m.storage > 1.5 ? 1.6 : m.storage], ['Winter hardiness', m.winter > 1.3 ? 1.4 : m.winter],
    ];
  }
  draw(ctx, dt) {
    this.t += dt;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a1c11'); bg.addColorStop(1, '#120c07');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    text(ctx, 'Found Your Colony', 30, 20, { font: `bold 32px ${FONT_HEAD}`, color: COL.gold });
    text(ctx, 'Choose a species. Each is modelled on a real ant with real strengths and weaknesses.', 32, 60, { color: COL.dim });
    // species list
    let y = 92;
    for (const k of SPECIES_KEYS) {
      const s = SPECIES[k], on = k === this.sel, hov = UI.over(30, y, 330, 62);
      roundRect(ctx, 30, y, 330, 62, 8);
      ctx.fillStyle = on ? 'rgba(217,164,65,0.22)' : hov ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.25)'; ctx.fill();
      ctx.strokeStyle = on ? COL.gold : 'rgba(120,90,50,0.5)'; ctx.lineWidth = on ? 2 : 1; ctx.stroke();
      drawAnt(ctx, k, 'worker', 70, y + 31, -0.3 + Math.sin(this.t * 2 + y) * 0.05, 40, on ? Math.floor(this.t * 10) % 6 : 0);
      text(ctx, s.name, 112, y + 12, { font: `bold 16px ${FONT_HEAD}`, color: on ? COL.gold : COL.text });
      text(ctx, s.latin, 112, y + 34, { font: `italic 13px ${FONT_HEAD}`, color: COL.dim });
      UI.region(30, y, 330, 62, () => { if (this.sel !== k) Sound.sfx('select'); this.sel = k; });
      y += 68;
    }
    // detail panel
    const sp = SPECIES[this.sel];
    panel(ctx, 380, 92, 870, 470);
    // portrait vignette
    const px = 400, py = 110, pw = 330, ph = 250;
    if (GL3D.active) {
      ctx.save(); roundRect(ctx, px, py, pw, ph, 10); ctx.clip(); ctx.clearRect(px, py, pw, ph); ctx.restore();
      GL3D.portrait({ x: px, y: py, w: pw, h: ph }, this.sel, 'soldier', this.t, { workers: true });
    } else {
    ctx.save(); roundRect(ctx, px, py, pw, ph, 10); ctx.clip();
    if (!this.portrait) this.portrait = paintSoil(pw, ph, 12, -10, null);
    ctx.drawImage(this.portrait, px, py);
    const vg = ctx.createRadialGradient(px + pw / 2, py + ph / 2, 40, px + pw / 2, py + ph / 2, 200);
    vg.addColorStop(0, 'rgba(255,220,150,0.18)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(px, py, pw, ph);
    const walk = Math.floor(this.t * 6) % 6;
    drawAnt(ctx, this.sel, 'soldier', px + pw / 2 + 10, py + ph / 2 - 10, -0.25 + Math.sin(this.t * 0.7) * 0.08, 130, walk);
    drawAnt(ctx, this.sel, 'worker', px + 70, py + ph - 50, -1.1, 50, (walk + 3) % 6);
    if (sp.look.carry === 'leaf') { ctx.save(); ctx.translate(px + 85, py + ph - 72); ctx.rotate(-1.1); ctx.scale(2, 2); ctx.drawImage(item('leafbit'), -8, -10); ctx.restore(); }
    ctx.restore();
    }
    roundRect(ctx, px, py, pw, ph, 10); ctx.strokeStyle = COL.border; ctx.stroke();
    text(ctx, sp.name, 750, 110, { font: `bold 26px ${FONT_HEAD}`, color: COL.gold });
    text(ctx, sp.latin + '  •  ' + sp.region, 750, 144, { font: `italic 14px ${FONT_HEAD}`, color: COL.dim });
    wrap(ctx, sp.desc, 750, 172, 480, 19, { font: `14px ${FONT_BODY}`, color: COL.text });
    let sy = 270;
    text(ctx, 'Strengths', 750, sy, { font: `bold 14px ${FONT_BODY}`, color: COL.good }); sy += 20;
    for (const s of sp.strengths) { text(ctx, '▲ ' + s, 760, sy, { font: `13px ${FONT_BODY}`, color: '#cfe8b8' }); sy += 18; }
    sy += 6;
    text(ctx, 'Weaknesses', 750, sy, { font: `bold 14px ${FONT_BODY}`, color: COL.bad }); sy += 20;
    for (const s of sp.weaknesses) { text(ctx, '▼ ' + s, 760, sy, { font: `13px ${FONT_BODY}`, color: '#f0c0b0' }); sy += 18; }
    // stat bars
    const rows = this.statRows(this.sel);
    rows.forEach(([n, v], i) => {
      const cx = 400 + (i % 2) * 170, cy = 378 + Math.floor(i / 2) * 34;
      text(ctx, n, cx, cy, { font: `12px ${FONT_BODY}`, color: COL.dim });
      const col = v > 1.05 ? '#8fd16a' : v < 0.95 ? '#e0735a' : '#d9b46a';
      bar(ctx, cx, cy + 16, 150, 8, v / 2, col);
    });
    // options
    panel(ctx, 380, 574, 870, 130);
    text(ctx, 'Map', 400, 590, { font: `bold 14px ${FONT_BODY}`, color: COL.gold });
    let bx = 400;
    for (const k of Object.keys(MAP_SIZES)) {
      button(ctx, bx, 612, 150, 34, MAP_SIZES[k].name, () => this.size = k, { active: this.size === k, tip: MAP_SIZES[k].desc + ` (${MAP_SIZES[k].w}x${MAP_SIZES[k].h})` });
      bx += 158;
    }
    text(ctx, MAP_SIZES[this.size].desc, 400, 654, { font: `12px ${FONT_BODY}`, color: COL.dim });
    text(ctx, 'Difficulty', 890, 590, { font: `bold 14px ${FONT_BODY}`, color: COL.gold });
    bx = 890;
    for (const k of Object.keys(DIFFICULTY)) { button(ctx, bx, 612, 112, 34, DIFFICULTY[k].name, () => this.diff = k, { active: this.diff === k }); bx += 120; }
    text(ctx, 'Colony name', 30, 572, { font: `bold 14px ${FONT_BODY}`, color: COL.gold });
    roundRect(ctx, 30, 594, 330, 38, 6); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
    ctx.strokeStyle = this.editing ? COL.gold : COL.border; ctx.stroke();
    const caret = this.editing && Math.floor(this.t * 2) % 2 ? '|' : '';
    text(ctx, this.name + caret, 42, 604, { font: `16px ${FONT_HEAD}` });
    UI.region(30, 594, 330, 38, () => { this.editing = true; App.editText(this.name, v => this.name = v, () => this.editing = false); });
    button(ctx, 30, 650, 110, 46, 'Back', () => App.setScene(new TitleScene()));
    button(ctx, 150, 650, 210, 46, 'Begin Campaign', () => this.start(), { primary: true, size: 17 });
    button(ctx, 1080, 660, 160, 34, 'Random seed', () => { this.seed = (Math.random() * 1e9) | 0; App.toast('New world seed: ' + this.seed); }, { size: 12, tip: 'Each campaign generates a new map anyway; this just rerolls it.' });
  }
  onClick() { if (this.editing) App.stopEditText(); this.editing = false; }
  leave() { App.stopEditText(); }
  onKey(e) { if (!this.editing && e.key === 'Enter') this.start(); }
  start() {
    App.stopEditText();
    Sound.sfx('turn');
    const st = newGame({ species: this.sel, sizeKey: this.size, difficulty: this.diff, name: this.name.trim() || 'Your Colony', seed: this.seed });
    App.startGame(st);
    App.mapScene.showIntro = true;
  }
}

// ---------------------------------------------------------------------
class HelpScene {
  constructor(back) { this.back = back; this.page = 0; }
  draw(ctx) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a1c11'); bg.addColorStop(1, '#120c07');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const pages = HELP_PAGES;
    const p = pages[this.page];
    panel(ctx, 140, 40, 1000, 600);
    text(ctx, p[0], 170, 62, { font: `bold 28px ${FONT_HEAD}`, color: COL.gold });
    text(ctx, `Page ${this.page + 1} / ${pages.length}`, 1110, 70, { align: 'right', color: COL.dim });
    wrap(ctx, p[1], 170, 112, 940, 22, { font: `15px ${FONT_BODY}` });
    button(ctx, 140, 655, 120, 40, 'Back', () => App.setScene(this.back && this.back.draw ? this.back : new TitleScene()));
    button(ctx, 880, 655, 120, 40, 'Previous', () => this.page = Math.max(0, this.page - 1), { disabled: this.page === 0 });
    button(ctx, 1020, 655, 120, 40, 'Next', () => this.page = Math.min(pages.length - 1, this.page + 1), { disabled: this.page === pages.length - 1, primary: true });
  }
  onKey(e) {
    if (e.key === 'Escape') App.setScene(this.back && this.back.draw ? this.back : new TitleScene());
    if (e.key === 'ArrowRight') this.page = Math.min(HELP_PAGES.length - 1, this.page + 1);
    if (e.key === 'ArrowLeft') this.page = Math.max(0, this.page - 1);
  }
}
const HELP_PAGES = [
  ['Your Colony', 'You begin as a young queen with her first workers (the "nanitics"). Every turn is one fortnight; four seasons of six turns make a year.\n\nThe QUEEN lays eggs each turn. Eggs become larvae and pupae (the BROOD) and finally hatch into adult ants of the caste you chose. Eggs cost food, and every adult eats food each turn (its upkeep).\n\nIf food runs out the colony eats its own brood, then adults starve. If your home nest falls, the queen dies and the game is lost - unless you have researched Polygyny and own an outpost.\n\nWin by destroying every rival colony, or by controlling 40% of all land.'],
  ['The Campaign Map', 'The main map shows the land around your nest from an ant\'s eye view: grass, leaf litter, stones, tree roots, sand and rain puddles. Each terrain has a food value, a material value, a movement cost and a defence bonus.\n\nYour TERRITORY (tinted with your colour) determines how much food foragers can find - more workers than the land can feed is wasted effort. Expand territory by founding OUTPOSTS (satellite nests) with a swarm of 10+ workers.\n\nFood sources appear on the map: aphid herds and seed caches are permanent; berries, beetle carcasses and picnic crumbs rot away. A source inside your territory adds to its food supply; a swarm with workers parked on one outside your land will harvest it.\n\nControls: drag with the left mouse button (or WASD / arrow keys) to pan, right-drag or Q / E to rotate the 3D camera, mouse wheel to zoom, click the minimap to jump. Space or Enter ends the turn. F9 mutes sound; volumes are in Menu > Sound Settings.'],
  ['Swarms & Battle', 'Muster a SWARM from the nest (Colony view > Muster, or select your nest on the map). Swarms carry soldiers, majors, scouts and workers. Select a swarm and click a destination (or right-click) to march - the path shows how far it gets this turn. Orders longer than one turn continue automatically.\n\nMarch into an enemy swarm, outpost or nest while at war to attack. Battles are fought in rounds and shown on the battlefield screen. Defenders get terrain bonuses; nests get a large defence bonus (Fortified Gates, Barracks, Fortification). Every worker in a nest fights to protect the queen.\n\nSwarms outside your territory suffer attrition (worse in winter). Bring them home and Disband them into the nest, or Garrison them in an outpost.\n\nBeating a nest kills its queen. You plunder its food and raise its captured brood as your own workers - just like real slave-raiding ants.'],
  ['Castes & Jobs', 'WORKERS forage, excavate (materials), nurse brood and research. Set the split in Colony view > Workforce.\n\nThe CASTE MIX decides what the queen\'s eggs become. Real ants do this through larval nutrition - so you can change it any time.\n  • Soldiers - large heads, strong jaws. Core of every army.\n  • Majors - giants (needs Polymorphism). Expensive, devastating.\n  • Scouts - fast, long-legged (needs Scout Caste). Extra vision and speed.\n\nEach nurse cares for 8 brood. Too few nurses and the brood stops developing.\n\nCHAMBERS are dug with materials: Royal Chamber (eggs per turn), Nursery (brood capacity), Galleries (population), Granary (storage), Barracks, Pheromone Archive (research), Fungus Garden, Aphid Pasture, Refuse Midden (health) and Fortified Gates.'],
  ['Research, Diplomacy & Trade', 'RESEARCH unlocks techniques in four branches: Foraging, Warfare, Nest-craft and Society. Pick a project in the Research screen; unspent research points are banked.\n\nDIPLOMACY: every colony you have met appears in the Diplomacy screen with its species and its opinion of you. Neighbours competing for the same land grow hostile over time. You can declare war, sue for peace, gift food to improve relations, or open TRADE ROUTES.\n\nA trade route is a pheromone trail between two nests. Trader ants walk it every turn and both colonies gain food and research - more for longer routes and bigger partners. A route is cut while an enemy swarm stands on it, so guard your trails.\n\nSeasons matter: spring boosts laying, summer boosts foraging, winter nearly stops both. Stock your granary before the frost.'],
  ['Species at a Glance', 'Leafcutter Ant - fungus farmers. Huge populations and Majors from the start, but slow armies.\n\nArmy Ant - nomadic raiders. Brutal attack, plunder and brood capture, but a weak bivouac nest.\n\nBullet Ant - each ant a warrior with the most painful sting on Earth. Tiny colonies.\n\nRed Fire Ant - explosive breeding and living rafts across water. Fragile individually.\n\nWeaver Ant - silk-stitching builders and fierce defenders of forest territory. Hate the cold.\n\nHoneypot Ant - living larders survive famine and grow rich through trade. Poor fighters.\n\nRed Wood Ant - formic-acid sprayers and aphid herders of European woods. Cold-hardy all-rounders.'],
];

// ---------------------------------------------------------------------
class SaveLoadDialog {
  constructor(canSave, onClose) { this.canSave = canSave; this.onClose = onClose; this.saves = App.listSaves(); this.confirm = null; }
  draw(ctx) {
    modalBackdrop(ctx);
    const x = W / 2 - 330, y = 110, w = 660, h = 500;
    panel(ctx, x, y, w, h, { title: this.canSave ? 'Save / Load Game' : 'Load Game' });
    let yy = y + 52;
    for (const s of this.saves) {
      roundRect(ctx, x + 16, yy, w - 32, 56, 6); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
      const label = s.slot === 'auto' ? 'Autosave' : 'Slot ' + s.slot;
      text(ctx, label, x + 30, yy + 8, { font: `bold 14px ${FONT_BODY}`, color: COL.gold });
      if (s.meta) {
        text(ctx, `${s.meta.name} (${SPECIES[s.meta.species]?.name || ''}) - ${s.meta.size}`, x + 130, yy + 8, { font: `14px ${FONT_BODY}` });
        text(ctx, `${s.meta.date}  •  saved ${s.meta.saved}`, x + 130, yy + 30, { font: `12px ${FONT_BODY}`, color: COL.dim });
        button(ctx, x + w - 110, yy + 12, 80, 32, 'Load', () => { if (!App.load(s.slot)) App.toast('Load failed', COL.bad); else this.onClose(); }, { primary: !this.canSave });
      } else text(ctx, 'empty', x + 130, yy + 18, { color: COL.faint });
      if (this.canSave && s.slot !== 'auto')
        button(ctx, x + w - 200, yy + 12, 80, 32, 'Save', () => {
          if (App.save(s.slot)) { App.toast('Game saved to slot ' + s.slot); this.saves = App.listSaves(); } else App.toast('Save failed (storage full?)', COL.bad);
        }, { primary: true });
      yy += 62;
    }
    if (this.canSave) button(ctx, x + 16, y + h - 54, 170, 38, 'Export save file...', () => App.exportSave(), { tip: 'Download the campaign as a file - a backup you can move between computers.' });
    button(ctx, x + 196, y + h - 54, 170, 38, 'Import save file...', () => App.importSave());
    button(ctx, x + w - 136, y + h - 54, 120, 38, 'Close', () => this.onClose());
  }
  onKey(e) { if (e.key === 'Escape') this.onClose(); }
}
