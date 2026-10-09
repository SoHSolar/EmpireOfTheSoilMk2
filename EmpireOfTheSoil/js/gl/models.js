// =====================================================================
//  Procedural 3D models: ants (with walk cycles), brood, food, nature
// =====================================================================
'use strict';

class MeshB {
  constructor() { this.p = []; this.n = []; this.c = []; this.t = []; this.i = []; this.segK = 1; }
  get vcount() { return this.p.length / 3; }
  v(x, y, z, nx, ny, nz, r, g, b, u = 0, w = 0) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(r, g, b); this.t.push(u, w); return this.vcount - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  // ellipsoid; optional basis rotation (fwd/up) and per-vertex noise
  ellipsoid(cx, cy, cz, rx, ry, rz, col, o = {}) {
    const seg = Math.max(5, Math.round((o.seg || 14) * this.segK)), ring = Math.max(3, Math.round((o.ring || 10) * this.segK)), base = this.vcount, nz = o.noise ?? 0.08, seed = o.seed || 1;
    const rot = o.rot;  // function (x,y,z)->[x,y,z]
    for (let j = 0; j <= ring; j++) {
      const v = j / ring, th = v * Math.PI;
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, ph = u * Math.PI * 2;
        let x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
        let dx = x * rx, dy = y * ry, dz = z * rz;
        let nx = x / rx, ny = y / ry, nzz = z / rz;
        if (o.bump) { const b = 1 + (hash2(i * 7 + j, j * 13 + i, seed) - 0.5) * o.bump; dx *= b; dy *= b; dz *= b; }
        if (o.flatBottom !== undefined && dy < -o.flatBottom * ry) { dy = -o.flatBottom * ry; nx *= 0.3; nzz *= 0.3; ny = -1; }
        if (rot) { [dx, dy, dz] = rot(dx, dy, dz); [nx, ny, nzz] = rot(nx, ny, nzz); }
        const l = Math.hypot(nx, ny, nzz) || 1;
        const k = 1 - nz + 2 * nz * hash2(i + seed * 31, j + seed * 17, seed);
        const sh = o.shadeY ? 1 + o.shadeY * y : 1;
        this.v(cx + dx, cy + dy, cz + dz, nx / l, ny / l, nzz / l, col[0] * k * sh, col[1] * k * sh, col[2] * k * sh, u, v);
      }
    }
    for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + seg + 1;
      if (o.inside) { this.tri(a, b, a + 1); this.tri(a + 1, b, b + 1); }
      else { this.tri(a, a + 1, b); this.tri(a + 1, b + 1, b); }
    }
    return this;
  }
  // tapered tube between two points
  tube(p0, p1, r0, r1, col, o = {}) {
    const seg = Math.max(3, Math.round((o.seg || 6) * this.segK)), base = this.vcount;
    const d = V3.sub(p1, p0), L = Math.hypot(...d) || 1, f = V3.scale(d, 1 / L);
    let up = Math.abs(f[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const s1 = V3.norm(V3.cross(f, up)), s2 = V3.cross(s1, f);
    const col1 = o.col1 || col;
    for (let e = 0; e < 2; e++) {
      const p = e ? p1 : p0, r = e ? r1 : r0, cc = e ? col1 : col;
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2, cx = Math.cos(a), sx = Math.sin(a);
        const n = [s1[0] * cx + s2[0] * sx, s1[1] * cx + s2[1] * sx, s1[2] * cx + s2[2] * sx];
        this.v(p[0] + n[0] * r, p[1] + n[1] * r, p[2] + n[2] * r, n[0], n[1], n[2], cc[0], cc[1], cc[2], i / seg, e);
      }
    }
    for (let i = 0; i < seg; i++) { const a = base + i, b = base + seg + 1 + i; this.tri(a, b, a + 1); this.tri(a + 1, b, b + 1); }
    if (o.cap) {   // round-ish end caps
      const c0 = this.v(p0[0] - f[0] * r0 * 0.5, p0[1] - f[1] * r0 * 0.5, p0[2] - f[2] * r0 * 0.5, -f[0], -f[1], -f[2], col[0], col[1], col[2]);
      const c1 = this.v(p1[0] + f[0] * r1 * 0.5, p1[1] + f[1] * r1 * 0.5, p1[2] + f[2] * r1 * 0.5, f[0], f[1], f[2], col1[0], col1[1], col1[2]);
      for (let i = 0; i < seg; i++) { this.tri(c0, base + i + 1, base + i); this.tri(c1, base + seg + 1 + i, base + seg + 2 + i); }
    }
    return this;
  }
  // polyline tube with joints
  limb(pts, r0, r1, col, o) {
    for (let k = 0; k < pts.length - 1; k++) {
      const ra = r0 + (r1 - r0) * k / (pts.length - 1), rb = r0 + (r1 - r0) * (k + 1) / (pts.length - 1);
      this.tube(pts[k], pts[k + 1], ra, rb, col, Object.assign({ cap: true }, o));
    }
    return this;
  }
  quadXZ(x0, z0, x1, z1, y, col, uv = [0, 0, 1, 1]) {
    const b = this.vcount;
    this.v(x0, y, z0, 0, 1, 0, ...col, uv[0], uv[1]); this.v(x1, y, z0, 0, 1, 0, ...col, uv[2], uv[1]);
    this.v(x1, y, z1, 0, 1, 0, ...col, uv[2], uv[3]); this.v(x0, y, z1, 0, 1, 0, ...col, uv[0], uv[3]);
    this.tri(b, b + 2, b + 1); this.tri(b, b + 3, b + 2);
    return this;
  }
  build() {
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let k = 0; k < this.p.length; k += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], this.p[k + a]); mx[a] = Math.max(mx[a], this.p[k + a]); }
    return { pos: new Float32Array(this.p), nrm: new Float32Array(this.n), col: new Float32Array(this.c), uv: new Float32Array(this.t), idx: new Uint32Array(this.i), bounds: [mn, mx] };
  }
  static quad() {
    return { pos: new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), idx: new Uint32Array([0, 1, 2, 0, 2, 3]) };
  }
}
const rgbf = hex => hexToRgb(hex).map(v => v / 255);

