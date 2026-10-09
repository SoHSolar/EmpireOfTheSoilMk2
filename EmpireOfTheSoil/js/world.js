// =====================================================================
//  World simulation: map, colonies, economy, swarms, battles, AI, trade
// =====================================================================
'use strict';

const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// ---------------------------------------------------------------------
//  Creation
// ---------------------------------------------------------------------
function newGame(opts) {
  const size = MAP_SIZES[opts.sizeKey];
  const seed = opts.seed ?? ((Math.random() * 1e9) | 0);
  const st = {
    version: 1, seed, w: size.w, h: size.h, sizeKey: opts.sizeKey, difficulty: opts.difficulty,
    turn: 0, nextId: 1, colonies: [], swarms: [], routes: [], features: [], log: [], popups: [],
    playerId: 0, gameOver: null, pendingBattles: [], rngState: seed ^ 0x5bd1e995,
  };
  genMap(st);
  placeColonies(st, opts);
  spawnInitialFeatures(st);
  recompute(st);
  logMsg(st, `The queen of ${playerCol(st).name} seals her founding chamber. Her first brood is hatching.`, '#f2c14e');
  logMsg(st, 'Explore with swarms, claim land with outposts, and build your nest from the Colony view.', '#cfc3a8');
  return st;
}
function rnd(st) {   // deterministic, save-able RNG
  st.rngState = (st.rngState + 0x6D2B79F5) | 0;
  let t = st.rngState;
  t = Math.imul(t ^ t >>> 15, 1 | t);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function nid(st) { return st.nextId++; }
function idx(st, x, y) { return y * st.w + x; }
function inMap(st, x, y) { return x >= 0 && y >= 0 && x < st.w && y < st.h; }
function terrainAt(st, x, y) { return st.terrain[y * st.w + x]; }
function colById(st, id) { return st.colonies.find(c => c.id === id); }
function playerCol(st) { return colById(st, st.playerId); }
function logMsg(st, text, color = '#e8dcc0') {
  st.log.push({ turn: st.turn, text, color });
  if (st.log.length > 200) st.log.shift();
}
function popup(st, p) { st.popups.push(p); }

function percentile(arr, p) {
  const s = Float32Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

function genMap(st) {
  const { w, h, seed } = st, n = w * h;
  const E = new Float32Array(n), M = new Float32Array(n), D = new Float32Array(n), R = new Float32Array(n);
  const sc = 0.055 * Math.sqrt(100 / Math.max(w, 60)) * 1.15;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    E[i] = fbm(x * sc, y * sc, seed + 1, 5);
    M[i] = fbm(x * sc * 0.9 + 40, y * sc * 0.9, seed + 2, 4);
    D[i] = fbm(x * sc * 2, y * sc * 2, seed + 3, 3);
    R[i] = ridge(x * sc * 0.55, y * sc * 0.55, seed + 4, 2);
  }
  const eWater = percentile(E, 0.07), eRock = percentile(E, 0.93), rStream = percentile(R, 0.955);
  const mForest = percentile(M, 0.78), mSand = percentile(M, 0.16);
  const dHi = percentile(D, 0.70), dLo = percentile(D, 0.28);
  const T = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let t;
    if (E[i] < eWater) t = T_WATER;
    else if (R[i] > rStream && E[i] < percentile_cache(E, 0.75, st)) t = T_WATER;
    else if (E[i] > eRock) t = T_ROCK;
    else if (M[i] > mForest) t = T_FOREST;
    else if (M[i] < mSand) t = T_SAND;
    else if (D[i] > dHi) t = M[i] > 0.5 ? T_LITTER : T_CLOVER;
    else if (D[i] < dLo) t = T_SOIL;
    else t = T_MEADOW;
    T[i] = t;
  }
  // Clean single-tile noise
  for (let pass = 0; pass < 2; pass++) for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, cnt = {};
    for (const [dx, dy] of DIRS8) { const t = T[i + dy * w + dx]; cnt[t] = (cnt[t] || 0) + 1; }
    if (!cnt[T[i]]) { let best = T[i], bc = 0; for (const k in cnt) if (cnt[k] > bc) { bc = cnt[k]; best = +k; } T[i] = best; }
  }
  st.terrain = T;
  // Largest connected land region
  const reg = new Int32Array(n).fill(-1); let best = -1, bestSize = 0, rid = 0;
  for (let i = 0; i < n; i++) {
    if (reg[i] >= 0 || !TERRAIN[T[i]].pass) continue;
    const q = [i]; reg[i] = rid; let size = 0;
    while (q.length) {
      const c = q.pop(); size++;
      const cx = c % w, cy = (c / w) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + DIRS8[k][0], ny = cy + DIRS8[k][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (reg[j] < 0 && TERRAIN[T[j]].pass) { reg[j] = rid; q.push(j); }
      }
    }
    if (size > bestSize) { bestSize = size; best = rid; }
    rid++;
  }
  st.mainRegion = best; st._reg = reg;
  st.landTiles = bestSize;
  st.explored = new Uint8Array(n);
}
const _pc = {};
function percentile_cache(arr, p, st) { const k = st.seed + ':' + p; if (_pc[k] === undefined) _pc[k] = percentile(arr, p); return _pc[k]; }

function placeColonies(st, opts) {
  const size = MAP_SIZES[st.sizeKey], { w, h } = st;
  const rng = mulberry32(st.seed + 99);
  const cands = [];
  for (let y = 4; y < h - 4; y++) for (let x = 4; x < w - 4; x++) {
    const i = y * w + x;
    if (st._reg[i] !== st.mainRegion) continue;
    let ok = true;
    for (const [dx, dy] of DIRS8) if (!TERRAIN[st.terrain[i + dy * w + dx]].pass) { ok = false; break; }
    if (ok && st.terrain[i] !== T_ROCK) cands.push([x, y]);
  }
  const sites = [];
  const first = cands[Math.floor(rng() * cands.length)];
  sites.push(first);
  for (let k = 0; k < size.rivals; k++) {
    let bestC = null, bestD = -1;
    for (let s = 0; s < 400; s++) {
      const c = cands[Math.floor(rng() * cands.length)];
      let md = 1e9; for (const p of sites) md = Math.min(md, dist(c[0], c[1], p[0], p[1]));
      if (md > bestD) { bestD = md; bestC = c; }
    }
    sites.push(bestC);
  }
  const names = shuffle(rng, COLONY_NAMES.slice());
  const pool = shuffle(rng, SPECIES_KEYS.filter(s => s !== opts.species));
  const diff = DIFFICULTY[st.difficulty];
  for (let k = 0; k < sites.length; k++) {
    const isP = k === 0;
    const sp = isP ? opts.species : pool[(k - 1) % pool.length];
    const name = isP ? (opts.name || 'Your Colony') : names[k % names.length];
    const boost = isP ? 1 : (0.9 + rng() * 0.6) * diff.ai;
    const c = makeColony(st, sp, name, COLONY_COLORS[k % COLONY_COLORS.length], sites[k][0], sites[k][1], isP, boost, rng);
    if (isP) st.playerId = c.id;
  }
  // initial relations
  for (const a of st.colonies) for (const b of st.colonies) if (a !== b) {
    if (!a.rel[b.id]) {
      const sc = Math.round((rng() - 0.5) * 20);
      a.rel[b.id] = { status: 'peace', score: sc, warTurns: 0 };
      b.rel[a.id] = { status: 'peace', score: sc, warTurns: 0 };
    }
  }
}

function makeColony(st, species, name, color, x, y, isPlayer, boost, rng) {
  const sp = SPECIES[species];
  const ch = { royal: 1, nursery: 1, galleries: 1, granary: 0, barracks: 0, archive: 0, fungus: 0, aphids: 0, midden: 0, gates: 0 };
  Object.assign(ch, sp.startChambers || {});
  const c = {
    id: nid(st), name, species, color, isPlayer, alive: true, nest: { x, y }, outposts: [],
    food: 40 * boost, materials: 25 * boost, rp: 0, tech: null, techs: (sp.startTechs || []).slice(),
    chambers: ch, builds: [], brood: [{ caste: 'worker', left: 2, n: Math.round(8 * boost) }, { caste: 'worker', left: 1, n: Math.round(4 * boost) }],
    adults: { worker: Math.round(14 * boost), soldier: Math.round(3 * boost), major: 0, scout: 0 },
    jobs: { forage: 0.55, build: 0.25, nurse: 0.1, research: 0.1 },
    mix: { worker: 0.85, soldier: 0.15, major: 0, scout: 0 },
    rel: {}, met: {}, last: {}, starving: 0,
    stats: { kills: 0, losses: 0, peakPop: 0, battlesWon: 0, battlesLost: 0 },
    ai: { aggr: 0.3 + (rng ? rng() : Math.random()) * 0.7, cooldown: 4 + Math.floor((rng ? rng() : Math.random()) * 6) },
  };
  if (!isPlayer && boost > 1.2) { c.chambers.granary = 1; c.adults.worker += 10; }
  st.colonies.push(c);
  return c;
}

