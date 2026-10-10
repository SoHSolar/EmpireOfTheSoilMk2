// =====================================================================
//  3D campaign map: terrain, water, vegetation, nests, swarms, trails
// =====================================================================
'use strict';

const CT = 32;            // tiles per terrain chunk
const PAINT_Z = 0.75;     // painted texture resolution (24px per tile)

const SEASON_ENV = [
  { lightCol: [1.0, 0.95, 0.85], sky: [0.40, 0.48, 0.58], ground: [0.22, 0.18, 0.12], fog: [0.60, 0.70, 0.80] },
  { lightCol: [1.08, 0.98, 0.84], sky: [0.44, 0.52, 0.62], ground: [0.24, 0.20, 0.12], fog: [0.62, 0.74, 0.86] },
  { lightCol: [1.02, 0.80, 0.58], sky: [0.46, 0.40, 0.38], ground: [0.24, 0.17, 0.10], fog: [0.70, 0.60, 0.50] },
  { lightCol: [0.86, 0.90, 1.0], sky: [0.50, 0.56, 0.64], ground: [0.26, 0.26, 0.28], fog: [0.74, 0.79, 0.86] },
];
const SUN_DIR = V3.norm([-0.55, 0.85, -0.45]);
const GRASS_TINT = [[1.0, 1.04, 0.95], [1.05, 1.0, 0.86], [1.35, 0.95, 0.55], [0.95, 0.92, 0.85]];
const GRADE = [
  { exposure: 1.0, gain: [1.0, 1.02, 0.97], lift: [0.005, 0.01, 0.01], sat: 1.12, contrast: 0.28 },
  { exposure: 1.02, gain: [1.04, 1.0, 0.92], lift: [0.012, 0.006, 0.0], sat: 1.1, contrast: 0.3 },
  { exposure: 0.98, gain: [1.08, 0.97, 0.86], lift: [0.015, 0.006, 0.0], sat: 1.06, contrast: 0.3 },
  { exposure: 0.98, gain: [0.95, 0.99, 1.06], lift: [0.0, 0.006, 0.016], sat: 0.88, contrast: 0.24 },
];
const ANT_MAT = { spec: 0.9, shin: 60, rim: 0.2, coat: 0.55, bump: 0.25, bumpScale: 40 };
const ANT_MAT_MAP = Object.assign({ map: true }, ANT_MAT);
function skyFor(si) {
  const E = SEASON_ENV[si];
  return { sunDir: SUN_DIR, top: E.sky.map(v => v * 0.7), hor: E.fog.map(v => v * 1.0), sunCol: E.lightCol };
}

class MapView3D {
  constructor(st) {
    this.st = st;
    this.S = st.w * st.h > 9000 ? 3 : 4;
    this.painter = new TerrainRenderer(st); this.painter.flat = true;
    this.cam = new OrbitCam();
    this.cam.dist = 16; this.cam.yaw = 0.35; this.cam.fov = 0.75;
    this.t = 0; this.overlaysDirty = true;
    this.fowTex = GL3D.texture(null); this.terrTex = GL3D.texture(null, { nearest: true });
    this.lists = new Map();
    this.buildHeights();
    this.buildChunks();
    this.buildWater();
    this.buildCanopy();
    this.mRing = Models.get('ring', buildRing);
    // dark plinth around the edge of the world
    const sk = new MeshB(), E = 400, { w, h } = st, c = [0.07, 0.05, 0.035];
    sk.quadXZ(-E, -E, w + E, 0, -0.9, c); sk.quadXZ(-E, h, w + E, h + E, -0.9, c);
    sk.quadXZ(-E, 0, 0, h, -0.9, c); sk.quadXZ(w, 0, w + E, h, -0.9, c);
    this.skirt = GL3D.mesh(sk.build());
    this.mDisc = Models.get('disc', buildDisc);
  }