// ---------------------------------------------------------------------
//  Model cache
// ---------------------------------------------------------------------
const Models = {
  cache: new Map(),
  get(key, fn) { let m = this.cache.get(key); if (!m) { m = GL3D.mesh(fn().build()); this.cache.set(key, m); } return m; },
  ant(species, caste, frame, lod = 0) { return this.get(`ant|${species}|${caste}|${frame % ANT3D_FRAMES}|${lod}`, () => buildAnt(species, caste, frame % ANT3D_FRAMES, lod)); },
};
const ANT3D_FRAMES = 12;

// Ant: length ~1 along +x, standing on y=0, +z to its right.
// Anatomical build: tergite-banded gaster with setae, 1-2 node petiole, three-part mesosoma,
// head with compound eyes and clypeus, elbowed beaded antennae, and legs of coxa / femur / tibia / tarsus.
function buildAnt(species, caste, frame, lod = 0) {
  const look = SPECIES[species].look, cs = CASTE_SHAPE[caste];
  const L = cs.len * look.size;
  const b = new MeshB(), hi = lod === 0;
  b.segK = hi ? 1 : 0.55;
  const hc = rgbf(look.head), tc = rgbf(look.thorax), gc = rgbf(look.gaster), lc = rgbf(look.legs);
  const dark = c => c.map(v => v * 0.6), lite = c => c.map(v => Math.min(1, v * 1.25 + 0.04));
  const headR = 0.11 * cs.head * look.headSize * L;
  const gasR = 0.17 * cs.gaster * look.gasterSize * L;
  const bodyY = 0.15 * L * (cs.queen ? 1.15 : 1) * (cs.leg > 1.2 ? 1.15 : 1);
  const gx = -0.3 * L - (gasR - 0.17 * L) * 0.8, hx = 0.2 * L + headR * 0.7;
  const phase = frame / ANT3D_FRAMES * Math.PI * 2;
  const tilt = (ang) => (x, y, z) => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang), z];
  const lerp3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  const bob = Math.sin(phase * 2) * 0.004 * L;
  const R = mulberry32(17 + caste.length * 7 + species.length);

  // ---- gaster ----
  const gy = bodyY + gasR * 0.15 + bob;
  if (cs.replete) {
    // honeypot repletes: swollen translucent amber crop with stretched tergite plates
    b.ellipsoid(gx - gasR * 0.3, bodyY + gasR * 0.4, 0, gasR * 1.05, gasR * 0.95, gasR * 0.95, [0.9, 0.62, 0.2], { seg: 22, ring: 14, noise: 0.02 });
    for (let k = 0; k < 4; k++) {
      const a = -0.9 + k * 0.6;
      b.ellipsoid(gx - gasR * 0.3 + Math.sin(a) * gasR * 0.9, bodyY + gasR * 0.4 + Math.cos(a) * gasR * 0.86, 0, gasR * 0.12, gasR * 0.04, gasR * 0.42, dark(gc), { seg: 8, ring: 4, noise: 0, rot: tilt(-a) });
    }
  } else {
    const gl_ = gasR * (cs.queen ? 1.25 : 1.05);
    // four overlapping tergites, each a little smaller towards the tip
    b.ellipsoid(gx, gy, 0, gl_ * 0.97, gasR * 0.8, gasR * 0.84, gc.map(v => v * 0.8), { seg: 18, ring: 12, rot: tilt(0.18), noise: 0.03, seed: 3 });
    const segs = [[0.36, 0.97, 0.5], [0.0, 1.0, 0.5], [-0.34, 0.9, 0.44], [-0.62, 0.7, 0.34]];
    segs.forEach(([o, k, rx], i) => {
      const cxs = gx + o * gl_, cys = gy - o * gl_ * 0.18 + gasR * 0.015;
      const col = (look.stripes && i % 2 === 1) ? lite(gc) : gc.map(v => v * (1 - i * 0.03));
      b.ellipsoid(cxs, cys, 0, gl_ * rx, gasR * 0.82 * k, gasR * 0.86 * k, col, { seg: 18, ring: 12, rot: tilt(0.18), noise: 0.03, seed: 3 + i });
    });
    // tip / acidopore
    b.ellipsoid(gx - gl_ * 0.98, gy + gl_ * 0.16, 0, gasR * 0.12, gasR * 0.1, gasR * 0.1, dark(gc), { seg: 8, ring: 5, noise: 0 });
    // fine setae (hairs) on the gaster
    const hairC = lite(gc).map(v => Math.min(1, v * 1.2 + 0.08));
    const nh = !hi ? 0 : caste === 'queen' ? 40 : 26;
    for (let i = 0; i < nh; i++) {
      const th = 0.35 + R() * 2.0, ph = R() * Math.PI * 2;
      const nx = Math.cos(th), ny = Math.sin(th) * Math.cos(ph), nz = Math.sin(th) * Math.sin(ph);
      if (ny < -0.3) continue;
      const p0 = [gx + nx * gl_ * 0.95, gy + ny * gasR * 0.8, nz * gasR * 0.84];
      const p1 = [p0[0] + (nx - 0.6) * 0.035 * L, p0[1] + ny * 0.035 * L, p0[2] + nz * 0.035 * L];
      b.tube(p0, p1, 0.0035 * L, 0.0008 * L, hairC, { seg: 3 });
    }
  }
  // ---- petiole (waist): one node, or two for myrmicines ----
  const twoNode = species === 'fire' || species === 'leafcutter' || species === 'bullet';
  b.tube([gx + gasR * 0.9, gy, 0], [-0.13 * L, bodyY - 0.005 * L, 0], 0.022 * L, 0.02 * L, dark(tc), { seg: 6 });
  b.ellipsoid(-0.135 * L, bodyY + 0.01 * L, 0, 0.04 * L, 0.06 * L, 0.04 * L, tc, { seg: 10, ring: 7, rot: tilt(-0.2) });
  if (twoNode) b.ellipsoid(-0.09 * L, bodyY + 0.005 * L, 0, 0.038 * L, 0.048 * L, 0.036 * L, tc, { seg: 10, ring: 7 });
  b.tube([-0.135 * L, bodyY, 0], [-0.06 * L, bodyY + 0.01 * L, 0], 0.016 * L, 0.02 * L, dark(tc), { seg: 6 });
  // ---- mesosoma: propodeum, mesonotum, pronotum ----
  const q = cs.queen ? 1.3 : 1, my = bodyY + 0.01 * L + bob;
  b.ellipsoid(-0.04 * L, my - 0.005 * L, 0, 0.06 * L, 0.06 * L * q, 0.055 * L * q, tc, { seg: 12, ring: 8, rot: tilt(0.25), seed: 5 });
  b.ellipsoid(0.03 * L, my + 0.012 * L, 0, 0.07 * L * (cs.queen ? 1.4 : 1), 0.068 * L * q, 0.06 * L * q, tc, { seg: 14, ring: 10, rot: tilt(-0.1), seed: 6 });
  b.ellipsoid(0.11 * L, my + 0.008 * L, 0, 0.065 * L, 0.07 * L * q, 0.068 * L * q, lite(tc).map((v, i) => (v + tc[i]) / 2), { seg: 14, ring: 10, rot: tilt(-0.35), seed: 7 });
  // neck
  b.tube([0.14 * L, my + 0.01 * L, 0], [hx - headR * 0.7, bodyY + 0.03 * L + bob, 0], 0.03 * L, 0.028 * L, dark(tc), { seg: 6 });
  if (look.spines) for (const sd of [-1, 1]) {
    b.tube([-0.05 * L, my + 0.05 * L, sd * 0.025 * L], [-0.1 * L, my + 0.12 * L, sd * 0.05 * L], 0.012 * L, 0.002 * L, dark(tc), { seg: 4 });
    b.tube([0.12 * L, my + 0.06 * L, sd * 0.04 * L], [0.1 * L, my + 0.1 * L, sd * 0.07 * L], 0.01 * L, 0.002 * L, dark(tc), { seg: 4 });
  }
  if (cs.queen) {   // wing scars and scutellum
    b.ellipsoid(0.0, my + 0.07 * L, 0, 0.05 * L, 0.025 * L, 0.04 * L, lite(tc), { seg: 8, ring: 5 });
    for (const sd of [-1, 1]) b.ellipsoid(-0.02 * L, my + 0.05 * L, sd * 0.075 * L, 0.035 * L, 0.012 * L, 0.02 * L, [0.1, 0.06, 0.03], { seg: 6, ring: 4 });
  }
  // ---- head ----
  const hy = bodyY + 0.03 * L + bob;
  b.ellipsoid(hx, hy, 0, headR * 1.05, headR * 0.86, headR * 0.98, hc, { seg: 18, ring: 14, rot: tilt(-0.25), seed: 9, noise: 0.04 });
  if (caste === 'major' || caste === 'soldier') b.tube([hx - headR * 0.2, hy + headR * 0.7, 0], [hx + headR * 0.5, hy + headR * 0.45, 0], 0.012 * L, 0.006 * L, dark(hc), { seg: 4 });   // frontal ridge
  // clypeus
  b.ellipsoid(hx + headR * 0.82, hy - headR * 0.15, 0, headR * 0.28, headR * 0.22, headR * 0.42, lite(hc).map((v, i) => (v + hc[i]) / 2), { seg: 10, ring: 6, rot: tilt(-0.5) });
  for (const s of [-1, 1]) {
    // compound eye: glossy black dome with a faint facet sheen
    const ex = hx + headR * 0.25, ey = hy + headR * 0.22, ez = s * headR * 0.8;
    const eyeK = species === 'bullet' || caste === 'scout' ? 1.15 : species === 'army' ? 0.45 : 1;
    b.ellipsoid(ex, ey, ez, headR * 0.22 * eyeK, headR * 0.19 * eyeK, headR * 0.13 * eyeK, [0.04, 0.035, 0.03], { seg: 10, ring: 8, noise: 0.25, seed: 41 });
    if (hi) b.ellipsoid(ex + headR * 0.06, ey + headR * 0.07, ez + s * headR * 0.06, headR * 0.06 * eyeK, headR * 0.04 * eyeK, headR * 0.03 * eyeK, [0.5, 0.55, 0.6], { seg: 6, ring: 4, noise: 0 });
    // mandibles - open/close faster when fighting frames are used
    const mL = headR * 1.0 * cs.mand * look.mand, open = 0.42 + Math.sin(phase * 2) * 0.1;
    const mx = hx + headR * 0.82, my2 = hy - headR * 0.38;
    const mc = (look.hooked && (caste === 'soldier' || caste === 'major')) ? [0.9, 0.84, 0.66] : dark(hc);
    if (look.hooked && (caste === 'soldier' || caste === 'major')) {
      const pts = [[mx, my2, s * headR * 0.35]];
      for (let k = 1; k <= 5; k++) { const t = k / 5; pts.push([mx + mL * 1.4 * t, my2 - mL * 0.1 * t, s * headR * 0.35 + s * Math.sin(open) * mL * (0.8 - t * 1.2) * t * 1.6]); }
      b.limb(pts, 0.03 * L * cs.mand, 0.006 * L, mc, { seg: 6 });
    } else {
      const tip = [mx + Math.cos(open) * mL, my2 - 0.02 * L, s * (headR * 0.25 + Math.sin(open) * mL * 0.55)];
      const bend = [mx + mL * 0.5, my2, s * (headR * 0.45 + mL * 0.28)];
      b.limb([[mx, my2, s * headR * 0.38], bend, tip], 0.032 * L * cs.mand, 0.007 * L, mc, { seg: 6 });
      // teeth along the inner edge
      if (hi) for (let k = 0; k < 3; k++) { const p = lerp3(bend, tip, 0.2 + k * 0.3); b.tube(p, [p[0] + 0.005 * L, p[1], p[2] - s * 0.018 * L * cs.mand], 0.006 * L * cs.mand, 0.001 * L, dark(mc), { seg: 3 }); }
    }
    // palps
    if (hi) b.limb([[mx - headR * 0.1, my2 - headR * 0.1, s * headR * 0.2], [mx + headR * 0.1, my2 - headR * 0.35, s * headR * 0.25], [mx + headR * 0.25, my2 - headR * 0.5, s * headR * 0.18]], 0.006 * L, 0.004 * L, lite(lc), { seg: 4 });
    // ---- elbowed antenna: long scape then a beaded funiculus ending in a club ----
    const wig = Math.sin(phase + (s > 0 ? 1.3 : 0)) * 0.14;
    const sc = 0.17 * L * (caste === 'scout' ? 1.3 : 1) * (species === 'army' ? 1.1 : 1);
    const a0 = [hx + headR * 0.6, hy + headR * 0.5, s * headR * 0.38];
    const a1 = [a0[0] + sc * 0.5, a0[1] + sc * 0.62, a0[2] + s * sc * (0.55 + wig)];
    b.limb([a0, lerp3(a0, a1, 0.5), a1], 0.011 * L, 0.009 * L, dark(lc), { seg: 5 });
    const nb = hi ? 10 : 4;
    let prev = a1;
    for (let k = 1; k <= nb; k++) {
      const t = k / nb, ang = t * (1.2 + wig);
      const p = [a1[0] + sc * 1.0 * t * Math.cos(ang * 0.35), a1[1] + sc * (0.18 * Math.sin(t * 2.6) - 0.55 * t * t), a1[2] + s * sc * (0.12 - wig * 0.6) * t];
      const club = k > nb - 3 ? 1.5 : 1;
      if (hi || k === nb) b.ellipsoid(p[0], p[1], p[2], 0.009 * L * club, 0.008 * L * club, 0.008 * L * club, dark(lc), { seg: 6, ring: 4, noise: 0 });
      b.tube(prev, p, 0.006 * L, 0.006 * L, dark(lc), { seg: 4 });
      prev = p;
    }
  }
  // ---- legs: coxa, trochanter/femur, tibia with spur, 3-bead tarsus and claw (alternating tripod gait) ----
  const legL = 0.36 * L * cs.leg * look.legLen, thick = caste === 'major' ? 1.3 : caste === 'queen' ? 1.15 : 1;
  for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
    const tri = (k + (side > 0 ? 1 : 0)) % 2;
    const ph = phase + tri * Math.PI;
    const sw = Math.sin(ph) * 0.32, lift = Math.max(0, Math.cos(ph)) * 0.11 * L;
    const ax = (0.1 - k * 0.07) * L, ay = bodyY - 0.035 * L + bob, az = side * 0.03 * L;
    const yawA = [0.8, 0.05, -0.75][k] + sw;
    const fem = legL * [0.48, 0.46, 0.58][k], tib = legL * [0.55, 0.58, 0.74][k], tar = legL * [0.32, 0.34, 0.42][k];
    const dirx = Math.sin(yawA), dirz = Math.cos(yawA) * side;
    const cox = [ax + dirx * 0.02 * L, ay - 0.025 * L, az + dirz * 0.045 * L];
    const knee = [cox[0] + dirx * fem * 0.82, ay + 0.075 * L + lift * 0.55, cox[2] + dirz * fem * 0.92];
    const ank = [knee[0] + dirx * tib * 0.85, Math.max(0.02 * L, lift * 0.7 + 0.025 * L), knee[2] + dirz * tib * 0.72];
    const foot = [ank[0] + dirx * tar * 0.85, Math.max(0.004 * L, lift * 0.6), ank[2] + dirz * tar * 0.7];
    b.ellipsoid(cox[0], cox[1] + 0.012 * L, cox[2], 0.03 * L * thick, 0.026 * L * thick, 0.026 * L * thick, tc, { seg: 8, ring: 5, noise: 0 });
    // femur thicker in the middle
    b.tube(cox, lerp3(cox, knee, 0.45), 0.018 * L * thick, 0.027 * L * thick, lc, { seg: 7 });
    b.tube(lerp3(cox, knee, 0.45), knee, 0.027 * L * thick, 0.016 * L * thick, lc, { seg: 7 });
    if (hi) b.ellipsoid(knee[0], knee[1], knee[2], 0.017 * L * thick, 0.017 * L * thick, 0.017 * L * thick, dark(lc), { seg: 6, ring: 4, noise: 0 });
    b.tube(knee, ank, 0.015 * L * thick, 0.011 * L * thick, lc, { seg: 6 });
    if (hi) b.tube(ank, [ank[0] - dirx * 0.02 * L, ank[1] - 0.012 * L, ank[2] - dirz * 0.02 * L], 0.004 * L, 0.001 * L, dark(lc), { seg: 3 });   // tibial spur
    let p = ank;
    for (let j = 1, nj = hi ? 3 : 1; j <= nj; j++) {
      const q2 = lerp3(ank, foot, j / nj);
      b.tube(p, q2, 0.009 * L * thick * (1 - j * 0.15), 0.007 * L * thick * (1 - j * 0.15), lc.map(v => v * 0.92), { seg: 5, cap: true });
      p = q2;
    }
    if (hi) b.tube(foot, [foot[0] + dirx * 0.018 * L, 0.001, foot[2] + dirz * 0.018 * L], 0.004 * L, 0.001 * L, [0.08, 0.06, 0.05], { seg: 3 });
  }
  return b;
}