function spawnInitialFeatures(st) {
  const n = Math.round(st.w * st.h / 70);
  for (let i = 0; i < n; i++) spawnFeature(st, rnd(st) < 0.55 ? 'aphids' : 'seeds');
  for (let i = 0; i < n / 2; i++) spawnFeature(st, pick(() => rnd(st), ['fruit', 'carcass', 'fruit']));
}
function spawnFeature(st, type, nearCol) {
  for (let tries = 0; tries < 30; tries++) {
    let x, y;
    if (nearCol) {
      const s = nearCol.nest; x = s.x + Math.round((rnd(st) - 0.5) * 8); y = s.y + Math.round((rnd(st) - 0.5) * 8);
    } else { x = Math.floor(rnd(st) * st.w); y = Math.floor(rnd(st) * st.h); }
    if (!inMap(st, x, y) || !TERRAIN[terrainAt(st, x, y)].pass) continue;
    if (st.features.some(f => f.x === x && f.y === y)) continue;
    if (siteAt(st, x, y)) continue;
    const F = FEATURES[type];
    const f = { x, y, type, food: F.food, ttl: F.ttl ? F.ttl + Math.floor(rnd(st) * 4) : 0 };
    st.features.push(f); return f;
  }
  return null;
}

// ---------------------------------------------------------------------
//  Derived statistics
// ---------------------------------------------------------------------
function has(c, t) { return c.techs.includes(t); }
function cstats(st, c) {
  const m = speciesMods(c.species);
  if (has(c, 'trails')) m.forage *= 1.2;
  if (has(c, 'mandibles')) m.atk *= 1.15;
  if (has(c, 'venom')) m.atk *= 1.2;
  if (has(c, 'armour')) m.hp *= 1.2;
  if (has(c, 'swarm_tactics')) m.move += 1;
  if (has(c, 'seed_caching')) { m.storage *= 1.4; m.winter *= 1.5; }
  m.territory = has(c, 'tandem') ? 1.3 : 1;
  m.attrition = has(c, 'trophallaxis') ? 0.5 : 1;
  if (has(c, 'trophallaxis')) m.upkeep *= 0.85;
  m.flood = has(c, 'ventilation') || m.swim;
  m.mortality = 3 - (has(c, 'ventilation') ? 0.5 : 0) - (c.chambers.midden ? CHAMBERS.midden.values[c.chambers.midden - 1] : 0);
  if (has(c, 'fortification')) m.defense *= 1.25;
  if (has(c, 'chem_diplomacy')) m.trade *= 1.5;
  if (has(c, 'polygyny')) m.lay *= 1.4;
  if (has(c, 'supercolony')) { for (const k of ['atk', 'hp', 'lay', 'forage', 'build', 'research', 'defense', 'trade']) m[k] *= 1.15; }
  if (!c.isPlayer) { const d = DIFFICULTY[st.difficulty].ai; m.forage *= d; m.research *= d; m.build *= d; }
  m.maxOutposts = 1 + (has(c, 'satellite') ? 2 : 0) + (has(c, 'nuptial') ? 2 : 0) + (has(c, 'supercolony') ? 3 : 0);
  m.buildSlots = has(c, 'parallel_dig') ? 2 : 1;
  m.maxLevel = has(c, 'deep_excavation') ? 5 : 3;
  m.outpostR = has(c, 'nuptial') ? 3 : 2;
  m.maxRoutes = 1 + Math.floor(c.chambers.royal / 2) + (has(c, 'chem_diplomacy') ? 1 : 0);
  return m;
}
function seasonIdx(turn) { return Math.floor(turn / TURNS_PER_SEASON) % 4; }
function season(turn) { return SEASONS[seasonIdx(turn)]; }
function yearOf(turn) { return Math.floor(turn / TURNS_PER_YEAR) + 1; }
function dateStr(turn) { return `${season(turn).name}, Year ${yearOf(turn)} (week ${(turn % TURNS_PER_SEASON) * 2 + 1})`; }
function seasonalForage(S, turn) {
  const base = season(turn).forage;
  if (base >= 1) return base;
  return clamp(1 - (1 - base) / S.winter, 0.05, 1);
}
function chVal(c, key) { const l = c.chambers[key] || 0; return l ? CHAMBERS[key].values[l - 1] : 0; }
function storageCap(st, c) { const S = cstats(st, c); return Math.round((80 + chVal(c, 'granary')) * S.storage); }
function popCap(st, c) { const S = cstats(st, c); return Math.round((10 + chVal(c, 'galleries') + chVal(c, 'barracks') + c.outposts.length * 25) * S.cap); }
function sumUnits(u) { return (u.worker || 0) + (u.soldier || 0) + (u.major || 0) + (u.scout || 0); }
function broodCount(c) { return c.brood.reduce((a, b) => a + b.n, 0); }
function colonySwarms(st, c) { return st.swarms.filter(s => s.owner === c.id); }
function totalUnits(st, c) {
  const t = Object.assign({}, c.adults);
  for (const s of colonySwarms(st, c)) for (const k of CASTE_KEYS) t[k] += s.units[k] || 0;
  for (const o of c.outposts) for (const k of CASTE_KEYS) t[k] += o.units[k] || 0;
  return t;
}
function population(st, c) { return sumUnits(totalUnits(st, c)); }
function upkeepOf(units) { let u = 0; for (const k of CASTE_KEYS) u += (units[k] || 0) * CASTES[k].upkeep; return u; }
function casteUnlocked(c, k) { return !CASTES[k].req || has(c, CASTES[k].req); }

function unitStats(st, c, k) {
  const S = cstats(st, c);
  return { atk: CASTES[k].atk * S.atk, hp: CASTES[k].hp * S.hp };
}
// Lanchester-style power estimate
function power(st, c, units, hpMult = 1) {
  let A = 0, Hh = 0;
  for (const k of CASTE_KEYS) {
    const n = units[k] || 0; if (!n) continue;
    const s = unitStats(st, c, k); A += n * s.atk; Hh += n * s.hp * hpMult;
  }
  return Math.sqrt(A * Hh);
}
function nestDefMult(st, c) {
  const S = cstats(st, c);
  return S.defense * (1.35 + chVal(c, 'gates') + (c.chambers.barracks || 0) * 0.1);
}
function militaryPower(st, c) {
  const t = totalUnits(st, c);
  return power(st, c, t);
}

// ---------------------------------------------------------------------
//  Territory & visibility
// ---------------------------------------------------------------------
function sitesOf(c, S) {
  const r = 3 + (c.chambers.royal >= 3 ? 1 : 0) + (c.chambers.royal >= 5 ? 1 : 0);
  const out = [{ x: c.nest.x, y: c.nest.y, r, nest: true }];
  for (const o of c.outposts) out.push({ x: o.x, y: o.y, r: S.outpostR, nest: false });
  return out;
}
function recompute(st) {
  const { w, h } = st, n = w * h;
  const owner = new Int16Array(n).fill(-1), best = new Float32Array(n).fill(1e9);
  for (const c of st.colonies) {
    if (!c.alive) continue;
    const S = cstats(st, c);
    for (const s of sitesOf(c, S)) {
      for (let y = Math.max(0, s.y - s.r); y <= Math.min(h - 1, s.y + s.r); y++)
        for (let x = Math.max(0, s.x - s.r); x <= Math.min(w - 1, s.x + s.r); x++) {
          const d = dist(x, y, s.x, s.y) - (s.nest ? 0.5 : 0);
          if (d > s.r + 0.3) continue;
          const i = y * w + x;
          if (d < best[i]) { best[i] = d; owner[i] = c.id; }
        }
    }
  }
  st.owner = owner;
  // territory stats per colony
  for (const c of st.colonies) { c._tiles = 0; c._food = 0; c._mat = 0; }
  const S_cache = {};
  for (let i = 0; i < n; i++) {
    const o = owner[i]; if (o < 0) continue;
    const c = colById(st, o); if (!c) continue;
    const S = S_cache[o] || (S_cache[o] = cstats(st, c));
    const T = TERRAIN[st.terrain[i]];
    c._tiles++;
    c._food += T.food * (S.terrain[T.key] || 1);
    c._mat += T.mat;
  }
  for (const f of st.features) {
    const o = owner[idx(st, f.x, f.y)];
    if (o >= 0) { const c = colById(st, o); if (c) c._food += f.food; }
  }
  computeVisibility(st);
}
function computeVisibility(st) {
  const { w, h } = st, vis = new Uint8Array(w * h);
  const p = playerCol(st);
  const reveal = (cx, cy, r) => {
    for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++)
      for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++)
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r + r) vis[y * w + x] = 1;
  };
  if (p && p.alive) {
    const S = cstats(st, p);
    for (let i = 0; i < w * h; i++) if (st.owner[i] === p.id) vis[i] = 1;
    for (const s of sitesOf(p, S)) reveal(s.x, s.y, s.r + 1 + Math.max(0, S.vision));
    for (const sw of st.swarms) if (sw.owner === p.id) reveal(sw.x, sw.y, swarmVision(st, sw));
    // trade partners share their scent maps
    for (const r of st.routes) {
      const other = r.a === p.id ? r.b : r.b === p.id ? r.a : -1;
      if (other < 0) continue;
      for (const [x, y] of r.path) vis[y * w + x] = 1;
      const oc = colById(st, other); if (oc) reveal(oc.nest.x, oc.nest.y, 3);
    }
  }
  st.visible = vis;
  for (let i = 0; i < w * h; i++) if (vis[i]) st.explored[i] = 1;
  // meeting colonies
  if (p) for (const c of st.colonies) {
    if (c === p || p.met[c.id]) continue;
    let seen = vis[idx(st, c.nest.x, c.nest.y)];
    if (!seen) for (let i = 0; i < w * h && !seen; i++) if (vis[i] && st.owner[i] === c.id) seen = 1;
    if (!seen) for (const s of st.swarms) if (s.owner === c.id && vis[idx(st, s.x, s.y)]) { seen = 1; break; }
    if (seen) {
      p.met[c.id] = true; c.met[p.id] = true;
      logMsg(st, `Your ants have encountered the ${c.name} colony (${SPECIES[c.species].name}).`, c.color);
    }
  }
}

