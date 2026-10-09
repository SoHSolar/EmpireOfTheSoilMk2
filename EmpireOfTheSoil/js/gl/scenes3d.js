// =====================================================================
//  3D title backdrop, species portraits and graphics settings
// =====================================================================
'use strict';

TitleScene.prototype.draw3DBackground = function (ctx, dt) {
  if (!this.demo) {
    // a showcase colony living under the title screen
    const demo = newGame({ species: 'leafcutter', sizeKey: 'skirmish', difficulty: 'normal', name: 'Demo', seed: 4242 });
    demo.demo = true; demo.turn = 8;
    const p = playerCol(demo);
    p.techs.push('aphid_husbandry', 'deep_excavation');
    Object.assign(p.chambers, { royal: 4, nursery: 3, galleries: 3, granary: 3, barracks: 2, archive: 2, fungus: 3, aphids: 2, midden: 1, gates: 2 });
    p.adults = { worker: 420, soldier: 60, major: 14, scout: 0 };
    p.food = 700;
    p.brood = [{ caste: 'worker', left: 3, n: 40 }, { caste: 'worker', left: 2, n: 30 }, { caste: 'soldier', left: 1, n: 24 }];
    recompute(demo);
    this.demoSt = demo;
    const prev = App.st; App.st = demo;
    this.demo = new ColonyScene(); this.demo.colOverride = p;
    this.demo.refreshSoil(true);
    App.st = prev;
  }
  const prev = App.st; App.st = this.demoSt;
  const v = this.demo.v3, cam = v.cam;
  this.demo.updateAnts(dt);
  v.rect = { x: 0, y: 0, w: W, h: H };
  cam.yaw = Math.sin(this.t * 0.06) * 0.38; cam.dist = 12.5 + Math.sin(this.t * 0.045) * 2.2;
  cam.tx = Math.sin(this.t * 0.035) * 1.5; cam.ty = -3.6; cam.pitch = 0.16 + Math.sin(this.t * 0.05) * 0.05;
  v.render(dt);
  App.st = prev;
  const g = ctx.createLinearGradient(0, 0, 0, 200);
  g.addColorStop(0, 'rgba(10,6,3,0.55)'); g.addColorStop(1, 'rgba(10,6,3,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 200);
};

GL3D.portrait = function (rect, species, caste, t, opts = {}) {
  const cam = this._pcam || (this._pcam = new OrbitCam());
  cam.tx = 0.1; cam.ty = 0.2; cam.tz = 0; cam.dist = 2.5; cam.pitch = 0.45; cam.yaw = opts.yaw ?? (0.6 + t * 0.3); cam.fov = 0.62; cam.near = 0.05; cam.far = 40;
  cam.update(rect.w, rect.h);
  this.time = t;
  const items = [];
  const D = new Float32Array(16); M4.yaw(D, 0, 0, 0, 0, 0, 2.6);
  items.push({ mesh: Models.get('disc', buildDisc), model: D, tint: [0.36, 0.26, 0.17], spec: 0.05, bump: 1.0, bumpScale: 18 });
  const ants = new InstList(4), fr = Math.floor(t * 9);
  ants.push(0, 0, 0, Math.cos(0.3), 0, Math.sin(0.3), 0, 1, 0, 0.78);
  items.push(ants.item(Models.ant(species, caste, fr), ANT_MAT));
  if (opts.workers) {
    const w = new InstList(4);
    w.push(-0.9, 0, 0.7, Math.cos(-0.8), 0, Math.sin(-0.8), 0, 1, 0, 0.7);
    items.push(w.item(Models.ant(species, 'worker', fr + 3), ANT_MAT));
  }
  const rocks = new InstList(8), r = mulberry32(5);
  for (let i = 0; i < 7; i++) { const a = r() * 6.28, d = 1.1 + r() * 1.2; rocks.pushYaw(Math.cos(a) * d, 0, Math.sin(a) * d, r() * 6, 0.08 + r() * 0.12, 0.9, 0.88, 0.84); }
  items.push(rocks.item(Models.get('rock1', () => buildRock(1)), { spec: 0.12, bump: 1.2, bumpScale: 30 }));
  const grass = new InstList(64);
  for (let i = 0; i < 50; i++) { const a = r() * 6.28, d = 1.3 + r() * 1.3; grass.pushYaw(Math.cos(a) * d, 0, Math.sin(a) * d, r() * 6, 0.5 + r() * 0.5); }
  items.push(grass.item(Models.get('grass', buildGrassBlade), { wind: 1, cull: false, trans: 0.55, spec: 0.18, shin: 30 }));
  const tint = opts.tint || [0.5, 0.36, 0.2];
  const bg = [0.08 + tint[0] * 0.25, 0.06 + tint[1] * 0.2, 0.04 + tint[2] * 0.15];
  this.render({ rect, cam, items, shadow: { c: [0, 0, 0], r: 2.5 },
    env: { lightDir: V3.norm([-0.5, 0.85, 0.35]), lightCol: [1.15, 1.02, 0.9], sky: [0.34, 0.3, 0.28], ground: [0.14, 0.1, 0.07], fogCol: bg, clear: bg, fogNear: 3, fogFar: 6.5 },
    focus: cam.dist, focusRange: 0.22, dofMax: 10 * Math.min(1, rect.h / 360), aoRadius: 0.06, bloomAmt: 0.3, bloomThresh: 1.0, vignette: 0.25 });
};

class GraphicsDialog {
  constructor(onClose) { this.onClose = onClose; this.start = JSON.stringify(GL3D.settings); }
  close() {
    GL3D.saveSettings();
    const before = JSON.parse(this.start), s = GL3D.settings;
    if ((before.mode3d !== s.mode3d || before.grass !== s.grass) && App.st && !App.st.demo && App.mapScene) rebuildMapScene();
    this.onClose();
  }
  draw(ctx) {
    modalBackdrop(ctx);
    const w = 520, h = 430, x = W / 2 - w / 2, y = H / 2 - h / 2, s = GL3D.settings;
    panel(ctx, x, y, w, h, { title: 'Graphics' });
    let yy = y + 60;
    const row = (label, opts, cur, set, tip, disabled) => {
      text(ctx, label, x + 24, yy + 8, { font: `bold 14px ${FONT_BODY}`, color: disabled ? COL.faint : COL.text });
      UI.tip(x + 24, yy, 150, 30, tip);
      let bx = x + 180;
      const bw = (w - 200) / opts.length - 6;
      opts.forEach(([v, l]) => { button(ctx, bx, yy, bw, 32, l, () => set(v), { active: cur === v, disabled, size: 13 }); bx += bw + 6; });
      yy += 50;
    };
    row('Renderer', [[true, '3D'], [false, '2D']], s.mode3d, v => s.mode3d = v, 'Full 3D world, nest and battles, or the classic painted 2D look.', !GL3D.ok);
    row('Shadows', [[true, 'On'], [false, 'Off']], s.shadows, v => s.shadows = v, 'Soft sun shadows from ants, grass, stones and stumps.', !s.mode3d || !GL3D.ok);
    row('Vegetation', [[0, 'Off'], [1, 'Normal'], [2, 'Dense']], s.grass, v => s.grass = v, 'Grass blades and flowers swaying in the wind. Dense looks lush but costs more GPU time.', !s.mode3d || !GL3D.ok);
    row('Quality', [[0, 'Low'], [1, 'Medium'], [2, 'High'], [3, 'Ultra']], GL3D.settings.quality ?? (GL3D.tablet ? 1 : 2), v => { s.quality = v; GL3D.applyQuality(); },
      'Low: no post-processing. Medium: bloom, depth of field, anti-aliasing. High: adds ambient occlusion and softer shadows. Ultra: 4K shadow maps, more particles and wider blur.', !s.mode3d || !GL3D.ok);
    row('Depth of field', [[true, 'On'], [false, 'Off']], s.dof, v => s.dof = v, 'Macro-lens focus blur, as if filmed with a close-up camera. Turn off for a sharper view.', !s.mode3d || !GL3D.ok || !GL3D.postActive);
    if (!GL3D.ok) wrap(ctx, 'This browser or graphics driver does not support WebGL 2, so the game is using its 2D renderer.', x + 24, yy, w - 48, 18, { font: `12px ${FONT_BODY}`, color: COL.bad });
    else text(ctx, 'Map: drag to pan, right-drag or Q / E to rotate, wheel to zoom.', x + 24, yy + 4, { font: `12px ${FONT_BODY}`, color: COL.dim });
    button(ctx, x + w - 140, y + h - 54, 120, 38, 'Done', () => this.close(), { primary: true });
  }
  onKey(e) { if (e.key === 'Escape') this.close(); }
}

function rebuildMapScene() {
  const old = App.mapScene, wasActive = App.scene === old;
  let center = null;
  if (old) {
    if (old.v3) center = [Math.floor(old.v3.cam.tx), Math.floor(old.v3.cam.tz)];
    else { const ts = old.ts(); center = [Math.floor((old.cam.x + W / 2) / ts), Math.floor((old.cam.y + H / 2) / ts)]; }
  }
  if (old && old.v3) old.v3.dispose();
  App.mapScene = GL3D.active ? new MapScene3D() : new MapScene();
  if (old) { App.mapScene.sel = old.sel; App.mapScene.dialog = wasActive ? null : null; }
  if (center) App.mapScene.centerOn(center[0], center[1]);
  if (wasActive) App.setScene(App.mapScene);
}
