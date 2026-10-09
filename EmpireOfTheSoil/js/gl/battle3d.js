// =====================================================================
//  3D battles, fought on the real campaign terrain
// =====================================================================
'use strict';

BattleScene.prototype.drawWorld3D = function (ctx, dt) {
  const v = this.v3, b = this.b, st = App.st;
  const fort = b.kind === 'nest' || b.kind === 'outpost';
  // arena centre: for sieges, the defenders form up in front of the real mound
  const cx = b.x + 0.5 - (fort ? 4.4 : 0), cz = b.y + 0.5;
  const wx = px => cx + (px - 640) / 100, wz = py => cz + (py - 410) / 100;
  const cam = this.cam3 || (this.cam3 = new OrbitCam());
  cam.tx = cx + (fort ? 0.8 : 0); cam.tz = cz; cam.ty = v.groundAt(cx, cz);
  cam.dist = 8.2 - Math.min(1.2, this.t * 0.12); cam.pitch = 0.62; cam.fov = 0.8;
  cam.yaw = Math.sin(this.t * 0.18) * 0.3; cam.near = 0.1; cam.far = 80;
  this.t3 = (this.t3 || 0) + dt; GL3D.time = this.t3;
  cam.update(W, H);
  const items = [], sprites = [], si = seasonIdx(st.turn);
  for (const ch of v.chunks) {
    if (ch.x1 < cx - 14 || ch.x0 > cx + 14 || ch.z1 < cz - 12 || ch.z0 > cz + 12) continue;
    items.push({ mesh: ch.mesh, tex: ch.tex, spec: 0.08, bump: 0.3, bumpScale: 14 });
    for (const d of ch.decor) items.push(v.decorItem(d.key, d.inst, si));
  }
  if (v.water) items.push({ mesh: v.water, water: true });
  v.paintStep(8, cx, cz);
  if (fort) {
    const x = b.x + 0.5, z = b.y + 0.5, M = new Float32Array(16);
    M4.yaw(M, 0, x, v.groundAt(x, z) - 0.05, z, 0.4, b.kind === 'nest' ? 1.4 : 0.95);
    items.push({ mesh: Models.get('mound|' + this.D.color + '|' + (b.kind === 'outpost'), () => buildMound(this.D.color, b.kind === 'outpost')), model: M, spec: 0.06 });
  }
  const lists = new Map();
  if (!this.dust3) this.dust3 = [];
  const add = (sp, caste, fr, x, z, f, up, s, tint) => {
    const key = sp + '|' + caste + '|' + (fr % ANT3D_FRAMES);
    let l = lists.get(key); if (!l) { l = new InstList(64); lists.set(key, l); }
    const y = v.groundAt(x, z);
    l.push(x, y + (up[1] < 0 ? 0.09 * s * 3 : 0), z, f[0], f[1], f[2], up[0], up[1], up[2], s, ...(tint || [1, 1, 1]));
  };
  for (const s of this.sprites) {
    const sp = s.side === 0 ? this.A.species : this.D.species;
    const sc = this.len(s.caste) / 100 * 1.25;
    const f = [Math.cos(s.a), 0, Math.sin(s.a)];
    if (s.alive) {
      // lunging bites at the battle line
      let lx = 0, up = [0, 1, 0];
      if (this.phase === 'clash' && Math.abs(s.x - 640) < 90) {
        const k = Math.pow(Math.max(0, Math.sin(s.ph * 1.3 + s.hy)), 6);
        lx = k * 0.09; up = V3.norm([-f[0] * k * 0.5, 1, -f[2] * k * 0.5]);
        if (k > 0.85 && Math.random() < 0.15) this.dust3.push({ x: wx(s.x) + f[0] * 0.15, z: wz(s.y) + f[2] * 0.15, life: 1, r: 0.05 + Math.random() * 0.05 });
      }
      add(sp, s.caste, Math.floor(this.t * 16 + s.ph * 3), wx(s.x) + f[0] * lx, wz(s.y) + f[2] * lx, f, up, sc);
    }
    else add(sp, s.caste, 0, wx(s.x), wz(s.y), f, [0.3, -1, 0], sc, [0.55, 0.5, 0.48]);
  }
  for (const [key, l] of lists) {
    const [sp, caste, fr] = key.split('|');
    items.push(l.item(Models.ant(sp, caste, +fr, GL3D.tablet || this.sprites.length > 200 ? 1 : 0), ANT_MAT));
  }
  // kicked-up dust
  for (const d of this.dust3) {
    d.life -= dt * 0.8; d.r += dt * 0.12;
    if (d.life > 0) sprites.push({ v: [d.x, v.groundAt(d.x, d.z) + 0.05 + (1 - d.life) * 0.12, d.z, d.r, 0.62, 0.53, 0.4, d.life * 0.35] });
  }
  this.dust3 = this.dust3.filter(d => d.life > 0);
  if (GL3D.Q.particles > 0) ambientParticles(sprites, cam.tx, cam.ty, cam.tz, 7, si, this.t3, GL3D.Q.particles * 0.6);
  for (const p of this.particles) {
    const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(p.col) || [0, 220, 200, 160, 0.6];
    const x = wx(p.x), z = wz(p.y);
    sprites.push({ v: [x, v.groundAt(x, z) + 0.12 + (1 - p.life) * 0.25, z, p.r * 0.022, m[1] / 255, m[2] / 255, m[3] / 255, Math.min(1, p.life * 2) * +m[4]] });
  }
  const E = SEASON_ENV[si];
  GL3D.render({ rect: { x: 0, y: 0, w: W, h: H }, cam, items, sprites,
    env: { lightDir: SUN_DIR, lightCol: E.lightCol, sky: E.sky, ground: E.ground, fogCol: E.fog.map(c => c * 0.8), clear: E.fog, fogNear: 14, fogFar: 32, snow: si === 3 ? 0.6 : 0 },
    shadow: { c: [cam.tx, cam.ty, cam.tz], r: 9 }, sky: skyFor(si), focus: cam.dist, focusRange: 0.32, dofMax: 8, aoRadius: 0.15,
    grade: Object.assign({}, GRADE[si], { contrast: 0.34, sat: (GRADE[si].sat || 1) * 0.95 }), bloomAmt: 0.35, bloomThresh: 1.0, vignette: 0.45 });
  if (!GL3D.postActive) {   // gentle vignette so the banners read well
    const vg = ctx.createRadialGradient(W / 2, H / 2, 240, W / 2, H / 2, 760);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
};
