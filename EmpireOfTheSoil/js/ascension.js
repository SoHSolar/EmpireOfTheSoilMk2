// =====================================================================
//  Ascension campaign: eras, advanced castes & machines, alien species, other worlds
// =====================================================================
'use strict';

const ERAS = [
  { key: 'primal',     name: 'Primal Age',      color: '#8fbf5a', desc: 'Pheromones, mandibles and instinct. The colony learns to survive.' },
  { key: 'stone',      name: 'Age of Stone',    color: '#b8a47a', desc: 'Ants learn to carry and wield pebbles and thorns as tools.' },
  { key: 'bronze',     name: 'Bronze Age',      color: '#d08a3a', desc: 'Copper beads smelted in sun-baked kilns become blades and armour. Siege engines rise.' },
  { key: 'iron',       name: 'Iron Age',        color: '#9aa0a8', desc: 'Iron mandible-caps, crossbows and armoured beetle cavalry. Castles crown the mounds.' },
  { key: 'gunpowder',  name: 'Age of Powder',   color: '#c86a3a', desc: 'Saltpetre from the midden explodes into muskets and cannon.' },
  { key: 'industrial', name: 'Industrial Age',  color: '#8a7a6a', desc: 'Steam engines pump air through the deep galleries. Rifles and artillery.' },
  { key: 'modern',     name: 'Modern Age',      color: '#6aa0c8', desc: 'Electric light underground, radio pheromones, machine guns and tanks.' },
  { key: 'space',      name: 'Space Age',       color: '#b08af0', desc: 'Rockets, lasers and colony ships. The colony reaches for the stars.' },
];

// research cost per era (the gate tech costs 1.5x, second-tier techs 1.3x)
const ERA_COST = [0, 150, 450, 1100, 2400, 4800, 9000, 15000];

