// =====================================================================
//  Procedural sprites: 3D-shaded ants, brood, food, map objects
// =====================================================================
'use strict';

const LIGHT = (() => { const v = [-0.45, -0.6, 0.66]; const l = Math.hypot(...v); return v.map(x => x / l); })();
const HALF = (() => { const v = [LIGHT[0], LIGHT[1], LIGHT[2] + 1]; const l = Math.hypot(...v); return v.map(x => x / l); })();

// Per-pixel Phong-shaded ellipsoid. Returns a canvas.
function shadedEllipsoid(rx, ry, rgb, opts = {}) {
  const gloss = opts.gloss ?? 0.6, power = opts.power ?? 28, amb = opts.amb ?? 0.32;
  const tex = opts.tex ?? 0.08, seed = opts.seed ?? 7, alpha = opts.alpha ?? 1, sss = opts.sss ?? 0;
  const w = Math.ceil(rx * 2 + 2), h = Math.ceil(ry * 2 + 2);
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const img = g.createImageData(w, h), d = img.data;
  const cx = w / 2, cy = h / 2, m = Math.min(rx, ry);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, r2 = nx * nx + ny * ny;
    const r = Math.sqrt(r2);
    const edge = clamp((1 - r) * m + 0.5, 0, 1);
    if (edge <= 0) continue;
    const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, r2)));
    const dif = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    const sp = Math.pow(Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), power) * gloss;
    const n = 1 - tex + tex * 2 * hash2(x, y, seed);
    const rim = 0.75 + 0.25 * nz;
    const k = (amb + (1 - amb) * dif) * n * rim + sss * (1 - nz) * 0.5;
    const i = (y * w + x) * 4;
    d[i] = clamp(rgb[0] * k + 255 * sp, 0, 255);
    d[i + 1] = clamp(rgb[1] * k + 255 * sp, 0, 255);
    d[i + 2] = clamp(rgb[2] * k + 255 * sp, 0, 255);
    d[i + 3] = 255 * edge * alpha;
  }
  g.putImageData(img, 0, 0);
  return c;
}
function blit(ctx, cv, x, y, rot = 0) {
  if (!rot) { ctx.drawImage(cv, x - cv.width / 2, y - cv.height / 2); return; }
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(cv, -cv.width / 2, -cv.height / 2); ctx.restore();
}

// ---------------------------------------------------------------------
//  Ants
// ---------------------------------------------------------------------
const CASTE_SHAPE = {
  worker:  { len: 1.0,  head: 1.0,  mand: 1.0, leg: 1.0,  gaster: 1.0 },
  soldier: { len: 1.25, head: 1.45, mand: 1.4, leg: 1.0,  gaster: 0.95 },
  major:   { len: 1.55, head: 1.85, mand: 1.7, leg: 0.95, gaster: 0.95 },
  scout:   { len: 1.0,  head: 0.9,  mand: 0.8, leg: 1.45, gaster: 0.8 },
  queen:   { len: 1.9,  head: 1.0,  mand: 0.9, leg: 0.9,  gaster: 1.7, queen: true },
  replete: { len: 1.1,  head: 1.0,  mand: 0.8, leg: 1.0,  gaster: 3.0, replete: true },
};
const ANT_FRAMES = 6;
const antCache = new Map();

// Get a cached ant sprite. `len` is the target body length in pixels (worker caste).
function antSprite(species, caste, frame, len) {
  const bucket = len <= 9 ? 8 : len <= 14 ? 12 : len <= 22 ? 18 : len <= 34 ? 28 : len <= 70 ? 48 : 150;
  const key = species + '|' + caste + '|' + (frame % ANT_FRAMES) + '|' + bucket;
  let s = antCache.get(key);
  if (!s) { s = renderAnt(species, caste, frame % ANT_FRAMES, bucket); antCache.set(key, s); }
  return s;
}

