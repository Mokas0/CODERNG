/**
 * Mayor Voting — 5 NPC mayors, 3 run per week. Players vote for 1.
 * Winner's buff scales with total votes received.
 */

function getMayorWeekKey() {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d - start) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getMayorWeekEnd() {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const nextMonday = new Date(d);
  nextMonday.setDate(d.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  return nextMonday.getTime();
}

function getPreviousMayorWeekKey() {
  const [y, w] = getMayorWeekKey().split('-W').map((s, i) => (i === 0 ? parseInt(s, 10) : parseInt(s, 10)));
  if (w <= 1) return `${y - 1}-W52`;
  return `${y}-W${String(w - 1).padStart(2, '0')}`;
}

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function seededShuffleIndices(length, seed) {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Get 3 of 5 mayors for this week (deterministic by week key) */
function getMayorCandidatesForWeek(weekKey) {
  const seed = weekKey.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const indices = seededShuffleIndices(MAYORS.length, seed);
  return indices.slice(0, 3).map(i => MAYORS[i]);
}

/** Compute buff strength from votes: base + votes * scale, capped at max */
function mayorBuffStrength(votes, basePercent, scalePerVote, maxPercent) {
  if (!votes || votes <= 0) return 0;
  const added = votes * scalePerVote;
  return Math.min(maxPercent, basePercent + added) / 100;
}

export const MAYORS = [
  {
    id: 'aurelia',
    name: 'Aurelia',
    emoji: '🌟',
    title: 'Fortune\'s Favorite',
    desc: 'Your rolls feel a little luckier when Aurelia is in charge.',
    buffType: 'luck',
    basePercent: 2,
    scalePerVote: 0.15,
    maxPercent: 25,
  },
  {
    id: 'barron',
    name: 'Barron',
    emoji: '🪙',
    title: 'Coin Baron',
    desc: 'Salvaging auras yields more coins under Barron\'s reign.',
    buffType: 'coins',
    basePercent: 5,
    scalePerVote: 0.2,
    maxPercent: 50,
  },
  {
    id: 'meridia',
    name: 'Meridia',
    emoji: '⚗️',
    title: 'Potion Patron',
    desc: 'Shop potions cost less when Meridia holds office.',
    buffType: 'potions',
    basePercent: 3,
    scalePerVote: 0.25,
    maxPercent: 35,
  },
  {
    id: 'vex',
    name: 'Vex',
    emoji: '🔩',
    title: 'Scrap Savant',
    desc: 'Salvaging has a higher chance to drop scraps with Vex as mayor.',
    buffType: 'scraps',
    basePercent: 3,
    scalePerVote: 0.2,
    maxPercent: 25,
  },
  {
    id: 'lyra',
    name: 'Lyra',
    emoji: '🎲',
    title: 'Luck Liberator',
    desc: 'The luck boost button costs less when Lyra holds office.',
    buffType: 'luck_boost_cost',
    basePercent: 10,
    scalePerVote: 0.5,
    maxPercent: 40,
  },
];

export {
  getMayorWeekKey,
  getMayorWeekEnd,
  getPreviousMayorWeekKey,
  getMayorCandidatesForWeek,
  mayorBuffStrength,
};
