# Empire of the Soil

A turn-based grand strategy game about ant colonies. You start with a queen and her first brood.
From there you forage, dig chambers, raise castes, research new techniques, trade along pheromone
trails and wage war on rival colonies across a large procedurally generated map.

## Play right now (no install)
Double-click **index.html** (or **play_in_browser.bat**). It runs in Chrome, Edge or Firefox.

## Play on an iPad
An iPad can't run the game from the zip file, so it needs a web address:

1. Put the game online for free. The easiest way is to go to **app.netlify.com/drop** on a computer, sign up, and drag this whole folder onto the page. You get a link like `https://something.netlify.app`. GitHub Pages works too.
2. Open that link in **Safari** on the iPad.
3. Tap **Share > Add to Home Screen**. The game gets its own icon, opens full-screen like an app and works offline. Saves are kept on the iPad.

Touch controls:

| Action | Gesture |
|---|---|
| Select / press buttons | Tap |
| Move or attack with a swarm | Tap the destination to preview the route, then tap it again to confirm |
| Pan the map | Drag with one finger (or two) |
| Zoom | Pinch |
| Rotate the 3D camera | Twist two fingers |
| Turn the 3D nest | Drag in the Colony view |
| See a tooltip | Press and hold |

Hold the iPad in landscape. If the sound is silent, check that the ring/silent switch (or Control Centre silent mode) is off. Any iPad that runs iPadOS 15 or later supports the 3D graphics.

## Make a Windows .exe
1. Install **Node.js LTS** from https://nodejs.org (default options). You only need to do this once.
2. Double-click **build_exe.bat**.
3. After a few minutes you get **dist\EmpireOfTheSoil.exe**. It's a single portable file, so copy it anywhere and double-click it.

To build an installer instead of the portable exe, run `npm run build-installer` from a terminal in this folder.

## Requirements
Any PC from the last several years with a graphics card that supports WebGL 2. That covers practically every Windows PC with up-to-date drivers. If 3D isn't available, the game switches to its 2D renderer automatically.

## Controls
| Action | Input |
|---|---|
| Select | Left-click |
| Move or attack with the selected swarm | Right-click (or left-click an empty tile) |
| Pan | WASD / arrow keys, or drag with the left mouse button |
| Rotate the 3D camera | Q / E, or drag with the right or middle mouse button |
| Zoom | Mouse wheel, + / - |
| End turn | Space / Enter |
| Colony, Research, Diplomacy | C, R, P |
| Next swarm, Home | N (or Tab), H |
| Quick-save | F5 (slot 1) |
| Fullscreen | F11 |
| Mute / unmute | F9 (volume settings are in Menu > Sound Settings) |

The game autosaves every turn. Use Menu > Save / Load for 5 save slots. You can also export a save file as a backup.

## Features
- **7 real species** with real strengths and weaknesses: Leafcutter, Army, Bullet, Red Fire, Weaver, Honeypot and Red Wood ants.
- **Castes**: workers, soldiers, majors and scouts. A caste-mix setting decides what the queen's eggs become.
- **Brood lifecycle**: eggs, larvae, pupae and adults, with nurses, food costs and famine (the colony eats its brood first).
- **10 excavatable chambers** shown in an animated underground cross-section with ants moving in real time.
- **22 research techniques** across Foraging, Warfare, Nest-craft and Society.
- **Campaign map** with seasons, terrain, food sources, territory, outposts, fog of war and a minimap.
- **Diplomacy & trade**: rivals' opinions shift over time. Trade trails have trader ants walking them and can be cut by enemy swarms.
- **Animated battles** fought in rounds, with terrain and nest-defence bonuses, plunder and brood capture.
- Three map sizes up to a **160x110 Grand Campaign** with 9 rival colonies, and three difficulty levels.
- **Adaptive soundtrack and sound effects**, synthesised live. The music shifts between calm (map), tense (at war), underground (colony) and driving (battle). There is birdsong, crickets and wind on the surface, and scuttling and dripping underground.
- **Full 3D graphics** on a custom WebGL 2 engine: a sculpted 3D landscape with water, swaying grass, flowers, stumps and boulders; soft sun shadows; seasonal lighting; jointed 3D ants with walk cycles; a cut-away 3D nest you can turn; and 3D battles on the real terrain. The original 2D look is still available under Menu > Graphics Settings.
- **Cinematic rendering**: HDR lighting with ACES tone mapping, a macro-lens depth of field, bloom, screen-space ambient occlusion, a procedural sky with drifting clouds, sun glitter on the water, dappled light under the forest canopy, translucent grass and leaves, glossy ant shells, snow in winter and golden grass in autumn, plus drifting pollen, leaves and snowflakes.
- **Anatomical ants**: banded gasters with fine hairs, a waist with one or two nodes, three-part thorax, compound eyes, toothed mandibles, elbowed antennae with beaded tips, and legs built from coxa, femur, tibia and tarsus. Soldiers lunge and kick up dust in battle.
- **Quality presets** under Graphics: Low (fast, no post-processing; good for older iPads), Medium, High and Ultra, plus a depth-of-field toggle.
- All graphics are generated procedurally: shaded 3D-style ants, terrain textures, soil strata and lighting.

## Files
- `index.html`, `js/`: the game (plain HTML5/JavaScript, no dependencies)
- `electron-main.js`, `package.json`: desktop wrapper used to build the .exe
- `build/icon.png`: app icon
