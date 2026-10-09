// =====================================================================
//  EMPIRE OF THE SOIL — static game data
// =====================================================================
'use strict';

const W = 1280, H = 720;           // logical screen size
const TILE = 32;                   // base tile size in pixels at zoom 1
const ZOOMS = [1.25, 1, 0.72, 0.5, 0.34];

const SEASONS = [
  { name: 'Spring', lay: 1.25, forage: 1.0, upkeep: 1.0, tint: 'rgba(120,200,120,0.05)', sky: ['#9fd3ff', '#e6f6ff'] },
  { name: 'Summer', lay: 1.0, forage: 1.2, upkeep: 1.1, tint: 'rgba(255,220,120,0.06)', sky: ['#69b8ff', '#d8f0ff'] },
  { name: 'Autumn', lay: 0.6, forage: 0.85, upkeep: 1.0, tint: 'rgba(230,120,30,0.10)', sky: ['#c9a27a', '#f3dcc0'] },
  { name: 'Winter', lay: 0.1, forage: 0.25, upkeep: 0.55, tint: 'rgba(200,225,255,0.20)', sky: ['#8f9db0', '#dfe7ef'] },
];
const TURNS_PER_SEASON = 6;        // one turn = one fortnight
const TURNS_PER_YEAR = TURNS_PER_SEASON * 4;

// ---------------------------------------------------------------------
//  Terrain
// ---------------------------------------------------------------------
const T_WATER = 0, T_MEADOW = 1, T_LITTER = 2, T_SOIL = 3, T_SAND = 4, T_ROCK = 5, T_FOREST = 6, T_CLOVER = 7;
const TERRAIN = [
  { key: 'water', name: 'Rain Puddle', move: 99, food: 0, mat: 0, def: 0, pass: false, color: [52, 98, 128], mini: '#3d6f8f' },
  { key: 'meadow', name: 'Meadow Grass', move: 1, food: 2, mat: 1, def: 0.1, pass: true, color: [92, 138, 52], mini: '#5f8c36' },
  { key: 'litter', name: 'Leaf Litter', move: 1, food: 2, mat: 3, def: 0.15, pass: true, color: [128, 92, 48], mini: '#8a6234' },
  { key: 'soil', name: 'Bare Soil', move: 1, food: 1, mat: 2, def: 0, pass: true, color: [118, 86, 58], mini: '#77573c' },
  { key: 'sand', name: 'Sandy Ground', move: 2, food: 0.6, mat: 0.5, def: 0, pass: true, color: [206, 180, 124], mini: '#cdb27c' },
  { key: 'rock', name: 'Stones', move: 3, food: 0.3, mat: 0.5, def: 0.5, pass: true, color: [128, 126, 120], mini: '#85827b' },
  { key: 'forest', name: 'Tree Roots', move: 2, food: 3, mat: 2, def: 0.3, pass: true, color: [62, 86, 42], mini: '#3e5a2b' },
  { key: 'clover', name: 'Wildflowers', move: 1, food: 3, mat: 1, def: 0.1, pass: true, color: [104, 150, 64], mini: '#6c9a44' },
];

// Food sources that appear on the map
const FEATURES = {
  aphids:  { name: 'Aphid Herd',      food: 6,  ttl: 0,  desc: 'Aphids on a grass stem, producing sugary honeydew. Permanent.' },
  seeds:   { name: 'Seed Cache',      food: 5,  ttl: 0,  desc: 'A drift of fallen seeds. Permanent.' },
  fruit:   { name: 'Fallen Berry',    food: 10, ttl: 9,  desc: 'A ripe berry, rich in sugar. Rots after a while.' },
  carcass: { name: 'Beetle Carcass',  food: 14, ttl: 6,  desc: 'Precious protein for the brood. Decays quickly.' },
  picnic:  { name: 'Picnic Crumbs',   food: 22, ttl: 10, desc: 'Giant crumbs dropped by the Titans. A feast.' },
};