// ---------------------------------------------------------------------
//  Map queries
// ---------------------------------------------------------------------
function siteAt(st, x, y) {
  for (const c of st.colonies) {
    if (!c.alive) continue;
    if (c.nest.x === x && c.nest.y === y) return { kind: 'nest', col: c };
    for (const o of c.outposts) if (o.x === x && o.y === y) return { kind: 'outpost', col: c, outpost: o };
  }
  return null;
}
function swarmsAt(st, x, y) { return st.swarms.filter(s => s.x === x && s.y === y); }
function featureAt(st, x, y) { return st.features.find(f => f.x === x && f.y === y); }
function atWar(st, a, b) {
  if (a === b) return false;
  const ca = colById(st, a); return !!(ca && ca.rel[b] && ca.rel[b].status === 'war');
}
function stepCost(st, x, y, c) {
  const t = TERRAIN[terrainAt(st, x, y)];
  if (!t.pass) return c && cstats(st, c).swim ? 3 : Infinity;
  return t.move;
}

function findPath(st, sx, sy, tx, ty, col, opts = {}) {
  const { w, h } = st;
  if (!inMap(st, tx, ty)) return null;
  if (stepCost(st, tx, ty, col) === Infinity) return null;
  const swim = col ? cstats(st, col).swim : false;
  const maxN = opts.maxNodes || 40000;
  const start = sy * w + sx, goal = ty * w + tx;
  const g = new Map([[start, 0]]), came = new Map();
  const heap = new MinHeap(); heap.push(start, 0);
  let nodes = 0;
  const costAt = i => {
    const t = TERRAIN[st.terrain[i]];
    if (!t.pass) return swim ? 3 : Infinity;
    return t.move;
  };
  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (++nodes > maxN) return null;
    const cx = cur % w, cy = (cur / w) | 0, gc = g.get(cur);
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      let c = costAt(ni); if (c === Infinity) continue;
      if (dx && dy) {
        if (costAt(cy * w + nx) === Infinity || costAt(ny * w + cx) === Infinity) continue;
        c *= 1.4;
      }
      if (opts.avoid && opts.avoid(nx, ny) && ni !== goal) c += 20;
      const ng = gc + c;
      if (ng < (g.has(ni) ? g.get(ni) : Infinity)) {
        g.set(ni, ng); came.set(ni, cur);
        heap.push(ni, ng + Math.hypot(nx - tx, ny - ty));
      }
    }
  }
  if (!came.has(goal) && start !== goal) return null;
  const path = []; let c = goal;
  while (c !== start) { path.push([c % w, (c / w) | 0]); c = came.get(c); }
  path.reverse();
  return path;
}
function moveCostStep(st, fx, fy, tx, ty, col) {
  const c = stepCost(st, tx, ty, col);
  return (fx !== tx && fy !== ty) ? c * 1.4 : c;
}

// ---------------------------------------------------------------------
//  Swarms
// ---------------------------------------------------------------------
function swarmMaxMP(st, sw) {
  const c = colById(st, sw.owner), S = cstats(st, c);
  const u = sw.units, tot = sumUnits(u);
  let mp = 4 + S.move;
  if (u.scout && u.scout === tot) mp += 2; else if (u.scout >= tot * 0.2) mp += 1;
  if (u.major) mp -= 1;
  return Math.max(2, mp);
}
function swarmVision(st, sw) {
  const c = colById(st, sw.owner), S = cstats(st, c);
  return Math.max(1, 2 + S.vision + (sw.units.scout ? 2 : 0));
}
function createSwarm(st, c, units, x, y) {
  const sw = { id: nid(st), owner: c.id, x: x ?? c.nest.x, y: y ?? c.nest.y, units: { worker: 0, soldier: 0, major: 0, scout: 0 }, mp: 0, path: [], target: null, role: null };
  for (const k of CASTE_KEYS) sw.units[k] = units[k] || 0;
  sw.mp = swarmMaxMP(st, sw);
  st.swarms.push(sw);
  return sw;
}
function musterSwarm(st, c, units) {
  for (const k of CASTE_KEYS) if ((units[k] || 0) > c.adults[k]) return null;
  if (sumUnits(units) <= 0) return null;
  for (const k of CASTE_KEYS) c.adults[k] -= units[k] || 0;
  const sw = createSwarm(st, c, units);
  sw.mp = swarmMaxMP(st, sw);
  return sw;
}
function disbandSwarm(st, sw) {
  const c = colById(st, sw.owner);
  const site = siteAt(st, sw.x, sw.y);
  if (site && site.col === c) {
    const target = site.kind === 'nest' ? c.adults : site.outpost.units;
    for (const k of CASTE_KEYS) target[k] = (target[k] || 0) + sw.units[k];
  } else return false;
  st.swarms = st.swarms.filter(s => s !== sw);
  return true;
}
function withdrawGarrison(st, c, outpost) {
  const keep = { worker: Math.min(5, outpost.units.worker || 0) };
  const u = {}; for (const k of CASTE_KEYS) u[k] = (outpost.units[k] || 0) - (keep[k] || 0);
  if (sumUnits(u) <= 0) return null;
  for (const k of CASTE_KEYS) outpost.units[k] = keep[k] || 0;
  return createSwarm(st, c, u, outpost.x, outpost.y);
}
function removeSwarm(st, sw) { st.swarms = st.swarms.filter(s => s !== sw); }

function canFoundOutpost(st, sw) {
  const c = colById(st, sw.owner), S = cstats(st, c);
  if (sw.units.worker < 10) return 'Needs at least 10 workers in the swarm.';
  if (c.materials < 30) return 'Needs 30 materials.';
  if (c.outposts.length >= S.maxOutposts) return `Outpost limit reached (${S.maxOutposts}). Research Satellite Nests / Nuptial Flights.`;
  const t = TERRAIN[terrainAt(st, sw.x, sw.y)];
  if (!t.pass) return 'Cannot build on water.';
  const o = st.owner[idx(st, sw.x, sw.y)];
  if (o >= 0 && o !== c.id) return 'This land belongs to another colony.';
  for (const col of st.colonies) {
    if (!col.alive) continue;
    for (const s of sitesOf(col, cstats(st, col))) if (dist(s.x, s.y, sw.x, sw.y) < 4) return 'Too close to an existing nest.';
  }
  return null;
}
function foundOutpost(st, sw) {
  const err = canFoundOutpost(st, sw); if (err) return err;
  const c = colById(st, sw.owner);
  c.materials -= 30;
  c.outposts.push({ x: sw.x, y: sw.y, units: Object.assign({}, sw.units), founded: st.turn });
  removeSwarm(st, sw);
  recompute(st);
  logMsg(st, `${c.name} founded a satellite nest.`, c.color);
  return null;
}