  dispose() {
    for (const ch of this.chunks) { GL3D.free(ch.mesh); GL3D.free(ch.tex); for (const d of ch.decor) GL3D.free(d.inst); }
    GL3D.free(this.water); GL3D.free(this.skirt); GL3D.free(this.fowTex); GL3D.free(this.terrTex); GL3D.free(this.canopyTex);
  }
  // ---------------- terrain ----------------
  buildHeights() {
    const { w, h, seed } = this.st, S = this.S;
    const gw = w * S + 1, gh = h * S + 1;
    this.gw = gw; this.gh = gh;
    const H = new Float32Array(gw * gh), H0 = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const u = gx / S, v = gy / S, i = gy * gw + gx;
      const hill = (fbm(u * 0.06, v * 0.06, seed + 501, 4) - 0.5) * 2.4;
      const base = this.painter.offAt(u, v) * 1.25;
      const bump = (fbm(u * 0.55, v * 0.55, seed + 502, 3) - 0.5) * 0.28;
      const rockness = clamp((base - 0.15) / 0.35, 0, 1);
      const rock = rockness * (ridge(u * 0.8, v * 0.8, seed + 503, 3) - 0.4) * 0.9;
      H0[i] = hill;
      H[i] = hill + base + bump * (base > -0.2 ? 1 : 0.3) + rock;
    }
    this.H = H; this.H0 = H0;
  }
  sample(A, u, v) {
    const S = this.S, gw = this.gw, gh = this.gh;
    let x = clamp(u * S, 0, gw - 1.001), y = clamp(v * S, 0, gh - 1.001);
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * gw + x0;
    return (A[i] * (1 - fx) + A[i + 1] * fx) * (1 - fy) + (A[i + gw] * (1 - fx) + A[i + gw + 1] * fx) * fy;
  }
  heightAt(u, v) { return this.sample(this.H, u, v); }
  groundAt(u, v) {   // standing height: never below the water surface
    const t = TERRAIN[terrainAt(this.st, clamp(Math.floor(u), 0, this.st.w - 1), clamp(Math.floor(v), 0, this.st.h - 1))];
    const h = this.heightAt(u, v);
    return t.pass ? h : Math.max(h, this.sample(this.H0, u, v) - 0.12);
  }
  normalAt(u, v) {
    const e = 0.25, dx = this.heightAt(u + e, v) - this.heightAt(u - e, v), dz = this.heightAt(u, v + e) - this.heightAt(u, v - e);
    return V3.norm([-dx / (2 * e), 1, -dz / (2 * e)]);
  }
  buildChunks() {
    const { w, h } = this.st, S = this.S;
    this.chunks = [];
    const ncx = Math.ceil(w / CT), ncy = Math.ceil(h / CT);
    for (let cy = 0; cy < ncy; cy++) for (let cx = 0; cx < ncx; cx++) {
      const gx0 = cx * CT * S, gy0 = cy * CT * S, gx1 = Math.min(this.gw - 1, (cx + 1) * CT * S), gy1 = Math.min(this.gh - 1, (cy + 1) * CT * S);
      const nx = gx1 - gx0 + 1, ny = gy1 - gy0 + 1;
      const pos = new Float32Array(nx * ny * 3), nrm = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2);
      let k = 0, mn = 1e9, mx = -1e9;
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        const u = gx / S, v = gy / S, i = gy * this.gw + gx, hh = this.H[i];
        const hl = this.H[gy * this.gw + Math.max(0, gx - 1)], hr = this.H[gy * this.gw + Math.min(this.gw - 1, gx + 1)];
        const hu = this.H[Math.max(0, gy - 1) * this.gw + gx], hd = this.H[Math.min(this.gh - 1, gy + 1) * this.gw + gx];
        const n = V3.norm([(hl - hr) * S / 2, 1, (hu - hd) * S / 2]);
        pos[k * 3] = u; pos[k * 3 + 1] = hh; pos[k * 3 + 2] = v;
        nrm[k * 3] = n[0]; nrm[k * 3 + 1] = n[1]; nrm[k * 3 + 2] = n[2];
        uv[k * 2] = (u - cx * CT) / CT; uv[k * 2 + 1] = (v - cy * CT) / CT;
        mn = Math.min(mn, hh); mx = Math.max(mx, hh); k++;
      }
      const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
      let q = 0;
      for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
        const a = y * nx + x, b = a + 1, c = a + nx, d = c + 1;
        idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
      }
      const mesh = GL3D.mesh({ pos, nrm, uv, idx });
      // quick low-resolution texture until the painted one is ready
      const lo = makeCanvas(CT * 2, CT * 2), lg = lo.getContext('2d');
      lg.imageSmoothingEnabled = true;
      lg.drawImage(this.painter.mini, cx * CT, cy * CT, CT, CT, 0, 0, CT * 2, CT * 2);
      const ch = { cx, cy, mesh, tex: GL3D.texture(lo, { mips: false }), painted: false, step: 0, canvas: null,
        x0: cx * CT, z0: cy * CT, x1: Math.min(w, (cx + 1) * CT), z1: Math.min(h, (cy + 1) * CT), ymin: mn, ymax: mx };
      this.buildDecor(ch);
      this.chunks.push(ch);
    }
  }
  paintStep(budgetMs, fx, fz) {
    const t0 = performance.now();
    const c = fx === undefined ? this.cam : { tx: fx, tz: fz };
    while (performance.now() - t0 < budgetMs) {
      let best = null, bd = 1e9;
      for (const ch of this.chunks) {
        if (ch.painted) continue;
        const d = Math.hypot((ch.x0 + ch.x1) / 2 - c.tx, (ch.z0 + ch.z1) / 2 - c.tz) - (ch.visible ? 1000 : 0);
        if (d < bd) { bd = d; best = ch; }
      }
      if (!best) return;
      if (!best.canvas) best.canvas = makeCanvas(CT * TILE * PAINT_Z, CT * TILE * PAINT_Z);
      const sx = best.step % 3, sy = Math.floor(best.step / 3);
      const part = this.painter.genChunk(PAINT_Z, best.cx * 3 + sx, best.cy * 3 + sy);
      best.canvas.getContext('2d').drawImage(part, sx * CHUNK, sy * CHUNK);
      best.step++;
      if (best.step >= 9) { GL3D.updateTexture(best.tex, best.canvas); best.painted = true; best.canvas = null; }
    }
  }
  buildWater() {
    const st = this.st, S = this.S, { w, h } = st;
    const b = new MeshB();
    const near = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (inMap(st, xx, yy) && st.terrain[yy * w + xx] === T_WATER) return true; } return false; };
    const vid = new Map();
    const vert = (gx, gy) => {
      const key = gy * this.gw + gx;
      let i = vid.get(key);
      if (i === undefined) { const dep = clamp((this.H0[key] - 0.12 - this.H[key]) / 0.6, 0, 1); i = b.v(gx / S, this.H0[key] - 0.12, gy / S, 0, 1, 0, dep, dep, dep); vid.set(key, i); }
      return i;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!near(x, y)) continue;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const gx = x * S + sx, gy = y * S + sy;
        const a = vert(gx, gy), bb = vert(gx + 1, gy), c = vert(gx, gy + 1), d = vert(gx + 1, gy + 1);
        b.tri(a, c, bb); b.tri(bb, c, d);
      }
    }
    this.water = b.i.length ? GL3D.mesh(b.build()) : null;
  }
  buildCanopy() {   // soft mask of forest shade for dappled light
    const st = this.st, R = 4, cv = makeCanvas(st.w * R, st.h * R), c = cv.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
    c.filter = 'blur(6px)';
    c.fillStyle = '#fff';
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) if (st.terrain[y * st.w + x] === T_FOREST) c.fillRect(x * R - 1, y * R - 1, R + 2, R + 2);
    c.filter = 'none';
    const img = c.getImageData(0, 0, cv.width, cv.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) d[i + 3] = d[i];
    c.putImageData(img, 0, 0);
    this.canopyTex = GL3D.texture(cv);
  }
  buildDecor(ch) {
    const st = this.st, S = st.seed, dens = GL3D.settings.grass, tab = GL3D.tablet ? 0.6 : 1;
    const L = {};
    const add = (key, x, z, yaw, s, r = 1, g = 1, bl = 1, sy) => { (L[key] || (L[key] = new InstList(32))).pushYaw(x, this.heightAt(x, z) - 0.02, z, yaw, s, r, g, bl, sy); };
    for (let ty = ch.z0; ty < ch.z1; ty++) for (let tx = ch.x0; tx < ch.x1; tx++) {
      const t = st.terrain[ty * st.w + tx];
      const R = mulberry32((tx * 7919 + ty * 104729) ^ (S + 9001));
      const rp = () => [tx + R(), ty + R()];
      const blades = dens === 0 ? 0 : Math.round([0, 14, 1, 3, 1, 0, 3, 8][t] * (dens === 2 ? 1.8 : 1) * tab);
      for (let i = 0; i < blades; i++) {
        const [x, z] = rp(), k = 0.8 + R() * 0.4, dry = t === T_SAND ? 1.5 : 1;
        add('grass', x, z, R() * 6.28, 0.22 + R() * 0.2, k * dry, k * (t === T_SAND ? 1.1 : 1), k * 0.9);
      }
      if (t === T_CLOVER) for (let i = 0; i < 3; i++) { const [x, z] = rp(); add('flower' + Math.floor(R() * 4), x, z, R() * 6.28, 0.55 + R() * 0.25); }
      if (t === T_LITTER || (t === T_FOREST && R() < 0.5)) for (let i = 0; i < (t === T_LITTER ? 3 : 1); i++) {
        const [x, z] = rp(), c = pick(R, [[0.72, 0.4, 0.17], [0.85, 0.6, 0.23], [0.55, 0.31, 0.13], [0.78, 0.55, 0.18], [0.62, 0.5, 0.24]]);
        add('leaf', x, z, R() * 6.28, 0.22 + R() * 0.16, c[0], c[1], c[2]);
      }
      const peb = [0, 0, 0, 2, 1, 4, 0, 0][t];
      for (let i = 0; i < peb; i++) { const [x, z] = rp(), g = 0.8 + R() * 0.4; add('pebble', x, z, R() * 6.28, 0.05 + R() * 0.09, g, g * 0.97, g * 0.92); }
      if (t === T_ROCK && hash2(tx, ty, S + 778) < 0.16) { const g = 0.85 + R() * 0.3; add('boulder', tx + 0.5, ty + 0.5, R() * 6.28, 0.35 + R() * 0.3, g, g, g * 0.95); }
      if (t === T_FOREST && hash2(tx, ty, S + 777) < 0.045) add('stump' + Math.floor(R() * 2), tx + 0.5, ty + 0.5, R() * 6.28, 0.55 + R() * 0.2);
      if (t === T_FOREST && R() < 0.18) { const [x, z] = rp(); add(R() < 0.5 ? 'mushR' : 'mushB', x, z, R() * 6.28, 0.3 + R() * 0.2); }
    }
    ch.decor = Object.entries(L).map(([k, l]) => ({ key: k, inst: GL3D.staticInst(l.data.slice(0, l.count * 20)) }));
  }
  decorItem(key, inst, si, near = true, grassShadow = true) {
    const it = { mesh: this.decorMesh(key), inst, spec: 0.05, shin: 20 };
    if (key === 'grass' || key.startsWith('flower')) {
      it.wind = 1; it.cull = false; it.shadow = near && grassShadow; it.trans = 0.55; it.spec = 0.18; it.shin = 30;
      if (key === 'grass') it.tintMul = GRASS_TINT[si];
    }
    else if (key === 'leaf') { it.cull = false; it.shadow = false; it.trans = 0.4; it.spec = 0.2; }
    else if (key === 'pebble' || key === 'boulder') { it.shadow = near; it.spec = 0.12; it.bump = 1.2; it.bumpScale = key === 'boulder' ? 7 : 16; }
    else if (key.startsWith('stump')) { it.shadow = near; it.bump = 1.4; it.bumpScale = [7, 1.4, 7]; }
    else { it.shadow = near; it.spec = 0.25; it.shin = 40; it.coat = 0.15; }
    return it;
  }
  decorMesh(key) {
    switch (key) {
      case 'grass': return Models.get('grass', buildGrassBlade);
      case 'flower0': return Models.get('flower0', () => buildFlower([0.96, 0.95, 0.9]));
      case 'flower1': return Models.get('flower1', () => buildFlower([0.95, 0.82, 0.25]));
      case 'flower2': return Models.get('flower2', () => buildFlower([0.72, 0.54, 0.88]));
      case 'flower3': return Models.get('flower3', () => buildFlower([0.94, 0.55, 0.7]));
      case 'leaf': return Models.get('leaf', buildLeaf);
      case 'pebble': return Models.get('rock1', () => buildRock(1));
      case 'boulder': return Models.get('rock2', () => buildRock(2));
      case 'stump0': return Models.get('stump0', () => buildStump(11));
      case 'stump1': return Models.get('stump1', () => buildStump(23));
      case 'mushR': return Models.get('mushR', () => buildMushroom([0.78, 0.18, 0.12]));
      case 'mushB': return Models.get('mushB', () => buildMushroom([0.62, 0.45, 0.28]));
    }
  }

  // ---------------- camera ----------------
  clamp() {
    const c = this.cam, st = this.st;
    c.tx = clamp(c.tx, 3, st.w - 3); c.tz = clamp(c.tz, 3, st.h - 3);
    c.dist = clamp(c.dist, 4.5, 75);
    c.pitch = lerp(0.6, 1.12, (c.dist - 4.5) / 70.5);
  }
  pick(mx, my) {
    const r = this.cam.ray(mx, my);
    let t = 0, prev = null;
    for (let k = 0; k < 600; k++) {
      const p = V3.add(r.o, V3.scale(r.d, t));
      if (p[1] < this.groundAt(p[0], p[2])) {
        let a = prev ?? 0, b = t;
        for (let j = 0; j < 8; j++) { const m = (a + b) / 2, q = V3.add(r.o, V3.scale(r.d, m)); if (q[1] < this.groundAt(q[0], q[2])) b = m; else a = m; }
        const q = V3.add(r.o, V3.scale(r.d, b));
        return [q[0], q[2]];
      }
      prev = t; t += 0.35 + t * 0.01;
      if (t > 500) break;
    }
    const t0 = r.d[1] < 0 ? (0 - r.o[1]) / r.d[1] : 200;
    return [r.o[0] + r.d[0] * t0, r.o[2] + r.d[2] * t0];
  }
  footprint() {   // ground points under the 4 screen corners
    return [[0, 0], [W, 0], [W, H], [0, H]].map(([x, y]) => {
      const r = this.cam.ray(x, y);
      let t = r.d[1] < -0.02 ? (this.cam.ty - 0.3 - r.o[1]) / r.d[1] : this.cam.dist * 4;
      t = Math.min(t, this.cam.dist * 4.5);
      return [r.o[0] + r.d[0] * t, r.o[2] + r.d[2] * t];
    });
  }

  // ---------------- per-frame ----------------
  antList(key) { let l = this.lists.get(key); if (!l) { l = new InstList(64); this.lists.set(key, l); } return l; }
  addAnt(species, caste, frame, x, z, yaw, s = 0.36, tint) {
    const y = this.groundAt(x, z);
    const n = this.normalAt(x, z);
    const l = this.antList(species + '|' + caste + '|' + (frame % ANT3D_FRAMES));
    const fx = Math.cos(yaw), fz = Math.sin(yaw);
    if (tint) l.push(x, y, z, fx, 0, fz, n[0], n[1], n[2], s, tint[0], tint[1], tint[2]);
    else l.push(x, y, z, fx, 0, fz, n[0], n[1], n[2], s);
  }

  render(scene, dt) {
    const st = this.st, cam = this.cam, gl = GL3D;
    this.t += dt; gl.time = this.t;
    this.clamp();
    const ty = this.groundAt(cam.tx, cam.tz);
    cam.ty += (Math.max(ty, -0.2) - cam.ty) * Math.min(1, dt * 6);
    cam.near = Math.max(0.1, cam.dist * 0.02); cam.far = cam.dist * 6;
    cam.update(W, H);
    if (this.overlaysDirty) {
      gl.updateTexture(this.fowTex, scene.fogCv, { mips: false });
      gl.updateTexture(this.terrTex, scene.terrCv, { nearest: true });
      this.overlaysDirty = false;
    }
    // visible chunks
    const fp = this.footprint();
    const bx0 = Math.min(...fp.map(p => p[0])) - 3, bx1 = Math.max(...fp.map(p => p[0])) + 3;
    const bz0 = Math.min(...fp.map(p => p[1])) - 3, bz1 = Math.max(...fp.map(p => p[1])) + 3;
    this.fp = fp;
    const items = [], labels = [], sprites = [];
    const si = seasonIdx(st.turn), E = SEASON_ENV[si], Q = gl.Q;
    for (const ch of this.chunks) {
      ch.visible = !(ch.x1 < bx0 || ch.x0 > bx1 || ch.z1 < bz0 || ch.z0 > bz1);
      if (!ch.visible) continue;
      items.push({ mesh: ch.mesh, tex: ch.tex, map: true, spec: 0.08, shin: 12, bump: 0.3, bumpScale: 14 });
      const near = Math.hypot((ch.x0 + ch.x1) / 2 - cam.tx, (ch.z0 + ch.z1) / 2 - cam.tz) < cam.dist * 1.8 + CT;
      for (const d of ch.decor) {
        if (d.key === 'grass' && cam.dist > 55) continue;
        const it = this.decorItem(d.key, d.inst, si, near, cam.dist < 30); it.map = true;
        items.push(it);
      }
    }
    this.paintStep(10);
    if (this.water) items.push({ mesh: this.water, water: true, map: true });
    items.push({ mesh: this.skirt, spec: 0, shadow: false });
    for (const l of this.lists.values()) l.reset();
    this.drawSites(scene, items, labels);
    this.drawFeatures(scene, items);
    this.drawSwarms(scene, items, labels, dt);
    this.drawRoutes(scene, sprites);
    for (const z of this.zocSprites) sprites.push(z);
    this.drawPath(scene, items, sprites, labels);
    this.drawSelection(scene, items);
    for (const [key, l] of this.lists) {
      if (!l.count) continue;
      const [sp, caste, fr] = key.split('|');
      items.push(l.item(Models.ant(sp, caste, +fr, cam.dist > 10 || GL3D.tablet ? 1 : 0), ANT_MAT_MAP));
    }
    if (Q.particles > 0 && cam.dist < 30) ambientParticles(sprites, cam.tx, cam.ty, cam.tz, Math.min(cam.dist * 0.9, 14), si, this.t, Q.particles * (1 - cam.dist / 30));
    const env = {
      lightDir: SUN_DIR, lightCol: E.lightCol, sky: E.sky, ground: E.ground, fogCol: E.fog.map(v => v * 0.6), clear: E.fog.map(v => v * 0.55),
      fogNear: cam.dist * 2.2, fogFar: cam.dist * 5.2, snow: si === 3 ? 0.6 : 0,
      map: { fow: this.fowTex, terr: this.terrTex, canopy: this.canopyTex, w: st.w, h: st.h },
    };
    gl.render({
      rect: { x: 0, y: 0, w: W, h: H }, cam, env, items, sprites, shadow: { c: [cam.tx, cam.ty, cam.tz], r: clamp(cam.dist * 1.0, 6, 34) },
      sky: skyFor(si), focus: cam.dist, focusRange: lerp(0.28, 0.6, clamp((cam.dist - 5) / 40, 0, 1)), dofMax: lerp(9, 4, clamp((cam.dist - 5) / 40, 0, 1)),
      aoRadius: clamp(cam.dist * 0.02, 0.12, 0.6), grade: GRADE[si], bloomAmt: 0.3, bloomThresh: 1.0,
    });
    return labels;
  }

  project(x, y, z) { return this.cam.project(x, y, z); }

  drawSites(scene, items, labels) {
    const st = this.st;
    for (const c of st.colonies) {
      if (!c.alive) continue;
      const list = [{ x: c.nest.x, y: c.nest.y, nest: true }, ...c.outposts.map(o => ({ x: o.x, y: o.y, nest: false }))];
      for (const s of list) {
        if (!st.explored[idx(st, s.x, s.y)]) continue;
        const x = s.x + 0.5, z = s.y + 0.5, y = this.groundAt(x, z);
        const m = Models.get('mound|' + c.color + '|' + !s.nest, () => buildMound(c.color, !s.nest));
        const M = new Float32Array(16); M4.yaw(M, 0, x, y - 0.05, z, 0.4, s.nest ? 0.95 : 0.62);
        items.push({ mesh: m, model: M, map: true, spec: 0.06 });
        if (st.visible[idx(st, s.x, s.y)]) {
          for (let i = 0; i < (s.nest ? 7 : 3); i++) {
            const a = this.t * 0.45 * (i % 2 ? 1 : -1) + i * 1.3, rr = (s.nest ? 1.05 : 0.75) + 0.12 * Math.sin(this.t + i);
            this.addAnt(c.species, 'worker', Math.floor(this.t * 12 + i), x + Math.cos(a) * rr, z + Math.sin(a) * rr, a + (i % 2 ? Math.PI / 2 : -Math.PI / 2));
          }
        }
        if (s.nest) {
          const p = this.project(x, y + 1.9, z);
          if (p) labels.push({ kind: 'nest', x: p[0], y: p[1], col: c, war: !c.isPlayer && atWar(st, st.playerId, c.id) });
        }
      }
    }
  }
  drawFeatures(scene, items) {
    const st = this.st;
    for (const f of st.features) {
      if (!st.explored[idx(st, f.x, f.y)]) continue;
      const x = f.x + 0.5, z = f.y + 0.5;
      if (Math.abs(x - this.cam.tx) > this.cam.dist * 3 || Math.abs(z - this.cam.tz) > this.cam.dist * 3) continue;
      const y = this.groundAt(x, z), M = new Float32Array(16);
      let mesh, s = 1, spec = 0.2, shin = 30;
      switch (f.type) {
        case 'aphids': mesh = Models.get('aphids', () => buildAphidStem(7)); s = 0.6; break;
        case 'seeds': mesh = Models.get('seeds', () => buildSeedPile(16, 5)); s = 0.8; break;
        case 'fruit': mesh = Models.get('berry', buildBerry); s = 0.6 * (f.ttl < 4 ? 0.85 : 1); spec = 0.9; shin = 70; break;
        case 'carcass': mesh = Models.get('beetle', buildBeetle); s = 0.75; spec = 1.0; shin = 50; break;
        case 'picnic': mesh = Models.get('crumbs', () => buildCrumbs(9, 4)); s = 0.9; spec = 0.05; break;
      }
      M4.yaw(M, 0, x, y, z, (f.x * 13 + f.y * 7) % 6, s);
      items.push({ mesh, model: M, map: true, spec, shin, tint: f.type === 'fruit' && f.ttl < 4 ? [0.7, 0.55, 0.5] : null });
    }
  }
  swarmPos(scene, sw, dt) {
    const d = scene.disp.get(sw.id);
    let x = sw.x, y = sw.y, moving = false, ang = 0;
    if (d) {
      d.t += dt / 0.13;
      if (d.t >= 1) scene.disp.delete(sw.id);
      else { const t = smooth(d.t); x = d.fx + (sw.x - d.fx) * t; y = d.fy + (sw.y - d.fy) * t; moving = true; ang = Math.atan2(sw.y - d.fy, sw.x - d.fx); }
    }
    return [x + 0.5, y + 0.5, moving, ang];
  }
  drawSwarms(scene, items, labels, dt) {
    const st = this.st, stackIdx = {};
    this.swarmScreen = new Map(); this.zocSprites = [];
    for (const sw of st.swarms) {
      const vis = isMine(st, sw.owner) || st.visible[idx(st, sw.x, sw.y)];
      if (!vis) continue;
      const c = colById(st, sw.owner);
      const key = sw.x + ',' + sw.y, si = stackIdx[key] = (stackIdx[key] ?? -1) + 1;
      let [x, z, moving, ang] = this.swarmPos(scene, sw, dt);
      x += si * 0.3; z -= si * 0.15;
      this.swarmScreen.set(sw.id, [x, z]);
      const y = this.groundAt(x, z);
      const M = new Float32Array(16); M4.yaw(M, 0, x, y + 0.03, z, 0, 0.55);
      items.push({ mesh: this.mRing, model: M, tint: rgbf(c.color), emis: 0.9, spec: 0, shadow: false });
      const tot = sumUnits(sw.units), n = clamp(Math.round(Math.sqrt(tot) * 1.1), 3, 14);
      const castes = [];
      for (const k of ['major', 'soldier', 'scout', 'worker']) for (let i = 0; i < Math.ceil(n * (sw.units[k] || 0) / Math.max(1, tot)); i++) castes.push(k);
      for (let i = 0; i < Math.min(n, castes.length); i++) {
        const r = mulberry32(sw.id * 13 + i);
        let ox = (r() - 0.5) * 0.75, oz = (r() - 0.5) * 0.75, a;
        if (moving) a = ang + (r() - 0.5) * 0.4;
        else { const ph = this.t * (0.4 + r() * 0.5) + i; a = ph + Math.PI / 2; ox += Math.cos(ph) * 0.06; oz += Math.sin(ph) * 0.06; }
        this.addAnt(c.species, castes[i], Math.floor(this.t * (moving ? 18 : 7) + i * 3), x + ox, z + oz, a);
      }
      if (sw.queens) this.addAnt(c.species, 'queen', Math.floor(this.t * (moving ? 12 : 3)), x, z, moving ? ang : this.t * 0.3, 0.36);
      // area of influence
      const hostile = !isMine(st, sw.owner) && atWar(st, st.playerId, sw.owner);
      if ((hostile && st.visible[idx(st, sw.x, sw.y)]) || (scene.sel && scene.sel.type === 'swarm' && scene.sel.id === sw.id)) {
        const R0 = zocR(st, sw) + 0.5, n = Math.round(R0 * 22), col = hostile ? [1, 0.38, 0.25] : [1, 0.8, 0.35];
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2 + this.t * 0.15, gx = x + Math.cos(a) * R0, gz = z + Math.sin(a) * R0;
          this.zocSprites.push({ v: [gx, this.groundAt(gx, gz) + 0.06, gz, 0.07 + this.cam.dist * 0.005, col[0], col[1], col[2], 0.8 + 0.2 * Math.sin(this.t * 3 + i * 0.5)] });
        }
      }
      const p = this.project(x, y + 0.2, z);
      if (p) labels.push({ kind: 'swarm', x: p[0], y: p[1] + 16, sw, col: c, tot, queens: sw.queens || 0, ready: isMine(st, sw.owner) && sw.mp > 0 && !sw.path.length, war: !isMine(st, sw.owner) && atWar(st, st.playerId, sw.owner) });
    }
  }
  drawRoutes(scene, sprites) {
    const st = this.st;
    for (const r of st.routes) {
      const g = scene.routeGeom(r);
      const mine = r.a === st.playerId || r.b === st.playerId;
      const known = mine || st.explored[idx(st, ...r.path[0])] || st.explored[idx(st, ...r.path[r.path.length - 1])];
      if (!known) continue;
      // glowing pheromone trail dots
      const step = 0.45, n = Math.floor(g.len / step);
      const col = r.blocked ? [1, 0.3, 0.2] : mine ? [1, 0.82, 0.4] : [0.85, 0.78, 0.6];
      for (let i = 0; i < n; i++) {
        const s = i / n, [x, z] = scene.posOnRoute(g, s);
        const tx = Math.floor(x - 0.5), tz = Math.floor(z - 0.5);
        if (!inMap(st, tx, tz) || !st.explored[idx(st, tx, tz)]) continue;
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 3 - i * 0.6);
        sprites.push({ v: [x - 0.5 + 0.5, this.groundAt(x, z) + 0.06, z, 0.06 + pulse * 0.03, col[0], col[1], col[2], 0.55 + pulse * 0.3], add: true });
      }
      if (r.blocked) continue;
      const A = colById(st, r.a), B = colById(st, r.b);
      const na = Math.min(16, Math.ceil(g.len / 2.5)), spd = 0.7 / g.len;
      for (let i = 0; i < na; i++) {
        const fwd = i % 2 === 0;
        let s = (this.t * spd + i / na) % 1; if (!fwd) s = 1 - s;
        const [x, z, a] = scene.posOnRoute(g, s);
        const tx = Math.floor(x), tz = Math.floor(z);
        if (!inMap(st, tx, tz) || !st.visible[idx(st, tx, tz)]) continue;
        const ox = Math.sin(i * 3.1) * 0.12, oz = Math.cos(i * 2.3) * 0.12;
        this.addAnt(fwd ? A.species : B.species, 'worker', Math.floor(this.t * 16 + i), x + ox, z + oz, a + (fwd ? 0 : Math.PI));
      }
    }
  }
  drawPath(scene, items, sprites, labels) {
    const st = this.st, sw = scene.selectedSwarm();
    if (!sw) return;
    let path = null;
    if (sw.path && sw.path.length) path = sw.path;
    else if (scene.hover && inMap(st, ...scene.hover) && !scene.anim && !UI.consumesPoint(UI.mx, UI.my)) {
      const key = scene.hover.join(',');
      if (!scene.pathCache || scene.pathCache.key !== key) scene.pathCache = { key, path: findPath(st, sw.x, sw.y, scene.hover[0], scene.hover[1], colById(st, sw.owner), { maxNodes: 15000 }) };
      path = scene.pathCache.path;
      if (!path && !(sw.x === scene.hover[0] && sw.y === scene.hover[1])) {
        const p = this.project(scene.hover[0] + 0.5, this.groundAt(scene.hover[0] + 0.5, scene.hover[1] + 0.5), scene.hover[1] + 0.5);
        if (p) labels.push({ kind: 'nopath', x: p[0], y: p[1] });
      }
    }
    if (!path || !path.length) return;
    const c = colById(st, sw.owner), full = swarmMaxMP(st, sw);
    let mp = sw.mp, turn = 0, px = sw.x, py = sw.y;
    const eng = scene.engageIndex(sw, path), last = eng >= 0 ? eng : path.length - 1;
    for (let i = 0; i <= last; i++) {
      const [x, y] = path[i];
      const cost = moveCostStep(st, px, py, x, y, c);
      if (mp + 1e-6 < cost && !(mp >= full - 1e-6)) { turn++; mp = full; }
      mp -= cost; px = x; py = y;
      const col = turn === 0 ? [0.66, 0.94, 0.48] : turn === 1 ? [0.95, 0.82, 0.3] : [0.94, 0.6, 0.3];
      const gx = x + 0.5, gz = y + 0.5, gy = this.groundAt(gx, gz) + 0.12;
      sprites.push({ v: [gx, gy, gz, 0.11, col[0], col[1], col[2], 0.95] });
      if (i === last) {
        const M = new Float32Array(16); M4.yaw(M, 0, gx, gy - 0.08, gz, 0, 0.42 + Math.sin(this.t * 5) * 0.03);
        items.push({ mesh: this.mRing, model: M, tint: eng >= 0 ? [1, 0.4, 0.3] : col, emis: 1, shadow: false });
        const site = siteAt(st, x, y), foe = swarmsAt(st, x, y).find(s => !isMine(st, s.owner));
        let label = eng >= 0 ? `⚔ Battle${turn ? ` in ${turn + 1} turns` : '!'}` : (site && !isMine(st, site.col.id)) || foe ? '⚔ Attack' : turn ? `${turn + 1} turns` : '';
        if (scene.pendingTap && scene.pendingTap[0] === x && scene.pendingTap[1] === y) label = (label ? label + ' - ' : '') + 'tap again to confirm';
        const p = this.project(gx, gy + 0.5, gz);
        if (label && p) labels.push({ kind: 'text', x: p[0], y: p[1], text: label, color: rgbStr(col.map(v => v * 255)) });
      }
    }
  }
  drawSelection(scene, items) {
    const st = this.st, s = scene.sel;
    if (!s) return;
    let x, z;
    if (s.type === 'swarm' || s.type === 'enemy') { const p = this.swarmScreen && this.swarmScreen.get(s.id); if (!p) return; [x, z] = p; }
    else { x = s.x + 0.5; z = s.y + 0.5; }
    const y = this.groundAt(x, z), sc = (s.type === 'site' ? 1.25 : 0.68) * (1 + Math.sin(this.t * 5) * 0.05);
    const M = new Float32Array(16); M4.yaw(M, 0, x, y + 0.05, z, this.t * 0.6, sc);
    items.push({ mesh: this.mRing, model: M, tint: [1, 0.78, 0.3], emis: 1.2, shadow: false });
  }
}

