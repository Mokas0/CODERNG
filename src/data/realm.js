/**
 * Realm RPG — aura-to-item mapping, map data, quests, NPCs, enemies
 */

// Weapon keywords (dongsa / verb-like) → weapon slot
// Armor keywords (myeongsa / object-like) → armor slot
// Artifact (yoso / elemental, or special) → artifact slot
const WEAPON_KEYWORDS = [
  'SWORD', 'SHIELD', 'STRIKE', 'SLASH', 'CRUSH', 'PIERCE', 'BLAST', 'FIRE', 'ICE',
  'ATTACK', 'STRIKE', 'RUSH', 'FLEET', 'SWIFT', 'BLADE', 'EDGE', 'CLAW', 'FANG'
];
const ARMOR_KEYWORDS = [
  'SHIELD', 'GUARD', 'ARMOR', 'WALL', 'PROTECT', 'DEFEND', 'EVADE', 'MAIL', 'PLATE'
];
const ARTIFACT_KEYWORDS = [
  'SOUL', 'VOID', 'MAGIC', 'FLUX', 'CORE', 'ECHO', 'SHARD', 'RUNE', 'CHARM',
  'ESSENCE', 'SPIRIT', 'HEART', 'FLAME', 'EMBER', 'SPARK', 'ORB', 'STAFF'
];

export function auraToRealmItem(aura, classifyAuraType) {
  const text = (aura.text || '').toUpperCase();
  const rarity = Math.max(1, aura.rarity || 1);
  const auraType = aura.auraType || (classifyAuraType ? classifyAuraType(aura.text) : 'default');

  // Rarity → power scaling: log10(rarity) * factor. Cap for sanity.
  const rarityPower = Math.min(100, Math.max(0, Math.log10(rarity) * 12));
  const atkBase = Math.floor(5 + rarityPower * 2);
  const defBase = Math.floor(3 + rarityPower * 1.5);

  let slot = 'artifact';
  let atkBonus = 0;
  let defBonus = 0;
  let specialEffect = null;

  // Special tiers get unique effects
  if (aura.isSupremeKing) {
    slot = 'artifact';
    atkBonus = 50;
    defBonus = 30;
    specialEffect = 'execute'; // extra damage when enemy low HP
  } else if (aura.isVoidQueen) {
    slot = 'artifact';
    atkBonus = 40;
    defBonus = 25;
    specialEffect = 'lifesteal';
  } else if (aura.isBookOfPower) {
    slot = 'artifact';
    atkBonus = 45;
    defBonus = 40;
    specialEffect = 'shield';
  } else if (aura.isEmperor || aura.is100Q || aura.isTier2) {
    slot = 'artifact';
    atkBonus = Math.floor(atkBase * 1.5);
    defBonus = Math.floor(defBase * 1.5);
    specialEffect = 'critical';
  } else if (aura.isAscendant) {
    slot = 'artifact';
    atkBonus = Math.floor(atkBase * 1.3);
    defBonus = Math.floor(defBase * 1.3);
  } else if (aura.isElder) {
    slot = auraType === 'dongsa' ? 'weapon' : auraType === 'myeongsa' ? 'armor' : 'artifact';
    atkBonus = auraType === 'weapon' || slot === 'weapon' ? atkBase : Math.floor(atkBase * 0.5);
    defBonus = auraType === 'armor' || slot === 'armor' ? defBase : Math.floor(defBase * 0.5);
  } else {
    // Default: keyword-based slot
    const hasWeapon = WEAPON_KEYWORDS.some((k) => text.includes(k));
    const hasArmor = ARMOR_KEYWORDS.some((k) => text.includes(k));
    const hasArtifact = ARTIFACT_KEYWORDS.some((k) => text.includes(k));

    if (hasWeapon && !hasArmor) {
      slot = 'weapon';
      atkBonus = atkBase;
      defBonus = Math.floor(defBase * 0.3);
    } else if (hasArmor && !hasWeapon) {
      slot = 'armor';
      atkBonus = Math.floor(atkBase * 0.3);
      defBonus = defBase;
    } else if (hasArtifact || auraType === 'yoso') {
      slot = 'artifact';
      atkBonus = Math.floor(atkBase * 0.7);
      defBonus = Math.floor(defBase * 0.7);
    } else if (auraType === 'dongsa') {
      slot = 'weapon';
      atkBonus = atkBase;
      defBonus = Math.floor(defBase * 0.2);
    } else if (auraType === 'myeongsa') {
      slot = 'armor';
      atkBonus = Math.floor(atkBase * 0.2);
      defBonus = defBase;
    } else {
      slot = 'artifact';
      atkBonus = Math.floor(atkBase * 0.6);
      defBonus = Math.floor(defBase * 0.6);
    }
  }

  return {
    slot,
    atkBonus: Math.max(1, atkBonus),
    defBonus: Math.max(0, defBonus),
    specialEffect,
    ...aura,
  };
}

// Map: hub + boss arenas only
export const REALM_MAP_NODES = [
  { id: 'village', name: 'Arena Hub', type: 'town', desc: 'Choose a boss to challenge.', connections: ['forest_arena', 'cave_arena', 'skeletal_arena', 'swamp_arena', 'castle_arena'], enemies: null, npcId: 'elder' },
  { id: 'forest_arena', name: 'Forest Arena', type: 'boss', desc: 'The Guardian awaits.', connections: ['village'], enemies: ['forest_guardian'], npcId: null },
  { id: 'cave_arena', name: 'Cave Arena', type: 'boss', desc: 'The Troll lurks within.', connections: ['village'], enemies: ['cave_troll'], npcId: null },
  { id: 'skeletal_arena', name: 'Skeletal Arena', type: 'boss', desc: 'The Warlord commands undead legions.', connections: ['village'], enemies: ['skeletal_warlord'], npcId: null },
  { id: 'swamp_arena', name: 'Swamp Arena', type: 'boss', desc: 'Tyranny reigns.', connections: ['village'], enemies: ['swamp_tyrant'], npcId: null },
  { id: 'castle_arena', name: 'Dark Castle', type: 'boss', desc: 'The ultimate challenge.', connections: ['village'], enemies: ['dark_lord'], npcId: null },
];