// Advanced castes. role: melee / ranged / siege. machine: assembled from materials rather than hatched.
const ASC_CASTES = {
  slinger:   { name: 'Slingers', one: 'Slinger', era: 1, req: 'slings', atk: 0.5, rng: 2.2, hp: 2.4, upkeep: 0.2, cost: 1.4, mat: 0.4, time: 3, shield: 0.5, base: 'worker', weapon: 'sling',
               desc: 'Workers trained to hurl pebbles with a woven grass sling. They strike before the lines meet.' },
  hoplite:   { name: 'Bronze Guards', one: 'Bronze Guard', era: 2, req: 'bronze', atk: 6, hp: 13, upkeep: 0.45, cost: 4, mat: 2, time: 4, shield: 1.6, base: 'soldier', weapon: 'spear', helm: 'bronze',
               desc: 'Soldiers in beaten bronze plates with long thorn spears. They hold the front line.' },
  catapult:  { name: 'Catapults', one: 'Catapult', era: 2, req: 'catapults', machine: true, atk: 0.5, rng: 5, siege: 22, hp: 12, upkeep: 0.6, cost: 3, mat: 12, time: 3, move: -1, shield: 0.4,
               desc: 'Twig-and-sinew torsion engines crewed by six workers. They lob seeds and stones over walls - devastating against nests.' },
  crossbow:  { name: 'Crossbowants', one: 'Crossbowant', era: 3, req: 'crossbows', atk: 1, rng: 6, hp: 5, upkeep: 0.35, cost: 3, mat: 2.5, time: 4, shield: 0.6, base: 'soldier', weapon: 'crossbow', helm: 'iron',
               desc: 'Iron-capped soldiers with spring crossbows that fire splinter bolts.' },
  rider:     { name: 'Beetle Riders', one: 'Beetle Rider', era: 3, req: 'beetle_riders', atk: 16, hp: 34, upkeep: 1.1, cost: 9, mat: 3, time: 5, move: 1, shield: 1.8, base: 'soldier', mount: true, helm: 'iron',
               desc: 'Armoured knights mounted on tamed ground beetles. Fast, heavy and terrifying.' },
  musketeer: { name: 'Musketeers', one: 'Musketeer', era: 4, req: 'gunpowder', atk: 1.5, rng: 13, hp: 6, upkeep: 0.4, cost: 4, mat: 4, time: 4, shield: 0.7, base: 'soldier', weapon: 'musket', helm: 'tricorn',
               desc: 'Volley fire from straw-barrelled matchlocks packed with midden saltpetre.' },
  cannon:    { name: 'Cannons', one: 'Cannon', era: 4, req: 'cannons', machine: true, rng: 22, siege: 80, hp: 30, upkeep: 1, cost: 6, mat: 28, time: 4, move: -1, shield: 0.5,
               desc: 'Cast-bronze cannon on seed-husk wheels. Batters down gates and galleries.' },
  rifleman:  { name: 'Riflemen', one: 'Rifleman', era: 5, req: 'rifling', atk: 2.5, rng: 28, hp: 10, upkeep: 0.5, cost: 5, mat: 6, time: 4, shield: 0.8, base: 'soldier', weapon: 'rifle', helm: 'brodie',
               desc: 'Breech-loading rifles with rifled barrels: accurate, rapid and deadly at range.' },
  artillery: { name: 'Artillery', one: 'Field Gun', era: 5, req: 'artillery', machine: true, rng: 55, siege: 200, hp: 45, upkeep: 1.5, cost: 8, mat: 55, time: 4, move: -1, shield: 0.5,
               desc: 'Steel field guns firing explosive shells far beyond the battle line.' },
  gunner:    { name: 'Machine Gunners', one: 'Machine Gunner', era: 6, req: 'machine_guns', atk: 3, rng: 65, hp: 15, upkeep: 0.7, cost: 6, mat: 12, time: 4, shield: 0.9, base: 'major', weapon: 'mg', helm: 'steel',
               desc: 'Belt-fed machine guns carried by majors. Nothing crosses open ground in front of them.' },
  tank:      { name: 'Tanks', one: 'Tank', era: 6, req: 'tanks', machine: true, atk: 40, rng: 90, siege: 120, hp: 300, upkeep: 3, cost: 15, mat: 140, time: 5, move: 1, shield: 2.2,
               desc: 'Tracked armoured vehicles with a turret gun. They break any line.' },
  laser:     { name: 'Laser Troopers', one: 'Laser Trooper', era: 7, req: 'lasers', atk: 5, rng: 150, hp: 26, upkeep: 1, cost: 8, mat: 26, time: 4, shield: 1, base: 'soldier', weapon: 'laser', helm: 'visor',
               desc: 'Power-armoured soldiers with focused-light rifles.' },
  mech:      { name: 'Battle Mechs', one: 'Battle Mech', era: 7, req: 'mechs', machine: true, atk: 180, rng: 260, siege: 420, hp: 950, upkeep: 7, cost: 30, mat: 420, time: 6, shield: 2.6,
               desc: 'Six-legged walking war machines armed with lasers and missile pods.' },
};
for (const k in ASC_CASTES) { CASTES[k] = Object.assign({ atk: 0, rng: 0, siege: 0, mat: 0, move: 0, asc: true }, ASC_CASTES[k]); CASTE_KEYS.push(k); }
// base castes
for (const k of ['worker', 'soldier', 'major', 'scout']) Object.assign(CASTES[k], { rng: 0, siege: 0, mat: 0, move: 0, era: 0, shield: { worker: 0.6, soldier: 1.2, major: 1.4, scout: 0.7 }[k] });
// shapes used for 2D/3D models of armed ants
for (const k in ASC_CASTES) if (!ASC_CASTES[k].machine) CASTE_SHAPE[k] = Object.assign({}, CASTE_SHAPE[ASC_CASTES[k].base], { weapon: ASC_CASTES[k].weapon, helm: ASC_CASTES[k].helm, mount: ASC_CASTES[k].mount });
for (const k in ASC_CASTES) if (ASC_CASTES[k].machine) CASTE_SHAPE[k] = { len: 1.6, head: 1, mand: 1, leg: 1, gaster: 1, machine: k };

