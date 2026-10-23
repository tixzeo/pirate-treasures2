// The voyage of the prototype: three treasure islands with part one's first levels, then Scar's schooner.
// level: moves, kinds of treasure, and a goal (score or collect {kind: count}). who: the crew member who tells the story.
export const ISLANDS = [
  { name: 'Остров Креста', x: 30, z: -190, radius: 20, seed: 7,
    level: { moves: 20, types: 5, score: 800 },
    who: 'quartermaster',
    story: 'Под крестом был зарыт сундук с дублонами. Команда грузит добычу в трюм. Следующий обрывок карты ведёт в Бухту Попугая.' },
  { name: 'Бухта Попугая', x: -150, z: -360, radius: 17, seed: 3,
    level: { moves: 20, types: 5, collect: { 0: 12 } },
    who: 'old_martin',
    story: 'Попугай Жако откопал горсть дублонов и требует свою долю сухарями. На горизонте виден Остров Черепа.' },
  { name: 'Остров Черепа', x: 110, z: -520, radius: 22, seed: 11,
    level: { moves: 22, types: 5, score: 1500 },
    who: 'bosun',
    story: 'В пещере под черепом нашлась карта с отметкой о шхуне Шрама. «Каракатица» стоит совсем рядом. Готовьте пушки!' },
];

// Where Scar's «Каракатица» circles until you come for her.
export const BOSS_HOME = { x: 320, z: -470 };

// Empty islands so the sea is not bare: x, z, radius, seed.
export const SCENERY = [[-160, -110, 12, 3], [200, -260, 16, 13], [-90, 150, 9, 5], [140, 110, 11, 19], [-300, -520, 18, 23], [-40, -620, 13, 29]];