// Simple objects -------------------------------------------------------
function buildRock(seed, col = [0.52, 0.5, 0.47]) {
  return new MeshB().ellipsoid(0, 0.3, 0, 1, 0.62, 0.85, col, { seg: 12, ring: 9, bump: 0.45, noise: 0.15, seed, flatBottom: 0.5, shadeY: 0.15 });
}
function buildMound(colorHex, outpost) {
  const b = new MeshB(), c = outpost ? [0.42, 0.31, 0.2] : [0.38, 0.27, 0.17];
  b.ellipsoid(0, 0, 0, 1, outpost ? 0.5 : 0.62, 1, c, { seg: 34, ring: 18, bump: 0.18, noise: 0.45, seed: outpost ? 4 : 2, flatBottom: 0.02 });
  // entrance crater
  b.ellipsoid(0.1, outpost ? 0.48 : 0.6, 0.1, 0.2, 0.05, 0.16, [0.05, 0.03, 0.02], { seg: 12, ring: 6, noise: 0 });
  // twigs / needles on the mound
  const r = mulberry32(outpost ? 9 : 7);
  for (let i = 0; i < 40; i++) {
    const a = r() * 6.28, rr = Math.sqrt(r()) * 0.85, y = Math.sqrt(Math.max(0, 1 - rr * rr)) * (outpost ? 0.5 : 0.62);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, t = r() * 6.28;
    b.tube([x, y, z], [x + Math.cos(t) * 0.18, y + 0.02, z + Math.sin(t) * 0.18], 0.012, 0.01, r() < 0.5 ? [0.35, 0.24, 0.14] : [0.72, 0.58, 0.38], { seg: 3 });
  }
  // banner pole + flag in colony colour
  const fc = rgbf(colorHex);
  b.tube([0.75, 0.1, -0.35], [0.75, 1.6, -0.35], 0.02, 0.015, [0.3, 0.2, 0.1], { seg: 5 });
  const fb = b.vcount;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 1; j++) b.v(0.75 + i * 0.12, 1.55 - j * 0.32 - i * 0.02, -0.35 + Math.sin(i * 1.3) * 0.04, 0, 0, 1, fc[0], fc[1], fc[2], i / 4, j);
  for (let i = 0; i < 4; i++) { const a = fb + i * 2; b.tri(a, a + 1, a + 2); b.tri(a + 1, a + 3, a + 2); }
  return b;
}
function buildStump(seed) {
  const b = new MeshB(), r = mulberry32(seed);
  const R = 0.7 + r() * 0.3;
  for (let i = 0; i < 6; i++) {    // buttress roots
    const a = i / 6 * 6.28 + r() * 0.5, l = R * (1.6 + r() * 0.8);
    const p0 = [Math.cos(a) * R * 0.5, 0.6, Math.sin(a) * R * 0.5], p1 = [Math.cos(a) * R * 1.1, 0.25, Math.sin(a) * R * 1.1], p2 = [Math.cos(a + 0.2) * l, 0.02, Math.sin(a + 0.2) * l];
    b.limb([p0, p1, p2], 0.32 * R, 0.06, [0.36, 0.26, 0.17], { seg: 7 });
  }
  // trunk with ridged bark
  const seg = 18, base = b.vcount, Ht = 2.6 + r() * 1.2;
  for (let j = 0; j <= 6; j++) for (let i = 0; i <= seg; i++) {
    const a = i / seg * 6.28, ridge = 1 + 0.07 * Math.sin(a * 9 + j) + 0.04 * (hash2(i, j, seed) - 0.5);
    const y = j / 6 * Ht, rr = R * ridge * (1 + (j === 0 ? 0.2 : 0));
    const k = 0.8 + 0.4 * hash2(i * 3, j * 5, seed);
    b.v(Math.cos(a) * rr, y, Math.sin(a) * rr, Math.cos(a), 0, Math.sin(a), 0.38 * k, 0.28 * k, 0.18 * k);
  }
  for (let j = 0; j < 6; j++) for (let i = 0; i < seg; i++) { const a = base + j * (seg + 1) + i, c = a + seg + 1; b.tri(a, c, a + 1); b.tri(a + 1, c, c + 1); }
  // jagged broken top with moss
  const top = b.v(0, Ht + 0.1, 0, 0, 1, 0, 0.3, 0.4, 0.15);
  for (let i = 0; i < seg; i++) b.tri(top, base + 6 * (seg + 1) + i + 1, base + 6 * (seg + 1) + i);
  b.ellipsoid(R * 0.3, Ht * 0.6, R * 0.85, R * 0.4, R * 0.25, R * 0.2, [0.32, 0.45, 0.16], { seg: 8, ring: 6, bump: 0.4 });
  return b;
}
function buildGrassBlade() {
  const b = new MeshB();
  // curved, tapered blade with a folded midrib (V cross-section) in 6 segments, darker at the base and
  // sun-bleached towards the tip; vertex height drives the wind sway
  const N = 4, base = b.vcount;
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = 0.26 * t * t + 0.02 * t, y = t * (1 - 0.12 * t * t);
    const w = 0.048 * (1 - t) * (1 - t * 0.2) + 0.002, fold = w * 0.45;
    const g = 0.4 + t * 0.6, tip = Math.max(0, (t - 0.7) / 0.3);
    const cA = [0.2 * g + tip * 0.22, 0.42 * g + tip * 0.08, 0.1 * g], cB = [0.27 * g + tip * 0.25, 0.5 * g + tip * 0.1, 0.13 * g];
    b.v(x - fold * 0.3, y, -w, -0.25, 0.3, 1, ...cA);
    b.v(x + fold, y, 0, 0, 0.3, 1, ...cB.map(v => v * 1.08));
    b.v(x - fold * 0.3, y, w, 0.25, 0.3, 1, ...cB);
  }
  for (let i = 0; i < N; i++) {
    const a = base + i * 3, c = a + 3;
    b.tri(a, a + 1, c); b.tri(a + 1, c + 1, c);
    b.tri(a + 1, a + 2, c + 1); b.tri(a + 2, c + 2, c + 1);
  }
  return b;
}
function buildFlower(col) {
  const b = new MeshB();
  b.tube([0, 0, 0], [0.02, 0.55, 0], 0.012, 0.01, [0.22, 0.42, 0.14], { seg: 4 });
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; b.ellipsoid(Math.cos(a) * 0.07, 0.56, Math.sin(a) * 0.07, 0.065, 0.015, 0.04, col, { seg: 8, ring: 4, noise: 0.02, rot: (x, y, z) => [x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)] }); }
  b.ellipsoid(0, 0.57, 0, 0.035, 0.025, 0.035, [0.92, 0.66, 0.12], { seg: 8, ring: 5 });
  return b;
}
function buildLeaf() {
  const b = new MeshB(), base = b.vcount, N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = (t - 0.5) * 2, wdt = Math.sin(t * Math.PI) * 0.42, curl = Math.sin(t * Math.PI) * 0.06;
    for (const s of [-1, 0, 1]) b.v(x, 0.02 + curl + Math.abs(s) * 0.04, s * wdt, 0, 1, 0, s === 0 ? 0.75 : 1, s === 0 ? 0.75 : 1, s === 0 ? 0.75 : 1);
  }
  for (let i = 0; i < N; i++) { const a = base + i * 3; b.tri(a, a + 1, a + 3); b.tri(a + 1, a + 4, a + 3); b.tri(a + 1, a + 2, a + 4); b.tri(a + 2, a + 5, a + 4); }
  return b;
}
function buildMushroom(col) {
  const b = new MeshB();
  b.tube([0, 0, 0], [0, 0.45, 0], 0.07, 0.06, [0.88, 0.84, 0.74], { seg: 7 });
  b.ellipsoid(0, 0.48, 0, 0.26, 0.14, 0.26, col, { seg: 14, ring: 8, flatBottom: 0.1, noise: 0.06 });
  if (col[0] > 0.6 && col[1] < 0.4) { const r = mulberry32(3); for (let i = 0; i < 7; i++) { const a = r() * 6.28, rr = r() * 0.18; b.ellipsoid(Math.cos(a) * rr, 0.6 - rr * 0.35, Math.sin(a) * rr, 0.025, 0.012, 0.025, [0.98, 0.96, 0.9], { seg: 6, ring: 3, noise: 0 }); } }
  return b;
}
function buildBerry() {
  const b = new MeshB().ellipsoid(0, 0.4, 0, 0.42, 0.4, 0.42, [0.62, 0.06, 0.1], { seg: 20, ring: 14, noise: 0.03 });
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; b.ellipsoid(Math.cos(a) * 0.08, 0.8, Math.sin(a) * 0.08, 0.1, 0.02, 0.04, [0.22, 0.4, 0.12], { seg: 6, ring: 3, rot: (x, y, z) => [x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)] }); }
  return b;
}
function buildBeetle() {
  const b = new MeshB();
  b.ellipsoid(0, 0.12, 0, 0.5, 0.18, 0.34, [0.12, 0.26, 0.18], { seg: 16, ring: 10, noise: 0.04 });
  b.ellipsoid(0.55, 0.1, 0, 0.16, 0.1, 0.16, [0.08, 0.12, 0.08], { seg: 10, ring: 6 });
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.limb([[0.2 - k * 0.2, 0.15, s * 0.25], [0.25 - k * 0.25, 0.32, s * 0.55], [0.3 - k * 0.3, 0.38, s * 0.62]], 0.03, 0.015, [0.08, 0.06, 0.05], { seg: 4 });
  return b;
}
function buildSeedPile(n, seed) {
  const b = new MeshB(), r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, rr = Math.sqrt(r()) * 0.45, h = (1 - rr / 0.5) * 0.15;
    const col = r() < 0.5 ? [0.58, 0.42, 0.22] : [0.76, 0.66, 0.4];
    const yaw = r() * 3;
    b.ellipsoid(Math.cos(a) * rr, 0.05 + h + r() * 0.05, Math.sin(a) * rr, 0.09, 0.05, 0.06, col, { seg: 8, ring: 5, rot: (x, y, z) => [x * Math.cos(yaw) - z * Math.sin(yaw), y, x * Math.sin(yaw) + z * Math.cos(yaw)] });
  }
  return b;
}
function buildCrumbs(n, seed) {
  const b = new MeshB(), r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const s = 0.12 + r() * 0.18;
    b.ellipsoid((r() - 0.5) * 0.9, s * 0.4, (r() - 0.5) * 0.8, s, s * 0.7, s * 0.9, [0.85 + r() * 0.1, 0.66 + r() * 0.1, 0.36], { seg: 7, ring: 5, bump: 0.6, seed: i + seed, noise: 0.15 });
  }
  return b;
}
function buildAphidStem(n) {
  const b = new MeshB();
  b.limb([[0, 0, 0], [0.05, 0.4, 0.02], [0.12, 0.85, 0], [0.22, 1.2, -0.05]], 0.04, 0.02, [0.26, 0.46, 0.14], { seg: 5 });
  for (let i = 0; i < n; i++) {
    const t = 0.2 + i / n * 0.7, y = t * 1.2, x = t * 0.18 + Math.sin(i * 2.3) * 0.05, z = Math.cos(i * 2.3) * 0.06;
    b.ellipsoid(x + 0.05, y, z, 0.06, 0.045, 0.05, [0.6, 0.82, 0.3], { seg: 8, ring: 5, noise: 0.03 });
  }
  return b;
}
function buildRing() {   // flat torus for selection & swarm markers
  const b = new MeshB(), seg = 40, base = b.vcount;
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * 6.28;
    for (const rr of [0.9, 1.0]) b.v(Math.cos(a) * rr, 0, Math.sin(a) * rr, 0, 1, 0, 1, 1, 1);
  }
  for (let i = 0; i < seg; i++) { const a = base + i * 2; b.tri(a, a + 2, a + 1); b.tri(a + 1, a + 2, a + 3); }
  return b;
}
function buildDisc() {
  const b = new MeshB(), seg = 32, c = b.v(0, 0, 0, 0, 1, 0, 1, 1, 1);
  for (let i = 0; i <= seg; i++) { const a = i / seg * 6.28; b.v(Math.cos(a), 0, Math.sin(a), 0, 1, 0, 1, 1, 1); }
  for (let i = 0; i < seg; i++) b.tri(c, c + i + 2, c + i + 1);
  return b;
}
// brood & stores (colony)
const buildEgg = () => new MeshB().ellipsoid(0, 0.06, 0, 0.07, 0.05, 0.05, [0.96, 0.94, 0.86], { seg: 10, ring: 6, noise: 0.01 });
const buildPupa = () => new MeshB().ellipsoid(0, 0.08, 0, 0.16, 0.075, 0.08, [0.82, 0.71, 0.52], { seg: 12, ring: 8, noise: 0.08 });
function buildLarva() {
  const b = new MeshB();
  for (let i = 0; i < 7; i++) { const a = 0.4 + i * 0.36; b.ellipsoid(Math.cos(a) * 0.1, 0.07 + Math.sin(a) * 0.06, 0, 0.055, 0.055, 0.055, [0.97, 0.95, 0.9], { seg: 8, ring: 6, noise: 0.01 }); }
  return b;
}
function buildFungus(seed) {
  const b = new MeshB(), r = mulberry32(seed);
  for (let i = 0; i < 26; i++) {
    const s = 0.09 + r() * 0.14, x = (r() - 0.5) * 1.6, z = (r() - 0.5) * 0.9;
    b.ellipsoid(x, s * 0.8 + r() * 0.15, z, s, s * 0.85, s, [0.86 - r() * 0.1, 0.84 - r() * 0.1, 0.76 - r() * 0.12], { seg: 8, ring: 6, bump: 0.5, noise: 0.18, seed: i + seed });
  }
  return b;
}