// ---------------------------------------------------------------------
//  The campaign map scene in 3D: same game UI, 3D world underneath
// ---------------------------------------------------------------------
class MapScene3D extends MapScene {
  constructor() {
    super();
    this.uses3D = true;
    this.v3 = new MapView3D(App.st);
    const p = playerCol(App.st);
    this.centerOn(p.nest.x, p.nest.y);
  }
  buildOverlays() { super.buildOverlays(); if (this.v3) this.v3.overlaysDirty = true; }
  centerOn(x, y) { if (!this.v3) return; this.v3.cam.tx = x + 0.5; this.v3.cam.tz = y + 0.5; this.v3.clamp(); }
  clampCam() { if (this.v3) this.v3.clamp(); }
  tileAt(mx, my) { if (!this.v3 || !this.v3.cam.inv) return [-1, -1]; const [x, z] = this.v3.pick(mx, my); return [Math.floor(x), Math.floor(z)]; }
  scr(x, y) { const v = this.v3; const p = v.project(x + 0.5, v.groundAt(x + 0.5, y + 0.5), y + 0.5); return p ? [p[0], p[1]] : [-999, -999]; }
  onWheel(x, y, dy) { if (this.dialog) return; this.v3.cam.dist *= dy > 0 ? 1.15 : 1 / 1.15; this.v3.clamp(); }
  onPinch(ratio) { if (this.dialog) return; this.v3.cam.dist /= ratio; this.v3.clamp(); }
  onTwist(da) { if (this.dialog) return; this.v3.cam.yaw -= da; }
  onTwoFingerPan(dx, dy) {
    if (this.dialog) return;
    const c = this.v3.cam, s = c.dist * 0.0021, fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = -fz, rz = fx;
    c.tx -= rx * dx * s - fx * dy * s * 1.3; c.tz -= rz * dx * s - fz * dy * s * 1.3; this.v3.clamp();
  }
  panKeys(dt) {
    const k = App.keys, c = this.v3.cam, sp = c.dist * 0.9 * dt;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = -fz, rz = fx;
    if (k['w'] || k['arrowup']) { c.tx += fx * sp; c.tz += fz * sp; }
    if (k['s'] || k['arrowdown']) { c.tx -= fx * sp; c.tz -= fz * sp; }
    if (k['d'] || k['arrowright']) { c.tx += rx * sp; c.tz += rz * sp; }
    if (k['a'] || k['arrowleft']) { c.tx -= rx * sp; c.tz -= rz * sp; }
    if (k['q']) c.yaw -= dt * 1.6;
    if (k['e']) c.yaw += dt * 1.6;
    this.v3.clamp();
  }
  dragStart(btn) { const c = this.v3.cam; return { tx: c.tx, tz: c.tz, yaw: c.yaw, btn }; }
  dragTo(d, dx, dy) {
    const c = this.v3.cam;
    if (d.btn === 0) {
      const s = c.dist * 0.0021;
      const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = -fz, rz = fx;
      c.tx = d.tx - rx * dx * s + fx * dy * s * 1.3; c.tz = d.tz - rz * dx * s + fz * dy * s * 1.3;
    } else c.yaw = d.yaw - dx * 0.006;
    this.v3.clamp();
  }
  drawWorld(ctx, dt) {
    const st = App.st;
    const labels = this.v3.render(this, dt);
    for (const l of labels) {
      if (l.kind === 'nest') {
        const c = l.col;
        ctx.font = `bold 13px ${FONT_HEAD}`;
        const tw = ctx.measureText(c.name).width + 16;
        roundRect(ctx, l.x - tw / 2, l.y - 10, tw, 20, 10);
        ctx.fillStyle = 'rgba(15,10,6,0.78)'; ctx.fill(); ctx.strokeStyle = c.color; ctx.lineWidth = 1.5; ctx.stroke();
        text(ctx, c.name, l.x, l.y, { font: ctx.font, align: 'center', base: 'middle', color: c.isPlayer ? COL.gold : '#f0e6d0' });
        if (l.war) text(ctx, '⚔ WAR', l.x, l.y - 24, { font: `bold 11px ${FONT_BODY}`, align: 'center', color: '#ff7a5c' });
      } else if (l.kind === 'swarm') {
        const bt = fmt(l.tot);
        ctx.font = `bold 11px ${FONT_BODY}`;
        const bw = Math.max(22, ctx.measureText(bt).width + 10);
        roundRect(ctx, l.x - bw / 2, l.y, bw, 15, 7);
        ctx.fillStyle = 'rgba(12,8,5,0.85)'; ctx.fill(); ctx.strokeStyle = l.col.color; ctx.lineWidth = 1; ctx.stroke();
        text(ctx, bt, l.x, l.y + 7.5, { font: ctx.font, align: 'center', base: 'middle', color: '#fff', shadow: false });
        if (l.ready) { ctx.fillStyle = '#9fe07a'; ctx.beginPath(); ctx.arc(l.x + bw / 2 + 4, l.y + 7.5, 3, 0, 6.28); ctx.fill(); }
        if (l.war) text(ctx, '⚔', l.x - bw / 2 - 10, l.y, { font: `bold 12px ${FONT_BODY}`, color: '#ff7a5c' });
        if (l.queens) drawCrown(ctx, l.x, l.y - 34, 16, l.queens);
      } else if (l.kind === 'text') text(ctx, l.text, l.x, l.y, { font: `bold 13px ${FONT_BODY}`, align: 'center', color: l.color });
      else if (l.kind === 'nopath') text(ctx, '✖', l.x, l.y, { font: `bold 18px ${FONT_BODY}`, align: 'center', base: 'middle', color: '#ff6b5c' });
    }
    // tooltip for a food source under the cursor
    if (this.hover && inMap(st, ...this.hover) && !UI.consumesPoint(UI.mx, UI.my)) {
      const f = featureAt(st, this.hover[0], this.hover[1]);
      if (f && st.explored[idx(st, f.x, f.y)]) UI.tip(UI.mx - 5, UI.my - 5, 10, 10, `${FEATURES[f.type].name} (+${f.food} food/turn)${f.ttl ? ` - lasts ${f.ttl} more turns` : ''}\n${FEATURES[f.type].desc}`);
    }
    if (!this.v3.chunks.every(c => c.painted)) text(ctx, 'painting terrain...', W - 14, 54, { font: `11px ${FONT_BODY}`, align: 'right', color: 'rgba(255,240,210,0.55)' });
  }
  drawMinimapView(ctx, x, y, sx, sy) {
    const fp = this.v3.fp; if (!fp) return;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath(); fp.forEach(([wx, wz], i) => { const px = x + wx * sx, py = y + wz * sy; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.closePath(); ctx.stroke();
  }
}
