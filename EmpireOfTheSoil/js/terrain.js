// =====================================================================
//  Chunked procedural terrain renderer for the campaign map
// =====================================================================
'use strict';

const CHUNK = 256;
const T_HEIGHT = [-0.55, 0.05, 0.1, 0.0, 0.02, 0.45, 0.14, 0.06];

class TerrainRenderer {
  constructor(state) {
    this.st = state;
    this.cache = new Map();
    this.order = [];
    this.seed = state.seed | 0;
    const { w, h, terrain } = state;
    this.off = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) this.off[i] = T_HEIGHT[terrain[i]];
    this.mini = this.buildMini();
  }
  // 1px-per-tile coloured map used for the minimap and as a fallback
  buildMini() {
    const { w, h, terrain } = this.st;
    const c = makeCanvas(w, h), g = c.getContext('2d');
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const col = TERRAIN[terrain[i]].color, n = 0.9 + 0.2 * hash2(i % w, (i / w) | 0, this.seed);
      img.data[i * 4] = col[0] * n; img.data[i * 4 + 1] = col[1] * n; img.data[i * 4 + 2] = col[2] * n; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  tAt(tx, ty) {
    const { w, h, terrain } = this.st;
    tx = tx < 0 ? 0 : tx >= w ? w - 1 : tx; ty = ty < 0 ? 0 : ty >= h ? h - 1 : ty;
    return terrain[ty * w + tx];
  }
  offAt(u, v) {   // bilinear terrain height offset
    const { w, h } = this.st;
    u -= 0.5; v -= 0.5;
    let x0 = Math.floor(u), y0 = Math.floor(v);
    const fx = u - x0, fy = v - y0;
    const x1 = clamp(x0 + 1, 0, w - 1), y1 = clamp(y0 + 1, 0, h - 1);
    x0 = clamp(x0, 0, w - 1); y0 = clamp(y0, 0, h - 1);
    const o = this.off;
    const a = o[y0 * w + x0], b = o[y0 * w + x1], c = o[y1 * w + x0], d = o[y1 * w + x1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  getChunk(z, cx, cy, allowGen) {
    const key = z + ':' + cx + ':' + cy;
    let c = this.cache.get(key);
    if (c) return c;
    if (!allowGen) return null;
    c = this.genChunk(z, cx, cy);
    this.cache.set(key, c); this.order.push(key);
    if (this.order.length > 260) { const k = this.order.shift(); this.cache.delete(k); }
    return c;
  }

  genChunk(z, cx, cy) {
    const ts = TILE * z, S = this.seed;
    const N = CHUNK, P = N + 2;
    const ox = cx * N - 1, oy = cy * N - 1;
    const hgt = new Float32Array(P * P), col = new Float32Array(P * P * 3), tt = new Uint8Array(P * P);
    for (let y = 0; y < P; y++) {
      for (let x = 0; x < P; x++) {
        const u = (ox + x) / ts, v = (oy + y) / ts;
        const wu = u + (vnoise(u * 1.6, v * 1.6, S + 11) - 0.5) * 0.75;
        const wv = v + (vnoise(u * 1.6, v * 1.6, S + 23) - 0.5) * 0.75;
        const t = this.tAt(Math.floor(wu), Math.floor(wv));
        const base = this.offAt(u, v);
        const lo = fbm(u * 0.3, v * 0.3, S + 5, 3);
        let h = base + lo * 0.35, r, g, b;
        const i = y * P + x;
        switch (t) {
          case T_MEADOW: case T_CLOVER: {
            const blade = vnoise(u * 9 + v * 2, v * 34, S + 41), clump = fbm(u * 2.2, v * 2.2, S + 43, 2);
            const k = 0.62 + 0.55 * blade * (0.6 + clump * 0.6);
            const hue = vnoise(u * 0.5, v * 0.5, S + 47);
            r = (t === T_CLOVER ? 96 : 84 + hue * 50) * k; g = (128 + hue * 30) * k; b = (44 + hue * 8) * k;
            h += blade * 0.07 + clump * 0.05; break;
          }
          case T_LITTER: {
            const n = fbm(u * 3.2, v * 3.2, S + 51, 3), q = Math.floor(n * 9) % 4;
            const pal = [[138, 86, 40], [168, 112, 48], [106, 70, 38], [150, 120, 62]][q];
            const edge = Math.abs((n * 9) % 1 - 0.5) < 0.07 ? 0.65 : 1;
            const vein = vnoise(u * 18, v * 18, S + 53);
            const k = edge * (0.82 + vein * 0.25);
            r = pal[0] * k; g = pal[1] * k; b = pal[2] * k;
            h += n * 0.12 + (edge < 1 ? -0.02 : 0); break;
          }
          case T_SOIL: {
            const n = fbm(u * 4, v * 4, S + 61, 3), sp = hash2(ox + x, oy + y, S);
            const k = 0.78 + n * 0.35 + (sp > 0.93 ? 0.18 : sp < 0.05 ? -0.15 : 0);
            r = 118 * k; g = 84 * k; b = 56 * k; h += n * 0.08; break;
          }
          case T_SAND: {
            const rip = Math.sin((u * 5 + vnoise(u, v, S + 71) * 3) * Math.PI * 2) * 0.5 + 0.5;
            const gr = hash2(ox + x, oy + y, S + 3);
            const k = 0.86 + rip * 0.1 + gr * 0.1;
            r = 212 * k; g = 186 * k; b = 130 * k; h += rip * 0.03; break;
          }
          case T_ROCK: {
            const n = fbm(u * 1.8, v * 1.8, S + 81, 4), cr = ridge(u * 2.5, v * 2.5, S + 83, 2);
            const k = (0.7 + n * 0.45) * (cr > 0.86 ? 0.55 : 1);
            const tint = vnoise(u * 0.8, v * 0.8, S + 85) * 14;
            r = (122 + tint) * k; g = (120 + tint * 0.7) * k; b = (114) * k;
            h += n * 0.55 - (cr > 0.86 ? 0.05 : 0); break;
          }
          case T_FOREST: {
            const moss = fbm(u * 2.5, v * 2.5, S + 91, 3), n = vnoise(u * 12, v * 12, S + 93);
            const m = clamp((moss - 0.45) * 4, 0, 1), k = 0.75 + n * 0.35;
            r = lerp(70, 64, m) * k; g = lerp(52, 98, m) * k; b = lerp(34, 38, m) * k;
            h += moss * 0.1 + n * 0.04; break;
          }
          default: { // water
            const dep = clamp(-base * 1.7, 0, 1);
            const rp = vnoise(u * 6, v * 10, S + 101);
            r = lerp(96, 26, dep) + rp * 12; g = lerp(132, 70, dep) + rp * 14; b = lerp(130, 104, dep) + rp * 16;
            h = -0.1 + rp * 0.02;
          }
        }
        // damp shoreline
        if (t !== T_WATER && base < -0.12) { const wet = clamp((-0.12 - base) * 4, 0, 0.5); r *= 1 - wet; g *= 1 - wet * 0.9; b *= 1 - wet * 0.7; }
        hgt[i] = h; tt[i] = t; col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      }
    }
    const c = makeCanvas(N, N), g = c.getContext('2d');
    const img = g.createImageData(N, N), d = img.data;
    const K = ts * 0.9 * (this.flat ? 0.4 : 1);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (y + 1) * P + (x + 1);
      const dx = hgt[i - 1] - hgt[i + 1], dy = hgt[i - P] - hgt[i + P];
      let s = 1 + clamp((dx * 0.8 + dy * 1.0) * K, -0.55, 0.6);
      const o = (y * N + x) * 4;
      if (tt[i] === T_WATER) {
        const spec = Math.pow(clamp(s - 0.9, 0, 1) * 2.2, 3) * 120;
        d[o] = col[i * 3] + spec; d[o + 1] = col[i * 3 + 1] + spec; d[o + 2] = col[i * 3 + 2] + spec;
      } else {
        d[o] = col[i * 3] * s; d[o + 1] = col[i * 3 + 1] * s; d[o + 2] = col[i * 3 + 2] * s;
      }
      d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.decorate(g, z, cx, cy);
    return c;
  }

  // Hand-placed-looking detail: tufts, leaves, pebbles, roots, trees, flowers
  decorate(g, z, cx, cy) {
    const ts = TILE * z, S = this.seed;
    const x0 = Math.floor(cx * CHUNK / ts) - 3, y0 = Math.floor(cy * CHUNK / ts) - 3;
    const x1 = Math.ceil((cx + 1) * CHUNK / ts) + 3, y1 = Math.ceil((cy + 1) * CHUNK / ts) + 3;
    const { w, h } = this.st;
    g.save(); g.translate(-cx * CHUNK, -cy * CHUNK);
    // two passes: ground clutter, then tall objects (trees)
    for (let pass = 0; pass < 2; pass++) {
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
        const t = this.st.terrain[ty * w + tx];
        const rng = mulberry32((tx * 7919 + ty * 104729) ^ S);
        const px = tx * ts, py = ty * ts;
        if (pass === 0) this.clutter(g, t, rng, px, py, ts);
        else if (this.flat) continue;
        else if (t === T_FOREST && hash2(tx, ty, S + 777) < 0.045) this.tree(g, rng, px + ts / 2, py + ts / 2, ts);
        else if (t === T_ROCK && hash2(tx, ty, S + 778) < 0.12) this.boulder(g, rng, px + ts / 2, py + ts / 2, ts * (0.7 + rng() * 0.5));
      }
    }
    g.restore();
  }

  clutter(g, t, rng, px, py, ts) {
    const R = () => rng();
    switch (t) {
      case T_MEADOW: case T_CLOVER: {
        if (ts < 14) break;
        const n = t === T_CLOVER ? 3 : 4 + Math.floor(R() * 3);
        for (let i = 0; i < n; i++) this.tuft(g, px + R() * ts, py + R() * ts, ts * (0.18 + R() * 0.16), R);
        if (t === T_CLOVER) {
          const fl = 2 + Math.floor(R() * 3);
          const cols = ['#f4f1e6', '#f2d24a', '#b98ae0', '#f08bb0'];
          for (let i = 0; i < fl; i++) this.flower(g, px + R() * ts, py + R() * ts, ts * (0.08 + R() * 0.05), pick(R, cols), R);
          if (R() < 0.5) this.cloverLeaf(g, px + R() * ts, py + R() * ts, ts * 0.12);
        }
        break;
      }
      case T_LITTER: {
        const n = 1 + Math.floor(R() * 2);
        for (let i = 0; i < n; i++) this.leaf(g, px + R() * ts, py + R() * ts, ts * (0.3 + R() * 0.3), R() * Math.PI * 2, R);
        if (R() < 0.35) this.twig(g, px + R() * ts, py + R() * ts, ts * 0.8, R);
        break;
      }
      case T_SOIL: {
        const n = 1 + Math.floor(R() * 4);
        for (let i = 0; i < n; i++) this.pebble(g, px + R() * ts, py + R() * ts, ts * (0.05 + R() * 0.08), R);
        if (R() < 0.2) this.twig(g, px + R() * ts, py + R() * ts, ts * 0.6, R);
        break;
      }
      case T_SAND: {
        if (R() < 0.5) this.pebble(g, px + R() * ts, py + R() * ts, ts * (0.04 + R() * 0.07), R, [190, 170, 140]);
        if (R() < 0.08) this.shell(g, px + R() * ts, py + R() * ts, ts * 0.14);
        break;
      }
      case T_ROCK: {
        const n = 2 + Math.floor(R() * 3);
        for (let i = 0; i < n; i++) this.pebble(g, px + R() * ts, py + R() * ts, ts * (0.08 + R() * 0.14), R);
        break;
      }
      case T_FOREST: {
        if (R() < 0.55) this.root(g, px + R() * ts, py + R() * ts, ts, R);
        if (R() < 0.18) this.mushroom(g, px + R() * ts, py + R() * ts, ts * (0.12 + R() * 0.1), R);
        if (R() < 0.4) this.leaf(g, px + R() * ts, py + R() * ts, ts * 0.28, R() * 6.28, R);
        break;
      }
      case T_WATER: {
        if (R() < 0.04) this.leaf(g, px + R() * ts, py + R() * ts, ts * 0.35, R() * 6.28, R, true);
        break;
      }
    }
  }
  tuft(g, x, y, s, R) {
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = Math.max(1, s * 0.12);
    g.beginPath(); g.ellipse(x + s * 0.2, y + s * 0.1, s * 0.5, s * 0.18, 0, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (R() - 0.5) * 1.6, l = s * (0.7 + R() * 0.6);
      const grd = g.createLinearGradient(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l);
      grd.addColorStop(0, '#2f4d18'); grd.addColorStop(1, R() < 0.5 ? '#a9d466' : '#7fb447');
      g.strokeStyle = grd; g.lineWidth = Math.max(1, s * 0.13);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + s * 0.15, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  }
  flower(g, x, y, r, col, R) {
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.arc(x + r * 0.4, y + r * 0.5, r * 1.2, 0, 6.28); g.fill();
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * 6.28 + R();
      const grd = g.createRadialGradient(x + Math.cos(a) * r * 0.7 - r * 0.2, y + Math.sin(a) * r * 0.7 - r * 0.2, 0, x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.7);
      grd.addColorStop(0, '#fff'); grd.addColorStop(1, col);
      g.fillStyle = grd; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.55, 0, 6.28); g.fill();
    }
    g.fillStyle = '#e8a91c'; g.beginPath(); g.arc(x, y, r * 0.4, 0, 6.28); g.fill();
  }
  cloverLeaf(g, x, y, r) {
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * 6.28 - 1.57;
      const grd = g.createRadialGradient(x + Math.cos(a) * r - r * 0.2, y + Math.sin(a) * r - r * 0.3, 0, x + Math.cos(a) * r, y + Math.sin(a) * r, r);
      grd.addColorStop(0, '#8fd060'); grd.addColorStop(1, '#3c6e22');
      g.fillStyle = grd; g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.8, 0, 6.28); g.fill();
    }
  }
  leaf(g, x, y, s, a, R, floating) {
    const cols = floating ? ['#6f8e3a'] : ['#b5652a', '#d49a3a', '#8a4e22', '#c98a2e', '#9c7a3a', '#7a5a2a'];
    const c = pick(R, cols);
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(s * 0.12, s * 0.12, s, s * 0.45, 0, 0, 6.28); g.fill();
    const grd = g.createLinearGradient(0, -s * 0.45, 0, s * 0.45);
    grd.addColorStop(0, shade(c, 1.3)); grd.addColorStop(0.5, c); grd.addColorStop(1, shade(c, 0.65));
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(0, -s * 0.9, s, 0); g.quadraticCurveTo(0, s * 0.9, -s, 0); g.fill();
    g.strokeStyle = shade(c, 0.6); g.lineWidth = Math.max(0.8, s * 0.06);
    g.beginPath(); g.moveTo(-s * 1.15, 0); g.lineTo(s * 0.95, 0); g.stroke();
    g.lineWidth = Math.max(0.5, s * 0.03);
    for (let i = -3; i <= 3; i++) {
      if (!i) continue;
      g.beginPath(); g.moveTo(i * s * 0.22, 0); g.lineTo(i * s * 0.22 + s * 0.2, -s * 0.3); g.moveTo(i * s * 0.22, 0); g.lineTo(i * s * 0.22 + s * 0.2, s * 0.3); g.stroke();
    }
    g.restore();
  }
  twig(g, x, y, l, R) {
    const a = R() * 6.28, ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = Math.max(1.5, l * 0.1);
    g.beginPath(); g.moveTo(x + 2, y + 2); g.lineTo(ex + 2, ey + 2); g.stroke();
    g.strokeStyle = '#5e4128'; g.lineWidth = Math.max(1.2, l * 0.08);
    g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
    g.strokeStyle = '#9b7550'; g.lineWidth = Math.max(0.5, l * 0.025);
    g.beginPath(); g.moveTo(x - 0.5, y - 0.8); g.lineTo(ex - 0.5, ey - 0.8); g.stroke();
  }
  pebble(g, x, y, r, R, tint) {
    const base = tint || [128 + R() * 30, 122 + R() * 26, 112 + R() * 20];
    const ry = r * (0.6 + R() * 0.3);
    g.fillStyle = 'rgba(0,0,0,0.32)'; g.beginPath(); g.ellipse(x + r * 0.35, y + r * 0.35, r, ry, 0, 0, 6.28); g.fill();
    const grd = g.createRadialGradient(x - r * 0.35, y - ry * 0.45, r * 0.1, x, y, r * 1.05);
    grd.addColorStop(0, rgbStr(base.map(v => Math.min(255, v * 1.45))));
    grd.addColorStop(0.55, rgbStr(base)); grd.addColorStop(1, rgbStr(base.map(v => v * 0.45)));
    g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, r, ry, 0, 0, 6.28); g.fill();
  }
  shell(g, x, y, r) {
    const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    grd.addColorStop(0, '#fff8ee'); grd.addColorStop(1, '#c8a88a');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
    g.strokeStyle = 'rgba(120,80,60,0.6)'; g.lineWidth = 1;
    g.beginPath(); for (let a = 0; a < 12; a += 0.3) { const rr = r * a / 12; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.stroke();
  }
  root(g, x, y, ts, R) {
    const a = R() * 6.28, l = ts * (0.8 + R() * 0.8);
    const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l;
    const mx = (x + ex) / 2 + (R() - 0.5) * ts * 0.6, my = (y + ey) / 2 + (R() - 0.5) * ts * 0.6;
    const wd = ts * (0.05 + R() * 0.07);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = wd * 1.3;
    g.beginPath(); g.moveTo(x + wd * 0.5, y + wd * 0.6); g.quadraticCurveTo(mx + wd * 0.5, my + wd * 0.6, ex + wd * 0.5, ey + wd * 0.6); g.stroke();
    g.strokeStyle = '#4c3420'; g.lineWidth = wd;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
    g.strokeStyle = 'rgba(170,130,90,0.55)'; g.lineWidth = wd * 0.3;
    g.beginPath(); g.moveTo(x - wd * 0.2, y - wd * 0.25); g.quadraticCurveTo(mx - wd * 0.2, my - wd * 0.25, ex - wd * 0.2, ey - wd * 0.25); g.stroke();
  }
  mushroom(g, x, y, r, R) {
    const col = pick(R, ['#c4472c', '#b98a4e', '#e0c79a', '#8a5a3a']);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x + r * 0.5, y + r * 0.5, r * 1.1, r * 0.9, 0, 0, 6.28); g.fill();
    const grd = g.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    grd.addColorStop(0, shade(col, 1.5)); grd.addColorStop(0.7, col); grd.addColorStop(1, shade(col, 0.5));
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
    if (col === '#c4472c') {
      g.fillStyle = 'rgba(255,250,235,0.9)';
      for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x + (R() - 0.5) * r * 1.2, y + (R() - 0.5) * r * 1.2, r * 0.13, 0, 6.28); g.fill(); }
    }
  }
  boulder(g, rng, x, y, r) {
    g.save(); g.filter = `blur(${Math.max(1, r * 0.12)}px)`;
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(x + r * 0.35, y + r * 0.35, r * 0.95, r * 0.7, 0.3, 0, 6.28); g.fill();
    g.restore();
    const base = [140 + rng() * 25, 136 + rng() * 20, 126 + rng() * 15];
    const grd = g.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.05, x, y, r);
    grd.addColorStop(0, rgbStr(base.map(v => Math.min(255, v * 1.5))));
    grd.addColorStop(0.5, rgbStr(base)); grd.addColorStop(1, rgbStr(base.map(v => v * 0.4)));
    g.fillStyle = grd;
    g.beginPath();
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, rr = r * (0.8 + rng() * 0.25); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8); }
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(80,110,60,0.35)';
    g.beginPath(); g.ellipse(x + r * 0.2, y + r * 0.25, r * 0.35, r * 0.2, 0.4, 0, 6.28); g.fill();
  }
  tree(g, rng, x, y, ts) {
    const r = ts * (0.55 + rng() * 0.35);
    // dappled canopy shade
    g.save(); g.filter = `blur(${r * 0.5}px)`;
    g.fillStyle = 'rgba(10,20,5,0.28)'; g.beginPath(); g.arc(x + r * 0.6, y + r * 0.6, r * 2.6, 0, 6.28); g.fill(); g.restore();
    // buttress roots: tapered, shaded
    const nr = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < nr; i++) {
      const a = i / nr * 6.28 + rng() * 0.6, l = r * (1.9 + rng() * 1.2), wd = r * (0.35 + rng() * 0.15);
      const bend = (rng() - 0.5) * 0.8;
      const ex = x + Math.cos(a + bend) * l, ey = y + Math.sin(a + bend) * l;
      const mx = x + Math.cos(a + bend * 0.3) * l * 0.5, my = y + Math.sin(a + bend * 0.3) * l * 0.5;
      const nx = -Math.sin(a), ny = Math.cos(a);
      const poly = (off, w0) => {
        g.beginPath();
        g.moveTo(x + nx * w0 + off, y + ny * w0 + off);
        g.quadraticCurveTo(mx + nx * w0 * 0.5 + off, my + ny * w0 * 0.5 + off, ex + off, ey + off);
        g.quadraticCurveTo(mx - nx * w0 * 0.5 + off, my - ny * w0 * 0.5 + off, x - nx * w0 + off, y - ny * w0 + off);
        g.closePath(); g.fill();
      };
      g.fillStyle = 'rgba(0,0,0,0.4)'; poly(r * 0.12, wd);
      const gr = g.createLinearGradient(x - nx * wd, y - ny * wd, x + nx * wd, y + ny * wd);
      gr.addColorStop(0, '#2e2014'); gr.addColorStop(0.45, '#6e5236'); gr.addColorStop(1, '#3a2818');
      g.fillStyle = gr; poly(0, wd);
    }
    // trunk with bark ridges
    g.save(); g.filter = `blur(${r * 0.12}px)`;
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(x + r * 0.25, y + r * 0.3, r * 1.02, 0, 6.28); g.fill(); g.restore();
    const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    grd.addColorStop(0, '#7d6044'); grd.addColorStop(0.75, '#4e3824'); grd.addColorStop(1, '#2a1c10');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const a = rng() * 6.28, r0 = r * (0.15 + rng() * 0.45), r1 = r * (0.7 + rng() * 0.28);
      g.strokeStyle = rng() < 0.6 ? 'rgba(25,15,6,0.55)' : 'rgba(170,135,95,0.3)'; g.lineWidth = Math.max(1, r * 0.05);
      g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a + 0.08) * r1, y + Math.sin(a + 0.08) * r1); g.stroke();
    }
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(${90 + rng() * 40},${130 + rng() * 40},50,0.45)`;
      g.beginPath(); g.ellipse(x + (rng() - 0.6) * r, y + (rng() - 0.6) * r, r * (0.15 + rng() * 0.2), r * 0.1, rng() * 3, 0, 6.28); g.fill();
    }
  }

  // Draw visible terrain. camX/camY are in zoomed world pixels.
  draw(ctx, z, camX, camY, vw, vh, genBudget) {
    const ts = TILE * z;
    const { w, h } = this.st;
    const cx0 = Math.max(0, Math.floor(camX / CHUNK)), cy0 = Math.max(0, Math.floor(camY / CHUNK));
    const cx1 = Math.min(Math.ceil(w * ts / CHUNK) - 1, Math.floor((camX + vw) / CHUNK));
    const cy1 = Math.min(Math.ceil(h * ts / CHUNK) - 1, Math.floor((camY + vh) / CHUNK));
    // fallback layer
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mini, -camX, -camY, w * ts, h * ts);
    let budget = genBudget;
    const t0 = performance.now();
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      let c = this.getChunk(z, cx, cy, false);
      if (!c && budget > 0 && performance.now() - t0 < 35) { c = this.getChunk(z, cx, cy, true); budget--; }
      if (c) ctx.drawImage(c, cx * CHUNK - camX, cy * CHUNK - camY);
    }
  }
  pregen(z, camX, camY, vw, vh) {   // build all visible chunks immediately
    const ts = TILE * z, { w, h } = this.st;
    for (let cy = Math.max(0, Math.floor(camY / CHUNK)); cy <= Math.min(Math.ceil(h * ts / CHUNK) - 1, Math.floor((camY + vh) / CHUNK)); cy++)
      for (let cx = Math.max(0, Math.floor(camX / CHUNK)); cx <= Math.min(Math.ceil(w * ts / CHUNK) - 1, Math.floor((camX + vw) / CHUNK)); cx++)
        this.getChunk(z, cx, cy, true);
  }
}
