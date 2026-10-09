// =====================================================================
//  3D colony: a cut-away "ant farm" block with real carved cavities
// =====================================================================
'use strict';

const CPX = 50;                     // layout pixels per world unit
const cX = px => (px - 430) / CPX;  // layout -> world
const cY = py => (SURF - py) / CPX;
const BLOCK_D = 3.2;                // block depth (world units)
const TUN_R = 0.21;

function chamberDepth(G) { return Math.min(1.7, Math.max(0.7, G.ry / CPX * 2.4)); }

// back half of an ellipsoid, seen from inside, with a flat floor
function addCavity(b, cx, cy, rx, ry, rz, floorK, seed) {
  const seg = 28, ring = 9, base = b.vcount;
  for (let j = 0; j <= ring; j++) {
    const ps = j / ring * Math.PI / 2;            // 0 = deepest point, pi/2 = rim at the front face
    for (let i = 0; i <= seg; i++) {
      const ph = i / seg * Math.PI * 2;
      let x = Math.sin(ps) * Math.cos(ph), y = Math.sin(ps) * Math.sin(ph), z = -Math.cos(ps);
      let px = x * rx, py = y * ry, pz = z * rz;
      let nx = -x / rx, ny = -y / ry, nz = -z / rz;
      if (py < -floorK * ry) { py = -floorK * ry; nx = 0; ny = 1; nz = 0; }
      const l = Math.hypot(nx, ny, nz) || 1;
      const k = (0.55 + 0.45 * (1 + z)) * (0.82 + 0.36 * hash2(i + seed * 7, j, seed));
      const floor = ny / l > 0.9 ? 1.12 : 1;
      b.v(cx + px, cy + py, pz, nx / l, ny / l, nz / l, 0.42 * k * floor, 0.29 * k * floor, 0.18 * k * floor);
    }
  }
  for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) {
    const a = base + j * (seg + 1) + i, c = a + seg + 1;
    b.tri(a, c, a + 1); b.tri(a + 1, c, c + 1);
  }
}
// half tube behind the front face along a polyline (world xy)
function addHalfTube(b, pts, r, seed) {
  const seg = 8, base = b.vcount;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], q = pts[Math.min(pts.length - 1, k + 1)], o = pts[Math.max(0, k - 1)];
    let tx = q[0] - o[0], ty = q[1] - o[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const n2 = [-ty, tx];
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI;
      const ox = Math.cos(a) * n2[0] * r, oy = Math.cos(a) * n2[1] * r, oz = -Math.sin(a) * r;
      const kk = (0.6 + 0.3 * Math.sin(a)) * (0.85 + 0.3 * hash2(k, i, seed));
      b.v(p[0] + ox, p[1] + oy, oz, -ox / r, -oy / r, -oz / r, 0.4 * kk, 0.28 * kk, 0.17 * kk);
    }
  }
  for (let k = 0; k < pts.length - 1; k++) for (let i = 0; i < seg; i++) {
    const a = base + k * (seg + 1) + i, c = a + seg + 1;
    b.tri(a, a + 1, c); b.tri(a + 1, c + 1, c);
  }
}

