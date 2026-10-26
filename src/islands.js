// The voyage of the prototype: three treasure islands with part one's first levels, then Scar's schooner.
// level: moves, kinds of treasure, and a goal (score or collect {kind: count}). who: the crew member who tells the story. kit/dock: Артем's island and dock models.
// Islands are this many times wider than in the first prototype; hills rise by its square root, palms and rocks keep their size.
export const ISLE_SCALE = 7.5; // ×3 width/length over the previously accepted 2.5
// Layout distances change independently of ship speed and island/prop size.
export const VOYAGE_SPACING = 3;

export const ISLANDS = [
  { name: 'Остров Креста', x: 30, z: -190, radius: 20 * ISLE_SCALE, seed: 7,
    level: { moves: 20, types: 5, score: 800 },
    who: 'quartermaster', kit: 'island_lagoon', dock: 'dock_royal',
    story: 'Под крестом был зарыт сундук с дублонами. Команда грузит добычу в трюм. Следующий обрывок карты ведёт в Бухту Попугая.' },
  { name: 'Бухта Попугая', x: -150, z: -360, radius: 17 * ISLE_SCALE, seed: 3,
    level: { moves: 20, types: 5, collect: { 0: 12 } },
    who: 'old_martin', kit: 'island_cove_small', dock: 'dock_pine',
    story: 'Попугай Жако откопал горсть дублонов и требует свою долю сухарями. На горизонте виден Остров Черепа.' },
  { name: 'Остров Черепа', x: 110, z: -520, radius: 22 * ISLE_SCALE, seed: 11,
    level: { moves: 22, types: 5, score: 1500 },
    who: 'bosun', kit: 'island_volcanic', dock: 'dock_ruined',
    story: 'В пещере под черепом нашлась карта с отметкой о шхуне Шрама. Курс к «Каракатице» отмечен на компасе. Готовьте пушки!' },
].map(def => ({ ...def, x: def.x * VOYAGE_SPACING, z: def.z * VOYAGE_SPACING }));

// Where Scar's «Каракатица» circles until you come for her.
export const BOSS_HOME = { x: 320 * VOYAGE_SPACING, z: -470 * VOYAGE_SPACING };

// Empty islands so the sea is not bare: x, z, radius, seed.
// Three distinct scenic islands; the former duplicates crowded the voyage.
export const SCENERY = [[-160, -110, 12, 3], [200, -260, 16, 13], [-90, 150, 9, 5]]
  .map(([x, z, r, seed]) => [x * VOYAGE_SPACING, z * VOYAGE_SPACING, r * ISLE_SCALE, seed]);