// Technologies of the later eras. gate: the tech that begins the era.
const ASC_TECHS = {
  // 1 - Stone
  stone_tools:  { era: 1, gate: true, name: 'Stone Tools', req: ['trails', 'mandibles'], desc: 'Ants learn to carry and wield pebbles and thorns. Begins the Age of Stone. +15% building materials.' },
  slings:       { era: 1, branch: 'war', tier: 0, name: 'Pebble Slings', req: ['stone_tools'], desc: 'Grass-fibre slings hurl pebbles at the enemy before the lines meet. Unlocks Slingers (ranged).' },
  grinding:     { era: 1, branch: 'forage', tier: 0, name: 'Seed Grinding', req: ['stone_tools'], desc: 'Stone mortars crush hard seeds into flour. +20% foraging.' },
  mud_brick:    { era: 1, branch: 'nest', tier: 0, name: 'Mud-Brick Galleries', req: ['stone_tools'], desc: 'Sun-dried mud bricks shore up larger galleries. +20% population capacity.' },
  tally:        { era: 1, branch: 'society', tier: 0, name: 'Scent Tallies', req: ['stone_tools'], desc: 'Counting with notched twigs and scent marks. +20% research.' },
  // 2 - Bronze
  bronze:       { era: 2, gate: true, name: 'Bronze Working', req: ['stone_tools', 'slings', 'tally'], desc: 'Copper and tin beads smelted in sun-kilns. Begins the Bronze Age. Unlocks Bronze Guards (heavy infantry).' },
  catapults:    { era: 2, branch: 'war', tier: 0, name: 'Torsion Catapults', req: ['bronze'], desc: 'Twisted-sinew siege engines. Unlocks Catapults - ranged siege machines that wreck nest defences.' },
  irrigation:   { era: 2, branch: 'forage', tier: 0, name: 'Irrigation Channels', req: ['bronze'], desc: 'Dew is channelled to the fungus gardens and aphid pastures. +25% foraging, +25% fungus and aphid food.' },
  ramparts:     { era: 2, branch: 'nest', tier: 0, name: 'Ramparts', req: ['bronze'], desc: 'Packed-earth walls ring the mound. +40% nest and outpost defence.' },
  glyphs:       { era: 2, branch: 'society', tier: 0, name: 'Glyph Writing', req: ['bronze'], desc: 'Pheromone glyphs record knowledge for the next generation. +25% research and +1 trade route.' },
  // 3 - Iron
  iron:         { era: 3, gate: true, name: 'Iron Smelting', req: ['bronze', 'catapults', 'glyphs'], desc: 'Bog-iron forges. Begins the Iron Age. +15% attack.' },
  crossbows:    { era: 3, branch: 'war', tier: 0, name: 'Crossbows', req: ['iron'], desc: 'Spring-loaded bows fire splinter bolts. Unlocks Crossbowants (ranged).' },
  beetle_riders:{ era: 3, branch: 'war', tier: 1, name: 'Beetle Cavalry', req: ['crossbows'], desc: 'Tamed ground beetles carry armoured knights. Unlocks Beetle Riders (fast heavy cavalry).' },
  rotation:     { era: 3, branch: 'forage', tier: 0, name: 'Crop Rotation', req: ['iron'], desc: 'Fungus beds are rotated and rested. +25% foraging and food storage.' },
  castles:      { era: 3, branch: 'nest', tier: 0, name: 'Castle Mounds', req: ['iron'], desc: 'Towers, gatehouses and murder-holes. +40% nest defence and +15% population capacity.' },
  guilds:       { era: 3, branch: 'society', tier: 0, name: 'Guilds', req: ['iron'], desc: 'Specialist crafts are passed down from worker to worker. +25% materials and +25% trade.' },
  // 4 - Gunpowder
  gunpowder:    { era: 4, gate: true, name: 'Gunpowder', req: ['iron', 'crossbows', 'guilds'], desc: 'Saltpetre from the refuse midden, charcoal and sulphur. Begins the Age of Powder. Unlocks Musketeers.' },
  cannons:      { era: 4, branch: 'war', tier: 0, name: 'Cannon Foundry', req: ['gunpowder'], desc: 'Cast-bronze cannon. Unlocks Cannons - heavy siege guns.' },
  navigation:   { era: 4, branch: 'forage', tier: 0, name: 'Leaf Boats', req: ['gunpowder'], desc: 'Sailing rafts of curled leaves. Swarms can cross water, +1 vision.' },
  star_forts:   { era: 4, branch: 'nest', tier: 0, name: 'Star Forts', req: ['gunpowder'], desc: 'Angled bastions that deflect shot. +40% nest defence.' },
  printing:     { era: 4, branch: 'society', tier: 0, name: 'Printing Press', req: ['gunpowder'], desc: 'Pheromone stamps copy knowledge across the colony. +30% research.' },
  // 5 - Industrial
  steam:        { era: 5, gate: true, name: 'Steam Power', req: ['gunpowder', 'cannons', 'printing'], desc: 'Coal-fired engines pump air and haul spoil. Begins the Industrial Age. +40% materials, +1 movement (rail).' },
  rifling:      { era: 5, branch: 'war', tier: 0, name: 'Rifling', req: ['steam'], desc: 'Spiral-grooved barrels. Unlocks Riflemen.' },
  artillery:    { era: 5, branch: 'war', tier: 1, name: 'Field Artillery', req: ['rifling'], desc: 'Steel guns firing explosive shells. Unlocks Artillery.' },
  mech_farming: { era: 5, branch: 'forage', tier: 0, name: 'Mechanised Farming', req: ['steam'], desc: 'Threshing engines and fungus factories. +50% foraging, territory feeds 50% more ants.' },
  sanitation:   { era: 5, branch: 'nest', tier: 0, name: 'Sanitation', req: ['steam'], desc: 'Drains and disinfectant secretions. -1% mortality, +30% population capacity.' },
  telegraph:    { era: 5, branch: 'society', tier: 0, name: 'Telegraph Trails', req: ['steam'], desc: 'Vibration signals along silk wires. +30% research, +1 vision.' },
  // 6 - Modern
  electricity:  { era: 6, gate: true, name: 'Electricity', req: ['steam', 'rifling', 'telegraph'], desc: 'Electric light deep underground. Begins the Modern Age. +30% research.' },
  machine_guns: { era: 6, branch: 'war', tier: 0, name: 'Machine Guns', req: ['electricity'], desc: 'Belt-fed automatic weapons. Unlocks Machine Gunners.' },
  tanks:        { era: 6, branch: 'war', tier: 1, name: 'Armoured Vehicles', req: ['machine_guns'], desc: 'Tracked steel vehicles. Unlocks Tanks.' },
  green_rev:    { era: 6, branch: 'forage', tier: 0, name: 'Green Revolution', req: ['electricity'], desc: 'Engineered fungus strains and synthetic honeydew. +60% foraging and fungus food.' },
  arcologies:   { era: 6, branch: 'nest', tier: 0, name: 'Arcologies', req: ['electricity'], desc: 'Self-contained mega-nests. +50% population capacity, +30% defence.' },
  radio:        { era: 6, branch: 'society', tier: 0, name: 'Radio Pheromones', req: ['electricity'], desc: 'Broadcast signals reach every ant at once. +2 vision, +40% trade, +20% research.' },
  // 7 - Space
  rocketry:     { era: 7, gate: true, name: 'Rocketry', req: ['electricity', 'machine_guns', 'radio'], desc: 'Liquid-fuel rockets rise from the meadow. Begins the Space Age.' },
  lasers:       { era: 7, branch: 'war', tier: 0, name: 'Laser Weapons', req: ['rocketry'], desc: 'Focused light rifles. Unlocks Laser Troopers.' },
  mechs:        { era: 7, branch: 'war', tier: 1, name: 'Battle Mechs', req: ['lasers'], desc: 'Six-legged walking war machines. Unlocks Battle Mechs.' },
  fusion:       { era: 7, branch: 'forage', tier: 0, name: 'Fusion Power', req: ['rocketry'], desc: 'Limitless clean energy. +50% foraging and +50% materials.' },
  habitats:     { era: 7, branch: 'nest', tier: 0, name: 'Orbital Habitats', req: ['rocketry'], desc: 'Spinning space stations above the nest. +50% population capacity.' },
  colony_ships: { era: 7, branch: 'society', tier: 0, name: 'Colony Ships', req: ['rocketry'], desc: 'Generation ships carrying a queen and her court across space. Lets any big nest launch a colony ship to another world.' },
};
for (const k in ASC_TECHS) {
  const T = ASC_TECHS[k];
  TECHS[k] = Object.assign({ branch: T.branch || 'society', tier: T.tier || 0 }, T, { cost: Math.round(ERA_COST[T.era] * (T.gate ? 1.5 : 1) * (1 + (T.tier || 0) * 0.3) / 5) * 5 });
  TECH_KEYS.push(k);
}
for (const k in TECHS) if (TECHS[k].era === undefined) TECHS[k].era = 0;
const ERA_GATES = ['', 'stone_tools', 'bronze', 'iron', 'gunpowder', 'steam', 'electricity', 'rocketry'];

