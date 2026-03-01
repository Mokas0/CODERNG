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

// Map: node graph — 8 locations
export const REALM_MAP_NODES = [
  { id: 'village', name: 'Starting Village', type: 'town', desc: 'A peaceful village. Rest and prepare.', connections: ['forest_path'], enemies: null, npcId: 'elder' },
  { id: 'forest_path', name: 'Forest Path', type: 'wilderness', desc: 'A winding path through ancient trees.', connections: ['village', 'cave_entrance', 'crossroads'], enemies: ['wolf'], npcId: null },
  { id: 'cave_entrance', name: 'Mountain Cave', type: 'dungeon', desc: 'Dark entrance to a dungeon. Danger awaits.', connections: ['forest_path'], enemies: ['goblin'], npcId: null, dungeonId: 'cave' },
  { id: 'cave_room2', name: 'Cave — Deep Chamber', type: 'dungeon', desc: 'Deeper into the darkness.', connections: [], enemies: ['goblin'], npcId: null },
  { id: 'cave_boss', name: 'Cave — Boss Lair', type: 'boss', desc: 'The cave lord awaits.', connections: [], enemies: ['cave_troll'], npcId: null },
  { id: 'crossroads', name: 'Crossroads', type: 'wilderness', desc: 'Where paths meet.', connections: ['forest_path', 'swamp_edge'], enemies: ['bandit'], npcId: null },
  { id: 'swamp_edge', name: 'Swamp Edge', type: 'wilderness', desc: 'Murky waters and twisted roots.', connections: ['crossroads', 'dark_castle'], enemies: ['skeleton'], npcId: null },
  { id: 'dark_castle', name: 'Dark Castle', type: 'boss', desc: 'The final challenge.', connections: ['swamp_edge'], enemies: ['dark_lord'], npcId: null },
];

// Dungeon room sequences
export const REALM_DUNGEONS = {
  cave: {
    id: 'cave',
    name: 'Mountain Cave',
    rooms: [
      { enemyId: 'goblin' },
      { enemyId: 'goblin' },
      { enemyId: 'goblin' },
      { enemyId: 'cave_troll' },
    ],
  },
};

// Enemies
export const REALM_ENEMIES = {
  wolf: { id: 'wolf', name: 'Forest Wolf', hp: 30, atk: 4, def: 2, gold: 5, exp: 3 },
  goblin: { id: 'goblin', name: 'Cave Goblin', hp: 25, atk: 5, def: 1, gold: 8, exp: 5 },
  bandit: { id: 'bandit', name: 'Highway Bandit', hp: 40, atk: 6, def: 3, gold: 15, exp: 8 },
  skeleton: { id: 'skeleton', name: 'Skeletal Warrior', hp: 35, atk: 7, def: 4, gold: 12, exp: 7 },
  cave_troll: { id: 'cave_troll', name: 'Cave Troll', hp: 80, atk: 12, def: 6, gold: 50, exp: 25 },
  dark_lord: { id: 'dark_lord', name: 'Dark Lord', hp: 150, atk: 18, def: 10, gold: 100, exp: 50 },
};

// NPCs
export const REALM_NPCS = {
  elder: {
    id: 'elder',
    name: 'Village Elder',
    dialogue: 'Welcome, traveler. Import your auras from Locked storage and equip them. Then venture forth. The forest holds danger — and treasure.',
    quests: ['first_steps'],
    shop: null,
  },
};

// Quests
export const REALM_QUESTS = [
  {
    id: 'first_steps',
    name: 'First Steps',
    description: 'Defeat your first enemy in the Realm.',
    objectives: [{ type: 'kill', target: 'any', count: 1 }],
    rewards: { gold: 20, exp: 10 },
    npcId: 'elder',
  },
  {
    id: 'forest_clear',
    name: 'Clear the Forest',
    description: 'Defeat 3 Wolves.',
    objectives: [{ type: 'kill', target: 'wolf', count: 3 }],
    rewards: { gold: 50, exp: 20 },
    npcId: 'elder',
  },
  {
    id: 'cave_conquer',
    name: 'Conquer the Cave',
    description: 'Defeat the Cave Troll.',
    objectives: [{ type: 'kill', target: 'cave_troll', count: 1 }],
    rewards: { gold: 100, exp: 50 },
    npcId: 'elder',
  },
];
