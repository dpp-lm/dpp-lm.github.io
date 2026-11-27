// The toy model used by the "hero", "volume", and "pool" widgets: six answers to "Suggest a birthday gift for a friend."
// It is illustrative, not model output. The answers are three gift ideas in two wordings each: answers 0 and 1,
// 2 and 3, and 4 and 5 are near-duplicates. Each answer has a probability p under a pretend language model and a
// unit embedding in the plane at the given angle (degrees). All angles lie in the first quadrant, where the
// horizontal axis stands for an object and the vertical axis for an experience, so a larger angle between two
// answers always means a larger area.
// data/pool-toy.json is precomputed from these values: change them only together with scripts/precompute_pool.mjs.
export const TOY_PROMPT = 'Suggest a birthday gift for a friend.';
export const TOY_AXES = { x: 'Object', y: 'Experience' };

export const TOY = [
  { id: 'album',    text: 'A photo album of your memories together', short: 'Photo album',          p: 0.30, angle: 9 },
  { id: 'book',     text: 'A photo book of your time together',      short: 'Photo book',           p: 0.24, angle: 16 },
  { id: 'concert',  text: 'Concert tickets for the two of you',      short: 'Concert tickets',      p: 0.18, angle: 74 },
  { id: 'tickets',  text: 'Tickets to a concert together',           short: 'Tickets to a concert', p: 0.13, angle: 81 },
  { id: 'board',    text: 'A board game to play together',           short: 'Board game',           p: 0.10, angle: 42 },
  { id: 'tabletop', text: 'A tabletop game for game nights',         short: 'Tabletop game',        p: 0.05, angle: 49 },
];

export const TOY_K = 2;

// Unit embedding of an item.
export const phi = (item) => {
  const a = (item.angle * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
};

// Quality kappa = p^(1/T). The quality-scaled embedding has length sqrt(kappa).
export const kappa = (p, T) => Math.pow(p, 1 / T);