// Move a swarm one tile. Returns {ok, battle?, blocked?}
function stepSwarm(st, sw, nx, ny) {
  const c = colById(st, sw.owner);
  const cost = moveCostStep(st, sw.x, sw.y, nx, ny, c);
  if (cost === Infinity) return { ok: false, blocked: 'impassable' };
  const full = swarmMaxMP(st, sw);
  if (sw.mp + 1e-6 < cost && sw.mp < full - 1e-6) return { ok: false, blocked: 'mp' };
  // what's there?
  const site = siteAt(st, nx, ny);
  const enemies = swarmsAt(st, nx, ny).filter(s => s.owner !== sw.owner);
  const hostile = enemies.find(s => atWar(st, sw.owner, s.owner));
  if (hostile) {
    sw.mp = 0;
    return { ok: true, battle: attackSwarm(st, sw, hostile) };
  }
  if (site && site.col.id !== sw.owner) {
    if (atWar(st, sw.owner, site.col.id)) {
      sw.mp = 0;
      return { ok: true, battle: site.kind === 'nest' ? attackNest(st, sw, site.col) : attackOutpost(st, sw, site.col, site.outpost) };
    }
    return { ok: false, blocked: 'peace', col: site.col };
  }
  if (enemies.length) {
    // not at war — can pass through only if not ending there; we allow stacking
  }
  sw.x = nx; sw.y = ny; sw.mp = Math.max(0, sw.mp - cost);
  // merge with friendly swarm
  const friend = swarmsAt(st, nx, ny).find(s => s !== sw && s.owner === sw.owner);
  if (friend && (!sw.path || sw.path.length === 0)) {
    for (const k of CASTE_KEYS) friend.units[k] += sw.units[k];
    friend.mp = Math.min(friend.mp, sw.mp);
    removeSwarm(st, sw);
    return { ok: true, merged: friend };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------
//  Combat
// ---------------------------------------------------------------------
function resolveBattle(st, A, D) {
  // A/D: {col, units, hpMult, label}
  const sides = [A, D].map((s, i) => {
    const enemy = i === 0 ? D : A;
    const st_ = {};
    for (const k of CASTE_KEYS) {
      const u = unitStats(st, s.col, k);
      let hp = u.hp * (s.hpMult || 1);
      if (has(enemy.col, 'chem_warfare')) hp *= 0.85;
      st_[k] = { atk: u.atk, hp };
    }
    return { units: Object.assign({ worker: 0, soldier: 0, major: 0, scout: 0 }, s.units), stats: st_, start: power(st, s.col, s.units, s.hpMult || 1) };
  });
  const rounds = [{ a: Object.assign({}, sides[0].units), d: Object.assign({}, sides[1].units) }];
  const shield = { worker: 0.6, soldier: 1.2, major: 1.4, scout: 0.7 };   // soldiers take the front line
  let winner = null;
  for (let r = 0; r < 7 && !winner; r++) {
    const dmg = sides.map((s, i) => {
      let d = 0; for (const k of CASTE_KEYS) d += s.units[k] * s.stats[k].atk;
      if (r === 0 && SPECIES[(i === 0 ? A : D).col.species] === SPECIES.wood) d *= 1.3;   // formic acid volley
      return d * (0.28 + rnd(st) * 0.1);
    });
    for (let i = 0; i < 2; i++) {
      const tgt = sides[1 - i];
      let weight = 0; for (const k of CASTE_KEYS) weight += tgt.units[k] * tgt.stats[k].hp * shield[k];
      if (weight <= 0) continue;
      for (const k of CASTE_KEYS) {
        if (!tgt.units[k]) continue;
        const share = tgt.units[k] * tgt.stats[k].hp * shield[k] / weight;
        let kills = dmg[i] * share / tgt.stats[k].hp;
        kills = Math.floor(kills) + (rnd(st) < kills % 1 ? 1 : 0);
        tgt.units[k] = Math.max(0, tgt.units[k] - kills);
      }
    }
    rounds.push({ a: Object.assign({}, sides[0].units), d: Object.assign({}, sides[1].units) });
    const pa = power(st, A.col, sides[0].units, A.hpMult || 1), pd = power(st, D.col, sides[1].units, D.hpMult || 1);
    if (pd <= 0.01) winner = 'atk';
    else if (pa <= 0.01) winner = 'def';
    else if (pa < sides[0].start * 0.35) winner = 'def';          // attackers break
    else if (pd < sides[1].start * 0.25 && !D.noRetreat) winner = 'atk';
  }
  if (!winner) winner = power(st, A.col, sides[0].units) / Math.max(1, sides[0].start) > power(st, D.col, sides[1].units) / Math.max(1, sides[1].start) ? 'atk' : 'def';
  const lossA = sumUnits(A.units) - sumUnits(sides[0].units), lossD = sumUnits(D.units) - sumUnits(sides[1].units);
  A.col.stats.kills += lossD; D.col.stats.kills += lossA; A.col.stats.losses += lossA; D.col.stats.losses += lossD;
  if (winner === 'atk') { A.col.stats.battlesWon++; D.col.stats.battlesLost++; } else { D.col.stats.battlesWon++; A.col.stats.battlesLost++; }
  return { rounds, winner, aEnd: sides[0].units, dEnd: sides[1].units, lossA, lossD };
}

function battleRecord(st, kind, atkCol, defCol, res, x, y, extra = {}) {
  const rec = Object.assign({ kind, atk: atkCol.id, def: defCol.id, x, y, terrain: terrainAt(st, x, y), rounds: res.rounds, winner: res.winner, lossA: res.lossA, lossD: res.lossD, turn: st.turn }, extra);
  if (atkCol.id === st.playerId || defCol.id === st.playerId) st.pendingBattles.push(rec);
  return rec;
}

function retreatTile(st, x, y, col) {
  const home = col.nest; let best = null, bd = 1e9;
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx, ny = y + dy;
    if (!inMap(st, nx, ny) || stepCost(st, nx, ny, col) === Infinity) continue;
    if (swarmsAt(st, nx, ny).some(s => s.owner !== col.id)) continue;
    const s = siteAt(st, nx, ny); if (s && s.col !== col) continue;
    const d = dist(nx, ny, home.x, home.y);
    if (d < bd) { bd = d; best = [nx, ny]; }
  }
  return best;
}

function attackSwarm(st, sw, target) {
  const A = colById(st, sw.owner), D = colById(st, target.owner);
  const tdef = TERRAIN[terrainAt(st, target.x, target.y)].def;
  const res = resolveBattle(st, { col: A, units: sw.units }, { col: D, units: target.units, hpMult: 1 + tdef });
  sw.units = res.aEnd; target.units = res.dEnd;
  const rec = battleRecord(st, 'field', A, D, res, target.x, target.y);
  if (res.winner === 'atk') {
    if (sumUnits(target.units) > 0) {
      const r = retreatTile(st, target.x, target.y, D);
      if (r) { target.x = r[0]; target.y = r[1]; target.mp = 0; } else removeSwarm(st, target);
    } else removeSwarm(st, target);
    const plunder = res.lossD * 0.5 * cstats(st, A).plunder;
    A.food = Math.min(storageCap(st, A), A.food + plunder);
    rec.plunder = plunder;
    if (sumUnits(sw.units) > 0 && !swarmsAt(st, target.x, target.y).some(s => s.owner !== sw.owner) && !siteAt(st, target.x, target.y)) {
      sw.x = target.x; sw.y = target.y;
    }
  } else if (sumUnits(target.units) <= 0) removeSwarm(st, target);
  if (sumUnits(sw.units) <= 0) removeSwarm(st, sw);
  if (sumUnits(target.units) <= 0) removeSwarm(st, target);
  logMsg(st, `Battle: ${A.name} ${res.winner === 'atk' ? 'routed' : 'was repelled by'} ${D.name}'s swarm (${res.lossA} vs ${res.lossD} ants lost).`, res.winner === 'atk' ? A.color : D.color);
  return rec;
}

function attackNest(st, sw, D) {
  const A = colById(st, sw.owner);
  const res = resolveBattle(st, { col: A, units: sw.units }, { col: D, units: D.adults, hpMult: nestDefMult(st, D), noRetreat: true });
  sw.units = res.aEnd; D.adults = Object.assign(D.adults, res.dEnd);
  const rec = battleRecord(st, 'nest', A, D, res, D.nest.x, D.nest.y);
  if (res.winner === 'atk') {
    const S = cstats(st, A);
    const plunder = D.food * 0.6 * S.plunder, captured = Math.round(broodCount(D) * (A.species === 'army' ? 0.8 : 0.4));
    A.food = Math.min(storageCap(st, A), A.food + plunder);
    sw.units.worker += captured;
    rec.plunder = plunder; rec.captured = captured;
    logMsg(st, `${A.name} stormed the nest of ${D.name}! The queen has fallen. ${captured} captured brood raised as workers.`, A.color);
    nestFallen(st, D, A);
  } else {
    logMsg(st, `${D.name} held its nest against ${A.name} (${res.lossA} attackers fell).`, D.color);
  }
  if (sumUnits(sw.units) <= 0) removeSwarm(st, sw);
  return rec;
}

function attackOutpost(st, sw, D, o) {
  const A = colById(st, sw.owner);
  const units = Object.assign({}, o.units);
  units.worker = (units.worker || 0) + 4;
  const res = resolveBattle(st, { col: A, units: sw.units }, { col: D, units, hpMult: 1.2 * cstats(st, D).defense, noRetreat: true });
  sw.units = res.aEnd;
  const rec = battleRecord(st, 'outpost', A, D, res, o.x, o.y);
  if (res.winner === 'atk') {
    D.outposts = D.outposts.filter(x => x !== o);
    const S = cstats(st, A);
    if (A.outposts.length < S.maxOutposts) {
      const g = { worker: Math.min(sw.units.worker, 8), soldier: Math.min(sw.units.soldier, 4) };
      sw.units.worker -= g.worker; sw.units.soldier -= g.soldier;
      A.outposts.push({ x: o.x, y: o.y, units: { worker: g.worker, soldier: g.soldier, major: 0, scout: 0 }, founded: st.turn });
      logMsg(st, `${A.name} captured an outpost of ${D.name}.`, A.color);
      rec.captured = 'outpost';
    } else logMsg(st, `${A.name} razed an outpost of ${D.name}.`, A.color);
    recompute(st);
  } else {
    o.units = res.dEnd; o.units.worker = Math.max(0, o.units.worker - 4);
    logMsg(st, `${D.name}'s outpost repelled ${A.name}.`, D.color);
  }
  if (sumUnits(sw.units) <= 0) removeSwarm(st, sw);
  return rec;
}

function nestFallen(st, D, by) {
  if (has(D, 'polygyny') && D.outposts.length) {
    // daughter queen takes over the largest outpost
    D.outposts.sort((a, b) => sumUnits(b.units) - sumUnits(a.units));
    const o = D.outposts.shift();
    D.nest = { x: o.x, y: o.y };
    D.adults = Object.assign({ worker: 0, soldier: 0, major: 0, scout: 0 }, o.units);
    D.adults.worker += 10;
    D.brood = []; D.food = 20; D.builds = [];
    for (const k of CHAMBER_KEYS) if (D.chambers[k] > 1) D.chambers[k] -= 1; else if (!['royal', 'nursery', 'galleries'].includes(k)) D.chambers[k] = 0;
    logMsg(st, `A daughter queen of ${D.name} survives and the colony relocates!`, D.color);
    if (D.isPlayer) popup(st, { title: 'The Queen is Dead - Long Live the Queen', text: 'Your home nest has fallen, but thanks to Polygyny a daughter queen in your largest outpost has taken over. The colony lives on, weakened.' });
    recompute(st);
    return;
  }
  D.alive = false;
  st.swarms = st.swarms.filter(s => s.owner !== D.id);
  st.routes = st.routes.filter(r => r.a !== D.id && r.b !== D.id);
  for (const c of st.colonies) if (c.rel[D.id]) c.rel[D.id].status = 'peace';
  if (D.isPlayer) {
    st.gameOver = { win: false, reason: `Your queen was slain by ${by ? by.name : 'enemies'}. The colony of ${D.name} is no more.` };
  }
  recompute(st);
}

// ---------------------------------------------------------------------
//  Diplomacy & trade
// ---------------------------------------------------------------------
function declareWar(st, a, b) {
  const A = colById(st, a), B = colById(st, b);
  A.rel[b].status = 'war'; B.rel[a].status = 'war';
  A.rel[b].warTurns = 0; B.rel[a].warTurns = 0;
  A.rel[b].score = Math.min(A.rel[b].score, -40); B.rel[a].score = Math.min(B.rel[a].score, -50);
  st.routes = st.routes.filter(r => !((r.a === a && r.b === b) || (r.a === b && r.b === a)));
  for (const c of st.colonies) if (c.alive && c.id !== a && c.id !== b && c.rel[a] && c.rel[b] && c.rel[b].status !== 'war') c.rel[a].score -= 5;
  logMsg(st, `${A.name} has declared war on ${B.name}!`, '#ff7a5c');
  if (b === st.playerId) popup(st, { title: 'War Declared!', text: `The ${A.name} colony (${SPECIES[A.species].name}) has declared war on you. Expect their swarms soon.`, col: A.color });
}
function makePeace(st, a, b) {
  const A = colById(st, a), B = colById(st, b);
  A.rel[b].status = 'peace'; B.rel[a].status = 'peace';
  A.rel[b].score = Math.max(A.rel[b].score, -10); B.rel[a].score = Math.max(B.rel[a].score, -10);
  A.rel[b].peaceTurn = st.turn; B.rel[a].peaceTurn = st.turn;
  logMsg(st, `${A.name} and ${B.name} have made peace.`, '#9fe0a0');
}
function routeBetween(st, a, b) { return st.routes.find(r => (r.a === a && r.b === b) || (r.a === b && r.b === a)); }
function routeCount(st, id) { return st.routes.filter(r => r.a === id || r.b === id).length; }
function canTrade(st, a, b) {
  const A = colById(st, a), B = colById(st, b);
  if (!A || !B || !A.alive || !B.alive) return 'Colony is gone.';
  if (atWar(st, a, b)) return 'You are at war.';
  if (routeBetween(st, a, b)) return 'A trade route already exists.';
  if (routeCount(st, a) >= cstats(st, A).maxRoutes) return `${A.name} has no free trade route slots (upgrade Royal Chamber or research Chemical Diplomacy).`;
  if (routeCount(st, b) >= cstats(st, B).maxRoutes) return `${B.name} has no free trade route slots.`;
  if (dist(A.nest.x, A.nest.y, B.nest.x, B.nest.y) > 70) return 'Too far away for a trail.';
  return null;
}
function createRoute(st, a, b) {
  const A = colById(st, a), B = colById(st, b);
  const path = findPath(st, A.nest.x, A.nest.y, B.nest.x, B.nest.y, null, { maxNodes: 60000 });
  if (!path) return 'No land path between the nests.';
  st.routes.push({ id: nid(st), a, b, path: [[A.nest.x, A.nest.y], ...path], len: path.length, blocked: false });
  A.rel[b].score += 10; B.rel[a].score += 10;
  logMsg(st, `A trade trail now links ${A.name} and ${B.name}.`, '#ffd27a');
  return null;
}
function routeIncome(st, r, forId) {
  const me = colById(st, forId), other = colById(st, forId === r.a ? r.b : r.a);
  const S = cstats(st, me);
  const otherPop = population(st, other);
  const f = (2 + r.len * 0.12) * S.trade * clamp(otherPop / 80, 0.5, 2.2) * (1 + (me.chambers.aphids || 0) * 0.1);
  return { food: f, rp: 0.5 + r.len * 0.03 };
}
function updateRouteBlocks(st) {
  for (const r of st.routes) {
    r.blocked = false;
    const set = new Set(r.path.map(([x, y]) => y * st.w + x));
    for (const s of st.swarms) {
      if ((atWar(st, s.owner, r.a) || atWar(st, s.owner, r.b)) && set.has(s.y * st.w + s.x)) { r.blocked = true; r.blocker = s.owner; break; }
    }
  }
}
function proposeTrade(st, b) {      // player -> AI
  const p = playerCol(st), B = colById(st, b);
  const err = canTrade(st, p.id, b); if (err) return { ok: false, msg: err };
  if (B.rel[p.id].score < -15) return { ok: false, msg: `${B.name} rejects your offer. (Relations too poor)` };
  const e = createRoute(st, p.id, b);
  if (e) return { ok: false, msg: e };
  return { ok: true, msg: `${B.name} accepts! Trade ants begin walking the trail.` };
}
function proposePeace(st, b) {
  const p = playerCol(st), B = colById(st, b);
  const rp = militaryPower(st, p), rb = militaryPower(st, B);
  const weary = B.rel[p.id].warTurns > 6;
  if (B.rel[p.id].score > -25 || (weary && rb < rp * 1.2) || rb < rp * 0.6) {
    makePeace(st, p.id, b);
    return { ok: true, msg: `${B.name} accepts peace.` };
  }
  return { ok: false, msg: `${B.name} refuses. They believe they can win this war.` };
}
function cancelRoute(st, b) {
  const r = routeBetween(st, st.playerId, b);
  if (r) { st.routes = st.routes.filter(x => x !== r); colById(st, b).rel[st.playerId].score -= 8; }
}
function giftFood(st, b, amount) {
  const p = playerCol(st), B = colById(st, b);
  if (p.food < amount) return false;
  p.food -= amount; B.food = Math.min(storageCap(st, B), B.food + amount);
  B.rel[p.id].score = Math.min(100, B.rel[p.id].score + amount / 4);
  p.rel[b].score = B.rel[p.id].score;
  return true;
}

// ---------------------------------------------------------------------
//  Economy
// ---------------------------------------------------------------------
function economy(st, c) {
  const S = cstats(st, c), sea = season(st.turn);
  const L = { food: 0, upkeep: 0, mat: 0, rp: 0, trade: 0, laid: 0, hatched: 0, died: 0, starved: 0, fungus: 0, cap: 0 };
  const jobs = normJobs(c.jobs);
  let workers = c.adults.worker;
  let garrWorkers = 0; for (const o of c.outposts) garrWorkers += o.units.worker || 0;
  const foragers = workers * jobs.forage + garrWorkers * 0.8;
  const cap = c._food * 3 * S.territory;
  L.cap = cap;
  const sf = seasonalForage(S, st.turn);
  L.food = Math.min(foragers * 0.8 * S.forage, cap) * sf;
  // fungus & aphids grow underground, season-independent
  if (c.chambers.fungus) {
    const need = c.chambers.fungus * (c.species === 'leafcutter' ? 1.5 : 1);
    const ok = c.materials >= need;
    c.materials = Math.max(0, c.materials - need);
    L.fungus = chVal(c, 'fungus') * S.fungus * (ok ? 1 : 0.4);
    L.food += L.fungus;
  }
  if (c.chambers.aphids) L.food += chVal(c, 'aphids') * (seasonIdx(st.turn) === 3 ? 0.6 : 1);
  L.mat = (workers * jobs.build * 0.6 + c._mat * 0.03) * S.build * (seasonIdx(st.turn) === 3 ? 0.6 : 1);
  L.rp = (4 + Math.pow(workers * jobs.research * 0.8, 0.85)) * (c.chambers.archive ? chVal(c, 'archive') : 1) * S.research;
  for (const r of st.routes) {
    if (r.blocked || (r.a !== c.id && r.b !== c.id)) continue;
    const inc = routeIncome(st, r, c.id);
    L.trade += inc.food; L.rp += inc.rp;
  }
  const units = totalUnits(st, c);
  L.upkeep = (upkeepOf(units) + 1 + broodCount(c) * 0.03) * S.upkeep * sea.upkeep;
  c.food += L.food + L.trade - L.upkeep;
  c.materials += L.mat;
  // brood development
  let support = workers * jobs.nurse * 8 + 6;
  const done = [];
  for (const b of c.brood) {
    if (support > 0) { b.left--; support -= b.n; }
    if (b.left <= 0) done.push(b);
  }
  for (const b of done) { c.adults[b.caste] += b.n; L.hatched += b.n; }
  c.brood = c.brood.filter(b => b.left > 0);
  // egg laying
  const pop = sumUnits(units), pcap = popCap(st, c), bc = broodCount(c);
  const nurseryCap = chVal(c, 'nursery');
  let eggs = Math.floor(chVal(c, 'royal') * S.lay * sea.lay);
  eggs = Math.min(eggs, nurseryCap - bc, Math.max(0, Math.floor(pcap * 1.05 - pop - bc)));
  if (eggs > 0) {
    const mix = normMix(c);
    let avgCost = 0; for (const k of CASTE_KEYS) avgCost += mix[k] * CASTES[k].cost;
    eggs = Math.min(eggs, Math.floor(Math.max(0, c.food - 2) / Math.max(0.5, avgCost)));
    let laid = 0;
    for (const k of CASTE_KEYS) {
      if (!mix[k]) continue;
      let n = Math.floor(eggs * mix[k] + (k === 'worker' ? 0.5 : 0));
      if (laid + n > eggs) n = eggs - laid;
      if (n <= 0) continue;
      laid += n; c.food -= n * CASTES[k].cost;
      c.brood.push({ caste: k, left: Math.max(1, CASTES[k].time + S.broodTime), n });
    }
    L.laid = laid;
  }
  // mortality
  let mort = Math.max(0.5, S.mortality) / 100;
  if (pop > pcap) mort += 0.05;
  for (const k of CASTE_KEYS) {
    const n = c.adults[k]; if (!n) continue;
    const x = n * mort, d = Math.floor(x) + (rnd(st) < x % 1 ? 1 : 0);
    c.adults[k] -= d; L.died += d;
  }
  // starvation
  if (c.food < 0) {
    let deficit = -c.food;
    while (deficit > 0 && c.brood.length) {      // the colony eats its brood first
      const b = c.brood[c.brood.length - 1];
      const take = Math.min(b.n, Math.ceil(deficit));
      b.n -= take; deficit -= take; L.starved += take;
      if (b.n <= 0) c.brood.pop();
    }
    if (deficit > 0) {
      const kill = Math.ceil(deficit / 0.2 * S.starve);
      for (const k of ['worker', 'scout', 'soldier', 'major']) {
        const d = Math.min(c.adults[k], Math.ceil(kill * (k === 'worker' ? 0.7 : 0.1)));
        c.adults[k] -= d; L.starved += d;
      }
      c.starving++;
    } else c.starving = 0;
    c.food = 0;
    if (c.isPlayer) logMsg(st, 'Famine! The colony is eating its own brood to survive.', '#ff6b5c');
  } else c.starving = 0;
  c.food = Math.min(c.food, storageCap(st, c));
  // construction
  for (const b of c.builds) b.left--;
  for (const b of c.builds.filter(b => b.left <= 0)) {
    c.chambers[b.key] = (c.chambers[b.key] || 0) + 1;
    if (c.isPlayer) logMsg(st, `Excavation complete: ${CHAMBERS[b.key].name} is now level ${c.chambers[b.key]}.`, '#d8b26a');
  }
  c.builds = c.builds.filter(b => b.left > 0);
  // research
  c.rp += L.rp;
  if (c.tech) {
    const T = TECHS[c.tech];
    if (c.rp >= T.cost) {
      c.rp -= T.cost; c.techs.push(c.tech);
      if (c.isPlayer) { logMsg(st, `Research complete: ${T.name}.`, '#c9a0ff'); popup(st, { title: 'Discovery!', text: `${T.name}\n\n${T.desc}`, col: '#b48ef0' }); }
      c.tech = null;
    }
  }
  c.stats.peakPop = Math.max(c.stats.peakPop, pop);
  c.last = L;
  if (sumUnits(c.adults) + sumUnits(totalUnits(st, c)) <= 0 && broodCount(c) === 0) {
    logMsg(st, `${c.name} has collapsed from starvation.`, '#ff6b5c');
    nestFallen(st, c, null);
  }
}
function normJobs(j) { const s = JOB_KEYS.reduce((a, k) => a + j[k], 0) || 1; const o = {}; for (const k of JOB_KEYS) o[k] = j[k] / s; return o; }
function normMix(c) {
  const o = {}; let s = 0;
  for (const k of CASTE_KEYS) { o[k] = casteUnlocked(c, k) ? c.mix[k] : 0; s += o[k]; }
  if (s <= 0) { o.worker = 1; s = 1; }
  for (const k of CASTE_KEYS) o[k] /= s;
  return o;
}
function canBuild(st, c, key) {
  const Ch = CHAMBERS[key], S = cstats(st, c), lvl = c.chambers[key] || 0;
  if (Ch.req && !has(c, Ch.req)) return `Requires ${TECHS[Ch.req].name}.`;
  if (lvl >= 5) return 'Maximum level.';
  if (lvl >= S.maxLevel) return 'Research Deep Excavation for levels 4-5.';
  if (c.builds.some(b => b.key === key)) return 'Already under construction.';
  if (c.builds.length >= S.buildSlots) return 'Excavation crews busy.';
  if (c.materials < chamberCost(key, lvl + 1)) return `Needs ${chamberCost(key, lvl + 1)} materials.`;
  return null;
}
function startBuild(st, c, key) {
  const err = canBuild(st, c, key); if (err) return err;
  const lvl = (c.chambers[key] || 0) + 1;
  c.materials -= chamberCost(key, lvl);
  c.builds.push({ key, left: chamberTime(key, lvl), total: chamberTime(key, lvl) });
  return null;
}
function techAvailable(c, key) {
  return !has(c, key) && TECHS[key].req.every(r => has(c, r));
}

// Projection for the UI (no side effects)
function projectIncome(st, c) {
  const S = cstats(st, c), sea = season(st.turn), jobs = normJobs(c.jobs);
  let garrWorkers = 0; for (const o of c.outposts) garrWorkers += o.units.worker || 0;
  const foragers = c.adults.worker * jobs.forage + garrWorkers * 0.8;
  const cap = c._food * 3 * S.territory;
  let food = Math.min(foragers * 0.8 * S.forage, cap) * seasonalForage(S, st.turn);
  const forage = food;
  let fungus = 0;
  if (c.chambers.fungus) { fungus = chVal(c, 'fungus') * S.fungus; food += fungus; }
  if (c.chambers.aphids) food += chVal(c, 'aphids') * (seasonIdx(st.turn) === 3 ? 0.6 : 1);
  let trade = 0, trp = 0;
  for (const r of st.routes) if (!r.blocked && (r.a === c.id || r.b === c.id)) { const i = routeIncome(st, r, c.id); trade += i.food; trp += i.rp; }
  const upkeep = (upkeepOf(totalUnits(st, c)) + 1 + broodCount(c) * 0.03) * S.upkeep * sea.upkeep;
  const mat = (c.adults.worker * jobs.build * 0.6 + c._mat * 0.03) * S.build * (seasonIdx(st.turn) === 3 ? 0.6 : 1) - (c.chambers.fungus ? c.chambers.fungus * (c.species === 'leafcutter' ? 1.5 : 1) : 0);
  const rp = (4 + Math.pow(c.adults.worker * jobs.research * 0.8, 0.85)) * (c.chambers.archive ? chVal(c, 'archive') : 1) * S.research + trp;
  return { food: food + trade - upkeep, foodIn: food, forage, fungus, trade, upkeep, mat, rp, cap, foragers,
           nurseSupport: c.adults.worker * jobs.nurse * 8 + 6, eggs: Math.floor(chVal(c, 'royal') * S.lay * sea.lay) };
}

// ---------------------------------------------------------------------
//  AI
// ---------------------------------------------------------------------
function aiEconomy(st, c) {
  const S = cstats(st, c), inc = projectIncome(st, c);
  const bc = broodCount(c);
  const atWarAny = st.colonies.some(o => o.alive && o !== c && atWar(st, c.id, o.id));
  // jobs
  const nurseNeed = clamp((bc / 8) / Math.max(1, c.adults.worker), 0.05, 0.3);
  const forage = c.food < storageCap(st, c) * 0.25 || inc.food < 0 ? 0.62 : 0.5;
  c.jobs = { forage, nurse: nurseNeed, build: 0.25, research: Math.max(0.05, 1 - forage - nurseNeed - 0.25) };
  // caste mix
  const threat = atWarAny ? 0.3 : 0.12 + c.ai.aggr * 0.08;
  c.mix = { worker: 1 - threat, soldier: threat, major: 0, scout: 0 };
  if (has(c, 'polymorphism')) { c.mix.major = threat * 0.35; c.mix.soldier = threat * 0.65; }
  if (has(c, 'scout_caste') && st.turn % 7 === 0) c.mix.scout = 0.05;
  // building
  if (c.builds.length < S.buildSlots) {
    const pop = population(st, c), pc = popCap(st, c);
    const prio = [];
    if (pop > pc * 0.8) prio.push('galleries');
    if (bc > chVal(c, 'nursery') * 0.75) prio.push('nursery');
    if (c.food > storageCap(st, c) * 0.8) prio.push('granary');
    if (c.chambers.royal < 2 || chVal(c, 'nursery') > chVal(c, 'royal') * 4) prio.push('royal');
    if (has(c, 'fungiculture')) prio.push('fungus');
    if (has(c, 'aphid_husbandry')) prio.push('aphids');
    if (atWarAny) prio.push('gates', 'barracks');
    prio.push('archive', 'midden', 'granary', 'galleries', 'royal', 'barracks', 'gates', 'nursery');
    for (const k of prio) if (!canBuild(st, c, k)) { startBuild(st, c, k); break; }
  }
  // research
  if (!c.tech) {
    const avail = TECH_KEYS.filter(k => techAvailable(c, k));
    if (avail.length) {
      avail.sort((a, b) => {
        const wa = TECHS[a].cost * (TECHS[a].branch === 'war' ? 1 - c.ai.aggr * 0.5 : 1);
        const wb = TECHS[b].cost * (TECHS[b].branch === 'war' ? 1 - c.ai.aggr * 0.5 : 1);
        return wa - wb;
      });
      c.tech = avail[Math.floor(rnd(st) * Math.min(3, avail.length))];
    }
  }
}

function aiDiplomacy(st, c) {
  const diff = DIFFICULTY[st.difficulty];
  const myP = militaryPower(st, c);
  for (const o of st.colonies) {
    if (!o.alive || o === c) continue;
    const r = c.rel[o.id];
    const ndist = dist(c.nest.x, c.nest.y, o.nest.x, o.nest.y);
    if (ndist > 55 && !(o.isPlayer && c.met[o.id])) continue;
    if (r.status === 'war') {
      r.warTurns++;
      const op = militaryPower(st, o);
      if (r.warTurns > 8 && myP < op * 0.8 && rnd(st) < 0.15) {
        if (o.isPlayer) {
          if (!st.popups.some(p => p.kind === 'peace' && p.from === c.id))
            popup(st, { kind: 'peace', from: c.id, title: 'Peace Offering', text: `${c.name} sends appeasement pheromones and proposes an end to the war. Accept?`, col: c.color });
        } else makePeace(st, c.id, o.id);
      }
      continue;
    }
    const op = militaryPower(st, o);
    const ratio = myP / Math.max(1, op);
    if (r.peaceTurn !== undefined && st.turn - r.peaceTurn < 10) continue;
    if (st.turn < 10 && o.isPlayer) continue;       // grace period
    const roll = rnd(st);
    const hate = r.score < -30 && ratio > 0.95 && roll < 0.18 * c.ai.aggr * diff.aggro;
    const prey = ratio > 2.0 && c.ai.aggr > 0.5 && r.score < 20 && roll < 0.06 * diff.aggro;
    if ((hate || prey) && c.ai.cooldown <= 0) { declareWar(st, c.id, o.id); c.ai.cooldown = 12; }
    // AI-AI trade
    if (!o.isPlayer && r.score > 20 && !canTrade(st, c.id, o.id) && rnd(st) < 0.1) createRoute(st, c.id, o.id);
    if (o.isPlayer && c.met[o.id] && r.score > 25 && !canTrade(st, c.id, o.id) && rnd(st) < 0.06 &&
        !st.popups.some(p => p.kind === 'trade' && p.from === c.id))
      popup(st, { kind: 'trade', from: c.id, title: 'Trade Proposal', text: `${c.name} (${SPECIES[c.species].name}) offers to open a trade trail between your nests. Both colonies would gain food and research each turn. Accept?`, col: c.color });
  }
  c.ai.cooldown--;
}

function siteDefense(st, D, site) {
  if (site.kind === 'nest') return power(st, D, D.adults, nestDefMult(st, D));
  const u = Object.assign({}, site.outpost.units); u.worker = (u.worker || 0) + 4;
  return power(st, D, u, 1.2 * cstats(st, D).defense);
}

function aiMilitary(st, c) {
  const enemies = st.colonies.filter(o => o.alive && o !== c && atWar(st, c.id, o.id));
  const mySwarms = colonySwarms(st, c);
  // defend: enemy swarms inside our territory
  const intruders = st.swarms.filter(s => enemies.some(e => e.id === s.owner) && st.owner[idx(st, s.x, s.y)] === c.id);
  for (const intr of intruders) {
    if (mySwarms.some(s => s.target && s.target.swarm === intr.id)) continue;
    const ip = power(st, colById(st, intr.owner), intr.units);
    const avail = { worker: 0, soldier: Math.floor(c.adults.soldier * 0.8), major: Math.floor(c.adults.major * 0.8), scout: 0 };
    if (power(st, c, avail) > ip * 1.1) {
      const sw = musterSwarm(st, c, avail);
      if (sw) { sw.role = 'attack'; sw.target = { swarm: intr.id }; }
    }
  }
  // offensives
  if (enemies.length && mySwarms.filter(s => s.role === 'attack').length < 3) {
    let best = null, bd = 1e9;
    for (const e of enemies) {
      const sites = [{ kind: 'nest', col: e, x: e.nest.x, y: e.nest.y }, ...e.outposts.map(o => ({ kind: 'outpost', col: e, outpost: o, x: o.x, y: o.y }))];
      for (const s of sites) {
        const d = dist(s.x, s.y, c.nest.x, c.nest.y) * (s.kind === 'outpost' ? 0.8 : 1);
        if (d < bd) { bd = d; best = s; }
      }
    }
    if (best && bd < 60) {
      const need = siteDefense(st, best.col, best) * (1.15 + rnd(st) * 0.3);
      const avail = { worker: Math.floor(c.adults.worker * 0.1), soldier: Math.floor(c.adults.soldier * 0.85), major: Math.floor(c.adults.major * 0.85), scout: c.adults.scout };
      const ap = power(st, c, avail);
      if (ap > need && sumUnits(avail) > 8) {
        const sw = musterSwarm(st, c, avail);
        if (sw) { sw.role = 'attack'; sw.target = { x: best.x, y: best.y }; }
      }
    }
  }
  // expansion
  const S = cstats(st, c);
  if (c.outposts.length < S.maxOutposts && c.adults.worker > 45 && c.materials > 45 && !mySwarms.some(s => s.role === 'settle') && rnd(st) < 0.35) {
    const spot = aiFindOutpostSpot(st, c);
    if (spot) {
      const sw = musterSwarm(st, c, { worker: 18, soldier: Math.min(4, c.adults.soldier) });
      if (sw) { sw.role = 'settle'; sw.target = { x: spot[0], y: spot[1] }; }
    }
  }
  // move swarms
  for (const sw of colonySwarms(st, c)) aiMoveSwarm(st, c, sw);
}
function aiFindOutpostSpot(st, c) {
  let best = null, bs = -1;
  for (let t = 0; t < 60; t++) {
    const a = rnd(st) * Math.PI * 2, d = 6 + rnd(st) * 6;
    const x = Math.round(c.nest.x + Math.cos(a) * d), y = Math.round(c.nest.y + Math.sin(a) * d);
    if (!inMap(st, x, y) || !TERRAIN[terrainAt(st, x, y)].pass) continue;
    if (st.owner[idx(st, x, y)] >= 0 && st.owner[idx(st, x, y)] !== c.id) continue;
    let ok = true;
    for (const col of st.colonies) if (col.alive) for (const s of sitesOf(col, cstats(st, col))) if (dist(s.x, s.y, x, y) < 5) ok = false;
    if (!ok) continue;
    let score = 0;
    for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (inMap(st, xx, yy) && st.owner[idx(st, xx, yy)] < 0) score += TERRAIN[terrainAt(st, xx, yy)].food;
    if (score > bs) { bs = score; best = [x, y]; }
  }
  return best;
}
function aiMoveSwarm(st, c, sw) {
  if (!st.swarms.includes(sw)) return;
  let tx, ty;
  if (sw.target && sw.target.swarm !== undefined) {
    const t = st.swarms.find(s => s.id === sw.target.swarm);
    if (!t || !atWar(st, c.id, t.owner)) { sw.target = null; sw.role = 'return'; }
    else { tx = t.x; ty = t.y; }
  } else if (sw.target) {
    tx = sw.target.x; ty = sw.target.y;
    const site = siteAt(st, tx, ty);
    if (sw.role === 'attack' && (!site || site.col === c || !atWar(st, c.id, site.col.id))) { sw.target = null; sw.role = 'return'; }
  }
  if (!sw.target) {
    if (sw.x === c.nest.x && sw.y === c.nest.y) { disbandSwarm(st, sw); return; }
    tx = c.nest.x; ty = c.nest.y; sw.role = 'return';
  }
  if (sw.role === 'settle' && sw.x === tx && sw.y === ty) {
    if (foundOutpost(st, sw)) { sw.target = null; sw.role = 'return'; }
    return;
  }
  const path = findPath(st, sw.x, sw.y, tx, ty, c, { maxNodes: 12000 });
  if (!path || !path.length) { if (sw.role !== 'return') { sw.target = null; sw.role = 'return'; } return; }
  let guard = 0;
  while (path.length && guard++ < 20 && st.swarms.includes(sw)) {
    const [nx, ny] = path[0];
    const r = stepSwarm(st, sw, nx, ny);
    if (!r.ok) break;
    if (r.battle || r.merged) break;
    path.shift();
    if (sw.mp <= 0) break;
    if (sw.role === 'settle' && sw.x === tx && sw.y === ty) { if (foundOutpost(st, sw)) { sw.target = null; sw.role = 'return'; } break; }
    if (sw.role === 'return' && sw.x === c.nest.x && sw.y === c.nest.y) { disbandSwarm(st, sw); break; }
  }
}

// ---------------------------------------------------------------------
//  Turn processing
// ---------------------------------------------------------------------
function continuePlayerPaths(st) {
  for (const sw of st.swarms.filter(s => s.owner === st.playerId && s.path && s.path.length)) {
    let guard = 0;
    while (sw.path.length && guard++ < 30 && st.swarms.includes(sw)) {
      const [nx, ny] = sw.path[0];
      const r = stepSwarm(st, sw, nx, ny);
      if (!r.ok) { if (r.blocked !== 'mp') sw.path = []; break; }
      sw.path.shift();
      if (r.battle || r.merged) { sw.path = []; break; }
      if (sw.mp <= 0) break;
    }
  }
}

function endTurn(st) {
  st.pendingBattles = [];
  const p = playerCol(st);
  // AI phase
  for (const c of st.colonies) {
    if (!c.alive || c.isPlayer) continue;
    aiEconomy(st, c);
    aiDiplomacy(st, c);
    aiMilitary(st, c);
    if (st.gameOver) break;
  }
  updateRouteBlocks(st);
  // economy for everyone
  for (const c of st.colonies) if (c.alive) economy(st, c);
  // swarm attrition & harvesting
  for (const sw of st.swarms.slice()) {
    const c = colById(st, sw.owner); if (!c || !c.alive) { removeSwarm(st, sw); continue; }
    const S = cstats(st, c);
    const own = st.owner[idx(st, sw.x, sw.y)] === c.id;
    if (!own) {
      const rate = (seasonIdx(st.turn) === 3 ? 0.04 : 0.015) * S.attrition;
      for (const k of CASTE_KEYS) { const x = sw.units[k] * rate; sw.units[k] -= Math.floor(x) + (rnd(st) < x % 1 ? 1 : 0); }
      const f = featureAt(st, sw.x, sw.y);
      if (f && sw.units.worker > 0) { const g = Math.min(f.food, sw.units.worker * 0.8); c.food = Math.min(storageCap(st, c), c.food + g); }
    }
    if (sumUnits(sw.units) <= 0) removeSwarm(st, sw);
  }
  // features
  for (const f of st.features) if (f.ttl) f.ttl--;
  st.features = st.features.filter(f => !FEATURES[f.type].ttl || f.ttl > 0);
  const temp = st.features.filter(f => FEATURES[f.type].ttl).length;
  if (temp < st.w * st.h / 90 && rnd(st) < 0.8) spawnFeature(st, pick(() => rnd(st), ['fruit', 'fruit', 'carcass', 'carcass', 'picnic']));
  if (seasonIdx(st.turn) !== 3 && rnd(st) < 0.15) spawnFeature(st, rnd(st) < 0.5 ? 'aphids' : 'seeds');
  // random events for the player
  if (p && p.alive) playerEvents(st, p);
  // relations drift
  relationsDrift(st);
  // time passes
  const oldSeason = seasonIdx(st.turn);
  st.turn++;
  if (seasonIdx(st.turn) !== oldSeason) {
    const s = season(st.turn);
    logMsg(st, `${s.name} arrives. ${['New life stirs - the queen lays more eggs.', 'Long warm days - foraging is at its peak.', 'The days shorten - laying slows.', 'Winter: the colony huddles deep below. Foraging almost stops.'][seasonIdx(st.turn)]}`, '#9fd0ff');
  }
  for (const sw of st.swarms) sw.mp = swarmMaxMP(st, sw);
  // player swarms continue multi-turn orders
  continuePlayerPaths(st);
  recompute(st);
  updateRouteBlocks(st);
  checkVictory(st);
}

function relationsDrift(st) {
  const { w, h } = st, touch = {};
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) {
    const a = st.owner[y * w + x], b = st.owner[y * w + x + 1];
    if (a >= 0 && b >= 0 && a !== b) touch[Math.min(a, b) + ':' + Math.max(a, b)] = 1;
  }
  const alive = st.colonies.filter(c => c.alive);
  const siteDist = (a, b) => {
    let m = 1e9;
    const sa = [a.nest, ...a.outposts], sb = [b.nest, ...b.outposts];
    for (const p of sa) for (const q of sb) m = Math.min(m, dist(p.x, p.y, q.x, q.y));
    return m;
  };
  for (const a of alive) {
    const near = alive.filter(b => b !== a).map(b => [b, siteDist(a, b)]).sort((x, y) => x[1] - y[1]);
    near.forEach(([b, dd], rank) => {
      const r = a.rel[b.id];
      let d = 0;
      if (touch[Math.min(a.id, b.id) + ':' + Math.max(a.id, b.id)]) d -= 1.6;
      if (dd < 20) d -= 0.9 * (1 - dd / 20);            // competing for the same foraging grounds
      if (rank < 2) d -= 0.45;                          // natural rivals
      if (routeBetween(st, a.id, b.id)) d += 1.5;
      if (r.status === 'war') d -= 0.5;
      if (has(b, 'chem_diplomacy')) d += 0.3;
      for (const c of alive) if (c !== a && c !== b && atWar(st, a.id, c.id) && atWar(st, b.id, c.id)) { d += 1; break; }
      if (b.isPlayer && a.isPlayer === false && rnd(st) < 0.01) d -= 8;   // border incident
      r.score = clamp(r.score * 0.99 + d, -100, 100);
    });
  }
}