function renderAnt(species, caste, frame, baseLen) {
  const look = SPECIES[species].look, cs = CASTE_SHAPE[caste];
  const SS = baseLen < 30 ? 3 : 2;                 // supersampling
  const L = baseLen * cs.len * look.size * SS;
  const legL = L * 0.36 * cs.leg * look.legLen;
  const wpx = Math.ceil(L * (cs.replete ? 2.2 : 1.75) + legL * 1.4 + (look.hooked ? L * 0.9 * cs.head : L * 0.3 * cs.head)), hpx = Math.ceil(L * (cs.replete ? 1.3 : 0.9) + legL * 1.9);
  const big = makeCanvas(wpx, hpx), g = big.getContext('2d');
  const cx = wpx / 2 - L * 0.04 + (cs.replete ? L * 0.25 : 0), cy = hpx / 2;
  const headR = L * 0.11 * cs.head * look.headSize;
  const gasR = L * 0.17 * cs.gaster * look.gasterSize;
  const gx = cx - L * 0.30 - (gasR - L * 0.17) * 0.8, hx = cx + L * 0.20 + headR * 0.7;
  const phase = frame / ANT_FRAMES * Math.PI * 2;
  const legCol = look.legs;
  g.lineCap = 'round'; g.lineJoin = 'round';

  // soft contact shadow
  g.save(); g.filter = `blur(${Math.max(1, L * 0.03)}px)`;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.ellipse(cx + L * 0.03, cy + L * 0.05, L * 0.55, L * 0.16, 0, 0, Math.PI * 2); g.fill();
  g.restore();

  // legs (tripod gait)
  const legW = Math.max(1, L * 0.028 * (caste === 'major' ? 1.3 : 1));
  for (let side = -1; side <= 1; side += 2) {
    for (let k = 0; k < 3; k++) {
      const tri = (k + (side > 0 ? 1 : 0)) % 2;
      const sw = Math.sin(phase + tri * Math.PI) * 0.32;
      const ax = cx + L * (0.06 - k * 0.06), ay = cy + side * L * 0.035;
      const th = [0.95, 1.6, 2.2][k] - sw;                  // femur angle from +x
      const bend = [-0.75, 0.05, 0.55][k];                  // tibia bend
      const fem = legL * [0.5, 0.48, 0.58][k], tib = legL * [0.62, 0.62, 0.78][k];
      const kx = ax + Math.cos(th) * fem, ky = ay + side * Math.sin(th) * fem;
      const t2 = th + bend - sw * 0.4;
      const fx = kx + Math.cos(t2) * tib, fy = ky + side * Math.sin(t2) * tib;
      g.strokeStyle = shade(legCol, 0.7); g.lineWidth = legW * 1.15;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
      g.strokeStyle = shade(legCol, 1.3); g.lineWidth = legW * 0.4;
      g.beginPath(); g.moveTo(ax, ay - legW * 0.2); g.lineTo(kx, ky - legW * 0.25); g.stroke();
    }
  }

  const gasRgb = hexToRgb(look.gaster), thRgb = hexToRgb(look.thorax), hdRgb = hexToRgb(look.head);
  // gaster
  if (cs.replete) {
    const rep = shadedEllipsoid(gasR * 1.05, gasR * 0.95, [214, 150, 50], { gloss: 1.0, power: 40, amb: 0.55, sss: 0.6, tex: 0.02, alpha: 0.95 });
    g.drawImage(rep, gx - rep.width / 2 - gasR * 0.3, cy - rep.height / 2);
    g.strokeStyle = 'rgba(90,50,20,0.5)'; g.lineWidth = Math.max(1, L * 0.012);
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(gx - gasR * 0.3 + i * gasR * 0.35, cy, gasR * 0.08, gasR * 0.8, 0, -1.2, 1.2); g.stroke(); }
  } else {
    const gas = shadedEllipsoid(gasR * (cs.queen ? 1.25 : 1.05), gasR * 0.86, gasRgb, { gloss: 0.75, alpha: look.translucent ? 0.9 : 1, seed: 3 });
    g.drawImage(gas, gx - gas.width / 2, cy - gas.height / 2);
    // segment bands
    g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = Math.max(1, L * 0.012);
    for (let i = 1; i <= 3; i++) {
      const bx = gx + gasR * (0.55 - i * 0.38) * (cs.queen ? 1.2 : 1);
      g.beginPath(); g.ellipse(bx, cy, gasR * 0.12, gasR * 0.78 * Math.sqrt(1 - Math.pow((bx - gx) / (gasR * 1.3), 2)), 0, -1.35, 1.35); g.stroke();
    }
    if (look.stripes) {
      g.strokeStyle = 'rgba(255,230,170,0.45)'; g.lineWidth = Math.max(1, L * 0.02);
      for (let i = 0; i < 3; i++) { const bx = gx + gasR * (0.35 - i * 0.4); g.beginPath(); g.ellipse(bx, cy, gasR * 0.1, gasR * 0.7, 0, -1.2, 1.2); g.stroke(); }
    }
  }
  // petiole node(s)
  const pet = shadedEllipsoid(L * 0.045, L * 0.05, thRgb, { gloss: 0.5 });
  g.drawImage(pet, cx - L * 0.135 - pet.width / 2, cy - pet.height / 2);
  if (species === 'fire' || species === 'leafcutter') g.drawImage(pet, cx - L * 0.09 - pet.width / 2, cy - pet.height / 2);
  // thorax
  const thR = L * (cs.queen ? 0.2 : 0.165);
  const th = shadedEllipsoid(thR, L * (cs.queen ? 0.1 : 0.075), thRgb, { gloss: 0.6, seed: 5 });
  g.drawImage(th, cx - th.width / 2, cy - th.height / 2);
  if (cs.queen) {   // wing scars
    g.fillStyle = 'rgba(30,15,5,0.6)';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx - L * 0.02, cy + s * L * 0.07, L * 0.03, L * 0.015, 0, 0, Math.PI * 2); g.fill(); }
  }
  if (look.spines) {
    g.strokeStyle = shade(look.thorax, 0.7); g.lineWidth = Math.max(1, L * 0.014);
    for (const s of [-1, 1]) for (const ox of [-0.08, 0.06]) {
      g.beginPath(); g.moveTo(cx + L * ox, cy + s * L * 0.05); g.lineTo(cx + L * (ox - 0.04), cy + s * L * 0.1); g.stroke();
    }
  }
  // mandibles (behind head front)
  const mL = headR * 0.95 * cs.mand * look.mand;
  const mOpen = 0.35 + Math.sin(phase * 2) * 0.04;
  for (const s of [-1, 1]) {
    g.save(); g.translate(hx + headR * 0.75, cy + s * headR * 0.35);
    g.rotate(s * mOpen);
    if (look.hooked && (caste === 'soldier' || caste === 'major')) {
      g.strokeStyle = '#e8d6a6'; g.lineWidth = Math.max(1.2, mL * 0.16);
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(mL * 1.3, -s * mL * 0.05, mL * 1.5, -s * mL * 0.75); g.stroke();
    } else {
      g.fillStyle = shade(look.head, 0.6);
      g.beginPath(); g.moveTo(0, -s * mL * 0.12); g.quadraticCurveTo(mL * 0.8, -s * mL * 0.2, mL, -s * mL * 0.55);
      g.lineTo(mL * 0.85, -s * mL * 0.35); g.quadraticCurveTo(mL * 0.5, s * mL * 0.05, 0, s * mL * 0.14); g.closePath(); g.fill();
    }
    g.restore();
  }
  // head
  const hd = shadedEllipsoid(headR * 1.05, headR * 0.95, hdRgb, { gloss: 0.7, seed: 9 });
  g.drawImage(hd, hx - hd.width / 2, cy - hd.height / 2);
  if (caste === 'soldier' || caste === 'major') {     // heart-shaped head cleft
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = Math.max(1, L * 0.01);
    g.beginPath(); g.moveTo(hx - headR * 0.9, cy); g.lineTo(hx - headR * 0.3, cy); g.stroke();
  }
  // eyes
  g.fillStyle = '#0b0805';
  for (const s of [-1, 1]) {
    g.beginPath(); g.ellipse(hx + headR * 0.25, cy + s * headR * 0.72, headR * 0.2, headR * 0.13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.arc(hx + headR * 0.2, cy + s * headR * 0.72 - headR * 0.05, headR * 0.05, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0b0805';
  }
  // antennae (elbowed)
  const antW = Math.max(1, L * 0.018);
  for (const s of [-1, 1]) {
    const wig = Math.sin(phase + (s > 0 ? 1.3 : 0)) * 0.12;
    const bx = hx + headR * 0.55, by = cy + s * headR * 0.45;
    const sc = L * 0.17 * (caste === 'scout' ? 1.3 : 1);
    const ex = bx + Math.cos(s * (0.9 + wig)) * sc, ey = by + Math.sin(s * (0.9 + wig)) * sc;
    const tx = ex + Math.cos(s * (0.15 + wig)) * sc * 1.15, ty = ey + Math.sin(s * (0.15 + wig)) * sc * 1.15;
    g.strokeStyle = shade(legCol, 0.8); g.lineWidth = antW;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.lineTo(tx, ty); g.stroke();
    g.fillStyle = shade(legCol, 0.75); g.beginPath(); g.arc(tx, ty, antW * 0.9, 0, Math.PI * 2); g.fill();
  }
  // downsample
  const out = makeCanvas(wpx / SS, hpx / SS), og = out.getContext('2d');
  og.imageSmoothingQuality = 'high';
  og.drawImage(big, 0, 0, out.width, out.height);
  return out;
}

function drawAnt(ctx, species, caste, x, y, angle, len, frame, alpha = 1) {
  const s = antSprite(species, caste, frame, len);
  const bucket = len <= 9 ? 8 : len <= 14 ? 12 : len <= 22 ? 18 : len <= 34 ? 28 : len <= 70 ? 48 : 150;
  const sc = len / bucket;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  if (alpha < 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(s, -s.width * sc / 2, -s.height * sc / 2, s.width * sc, s.height * sc);
  ctx.restore();
}

// ---------------------------------------------------------------------
//  Items: brood, food, nature
// ---------------------------------------------------------------------
const itemCache = {};
function item(name) {
  if (itemCache[name]) return itemCache[name];
  let c;
  switch (name) {
    case 'egg': c = shadedEllipsoid(3.2, 2.2, [245, 240, 222], { gloss: 1, power: 20, amb: 0.6, sss: 0.4, tex: 0.02 }); break;
    case 'larva': c = makeGrub(); break;
    case 'pupa': c = shadedEllipsoid(6.5, 3.2, [214, 186, 136], { gloss: 0.25, amb: 0.5, tex: 0.12, seed: 21 }); break;
    case 'seed': c = shadedEllipsoid(3.4, 2.2, [150, 110, 60], { gloss: 0.5, tex: 0.1, seed: 2 }); break;
    case 'seed2': c = shadedEllipsoid(2.6, 2.4, [196, 168, 98], { gloss: 0.4, tex: 0.1, seed: 4 }); break;
    case 'crumb': c = makeCrumb(); break;
    case 'berry': c = makeBerry(14); break;
    case 'berry_s': c = makeBerry(7); break;
    case 'leafbit': c = makeLeafBit(); break;
    case 'fungus': c = makeFungus(); break;
    case 'aphid': c = makeAphid(); break;
    case 'beetle': c = makeBeetle(); break;
    case 'pebble': c = shadedEllipsoid(9, 6, [140, 136, 128], { gloss: 0.15, tex: 0.15, seed: 8 }); break;
    case 'droplet': c = shadedEllipsoid(5, 5, [245, 210, 110], { gloss: 1.2, power: 50, amb: 0.6, sss: 0.7, alpha: 0.85, tex: 0 }); break;
    default: c = makeCanvas(2, 2);
  }
  itemCache[name] = c; return c;
}
function makeGrub() {
  const c = makeCanvas(18, 16), g = c.getContext('2d');
  const seg = shadedEllipsoid(3.2, 3.2, [248, 242, 228], { gloss: 0.8, amb: 0.55, sss: 0.5, tex: 0.03 });
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.15 + i * 0.36, r = 5.2;
    g.drawImage(seg, 9 + Math.cos(a) * r - seg.width / 2, 8 + Math.sin(a) * r - seg.height / 2);
  }
  return c;
}
function makeCrumb() {
  const c = makeCanvas(14, 12), g = c.getContext('2d');
  const gr = g.createRadialGradient(5, 4, 1, 7, 6, 8);
  gr.addColorStop(0, '#f4d9a0'); gr.addColorStop(0.6, '#d6a85c'); gr.addColorStop(1, '#9a6a2a');
  g.fillStyle = gr; g.beginPath();
  g.moveTo(2, 5); g.lineTo(6, 1); g.lineTo(12, 3); g.lineTo(13, 8); g.lineTo(8, 11); g.lineTo(3, 10); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(5, 3, 2, 1);
  return c;
}
function makeBerry(r) {
  const c = makeCanvas(r * 2 + 6, r * 2 + 6), g = c.getContext('2d');
  const b = shadedEllipsoid(r, r, [176, 24, 40], { gloss: 1.1, power: 35, amb: 0.3, sss: 0.3, tex: 0.04, seed: 11 });
  g.drawImage(b, 3, 4);
  g.fillStyle = '#3f6b23';
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    g.beginPath(); g.ellipse(r + 3 + Math.cos(a) * r * 0.25, r * 0.35 + 4 + Math.sin(a) * r * 0.15, r * 0.22, r * 0.08, a, 0, Math.PI * 2); g.fill();
  }
  return c;
}
function makeLeafBit() {
  const c = makeCanvas(16, 14), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 16, 14); gr.addColorStop(0, '#9ed15a'); gr.addColorStop(1, '#3f7a22');
  g.fillStyle = gr; g.beginPath(); g.moveTo(1, 8); g.quadraticCurveTo(5, 0, 15, 2); g.lineTo(12, 13); g.quadraticCurveTo(5, 13, 1, 8); g.fill();
  g.strokeStyle = 'rgba(230,255,190,0.6)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(2, 8); g.lineTo(13, 4); g.stroke();
  return c;
}
function makeFungus() {
  const c = makeCanvas(40, 30), g = c.getContext('2d');
  const r = mulberry32(5);
  for (let i = 0; i < 16; i++) {
    const s = 3 + r() * 5;
    const b = shadedEllipsoid(s, s * 0.85, [225 - r() * 25, 222 - r() * 25, 205 - r() * 30], { gloss: 0.15, amb: 0.5, tex: 0.25, seed: i });
    g.drawImage(b, 6 + r() * 26 - s, 8 + r() * 16 - s);
  }
  return c;
}
function makeAphid() {
  const c = makeCanvas(14, 12), g = c.getContext('2d');
  g.strokeStyle = '#4a6a20'; g.lineWidth = 0.7;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(6 + i * 2, 6); g.lineTo(4 + i * 3, 1); g.moveTo(6 + i * 2, 6); g.lineTo(4 + i * 3, 11); g.stroke(); }
  const b = shadedEllipsoid(5, 3.6, [150, 205, 80], { gloss: 0.9, amb: 0.45, sss: 0.4, tex: 0.04 });
  g.drawImage(b, 1, 2);
  g.fillStyle = '#2a3a10'; g.fillRect(10, 5, 1.2, 1.2);
  return c;
}
function makeBeetle() {
  const c = makeCanvas(40, 30), g = c.getContext('2d');
  g.strokeStyle = '#1a1410'; g.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(16 + i * 5, 15); g.lineTo(13 + i * 7, 15 + s * 10); g.lineTo(10 + i * 9, 15 + s * 13); g.stroke();
  }
  const body = shadedEllipsoid(13, 9, [40, 70, 50], { gloss: 1.2, power: 30, amb: 0.25, tex: 0.05 });
  g.drawImage(body, 7, 6);
  const head = shadedEllipsoid(5, 4.5, [30, 40, 30], { gloss: 0.9 });
  g.drawImage(head, 30, 10);
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(8, 15); g.lineTo(33, 15); g.stroke();
  return c;
}

