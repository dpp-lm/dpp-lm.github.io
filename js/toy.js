// The toy model used by the "volume" and "pool" widgets: six answers to "Suggest a birthday gift for a friend."
// It is illustrative, not model output. Each answer has a probability p under a pretend language model and a
// unit embedding in the plane at the given angle (degrees). Answers 0 and 1 are near-duplicates, as are 2 and 3.
// data/pool-toy.json is precomputed from these values: change them only together with scripts/precompute_pool.mjs.
export const TOY_PROMPT = 'Suggest a birthday gift for a friend.';

export const TOY = [
  { id: 'novel',   text: 'A novel by their favorite author',  short: 'Novel',            p: 0.30, angle: 12 },
  { id: 'poetry',  text: 'A book of poems',                   short: 'Poetry book',      p: 0.24, angle: 24 },
  { id: 'concert', text: 'Tickets to a concert',              short: 'Concert tickets',  p: 0.18, angle: 78 },
  { id: 'class',   text: 'A cooking class for two',           short: 'Cooking class',    p: 0.13, angle: 96 },
  { id: 'plant',   text: 'A houseplant',                      short: 'Houseplant',       p: 0.10, angle: 138 },
  { id: 'letter',  text: 'A handwritten letter',              short: 'Handwritten letter', p: 0.05, angle: 164 },
];

export const TOY_K = 2;

// Unit embedding of an item.
export const phi = (item) => {
  const a = (item.angle * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
};

// Quality kappa = p^(1/T). The quality-scaled embedding has length sqrt(kappa).
export const kappa = (p, T) => Math.pow(p, 1 / T);
