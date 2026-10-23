# Pirate Treasures — PBR Texture Pack

## Package contents
- `materials/`: 24 seamless 512x512 PBR materials.
- Each material includes `basecolor`, `normal`, `roughness`, and `metallic` maps.
- `icons/`: 16 transparent 512x512 PNG UI icons.
- `preview/`: material and icon preview sheets.
- `manifest.json`: programmatic list of material/icon paths and metadata.

## Material list
- `deck_oak` — Deck Oak (family: wood)
- `weathered_hull` — Weathered Hull (family: wood)
- `polished_oak` — Polished Oak (family: wood)
- `sail_canvas` — Sail Canvas (family: canvas)
- `black_sailcloth` — Black Sailcloth (family: canvas)
- `crimson_sailcloth` — Crimson Sailcloth (family: canvas)
- `hemp_rope` — Hemp Rope (family: rope)
- `worn_iron` — Worn Iron (family: metal)
- `pirate_gold` — Pirate Gold (family: metal)
- `aged_bronze` — Aged Bronze (family: metal)
- `dark_leather` — Dark Leather (family: leather)
- `ruin_stone` — Ruin Stone (family: stone)
- `dune_sand` — Dune Sand (family: sand)
- `glacier_ice` — Glacier Ice (family: ice)
- `volcanic_lava` — Volcanic Lava (family: lava)
- `kraken_hide` — Kraken Hide (family: scales)
- `fire_serpent_scales` — Fire Serpent Scales (family: scales)
- `gold_dragon_scales` — Gold Dragon Scales (family: scales)
- `swamp_hydra_hide` — Swamp Hydra Hide (family: scales)
- `bone_ivory` — Bone Ivory (family: bone)
- `spectral_galleon_sail` — Spectral Galleon Sail (family: ghost)
- `reef_coral` — Reef Coral (family: coral)
- `swamp_moss` — Swamp Moss (family: moss)
- `abyssal_stone` — Abyssal Stone (family: stone)

## Maps
- `basecolor`: color/albedo, sRGB.
- `normal`: tangent-space normal map, OpenGL convention (Y+), RGB.
- `roughness`: grayscale linear map (white = rough).
- `metallic`: grayscale linear map (white = metal).

## Tileable maps
All material maps are authored as periodic textures intended to repeat. Use repeat wrapping in the engine. Surface textures are tileable; icons are not textures for 3D surfaces and should be displayed as UI sprites.

## Three.js example
```js
const loader = new THREE.TextureLoader();
const loadRepeat = (url, repeat = 2, srgb = false) => {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; // basecolor only
  return t;
};
const mat = new THREE.MeshStandardMaterial({
  map: loadRepeat('/assets/textures/materials/deck_oak_basecolor.png', 2, true),
  normalMap: loadRepeat('/assets/textures/materials/deck_oak_normal.png', 2),
  roughnessMap: loadRepeat('/assets/textures/materials/deck_oak_roughness.png', 2),
  metalnessMap: loadRepeat('/assets/textures/materials/deck_oak_metallic.png', 2),
  metalness: 1, roughness: 1
});
```
Basecolor uses sRGB. Normal, roughness and metallic maps stay in linear/no-color space. Replace `/assets/textures/` with the URL prefix used by your project.

## Quick usage
- Ship deck/hull: `deck_oak`, `weathered_hull`, `polished_oak`
- Sails: `sail_canvas`, `black_sailcloth`, `crimson_sailcloth`, `spectral_galleon_sail`
- Rigging: `hemp_rope`
- Weapons/armor/coins: `worn_iron`, `pirate_gold`, `aged_bronze`, `dark_leather`, `bone_ivory`
- Biomes and bosses: `ruin_stone`, `abyssal_stone`, `dune_sand`, `glacier_ice`, `volcanic_lava`, `kraken_hide`, `fire_serpent_scales`, `gold_dragon_scales`, `swamp_hydra_hide`, `swamp_moss`, `reef_coral`

These are stylized hand-authored procedural textures, not photogrammetry scans. They are designed to fit a colorful pirate game and keep a consistent art direction.