// Alien ant species found on other worlds
const ALIEN_SPECIES = {
  crystal: {
    name: 'Crystal Myrmidons', latin: 'Crystallomyrmex glacialis', region: 'Ice caves of distant worlds', alien: true,
    desc: 'Silicon-based ants whose glassy bodies refract the light of alien suns. Slow to breed but almost impossible to crack.',
    strengths: ['+70% health', 'Crystal nests: +30% defence', 'Immune to cold'], weaknesses: ['Queen lays 25% fewer eggs', '-10% attack'],
    look: { head: '#8fd8f0', thorax: '#7ac8e8', gaster: '#a8e8ff', legs: '#5aa8c8', size: 1.15, headSize: 1.1, gasterSize: 0.95, mand: 1.1, legLen: 1.1, spines: true, translucent: true },
    mods: { hp: 1.7, defense: 1.3, winter: 3, lay: 0.75, atk: 0.9 }, startTechs: [], startChambers: {},
  },
  spore: {
    name: 'Sporeborn Hive', latin: 'Mycomyrmex vorax', region: 'Fungal jungles',
    alien: true, desc: 'Ants fused with a parasitic fungus that grows through their bodies. The hive spreads like a mould, breeding at a terrifying rate.',
    strengths: ['Queen lays +70% eggs', 'Fungus food x2', '+30% population capacity'], weaknesses: ['-25% health', '-20% research'],
    look: { head: '#7a3a8a', thorax: '#8a4a9a', gaster: '#5a9a5a', legs: '#4a2a5a', size: 1.0, headSize: 1.0, gasterSize: 1.15, mand: 0.9, legLen: 1.0, spines: true, stripes: true },
    mods: { lay: 1.7, fungus: 2, cap: 1.3, hp: 0.75, research: 0.8 }, startTechs: ['fungiculture'], startChambers: { fungus: 1 },
  },
  void: {
    name: 'Void Raiders', latin: 'Umbramyrmex rapax', region: 'Dark side of tidally locked worlds',
    alien: true, desc: 'Lightless hunters with violet bioluminescent jaws. They raid relentlessly and strip conquered nests bare.',
    strengths: ['+50% attack', '+1 movement', 'Plunder x2'], weaknesses: ['-30% nest defence', '-20% foraging'],
    look: { head: '#1a1424', thorax: '#241a34', gaster: '#2c1e44', legs: '#6a3aa8', size: 1.1, headSize: 1.15, gasterSize: 0.9, mand: 1.5, legLen: 1.2, spines: false, hooked: true },
    mods: { atk: 1.5, move: 1, plunder: 2, defense: 0.7, forage: 0.8 }, startTechs: ['swarm_tactics'], startChambers: {},
  },
};
for (const k in ALIEN_SPECIES) SPECIES[k] = ALIEN_SPECIES[k];
const PLAYABLE_SPECIES = SPECIES_KEYS.slice();          // SPECIES_KEYS was captured before the aliens were added
const ALIEN_NAMES = ['Xel-Thrax', 'Vorrikai', 'Ssylith', 'Qa-Rhun', 'Zenthari', 'Ul-Mokk', 'Ixiloth', 'Krell Vae', 'Thessa-Nul', 'Oruvex', 'Yth Kael', 'Morrogh'];