// Anthill mound (map icon)
const moundCache = {};
function moundSprite(size, color, outpost) {
  const key = size + color + outpost;
  if (moundCache[key]) return moundCache[key];
  const s = size, c = makeCanvas(s * 2.4, s * 1.9), g = c.getContext('2d');
  const cx = c.width / 2, cy = c.height * 0.58;
  g.save(); g.filter = `blur(${s * 0.08}px)`; g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath(); g.ellipse(cx + s * 0.18, cy + s * 0.16, s * 1.05, s * 0.55, 0, 0, Math.PI * 2); g.fill(); g.restore();
  // dome with per-pixel shading
  const base = outpost ? [176, 136, 92] : [168, 124, 80];
  const dome = shadedEllipsoid(s, s * 0.78, base, { gloss: 0.08, amb: 0.35, tex: 0.32, seed: 33 });
  g.drawImage(dome, cx - dome.width / 2, cy - dome.height / 2);
  // thatch / grains
  const r = mulberry32(size * 7 + (outpost ? 1 : 0));
  for (let i = 0; i < s * 6; i++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * s * 0.92;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.78;
    const lit = 0.6 + 0.6 * (-(Math.cos(a) * 0.5 + Math.sin(a) * 0.6) * rr / s + 0.5);
    g.strokeStyle = `rgba(${70 * lit + 40},${50 * lit + 25},${25 * lit + 10},0.8)`;
    g.lineWidth = 1; const t = r() * Math.PI;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(t) * 3, y + Math.sin(t) * 2); g.stroke();
  }
  // entrance
  const eg = g.createRadialGradient(cx, cy - s * 0.12, 0, cx, cy - s * 0.12, s * 0.22);
  eg.addColorStop(0, '#000'); eg.addColorStop(0.7, '#140c06'); eg.addColorStop(1, 'rgba(20,12,6,0)');
  g.fillStyle = eg; g.beginPath(); g.ellipse(cx, cy - s * 0.12, s * 0.24, s * 0.16, 0, 0, Math.PI * 2); g.fill();
  // colour banner ring
  g.strokeStyle = color; g.lineWidth = Math.max(2, s * 0.09); g.globalAlpha = 0.9;
  g.beginPath(); g.ellipse(cx, cy + s * 0.05, s * 1.04, s * 0.8, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.globalAlpha = 1;
  moundCache[key] = c; return c;
}