function playerEvents(st, p) {
  if (rnd(st) > 0.14) return;
  const S = cstats(st, p), si = seasonIdx(st.turn);
  const roll = rnd(st);
  const ev = (title, text) => { popup(st, { title, text, kind: 'event' }); logMsg(st, `${title}: ${text.split('.')[0]}.`, '#ffcf6b'); };
  if (roll < 0.18 && (si === 0 || si === 2)) {
    if (S.flood) { ev('Rainstorm', 'A violent rainstorm lashes the meadow, but your nest stays dry. ' + (S.swim ? 'Your fire ants simply link up into living rafts.' : 'Your ventilation shafts channel the water away.')); return; }
    const lostB = Math.round(broodCount(p) * 0.25), lostW = Math.round(p.adults.worker * 0.05);
    for (const b of p.brood) b.n = Math.round(b.n * 0.75);
    p.brood = p.brood.filter(b => b.n > 0); p.adults.worker -= lostW;
    ev('Flood!', `Rainwater pours into the tunnels. ${lostB} brood and ${lostW} workers drowned. (Ventilation Shafts would prevent this.)`);
  } else if (roll < 0.34) {
    const lost = Math.round(p.adults.worker * normJobs(p.jobs).forage * 0.08);
    p.adults.worker -= lost;
    ev('Bird Predation', `A foraging robin has been picking off your workers on the surface. ${lost} foragers were eaten.`);
  } else if (roll < 0.52) {
    const f = spawnFeature(st, rnd(st) < 0.3 ? 'picnic' : 'fruit', p);
    if (f) ev('Windfall', `Scouts report a ${FEATURES[f.type].name.toLowerCase()} near the nest - a rich new food source has appeared in or near your territory.`);
  } else if (roll < 0.66 && (has(p, 'aphid_husbandry') || p.chambers.aphids)) {
    const g = 25 + p.chambers.aphids * 10; p.food = Math.min(storageCap(st, p), p.food + g);
    ev('Honeydew Bonanza', `Your aphid herds are producing heavily. +${g} food.`);
  } else if (roll < 0.8) {
    if (p.chambers.midden >= 2) { ev('Parasitic Mites', 'Mites tried to infest the nest but your refuse midden keeps the galleries clean. No losses.'); return; }
    let lost = 0; for (const k of CASTE_KEYS) { const d = Math.round(p.adults[k] * 0.06); p.adults[k] -= d; lost += d; }
    ev('Parasitic Mites', `A mite infestation spreads through the galleries. ${lost} ants perished. (A level 2 Refuse Midden prevents this.)`);
  } else if (si === 1 && p.chambers.royal >= 2) {
    p.rp += 35;
    ev('Nuptial Flight', 'On a warm humid evening your winged princesses and males take to the air. Watching their flight teaches your colony much: +35 research.');
  } else {
    const lost = Math.min(p.adults.worker, 3 + Math.floor(rnd(st) * 5));
    p.adults.worker -= lost;
    ev('Antlion Pit', `An antlion has dug a sand-trap at the edge of your territory. ${lost} workers fell in.`);
  }
}

