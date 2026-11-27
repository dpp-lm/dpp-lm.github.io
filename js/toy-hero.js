// The hero figure's toy: six answers to "Suggest a birthday gift for a friend." It is illustrative, not model output.
// The answers are three gifts in two wordings each: answers 0 and 1, 2 and 3, and 4 and 5 are near-duplicates.
// p is the answer's probability under a pretend language model. angle (degrees) places the answer on a plane with
// two scales: the horizontal one runs from object (180) to experience (0), the vertical one from generic (270) to
// personal (90). The three gifts point about 120 degrees apart, so no two answers point in opposite directions.
// The unit embedding of an answer is (cos angle, sin angle).
// The volume and pool figures still use js/toy.js.
export { TOY_PROMPT } from './toy.js';

export const HERO_AXES = { left: 'Object', right: 'Experience', bottom: 'Generic', top: 'Personal' };

export const HERO_TOY = [
  { id: 'album',    text: 'A photo album of your memories together', short: 'Photo album',          p: 0.30, angle: 144 },
  { id: 'book',     text: 'A photo book of your time together',      short: 'Photo book',           p: 0.24, angle: 137 },
  { id: 'concert',  text: 'Concert tickets for the two of you',      short: 'Concert tickets',      p: 0.18, angle: 17 },
  { id: 'tickets',  text: 'Tickets to a concert together',           short: 'Tickets to a concert', p: 0.13, angle: 24 },
  { id: 'board',    text: 'A board game to play together',           short: 'Board game',           p: 0.10, angle: 257 },
  { id: 'tabletop', text: 'A tabletop game for game nights',         short: 'Tabletop game',        p: 0.05, angle: 264 },
];