// Resource icons for the HUD
function drawIcon(ctx, kind, x, y, s = 16) {
  ctx.save(); ctx.translate(x, y);
  const sc = s / 16; ctx.scale(sc, sc);
  switch (kind) {
    case 'food': ctx.drawImage(item('berry_s'), -10, -10); ctx.drawImage(item('seed'), 0, -2); break;
    case 'mat': {
      ctx.drawImage(item('leafbit'), -9, -9);
      ctx.fillStyle = '#8a6a44'; ctx.beginPath(); ctx.ellipse(3, 4, 5, 3, 0, 0, Math.PI * 2); ctx.fill(); break;
    }
    case 'rp': {
      const gr = ctx.createRadialGradient(0, 0, 1, 0, 0, 9); gr.addColorStop(0, '#f0d0ff'); gr.addColorStop(1, 'rgba(160,90,220,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d9b3ff'; ctx.lineWidth = 1.4; ctx.beginPath();
      ctx.moveTo(-6, 4); ctx.bezierCurveTo(-2, -8, 2, 8, 6, -4); ctx.stroke(); break;
    }
    case 'pop': drawAnt(ctx, 'wood', 'worker', 0, 0, -Math.PI / 4, 16, 0); break;
    case 'brood': ctx.drawImage(item('larva'), -9, -8); break;
    case 'sword': {
      ctx.strokeStyle = '#e8d6a6'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-6, 6); ctx.quadraticCurveTo(-6, -6, 6, -6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, 6); ctx.quadraticCurveTo(6, -6, -6, -6); ctx.stroke(); break;
    }
  }
  ctx.restore();
}