// Worlds reachable by colony ship
const WORLD_KINDS = {
  earth:    { name: 'Earth',    desc: 'Home. A garden at the edge of a wood.', icon: '#4a8fe7' },
  rubra:    { name: 'Rubra',    desc: 'A rust-red desert planet of iron dust, brine pools and towering mesas.', icon: '#d0603a', aliens: ['void', 'crystal'], travel: 3,
              sky: [0.55, 0.38, 0.30], fog: [0.80, 0.55, 0.42], light: [1.1, 0.88, 0.70], decor: [1.25, 0.6, 0.45] },
  glacis:   { name: 'Glacis',   desc: 'A frozen world of blue ice sheets and crystal forests under a pale sun.', icon: '#9ad8f0', aliens: ['crystal'], travel: 4,
              sky: [0.55, 0.65, 0.80], fog: [0.82, 0.88, 0.95], light: [0.92, 0.97, 1.08], decor: [0.75, 0.95, 1.15] },
  verdance: { name: 'Verdance', desc: 'A steaming fungal jungle lit by two violet suns.', icon: '#a86ae0', aliens: ['spore', 'void'], travel: 5,
              sky: [0.42, 0.30, 0.55], fog: [0.55, 0.42, 0.65], light: [1.0, 0.85, 1.1], decor: [0.9, 0.55, 1.2] },
};
const WORLD_KEYS = Object.keys(WORLD_KINDS);