// ---------------------------------------------------------------------
//  Castes
// ---------------------------------------------------------------------
const CASTES = {
  worker:  { name: 'Workers',  one: 'Worker',  atk: 1,   hp: 2,   upkeep: 0.15, cost: 1.0, time: 3, req: null,
             desc: 'Minor workers forage, dig, nurse and research. They fight weakly but defend the nest to the last.' },
  soldier: { name: 'Soldiers', one: 'Soldier', atk: 4,   hp: 6,   upkeep: 0.30, cost: 2.5, time: 4, req: null,
             desc: 'Large-headed defenders with powerful mandibles. The backbone of every swarm.' },
  major:   { name: 'Majors',   one: 'Major',   atk: 10,  hp: 16,  upkeep: 0.70, cost: 6.0, time: 5, req: 'polymorphism',
             desc: 'Giant supermajors with crushing jaws. Expensive and slow to raise, devastating in battle.' },
  scout:   { name: 'Scouts',   one: 'Scout',   atk: 1.5, hp: 2.5, upkeep: 0.15, cost: 1.5, time: 3, req: 'scout_caste',
             desc: 'Swift, long-legged explorers. Extend vision and speed up any swarm they join.' },
};
const CASTE_KEYS = ['worker', 'soldier', 'major', 'scout'];
const JOB_KEYS = ['forage', 'build', 'nurse', 'research'];
const JOBS = {
  forage:   { name: 'Forage',   desc: 'Gather food from your territory. Limited by the food your territory can supply.' },
  build:    { name: 'Excavate', desc: 'Dig soil and gather leaves/twigs - produces building materials.' },
  nurse:    { name: 'Nurse',    desc: 'Tend eggs, larvae and pupae. Each nurse can care for 8 brood.' },
  research: { name: 'Research', desc: 'Experiment with pheromones and techniques - produces research.' },
};

// ---------------------------------------------------------------------
//  Species — real ants, real strengths
// ---------------------------------------------------------------------
const DEFAULT_MODS = { atk: 1, hp: 1, lay: 1, forage: 1, build: 1, research: 1, upkeep: 1, cap: 1, move: 0, vision: 0,
  storage: 1, defense: 1, trade: 1, winter: 1, fungus: 1, broodTime: 0, swim: false, plunder: 1, starve: 1, terrain: {} };