// Bosses — base stats; scaling applied at combat start from player power
export const REALM_BOSSES = {
  forest_guardian: { id: 'forest_guardian', name: 'Forest Guardian', hp: 50, atk: 6, def: 3, gold: 20, exp: 10, baseCoins: 75, baseGems: 1, tier: 1 },
  cave_troll: { id: 'cave_troll', name: 'Cave Troll', hp: 90, atk: 14, def: 7, gold: 40, exp: 20, baseCoins: 150, baseGems: 2, tier: 2 },
  skeletal_warlord: { id: 'skeletal_warlord', name: 'Skeletal Warlord', hp: 120, atk: 18, def: 9, gold: 55, exp: 30, baseCoins: 225, baseGems: 3, tier: 3 },
  swamp_tyrant: { id: 'swamp_tyrant', name: 'Swamp Tyrant', hp: 160, atk: 24, def: 13, gold: 80, exp: 45, baseCoins: 350, baseGems: 4, tier: 4 },
  dark_lord: { id: 'dark_lord', name: 'Dark Lord', hp: 220, atk: 32, def: 18, gold: 120, exp: 65, baseCoins: 500, baseGems: 5, tier: 5 },
};

// NPCs
export const REALM_NPCS = {
  elder: {
    id: 'elder',
    name: 'Arena Master',
    dialogue: 'Welcome, champion. Import your auras from Locked storage and equip them. Travel to any arena to challenge a boss. Victory rewards coins and gems.',
    quests: ['first_steps'],
    shop: null,
  },
};

// Special moves for auras >= 100T rarity (Pokemon-style)
const REALM_SPECIAL_MOVES = [
  { id: 'power_strike', name: 'Power Strike', desc: '1.5× ATK damage', damageMult: 1.5 },
  { id: 'execute', name: 'Execute', desc: '2× damage if enemy < 30% HP', damageMult: 1, executeThreshold: 0.3, executeMult: 2 },
  { id: 'lifesteal', name: 'Lifesteal', desc: 'Heal 50% of damage dealt', damageMult: 1, lifestealRatio: 0.5 },
  { id: 'shield_bash', name: 'Shield Bash', desc: '0.8× damage, +5 DEF this fight', damageMult: 0.8, defBonus: 5 },
  { id: 'critical_blow', name: 'Critical Blow', desc: '2× damage, 30% chance', damageMult: 1, critChance: 0.3, critMult: 2 },
  { id: 'healing_light', name: 'Healing Light', desc: 'Heal 20% max HP, no attack', damageMult: 0, healRatio: 0.2 },
  { id: 'void_slash', name: 'Void Slash', desc: '1.3× damage, ignore 20% enemy DEF', damageMult: 1.3, ignoreDef: 0.2 },
  { id: 'elemental_burst', name: 'Elemental Burst', desc: '1.4× damage', damageMult: 1.4 },
];

const REALM_100T = 1e14;   // 100 trillion — 1 move
const REALM_1Q = 1e15;     // 1 quadrillion — 2 moves

/** Deterministic hash from aura identity for move assignment */
function auraMoveSeed(aura) {
  const str = (aura.text || '') + '|' + (aura.rarity || 0);
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
  return Math.abs(h);
}

/**
 * Returns 1 or 2 special moves for auras with rarity >= 100T.
 * ≥ 1Q grants 2 moves; 100T–999T grants 1 move.
 */
export function getAuraSpecialMoves(aura) {
  const r = Math.max(0, aura.rarity ?? 0);
  if (r < REALM_100T) return [];
  const seed = auraMoveSeed(aura);
  const count = r >= REALM_1Q ? 2 : 1;
  const moves = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let idx = Math.abs((seed + i * 31) % REALM_SPECIAL_MOVES.length);
    while (used.has(idx) && used.size < REALM_SPECIAL_MOVES.length) {
      idx = (idx + 1) % REALM_SPECIAL_MOVES.length;
    }
    used.add(idx);
    moves.push(REALM_SPECIAL_MOVES[idx]);
  }
  return moves;
}

export { REALM_SPECIAL_MOVES };

// Quests
export const REALM_QUESTS = [
  {
    id: 'first_steps',
    name: 'First Steps',
    description: 'Defeat your first boss in the Arena.',
    objectives: [{ type: 'kill', target: 'any', count: 1 }],
    rewards: { gold: 20, exp: 10 },
    npcId: 'elder',
  },
  {
    id: 'arena_novice',
    name: 'Arena Novice',
    description: 'Defeat 3 bosses (any).',
    objectives: [{ type: 'kill', target: 'any', count: 3 }],
    rewards: { gold: 75, exp: 30 },
    npcId: 'elder',
  },
  {
    id: 'champion',
    name: 'Champion',
    description: 'Defeat the Dark Lord.',
    objectives: [{ type: 'kill', target: 'dark_lord', count: 1 }],
    rewards: { gold: 150, exp: 75 },
    npcId: 'elder',
  },
];