function checkVictory(st) {
  if (st.gameOver || st.victoryAck) return;
  const p = playerCol(st);
  if (!p.alive) return;
  const rivals = st.colonies.filter(c => c.alive && !c.isPlayer);
  if (!rivals.length) { st.gameOver = { win: true, reason: 'Every rival colony has fallen. Your queen rules the land unchallenged.' }; return; }
  const share = p._tiles / st.landTiles;
  if (share >= 0.4) st.gameOver = { win: true, reason: `Your colony controls ${Math.round(share * 100)}% of the land. A true supercolony!` };
}

// ---------------------------------------------------------------------
//  Save / load
// ---------------------------------------------------------------------
function serialize(st) {
  const o = Object.assign({}, st);
  o.terrain = Array.from(st.terrain); o.explored = Array.from(st.explored);
  delete o.owner; delete o.visible; delete o._reg; delete o.pendingBattles;
  o.colonies = st.colonies.map(c => { const x = Object.assign({}, c); delete x._tiles; delete x._food; delete x._mat; return x; });
  return JSON.stringify(o);
}
function deserialize(json) {
  const st = JSON.parse(json);
  st.terrain = Uint8Array.from(st.terrain); st.explored = Uint8Array.from(st.explored);
  st.pendingBattles = []; st.popups = st.popups || [];
  recompute(st); updateRouteBlocks(st);
  return st;
}