const SPECIES = {
  leafcutter: {
    name: 'Leafcutter Ant', latin: 'Atta cephalotes', region: 'Neotropical rainforest',
    desc: 'Farmers of the rainforest. Leafcutters do not eat the leaves they cut - they feed them to vast underground fungus gardens. Their colonies grow into the millions with a whole spectrum of castes, from tiny gardeners to giant soldiers.',
    strengths: ['Starts with Fungiculture & Polymorphism (Majors)', 'Fungus Gardens produce +60% food', '+30% population capacity'],
    weaknesses: ['Swarms move 1 less per turn', '-15% research', 'Fungus gardens consume extra materials'],
    look: { head: '#a8481d', thorax: '#9c421a', gaster: '#7e3415', legs: '#702d12', size: 1.0, headSize: 1.2, gasterSize: 0.85, mand: 1.0, legLen: 1.15, spines: true, carry: 'leaf' },
    mods: { cap: 1.3, move: -1, research: 0.85, fungus: 1.6 },
    startTechs: ['fungiculture', 'polymorphism'], startChambers: { fungus: 1 },
  },
  army: {
    name: 'Army Ant', latin: 'Eciton burchellii', region: 'Central & South American jungle',
    desc: 'Nomadic predators that raid in swarms 200,000 strong, consuming every insect in their path. They build no permanent nest - the colony shelters in a living bivouac made of their own bodies.',
    strengths: ['+35% attack, starts with Swarm Tactics (+1 move)', 'Victories plunder double food', 'Raids capture enemy brood as workers'],
    weaknesses: ['Bivouac nest: -35% nest defence', '-40% food storage, +15% upkeep', 'Nearly blind: -1 vision'],
    look: { head: '#5a2a14', thorax: '#6b331a', gaster: '#4a2410', legs: '#8a5a2a', size: 1.0, headSize: 1.15, gasterSize: 0.8, mand: 1.6, legLen: 1.25, spines: false, hooked: true },
    mods: { atk: 1.35, defense: 0.65, storage: 0.6, upkeep: 1.15, vision: -1, plunder: 2 },
    startTechs: ['swarm_tactics'], startChambers: {},
  },
  bullet: {
    name: 'Bullet Ant', latin: 'Paraponera clavata', region: 'Lowland rainforest, Nicaragua to Paraguay',
    desc: 'Huge solitary hunters with the most painful sting of any insect - said to feel like being shot. Colonies are small, but every single ant is a warrior.',
    strengths: ['+60% attack and +40% health', 'Starts with Venom Glands', 'Enemies fear them: +15% nest defence'],
    weaknesses: ['Queen lays 40% fewer eggs', '-35% population capacity', '-10% foraging'],
    look: { head: '#2a1a12', thorax: '#3a2216', gaster: '#24160f', legs: '#4a2c1a', size: 1.35, headSize: 1.0, gasterSize: 1.05, mand: 0.9, legLen: 1.0, spines: false },
    mods: { atk: 1.6, hp: 1.4, lay: 0.6, cap: 0.65, forage: 0.9, defense: 1.15 },
    startTechs: ['venom'], startChambers: {},
  },
  fire: {
    name: 'Red Fire Ant', latin: 'Solenopsis invicta', region: 'Paraná floodplains, now invasive worldwide',
    desc: 'One of the most successful invasive species on Earth. Fire ants breed explosively, sting with alkaloid venom and survive floods by linking together into living rafts.',
    strengths: ['Queen lays +50% eggs, brood matures 1 turn faster', 'Living rafts: can cross water, immune to floods', '+10% attack (venom)'],
    weaknesses: ['Small bodies: -25% health', '-10% research', 'Cold-sensitive: harsher winters'],
    look: { head: '#b5341c', thorax: '#b43a20', gaster: '#3a1a10', legs: '#8f2c18', size: 0.85, headSize: 1.0, gasterSize: 1.0, mand: 0.9, legLen: 0.95, spines: false },
    mods: { lay: 1.5, broodTime: -1, swim: true, atk: 1.1, hp: 0.75, research: 0.9, winter: 0.7 },
    startTechs: [], startChambers: {},
  },
  weaver: {
    name: 'Weaver Ant', latin: 'Oecophylla smaragdina', region: 'Tropical Asia & Australia',
    desc: 'Master builders that stitch leaves into nests using silk from their own larvae. Fiercely territorial, they patrol the tree canopy and attack anything that enters it.',
    strengths: ['+40% building materials', '+30% nest defence, +1 vision', 'Forest & wildflower tiles yield +50% food'],
    weaknesses: ['Tropical: much harsher winters', '+10% upkeep', 'Poor on sand and stone'],
    look: { head: '#c97a22', thorax: '#d0882c', gaster: '#b8732a', legs: '#a8641c', size: 1.05, headSize: 0.9, gasterSize: 0.9, mand: 1.1, legLen: 1.35, spines: false, translucent: true },
    mods: { build: 1.4, defense: 1.3, vision: 1, winter: 0.55, upkeep: 1.1, terrain: { forest: 1.5, clover: 1.5, sand: 0.5, rock: 0.5 } },
    startTechs: [], startChambers: {},
  },
  honeypot: {
    name: 'Honeypot Ant', latin: 'Myrmecocystus mimicus', region: 'Deserts of North America',
    desc: 'Desert survivors whose "repletes" hang from the ceiling, their abdomens swollen like grapes with stored nectar - living larders that carry the colony through drought.',
    strengths: ['Repletes: +120% food storage', 'Starvation losses halved', 'Sand yields double food, +40% trade income'],
    weaknesses: ['-25% attack', '-10% health', 'Slow excavation (-10% materials)'],
    look: { head: '#9c6a2c', thorax: '#a9763a', gaster: '#b88a3e', legs: '#8a5c26', size: 0.95, headSize: 1.0, gasterSize: 1.2, mand: 0.8, legLen: 1.15, spines: false, stripes: true },
    mods: { storage: 2.2, starve: 0.5, trade: 1.4, atk: 0.75, hp: 0.9, build: 0.9, terrain: { sand: 2.0 } },
    startTechs: [], startChambers: {},
  },
  wood: {
    name: 'Red Wood Ant', latin: 'Formica rufa', region: 'Temperate forests of Europe',
    desc: 'Builders of great thatched mounds in European woodland. Wood ants herd aphids, spray formic acid at enemies and stay active far into the cold season.',
    strengths: ['Starts with Aphid Husbandry & an Aphid Pasture', 'Formic acid: +15% attack, +10% health', 'Cold-hardy: mild winters, +10% research'],
    weaknesses: ['Queen lays 10% fewer eggs', 'No outstanding specialisation', 'Mound nests are slow to grow (-10% capacity)'],
    look: { head: '#2b1c14', thorax: '#a8452a', gaster: '#24170f', legs: '#5a2c1c', size: 1.0, headSize: 1.0, gasterSize: 1.0, mand: 1.0, legLen: 1.05, spines: false },
    mods: { atk: 1.15, hp: 1.1, winter: 1.6, research: 1.1, lay: 0.9, cap: 0.9 },
    startTechs: ['trails', 'aphid_husbandry'], startChambers: { aphids: 1 },
  },
};
const SPECIES_KEYS = Object.keys(SPECIES);