// Colour transform applied to painted terrain on other worlds
function worldSkin(kind) {
  if (kind === 'rubra') return (r, g, b, t) => {
    if (t === T_WATER) return [r * 0.9 + 30, g * 0.55 + 10, b * 0.35];
    const l = (r + g + b) / 3; return [l * 1.25 + 30, l * 0.62 + 6, l * 0.38];
  };
  if (kind === 'glacis') return (r, g, b, t) => {
    const l = (r + g + b) / 3;
    if (t === T_WATER) return [l * 0.4 + 40, l * 0.6 + 70, l * 0.7 + 110];
    return [l * 0.55 + 105, l * 0.62 + 115, l * 0.66 + 130];
  };
  if (kind === 'verdance') return (r, g, b, t) => {
    if (t === T_WATER) return [g * 0.4 + 30, b * 0.4 + 50, g * 0.6 + 60];
    return [g * 0.62 + r * 0.25 + 10, r * 0.35 + b * 0.3, g * 0.85 + 25];
  };
  return null;
}

function eraOf(c) { let e = 0; for (let i = 1; i < ERA_GATES.length; i++) if (has(c, ERA_GATES[i])) e = i; return e; }
// Castes that should appear in menus for this colony
function castesShown(c) { return CASTE_KEYS.filter(k => !CASTES[k].asc || (c.ascend && casteUnlocked(c, k))); }
// order castes for drawing a swarm on the map: machines and heavies first so they always show
function swarmDrawOrder(sw) {
  return CASTE_KEYS.filter(k => sw.units[k] > 0).sort((a, b) => (CASTES[b].machine ? 3 : 0) + (CASTES[b].era || 0) * 0.2 + (CASTES[b].hp || 0) * 0.001 - ((CASTES[a].machine ? 3 : 0) + (CASTES[a].era || 0) * 0.2 + (CASTES[a].hp || 0) * 0.001));
}