const OBJ_MAT = {
  egg: { spec: 0.7, shin: 50, trans: 0.7, coat: 0.3, rim: 0.25 },
  larva: { spec: 0.6, shin: 40, trans: 0.6, coat: 0.25 },
  pupa: { spec: 0.3, shin: 24, trans: 0.3 },
  fungus: { spec: 0.15, shin: 12, trans: 0.5, bump: 1.6, bumpScale: 22, emis: 0.12 },
  leafbit: { spec: 0.2, shin: 30, trans: 0.4, cull: false },
  seedpile: { spec: 0.35, shin: 40, coat: 0.15 },
  aphid: { spec: 0.5, shin: 40, trans: 0.6 },
  root: { spec: 0.08, bump: 1.4, bumpScale: [4, 10, 4] },
  debris: { spec: 0.12, bump: 1.2, bumpScale: 16 },
};
const REPLETE_MAT = { spec: 1.2, shin: 70, coat: 0.9, trans: 0.8, rim: 0.2 };
class ColonyView3D {
  constructor(scene) {
    this.scene = scene; this.cam = new OrbitCam();
    this.cam.tx = 0; this.cam.ty = -4.6; this.cam.tz = -0.6; this.cam.dist = 15.5; this.cam.yaw = 0.18; this.cam.pitch = 0.2; this.cam.fov = 0.72;
    this.key = ''; this.t = 0; this.lists = new Map();
    this.rect = { x: 0, y: VY, w: VW, h: VH };
  }
  rebuild(col, soilCanvas, mask) {
    // front face texture: painted soil with the tunnels cut out
    const tex = makeCanvas(VW, VH), g = tex.getContext('2d');
    g.drawImage(soilCanvas, 0, 0);
    // cut-out mask: tunnels, plus chambers only above their flat floor
    const m3 = makeCanvas(VW, VH), mg = m3.getContext('2d');
    mg.drawImage(mask, 0, 0);
    for (const k of CHAMBER_KEYS) {
      const G = chGeom(col, k); if (!G.lvl) continue;
      const fy = G.y + G.ry * 0.62;
      mg.save(); mg.beginPath(); mg.ellipse(G.x, G.y + G.ry * 0.25, G.rx + 6, G.ry * 1.3, 0, 0, 6.28); mg.clip();
      mg.clearRect(G.x - G.rx - 8, fy, G.rx * 2 + 16, G.ry * 2);
      mg.restore();
    }
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(m3, 0, 0);
    g.globalCompositeOperation = 'source-over';
    if (this.frontTex) GL3D.updateTexture(this.frontTex, tex); else this.frontTex = GL3D.texture(tex);
    for (const m of [this.front, this.cavity, this.sides, this.ground, this.grass]) GL3D.free(m);
    const fb = new MeshB();
    const X0 = cX(0), X1 = cX(VW), Y0 = cY(0), Y1 = cY(VH);
    const v0 = fb.v(X0, Y0, 0, 0, 0, 1, 1, 1, 1, 0, 0), v1 = fb.v(X1, Y0, 0, 0, 0, 1, 1, 1, 1, 1, 0);
    const v2 = fb.v(X1, Y1, 0, 0, 0, 1, 1, 1, 1, 1, 1), v3 = fb.v(X0, Y1, 0, 0, 0, 1, 1, 1, 1, 0, 1);
    fb.tri(v0, v3, v1); fb.tri(v1, v3, v2);
    this.front = GL3D.mesh(fb.build());
    // cavities
    const b = new MeshB();
    for (const k of CHAMBER_KEYS) {
      const G = chGeom(col, k); if (!G.lvl) continue;
      addCavity(b, cX(G.x), cY(G.y), G.rx / CPX * 1.1, G.ry / CPX * 1.04, chamberDepth(G), 0.6, k.length);
    }
    const sc = this.scene;
    const inChamber = (x, y) => CHAMBER_KEYS.some(k => { const G = chGeom(col, k); if (!G.lvl) return false; const dx = (x - G.x) / (G.rx - 4), dy = (y - G.y) / (G.ry - 2); return dx * dx + dy * dy < 1; });
    for (const [a, bb, kind] of EDGES) {
      if (kind || !sc.isOpen(a) || !sc.isOpen(bb)) continue;
      // split the tunnel into runs that lie outside chambers
      let run = [];
      const flush = () => { if (run.length > 1) addHalfTube(b, run, TUN_R, a.length + bb.length); run = []; };
      const pts = sc.edgePts[a + '>' + bb];
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        if (inChamber(x, y)) { if (run.length) run.push([cX(x), cY(y)]); flush(); }
        else { if (!run.length && i > 0) run.push([cX(pts[i - 1][0]), cY(pts[i - 1][1])]); run.push([cX(x), cY(y)]); }
      }
      flush();
    }
    const shaft = []; for (let y = SURF - 6; y <= 285; y += 12) shaft.push([cX(430), cY(y)]);
    addHalfTube(b, shaft, TUN_R * 1.1, 3);
    for (const n of ['H1', 'H2', 'H3', 'H4']) if (sc.isOpen(n)) { const [x, y] = NODES[n]; addCavity(b, cX(x), cY(y), 0.3, 0.3, 0.3, 0.8, 5); }
    this.cavity = GL3D.mesh(b.build());
    // block sides, top ground and distant meadow
    const s = new MeshB(), soil = [0.36, 0.25, 0.16];
    for (const X of [X0, X1]) {
      const nx = X < 0 ? -1 : 1, a = s.v(X, 0, 0, nx, 0, 0, ...soil), bq = s.v(X, 0, -BLOCK_D, nx, 0, 0, ...soil), c = s.v(X, Y1, -BLOCK_D, nx, 0, 0, ...soil), d = s.v(X, Y1, 0, nx, 0, 0, ...soil);
      if (nx < 0) { s.tri(a, bq, c); s.tri(a, c, d); } else { s.tri(a, c, bq); s.tri(a, d, c); }
    }
    this.sides = GL3D.mesh(s.build());
    const tg = new MeshB();
    const N = 48, gseed = 4;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = lerp(X0 - 30, X1 + 30, i / N), z = lerp(-60, 0, j / N);
      const inside = x > X0 && x < X1 && z > -BLOCK_D;
      const y = inside ? 0 : (fbm(x * 0.08, z * 0.08, gseed, 3) - 0.5) * 2.2 - 0.05 + (z < -10 ? (z + 10) * -0.03 : 0);
      const k = 0.75 + 0.4 * hash2(i, j, gseed);
      tg.v(x, y, z, 0, 1, 0, 0.3 * k, 0.42 * k, 0.16 * k);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, c = a + N + 1; tg.tri(a, c, a + 1); tg.tri(a + 1, c, c + 1); }
    this.ground = GL3D.mesh(tg.build());
    // grass on top
    const gl = new InstList(512), R = mulberry32(77);
    for (let i = 0; i < 1400; i++) {
      const x = lerp(X0 - 6, X1 + 6, R()), z = -R() * 9 - 0.05;
      if (Math.abs(x) < 1.6 && z > -1.6) continue;   // keep the mound clear
      const k = 0.8 + R() * 0.4;
      gl.pushYaw(x, 0, z, R() * 6.28, 0.5 + R() * 0.6, k, k, k);
    }
    this.grass = GL3D.staticInst(gl.data.slice(0, gl.count * 20));
    this.moundLvl = -1;
  }

  dispose() { for (const m of [this.front, this.cavity, this.sides, this.ground, this.grass, this.frontTex]) GL3D.free(m); }
  list(key) { let l = this.lists.get(key); if (!l) { l = new InstList(32); this.lists.set(key, l); } return l; }
  antAt(species, caste, frame, x, y, z, f, u, s) {
    this.list(species + '|' + caste + '|' + (frame % ANT3D_FRAMES)).push(x, y, z, f[0], f[1], f[2], u[0], u[1], u[2], s);
  }
  objAt(key, x, y, z, yaw, s, tint) { this.list('obj|' + key).pushYaw(x, y, z, yaw, s, ...(tint || [1, 1, 1])); }

  // where an animated agent stands in 3D
  placeAnt(ant, col) {
    const len = ant.caste === 'major' ? 30 : ant.caste === 'soldier' ? 24 : ant.caste === 'scout' ? 20 : 19;
    const s = len / CPX * 0.95;
    let X = cX(ant.x), Y = cY(ant.y), Z, up;
    if (ant.wander && CH_LAYOUT[ant.at]) {
      const G = chGeom(col, ant.at), d = chamberDepth(G);
      if (ant.z3 === undefined || ant.z3c !== ant.at) { ant.z3 = -(0.25 + Math.random() * 0.5) * d; ant.z3c = ant.at; }
      Y = cY(G.y) - G.ry / CPX * 0.62;
      Z = ant.z3 + Math.sin(this.t * 0.4 + ant.sp) * 0.15 * d;
      up = [0, 1, 0];
    } else if (ant.y <= SURF + 2 && Math.abs(ant.x - 430) > 12) {
      Y = 0; Z = -0.45 - (ant.sp % 3) * 0.15; up = [0, 1, 0];
    } else {
      // tunnel: stand on the floor (or wall) of the half tube
      const tx = Math.cos(ant.a), ty = -Math.sin(ant.a);
      let ux = -ty, uy = tx;
      if (uy < 0) { ux = -ux; uy = -uy; }
      if (uy < 0.25) { ux = Math.sign(ux || 1); uy = 0; }
      X -= ux * TUN_R * 0.55; Y -= uy * TUN_R * 0.55; Z = -TUN_R * 0.55;
      up = [ux * 0.8, uy * 0.8, 0.6];
    }
    const prev = ant.p3;
    let f;
    if (prev) { const dx = X - prev[0], dy = Y - prev[1], dz = Z - prev[2], l = Math.hypot(dx, dy, dz); f = l > 1e-4 ? [dx / l, dy / l, dz / l] : (ant.f3 || [1, 0, 0]); }
    else f = [Math.cos(ant.a), -Math.sin(ant.a), 0];
    if (ant.f3) f = V3.norm([ant.f3[0] * 0.75 + f[0] * 0.25, ant.f3[1] * 0.75 + f[1] * 0.25, ant.f3[2] * 0.75 + f[2] * 0.25]);
    ant.f3 = f; ant.p3 = [X, Y, Z];
    this.antAt(col.species, ant.caste, Math.floor(ant.frame * 0.75), X, Y, Z, f, up, s);
    if (ant.carry) this.objAt(ant.carry === 'leafbit' ? 'leafbit' : 'seed', X + f[0] * s * 0.7, Y + up[1] * s * 0.28 + 0.03, Z + f[2] * s * 0.7, Math.atan2(-f[2], f[0]), ant.carry === 'leafbit' ? 0.11 : 0.55);
  }

  contents(col, sprites) {
    const st = App.st;
    for (const k of CHAMBER_KEYS) {
      const G = chGeom(col, k); if (!G.lvl) continue;
      const cx = cX(G.x), cy = cY(G.y), rx = G.rx / CPX, ry = G.ry / CPX, d = chamberDepth(G), fy = cy - ry * 0.62;
      const r = mulberry32(k.length * 97 + 3);
      const spot = (fx = 0.8) => { // random floor spot inside the chamber
        for (let t = 0; t < 8; t++) {
          const x = (r() * 2 - 1) * rx * fx, z = -(0.12 + r() * 0.75) * d;
          const e = (x / rx) ** 2 + (0.62) ** 2 + (z / d) ** 2;
          if (e < 0.98) return [cx + x, z];
        }
        return [cx, -d * 0.4];
      };
      switch (k) {
        case 'royal': {
          this.antAt(col.species, 'queen', Math.floor(this.t * 2), cx + 0.1, fy, -d * 0.45, [Math.cos(-0.35), 0, Math.sin(-0.35)], [0, 1, 0], 0.88 + G.lvl * 0.04);
          const ne = Math.min(22, 4 + broodCount(col) / 4);
          for (let i = 0; i < ne; i++) this.objAt('egg', cx - rx * 0.55 + r() * rx * 0.35, fy, -(0.2 + r() * 0.5) * d, r() * 6, 1);
          for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.5; this.antAt(col.species, 'worker', Math.floor(this.t * 3 + i * 2), cx + Math.cos(a) * 1.0, fy, -d * 0.45 + Math.sin(a) * 0.55, [-Math.cos(a), 0, -Math.sin(a)], [0, 1, 0], 0.36); }
          break;
        }
        case 'nursery': {
          let eggs = 0, larvae = 0, pupae = 0;
          for (const b of col.brood) { const tt = CASTES[b.caste].time; if (b.left > tt * 0.66) eggs += b.n; else if (b.left > tt * 0.33) larvae += b.n; else pupae += b.n; }
          const sc = n => Math.min(40, Math.ceil(n / 1.5));
          for (let i = 0; i < sc(eggs); i++) { const [x, z] = spot(); this.objAt('egg', x - rx * 0.3, fy + r() * 0.06, z, r() * 6, 1.3); }
          for (let i = 0; i < sc(larvae); i++) { const [x, z] = spot(); this.objAt('larva', x, fy, z, r() * 6, 1.5); }
          for (let i = 0; i < sc(pupae); i++) { const [x, z] = spot(); this.objAt('pupa', x + rx * 0.3, fy, z, r() * 6, 1.4); }
          break;
        }
        case 'granary': {
          const frac = clamp(col.food / storageCap(st, col), 0, 1);
          if (col.species === 'honeypot') {
            const n = Math.max(1, Math.round(frac * 10));
            for (let i = 0; i < n; i++) this.antAt('honeypot', 'replete', 0, cx - rx * 0.7 + i * rx * 0.15, cy + ry * 0.55, -(0.25 + (i % 3) * 0.2) * d, [0, 0, 1], [0, -1, 0], 0.42);
          } else {
            const n = Math.round(frac * 9);
            for (let i = 0; i < n; i++) { const [x, z] = spot(0.7); this.objAt('seedpile', x, fy, z, r() * 6, 0.5 + frac * 0.5); }
          }
          break;
        }
        case 'galleries': for (let i = 0; i < Math.min(16, Math.ceil(col.adults.worker / 10)); i++) { const [x, z] = spot(); const a = r() * 6.28; this.antAt(col.species, 'worker', 0, x, fy, z, [Math.cos(a), 0, Math.sin(a)], [0, 1, 0], 0.36); } break;
        case 'barracks': {
          const ns = Math.min(12, Math.ceil(col.adults.soldier / 5)), nm = Math.min(4, Math.ceil(col.adults.major / 3));
          for (let i = 0; i < ns; i++) this.antAt(col.species, 'soldier', 0, cx - rx * 0.7 + (i % 6) * rx * 0.28, fy, -d * (0.3 + Math.floor(i / 6) * 0.3), [1, 0, 0.15], [0, 1, 0], 0.45);
          for (let i = 0; i < nm; i++) this.antAt(col.species, 'major', 0, cx - rx * 0.3 + i * 0.6, fy, -d * 0.75, [1, 0, -0.1], [0, 1, 0], 0.55);
          break;
        }
        case 'archive': for (let i = 0; i < 8 + G.lvl * 4; i++) {
          const a = i * 2.4 + this.t * 0.4, rr = (i / (8 + G.lvl * 4)) * rx * 0.75;
          const pul = 0.5 + 0.5 * Math.sin(this.t * 3 + i);
          sprites.push({ v: [cx + Math.cos(a) * rr, cy + Math.sin(a * 1.3) * ry * 0.4, -d * (0.3 + 0.4 * ((i * 0.37) % 1)), 0.12 + pul * 0.08, 0.75, 0.5, 1.0, 0.5 + pul * 0.4], add: true });
        } break;
        case 'fungus': {
          this.objAt('fungus', cx, fy, -d * 0.45, 0, rx * 0.55 * (0.7 + G.lvl * 0.08));
          for (let i = 0; i < 6 + G.lvl * 2; i++) { const [x, z] = spot(); this.objAt('leafbit', x, fy + 0.25 + r() * 0.15, z, r() * 6, 0.12); }
          break;
        }
        case 'aphids': {
          this.objAt('root', cx, cy, -d * 0.5, 0, 1);
          for (let i = 0; i < 5 + G.lvl * 3; i++) { const t = r(), x = cx + (t - 0.5) * rx * 1.8; this.objAt('aphid', x, cy - ry * 0.2 + Math.sin(t * 3) * ry * 0.3 - 0.06, -d * (0.3 + r() * 0.4), r() * 6, 1); }
          break;
        }
        case 'midden': for (let i = 0; i < 26; i++) { const [x, z] = spot(0.7); this.objAt('debris', x, fy, z, r() * 6, 0.06 + r() * 0.08, [0.3, 0.24, 0.2]); } break;
        case 'gates': {
          for (let i = 0; i < 6 + G.lvl * 2; i++) { const s = i % 2 ? -1 : 1; this.objAt('debris', cx + s * (rx * 0.4 + r() * rx * 0.45), fy, -(0.1 + r() * 0.6) * d, r() * 6, 0.12 + r() * 0.1, [0.8, 0.78, 0.72]); }
          this.antAt(col.species, 'soldier', 0, cx - 0.35, fy, -d * 0.4, [0.3, 0, 1], [0, 1, 0], 0.45);
          break;
        }
      }
    }
  }
  objMesh(key) {
    switch (key) {
      case 'egg': return Models.get('egg', buildEgg);
      case 'larva': return Models.get('larva', buildLarva);
      case 'pupa': return Models.get('pupa', buildPupa);
      case 'seed': return Models.get('seed1', () => new MeshB().ellipsoid(0, 0.05, 0, 0.09, 0.05, 0.06, [0.6, 0.44, 0.24], { seg: 8, ring: 5 }));
      case 'seedpile': return Models.get('seedpile', () => buildSeedPile(26, 8));
      case 'leafbit': return Models.get('leaf', buildLeaf);
      case 'fungus': return Models.get('fungus', () => buildFungus(5));
      case 'aphid': return Models.get('aphid', () => new MeshB().ellipsoid(0, 0.05, 0, 0.07, 0.05, 0.055, [0.6, 0.82, 0.3], { seg: 8, ring: 5 }));
      case 'root': return Models.get('root', () => new MeshB().limb([[-2.3, 0.7, 0], [-1, -0.25, 0.1], [0.6, -0.3, -0.1], [2.3, 0.6, 0]], 0.13, 0.08, [0.34, 0.23, 0.13], { seg: 7 }));
      case 'debris': return Models.get('rock1', () => buildRock(1));
    }
  }

  render(dt) {
    const sc = this.scene, col = sc.col(), cam = this.cam;
    this.t += dt; GL3D.time = this.t;
    cam.update(this.rect.w, this.rect.h);
    for (const l of this.lists.values()) l.reset();
    const sprites = [];
    for (const ant of sc.ants) this.placeAnt(ant, col);
    this.contents(col, sprites);
    const si = seasonIdx(App.st.turn), E = SEASON_ENV[si];
    const items = [
      { mesh: this.front, tex: this.frontTex, cut: 0.5, spec: 0.06, bump: 0.6, bumpScale: 5, snow: false },
      { mesh: this.cavity, spec: 0.14, shin: 14, bump: 1.4, bumpScale: [5, 7, 5], snow: false },
      { mesh: this.sides, spec: 0.03, bump: 1.0, bumpScale: 4, snow: false },
      { mesh: this.ground, spec: 0.02, bump: 0.8, bumpScale: 6 },
      { mesh: Models.get('grass', buildGrassBlade), inst: this.grass, wind: 1, cull: false, spec: 0.18, shin: 30, trans: 0.55, tintMul: GRASS_TINT[si] },
    ];
    // mound grows with the colony
    const lvl = (col.chambers.galleries || 0) + (col.chambers.royal || 0);
    const ms = 0.85 + lvl * 0.06; const M = new Float32Array(16); M4.yaw(M, 0, 0, -0.05, -1.25, 0.3, ms, ms * 0.75);
    items.push({ mesh: Models.get('mound|' + col.color + '|false', () => buildMound(col.color, false)), model: M, spec: 0.05, bump: 1.0, bumpScale: 8 });
    for (const [key, l] of this.lists) {
      if (!l.count) continue;
      if (key.startsWith('obj|')) {
        const k = key.slice(4);
        items.push(l.item(this.objMesh(k), OBJ_MAT[k] || { spec: 0.2, shin: 30 }));
      } else {
        const [sp, caste, fr] = key.split('|');
        items.push(l.item(Models.ant(sp, caste, +fr, GL3D.tablet || cam.dist > 11 ? 1 : 0), caste === 'replete' ? REPLETE_MAT : ANT_MAT));
      }
    }
    // dust motes drifting through the lamp-lit galleries
    const Q = GL3D.Q;
    if (Q.particles > 0) for (let i = 0, n = Math.round(70 * Q.particles); i < n; i++) {
      const a = hash2(i, 5, 31), b = hash2(i, 6, 31), c = hash2(i, 7, 31);
      const x = (a - 0.5) * 17 + Math.sin(this.t * 0.13 + i) * 0.4, y = -1 - b * 6.5 + Math.sin(this.t * 0.2 + i * 1.7) * 0.25;
      const tw = 0.5 + 0.5 * Math.sin(this.t * 1.5 + i * 2.3);
      sprites.push({ v: [x, y, -0.15 - c * 0.9, 0.015 + c * 0.02, 1.4, 1.15, 0.8, 0.35 * tw], add: true });
    }
    const env = {
      lightDir: V3.norm([-0.35, 0.62, 0.7]), lightCol: E.lightCol.map(v => v * 1.05), sky: E.sky.map(v => v * 0.9), ground: [0.2, 0.14, 0.09],
      fogCol: E.fog, fogNear: 30, fogFar: 75, clear: E.fog, snow: si === 3 ? 0.6 : 0,
    };
    GL3D.render({ rect: this.rect, cam, env, items, sprites, shadow: { c: [0, -3.5, -1], r: 11 },
      sky: { sunDir: env.lightDir, top: E.sky.map(v => v * 0.7), hor: E.fog, sunCol: E.lightCol },
      focus: cam.dist, focusRange: 0.42, dofMax: 7, aoRadius: 0.22, aoAmt: 0.9, bloomAmt: 0.35, bloomThresh: 1.0,
      grade: Object.assign({}, GRADE[si], { contrast: 0.3 }), vignette: 0.4 });
  }
  // mouse (logical) -> layout pixel coords on the front face
  layoutAt(mx, my) {
    if (!this.cam.inv) return [-1, -1];
    const r = this.cam.ray(mx - this.rect.x, my - this.rect.y);
    if (Math.abs(r.d[2]) < 1e-4) return [-1, -1];
    const t = -r.o[2] / r.d[2];
    const X = r.o[0] + r.d[0] * t, Y = r.o[1] + r.d[1] * t;
    return [X * CPX + 430, SURF - Y * CPX];
  }
  // layout -> screen (logical)
  screenOf(px, py, z = 0) {
    const p = this.cam.project(cX(px), cY(py), z);
    return p ? [p[0] + this.rect.x, p[1] + this.rect.y] : null;
  }
}