function speciesMods(key) {
  const s = SPECIES[key];
  return Object.assign({}, DEFAULT_MODS, s.mods, { terrain: Object.assign({}, s.mods.terrain || {}) });
}

// ---------------------------------------------------------------------
//  Nest chambers
// ---------------------------------------------------------------------
const CHAMBERS = {
  royal:     { name: 'Royal Chamber',     base: 25, time: 2, req: null, values: [8, 13, 20, 30, 44],
               desc: 'Home of the queen. Each level increases how many eggs she can lay per turn.', fmt: v => `${v} eggs / turn` },
  nursery:   { name: 'Brood Nursery',     base: 15, time: 1, req: null, values: [30, 70, 140, 250, 400],
               desc: 'Warm, humid galleries where eggs, larvae and pupae are raised. Sets brood capacity.', fmt: v => `${v} brood capacity` },
  galleries: { name: 'Worker Galleries',  base: 18, time: 2, req: null, values: [40, 110, 250, 500, 900],
               desc: 'Resting halls for the adult workforce. Sets population capacity.', fmt: v => `+${v} population cap` },
  granary:   { name: 'Granary',           base: 15, time: 1, req: null, values: [200, 450, 900, 1600, 2600],
               desc: 'Dry chambers for seeds, prey and honeydew. Raises food storage (base 80).', fmt: v => `${v} food storage` },
  barracks:  { name: 'Soldier Barracks',  base: 25, time: 2, req: null, values: [30, 80, 180, 350, 600],
               desc: 'Quarters for the military castes. Extra population cap and +10% garrison defence per level.', fmt: v => `+${v} pop cap` },
  archive:   { name: 'Pheromone Archive', base: 30, time: 2, req: null, values: [1.3, 1.6, 1.9, 2.2, 2.6],
               desc: 'Chemical libraries where scent signals are refined. Multiplies research.', fmt: v => `x${v} research` },
  fungus:    { name: 'Fungus Garden',     base: 30, time: 2, req: 'fungiculture', values: [8, 18, 32, 50, 75],
               desc: 'A spongy garden of cultivated Leucoagaricus fungus, fed with leaf mulch. Produces food but consumes materials.', fmt: v => `+${v} food / turn` },
  aphids:    { name: 'Aphid Pasture',     base: 25, time: 2, req: 'aphid_husbandry', values: [5, 11, 19, 29, 42],
               desc: 'Root aphids herded underground and milked for honeydew. Steady food, boosts trade.', fmt: v => `+${v} food / turn` },
  midden:    { name: 'Refuse Midden',     base: 12, time: 1, req: null, values: [0.6, 1.2, 1.8, 2.4, 3.0],
               desc: 'A sealed waste chamber that keeps disease and parasites out of the nest. Lowers mortality.', fmt: v => `-${v}% mortality` },
  gates:     { name: 'Fortified Gates',   base: 20, time: 1, req: null, values: [0.2, 0.4, 0.6, 0.8, 1.0],
               desc: 'Narrow, pebble-lined entrances that soldiers can hold against any army.', fmt: v => `+${Math.round(v * 100)}% nest defence` },
};
const CHAMBER_KEYS = Object.keys(CHAMBERS);
function chamberCost(key, toLevel) { return Math.round(CHAMBERS[key].base * Math.pow(toLevel, 1.7)); }
function chamberTime(key, toLevel) { return CHAMBERS[key].time + Math.floor(toLevel / 2); }

// ---------------------------------------------------------------------
//  Technology tree
// ---------------------------------------------------------------------
const BRANCHES = [
  { key: 'forage', name: 'Foraging', color: '#7fbf4d' },
  { key: 'war', name: 'Warfare', color: '#d0533c' },
  { key: 'nest', name: 'Nest-craft', color: '#c08a4a' },
  { key: 'society', name: 'Society', color: '#a77fd6' },
];
const TECHS = {
  // Foraging
  trails:          { name: 'Pheromone Trails',   branch: 'forage', tier: 0, cost: 25,  req: [], desc: 'Recruitment trails lead foragers straight to food. +20% foraging.' },
  aphid_husbandry: { name: 'Aphid Husbandry',    branch: 'forage', tier: 1, cost: 45,  req: ['trails'], desc: 'Protect and milk aphids for honeydew. Unlocks the Aphid Pasture chamber.' },
  fungiculture:    { name: 'Fungiculture',       branch: 'forage', tier: 1, cost: 60,  req: ['trails'], desc: 'Cultivate a symbiotic fungus on leaf mulch. Unlocks the Fungus Garden chamber.' },
  seed_caching:    { name: 'Seed Caching',       branch: 'forage', tier: 2, cost: 75,  req: ['trails'], desc: 'Husk and store seeds. +40% food storage and winters hit foraging less hard.' },
  tandem:          { name: 'Tandem Running',     branch: 'forage', tier: 2, cost: 120, req: ['aphid_husbandry'], desc: 'Experienced foragers teach new ones the way. Territory supplies +30% food.' },
  trophallaxis:    { name: 'Trophallaxis Network', branch: 'forage', tier: 3, cost: 140, req: ['seed_caching'], desc: 'Mouth-to-mouth food sharing across the colony. -15% upkeep, swarm attrition halved.' },
  // Warfare
  mandibles:       { name: 'Hardened Mandibles', branch: 'war', tier: 0, cost: 30,  req: [], desc: 'Zinc-reinforced mandible tips. +15% attack.' },
  scout_caste:     { name: 'Scout Caste',        branch: 'war', tier: 1, cost: 35,  req: [], desc: 'Raise swift, long-legged scouts. Unlocks the Scout caste.' },
  polymorphism:    { name: 'Polymorphism',       branch: 'war', tier: 1, cost: 65,  req: ['mandibles'], desc: 'Hormonal control of larval growth produces giants. Unlocks the Major caste.' },
  venom:           { name: 'Venom Glands',       branch: 'war', tier: 2, cost: 90,  req: ['mandibles'], desc: 'Potent alkaloid and peptide venoms. +20% attack.' },
  swarm_tactics:   { name: 'Swarm Tactics',      branch: 'war', tier: 2, cost: 80,  req: ['scout_caste'], desc: 'Coordinated raiding columns. Swarms gain +1 movement.' },
  armour:          { name: 'Sclerotised Armour', branch: 'war', tier: 3, cost: 150, req: ['polymorphism'], desc: 'Thicker, harder cuticle. +20% health for all castes.' },
  chem_warfare:    { name: 'Chemical Warfare',   branch: 'war', tier: 3, cost: 170, req: ['venom'], desc: 'Propaganda pheromones turn enemies against each other. Enemies lose 15% health in battle.' },
  // Nest-craft
  ventilation:     { name: 'Ventilation Shafts', branch: 'nest', tier: 0, cost: 40,  req: [], desc: 'Chimneys draw air through the nest. Immune to floods, -0.5% mortality.' },
  deep_excavation: { name: 'Deep Excavation',    branch: 'nest', tier: 1, cost: 55,  req: [], desc: 'Dig far below the frost line. Chambers can reach levels 4 and 5.' },
  satellite:       { name: 'Satellite Nests',    branch: 'nest', tier: 1, cost: 70,  req: ['ventilation'], desc: 'Polydomy - one colony, many nests. +2 outpost limit.' },
  fortification:   { name: 'Fortification',      branch: 'nest', tier: 2, cost: 100, req: ['ventilation'], desc: 'Hardened walls and false tunnels. +25% nest and outpost defence.' },
  parallel_dig:    { name: 'Parallel Excavation', branch: 'nest', tier: 2, cost: 120, req: ['deep_excavation'], desc: 'Two excavation crews work at once. Build two chambers simultaneously.' },
  // Society
  chem_diplomacy:  { name: 'Chemical Diplomacy', branch: 'society', tier: 0, cost: 45,  req: [], desc: 'Appeasement pheromones calm rivals. +50% trade income, rivals warm to you faster.' },
  polygyny:        { name: 'Polygyny',           branch: 'society', tier: 1, cost: 130, req: [], desc: 'Accept multiple queens. +40% egg laying, and a daughter queen can take over if the home nest falls.' },
  nuptial:         { name: 'Nuptial Flights',    branch: 'society', tier: 2, cost: 160, req: ['polygyny'], desc: 'Winged alates found daughter colonies. +2 outpost limit and outposts claim wider territory.' },
  supercolony:     { name: 'Supercolony',        branch: 'society', tier: 3, cost: 420, req: ['nuptial', 'trophallaxis', 'fortification'], desc: 'Nests across the land recognise one another as kin. +15% to everything, +3 outposts.' },
};
for (const k in TECHS) TECHS[k].cost = Math.round(TECHS[k].cost * (1.6 + TECHS[k].tier * 0.3) / 5) * 5;
const TECH_KEYS = Object.keys(TECHS);

// ---------------------------------------------------------------------
//  Colony colours & names
// ---------------------------------------------------------------------
const COLONY_COLORS = ['#f2c14e', '#e0503f', '#4a8fe7', '#55c26a', '#b06ce0', '#ef8a35', '#38c9c9', '#e05aa8', '#a3b43c', '#d8d8d8', '#7e6bf0'];
const COLONY_NAMES = ['Redmound', 'Thornhollow', 'Ashroot', 'Gloomburrow', 'Emberhill', 'Mossdeep', 'Stonejaw', 'Dewcrest', 'Briarnest',
  'Cinderfall', 'Hollowbark', 'Sunpit', 'Mirefang', 'Saltmound', 'Rustgate', 'Blightwood', 'Velvetdeep', 'Grimcairn', 'Amberveil', 'Duskhold'];

const MAP_SIZES = {
  skirmish: { name: 'Skirmish',       w: 64,  h: 44,  rivals: 3, desc: 'A small patch of garden. 3 rival colonies. ~1-2 hours.' },
  standard: { name: 'Standard',       w: 100, h: 68,  rivals: 5, desc: 'A sprawling meadow. 5 rival colonies. ~3-5 hours.' },
  grand:    { name: 'Grand Campaign', w: 160, h: 110, rivals: 9, desc: 'An entire woodland edge. 9 rival colonies. A long campaign.' },
};
const DIFFICULTY = {
  easy:   { name: 'Easy',   ai: 0.8,  aggro: 0.6 },
  normal: { name: 'Normal', ai: 1.0,  aggro: 1.0 },
  hard:   { name: 'Hard',   ai: 1.25, aggro: 1.35 },
};
