import './style.css';
import { ITEMS, WORLD2_ITEMS, SECRET_AURAS, BIOME_AURAS, ELDER_AURAS, ASCENDANT_AURAS, EMPEROR_AURAS, AURAS_100Q, ACCOMPLISHMENT_AURAS, MUTATION_AURAS, GEOMETRICAL_AURAS, TIER2_AURAS, SUPREME_KING_AURA, JIA_VOID_AURAS, JIA_RARE_ITEMS, VOID_QUEEN_AURA, BOOK_OF_POWER_AURA, SELLER_MATERIALS, classifyAuraType } from './data/items.js';
import { supabase, isHubAvailable } from './supabase.js';

// World detection: data-world on <html> or <body>; default 1
const _worldRaw = parseInt(
  document.documentElement.getAttribute('data-world') || document.body?.getAttribute('data-world') || '1',
  10
);
const WORLD_ID = (_worldRaw === 1 || _worldRaw === 2) ? _worldRaw : 1;
const STORAGE_PREFIX = WORLD_ID === 2 ? 'rng_w2_' : 'rng_';
const STORAGE_KEYS = {
  coins: STORAGE_PREFIX + 'coins',
  history: STORAGE_PREFIX + 'history',
  luck: 'rng_luck', // shared across worlds
  locked: STORAGE_PREFIX + 'locked',
  lockedStorage: STORAGE_PREFIX + 'locked_storage',
  shopRotationEnd: STORAGE_PREFIX + 'shop_rotation_end',
  shopSeed: STORAGE_PREFIX + 'shop_seed',
  bennyNextAt: STORAGE_PREFIX + 'benny_next_at',
  patrickNextAt: STORAGE_PREFIX + 'patrick_next_at',
  scraps: STORAGE_PREFIX + 'scraps',
  gearBonus: STORAGE_PREFIX + 'gear_bonus',
  snehoRotationEnd: STORAGE_PREFIX + 'sneho_rotation_end',
  snehoSeed: STORAGE_PREFIX + 'sneho_seed',
  tycoonCpc: STORAGE_PREFIX + 'tycoon_cpc',
  tycoonUpgrades: STORAGE_PREFIX + 'tycoon_upgrades',
  tycoonClicks: STORAGE_PREFIX + 'tycoon_clicks',
  tycoonEarned: STORAGE_PREFIX + 'tycoon_earned',
  cutsceneThreshold: STORAGE_PREFIX + 'settings_cutscene_threshold',
  visitedWorld2: 'rng_visited_world2', // shared across worlds
  elderSnehoTotal: STORAGE_PREFIX + 'elder_sneho_total',
  elderRollTotal: STORAGE_PREFIX + 'elder_roll_total',
  elderCurseTotal: STORAGE_PREFIX + 'elder_curse_total',
  elderCoinsSpent: STORAGE_PREFIX + 'elder_coins_spent',
  elderReceived: STORAGE_PREFIX + 'elder_received',
  elderUnlocked: STORAGE_PREFIX + 'elder_unlocked',
  questDailyEnd: STORAGE_PREFIX + 'quest_daily_end',
  questDailySeed: STORAGE_PREFIX + 'quest_daily_seed',
  questWeeklyEnd: STORAGE_PREFIX + 'quest_weekly_end',
  questWeeklySeed: STORAGE_PREFIX + 'quest_weekly_seed',
  questDailyProg: STORAGE_PREFIX + 'quest_daily_prog',
  questDailyClaimed: STORAGE_PREFIX + 'quest_daily_claimed',
  questWeeklyProg: STORAGE_PREFIX + 'quest_weekly_prog',
  questWeeklyClaimed: STORAGE_PREFIX + 'quest_weekly_claimed',
  potionInventory: STORAGE_PREFIX + 'potion_inventory',
  competitionType: STORAGE_PREFIX + 'competition_type',
  competitionQuests: STORAGE_PREFIX + 'competition_quests',
  nullCoins: STORAGE_PREFIX + 'null_coins',
  materials: STORAGE_PREFIX + 'materials',
};

const WORLD_CONFIG = {
  worldId: WORLD_ID,
  items: WORLD_ID === 2 ? WORLD2_ITEMS : ITEMS,
  luckCapEffective: WORLD_ID === 2 ? 30 : Infinity,
};
// World 2: max raw (luck + gear) so that effective = (luck+gear)^0.4 <= 30
const MAX_RAW_LUCK_WORLD2 = Math.pow(30, 1 / 0.4);

const SHOP_ROTATION_MS  = 5  * 60 * 1000;  // 5 minutes
const SNEHO_ROTATION_MS = 10 * 60 * 1000;  // 10 minutes
const BENNY_INTERVAL_MS = 60 * 60 * 1000;  // 60 minutes
const PATRICK_INTERVAL_MS = 120 * 60 * 1000;  // 120 minutes (2× rarer than Benny)
const JIA_SPAWN_CHANCE = 1 / 180;
const JIA_MINUTE_MS = 60 * 1000;
const JIA_VOID_POTION_COST = 1200;
const BOOK_OF_POWER_CHANCE = 1 / 500; // Void Potion only, after Void Queen + Supreme King

function getCoins() {
  return Number(localStorage.getItem(STORAGE_KEYS.coins) || 0);
}
function setCoins(n) {
  const prev = getCoins();
  const next = Math.max(0, Math.floor(n));
  if (next < prev) {
    const spent = prev - next;
    const total = Number(localStorage.getItem(STORAGE_KEYS.elderCoinsSpent) || 0) + spent;
    localStorage.setItem(STORAGE_KEYS.elderCoinsSpent, String(total));
  }
  localStorage.setItem(STORAGE_KEYS.coins, String(next));
}
function getScraps() {
  return Number(localStorage.getItem(STORAGE_KEYS.scraps) || 0);
}
function setScraps(n) {
  localStorage.setItem(STORAGE_KEYS.scraps, String(Math.max(0, Math.floor(n))));
  // THE HOARDER check happens after scraps settle; defer so getters are current
  setTimeout(() => { checkElderUnlock(); checkAscendantUnlock(); checkEmperorUnlock(); }, 0);
}

function getMaterials() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.materials)) || {}; }
  catch { return {}; }
}
function setMaterials(obj) {
  localStorage.setItem(STORAGE_KEYS.materials, JSON.stringify(obj));
}
function getMaterialCount(id) {
  const m = getMaterials();
  return Math.max(0, Math.floor(m[id] || 0));
}
function addMaterial(id, n) {
  if (!n || n < 1) return;
  const m = getMaterials();
  m[id] = (m[id] || 0) + n;
  setMaterials(m);
}
function hasMaterials(recipe) {
  if (!Array.isArray(recipe)) return false;
  for (const { id, n } of recipe) {
    if (getMaterialCount(id) < n) return false;
  }
  return true;
}
function consumeMaterials(recipe) {
  if (!hasMaterials(recipe)) return false;
  const m = getMaterials();
  for (const { id, n } of recipe) {
    m[id] = Math.max(0, (m[id] || 0) - n);
    if (m[id] <= 0) delete m[id];
  }
  setMaterials(m);
  return true;
}

const GEAR_LUCK_CAP = 15_000;

function getGearBonus() {
  return Math.min(Number(localStorage.getItem(STORAGE_KEYS.gearBonus) || 0), GEAR_LUCK_CAP);
}
function addGearBonus(amount) {
  const newBonus = Math.min(Math.max(0, getGearBonus() + amount), GEAR_LUCK_CAP);
  localStorage.setItem(STORAGE_KEYS.gearBonus, String(newBonus));
}
function getHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function setHistory(arr) {
  const kept = arr.slice(-100);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(kept));
}
function getLuckMultiplier() {
  const raw = Number(localStorage.getItem(STORAGE_KEYS.luck) || 1);
  if (WORLD_ID === 2) {
    const maxBase = Math.max(1, Math.floor(MAX_RAW_LUCK_WORLD2 - getGearBonus()));
    return Math.min(raw, maxBase);
  }
  return raw;
}
function setLuckMultiplier(m) {
  if (WORLD_ID === 2) {
    const maxBase = Math.max(1, Math.floor(MAX_RAW_LUCK_WORLD2 - getGearBonus()));
    m = Math.min(m, maxBase);
  }
  localStorage.setItem(STORAGE_KEYS.luck, String(Math.max(1, m)));
}

function getNullCoins() {
  if (WORLD_ID !== 2) return 0;
  return Math.max(0, Number(localStorage.getItem(STORAGE_KEYS.nullCoins) || 0));
}
function setNullCoins(n) {
  if (WORLD_ID !== 2) return;
  localStorage.setItem(STORAGE_KEYS.nullCoins, String(Math.max(0, Math.floor(n))));
}

function getLockedStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.lockedStorage);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function setLockedStorage(arr) {
  localStorage.setItem(STORAGE_KEYS.lockedStorage, JSON.stringify(arr));
}

function getPotionInventory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.potionInventory)) || {}; }
  catch { return {}; }
}
function setPotionInventory(inv) {
  localStorage.setItem(STORAGE_KEYS.potionInventory, JSON.stringify(inv));
}

// Migrate old lock-by-id to separate storage (one-time)
function migrateLockedToStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.locked);
    if (!raw || localStorage.getItem(STORAGE_KEYS.lockedStorage)) return;
    const ids = new Set(JSON.parse(raw));
    if (ids.size === 0) return;
    let history = getHistory();
    const locked = getLockedStorage();
    for (let i = history.length - 1; i >= 0; i--) {
      const id = history[i].historyId || `legacy-${i}`;
      if (ids.has(id)) {
        locked.push(history[i]);
        history.splice(i, 1);
      }
    }
    setHistory(history);
    setLockedStorage(locked);
    localStorage.removeItem(STORAGE_KEYS.locked);
  } catch (_) {}
}

// Weight assigned to unlocked elder/ascendant auras in the roll pool.
// Matches their 9Q display rarity — extremely rare even once unlocked.
const ELDER_ROLL_WEIGHT = 1 / 9_000_000_000_000_000;

function weightedRandom(multiplier = 1, extraItems = []) {
  // Compress luck via power curve so potions feel impactful but can't fully
  // flatten the rarity spectrum.  effectiveMult = luck^0.4 (capped in World 2 at 30).
  const rawEffective = Math.pow(Math.max(multiplier, 1), 0.4);
  const effectiveMult = Math.min(rawEffective, WORLD_CONFIG.luckCapEffective);
  const pool = [...WORLD_CONFIG.items, ...extraItems];
  const weights = pool.map((i) => Math.pow(i.weight, 1 / effectiveMult));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return { ...pool[i], index: i };
  }
  return { ...pool[pool.length - 1], index: pool.length - 1 };
}

const AURA_TYPE_INFO = {
  yoso:     { label: '요소 Yoso',     tag: 'Elemental', color: '#00ccff', perk: 'Deposit +15% — coins add 1.15× to bank' },
  myeongsa: { label: '명사 Myeongsa', tag: 'Object',    color: '#ffaa33', perk: 'Bank shield — raids deal 10% less damage to your team' },
  dongsa:   { label: '동사 Dongsa',   tag: 'Verb',      color: '#ff55aa', perk: 'Raid +25% — sacrificed auras deal 1.25× damage' },
};

// ─── Competition of Colors (Blobfish NPC) — Individual quest-completion ───────
const COMPETITION_COLORS = ['green', 'red', 'blue', 'black', 'white', 'orange', 'purple'];
const COLOR_INFO = {
  green:  { label: 'Green',  color: '#22c55e' },
  red:    { label: 'Red',    color: '#ef4444' },
  blue:   { label: 'Blue',   color: '#3b82f6' },
  black:  { label: 'Black',  color: '#1f2937' },
  white:  { label: 'White',  color: '#f8fafc' },
  orange: { label: 'Orange', color: '#f97316' },
  purple: { label: 'Purple', color: '#a855f7' },
};
const SEASON_MS = 30 * 24 * 60 * 60 * 1000; // ~30 days

function getCompetitionSeasonKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getCompetitionSeasonEnd() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getCompetitionAssignedColor() {
  const key = getCompetitionSeasonKey();
  let color = localStorage.getItem(`${STORAGE_KEYS.competitionType}_${key}`);
  if (!color || !COMPETITION_COLORS.includes(color)) {
    color = COMPETITION_COLORS[Math.floor(Math.random() * COMPETITION_COLORS.length)];
    localStorage.setItem(`${STORAGE_KEYS.competitionType}_${key}`, color);
  }
  return color;
}

function getCompetitionQuestsCompleted(seasonKey) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.competitionQuests) || '{}';
    const obj = JSON.parse(raw);
    return Number(obj[seasonKey]) || 0;
  } catch { return 0; }
}

function incrementCompetitionQuestsCompleted() {
  const key = getCompetitionSeasonKey();
  const obj = {};
  try {
    Object.assign(obj, JSON.parse(localStorage.getItem(STORAGE_KEYS.competitionQuests) || '{}'));
  } catch {}
  obj[key] = (Number(obj[key]) || 0) + 1;
  localStorage.setItem(STORAGE_KEYS.competitionQuests, JSON.stringify(obj));
}

function computeCompetitionScore() {
  return getCompetitionQuestsCompleted(getCompetitionSeasonKey());
}

async function submitCompetitionScore() {
  if (!supabase) return;
  const username = getHubUsername();
  if (!username) {
    showCompetitionFeedback('Set a display name in the Hub first.');
    return;
  }
  const score = computeCompetitionScore();
  const seasonKey = getCompetitionSeasonKey();
  const assignedColor = getCompetitionAssignedColor();
  const token = getDeviceToken();
  await supabase.from('competition_entries').delete().eq('season_key', seasonKey).eq('device_token', token);
  const { error } = await supabase.from('competition_entries').insert(
    { season_key: seasonKey, username, device_token: token, assigned_type: assignedColor, score, deposited: 0, updated_at: new Date().toISOString() }
  );
  showCompetitionFeedback(error ? `Failed: ${error.message}` : `Score submitted: ${score.toLocaleString()} quests completed`);
  if (!error) renderCompetition();
}

function showCompetitionFeedback(msg) {
  const el = document.getElementById('competition-feedback');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 4000); }
}

async function fetchCompetitionLeaderboard() {
  if (!supabase) return [];
  const seasonKey = getCompetitionSeasonKey();
  const { data } = await supabase
    .from('competition_entries')
    .select('username, score, assigned_type')
    .eq('season_key', seasonKey)
    .order('score', { ascending: false })
    .limit(50);
  return (data || []).map(e => ({ ...e, score: Number(e.score) || 0 }));
}

async function ensureCompetitionEntry() {
  const username = getHubUsername();
  if (!username) return false;
  const seasonKey = getCompetitionSeasonKey();
  const assignedColor = getCompetitionAssignedColor();
  const token = getDeviceToken();
  const { data: existing } = await supabase.from('competition_entries').select('id').eq('season_key', seasonKey).eq('device_token', token).single();
  if (existing) return true;
  const score = computeCompetitionScore();
  await supabase.from('competition_entries').insert(
    { season_key: seasonKey, username, device_token: token, assigned_type: assignedColor, score, deposited: 0, updated_at: new Date().toISOString() }
  );
  return true;
}

function renderCompetition() {
  const seasonKey = getCompetitionSeasonKey();
  const endMs = getCompetitionSeasonEnd();
  const assignedColor = getCompetitionAssignedColor();
  const score = computeCompetitionScore();
  const info = COLOR_INFO[assignedColor];

  const seasonEl = document.getElementById('competition-season-label');
  const endsEl = document.getElementById('competition-ends');
  const typeEl = document.getElementById('competition-type-label');
  const scoreEl = document.getElementById('competition-score');

  if (seasonEl) seasonEl.textContent = seasonKey;
  if (endsEl) endsEl.textContent = new Date(endMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (typeEl) {
    typeEl.textContent = info ? info.label : assignedColor;
    if (info) typeEl.style.color = info.color;
  }
  const perkEl = document.getElementById('competition-perk-label');
  if (perkEl) perkEl.style.display = 'none';

  if (scoreEl) scoreEl.textContent = score.toLocaleString();

  fetchCompetitionLeaderboard().then(entries => {
    const allBoards = document.getElementById('competition-all-leaderboards');
    if (allBoards) {
      allBoards.innerHTML = `
        <div class="competition-leaderboard-block">
          <h5 class="competition-leaderboard-block-title">Quests completed</h5>
          <ol class="competition-leaderboard-list">
            ${entries.length === 0 ? '<li class="competition-empty">No entries</li>' : entries.map((e, i) => {
              const colorInfo = COLOR_INFO[e.assigned_type] || {};
              return `<li class="competition-entry"><span class="competition-rank">${i + 1}.</span><span style="color:${colorInfo.color || '#888'}">●</span> ${escapeHtml(e.username)} — ${e.score.toLocaleString()} quests</li>`;
            }).join('')}
          </ol>
        </div>
      `;
    }
  });
}

function formatRarity(rarity) {
  if (rarity === -1) return 'UNOBTAINABLE';
  if (rarity === 0) return 'SECRET';
  if (rarity >= 1e18) return `1 / ${(rarity / 1e18).toFixed(2)}Qi`; // quintillion
  if (rarity >= 1e15) return `1 / ${(rarity / 1e15).toFixed(2)}Q`;
  if (rarity >= 1e12) return `1 / ${(rarity / 1e12).toFixed(2)}T`;
  if (rarity >= 1e9)  return `1 / ${(rarity / 1e9).toFixed(1)}B`;
  if (rarity >= 1e6)  return `1 / ${(rarity / 1e6).toFixed(1)}M`;
  if (rarity >= 1e3)  return `1 / ${(rarity / 1e3).toFixed(1)}K`;
  return `1 / ${rarity}`;
}

function coinsForSalvage(rarity) {
  const base = Math.max(1, Math.floor(100 / Math.log10(rarity + 1)));
  return Math.min(10000, base);
}

function nullCoinsForSale(rarity) {
  const r = Math.max(1, rarity);
  const base = Math.min(2000, Math.max(1, Math.floor(Math.log10(r + 1) * 80)));
  const variance = Math.floor(base * 0.5 * Math.random());
  return base + variance;
}

function renderResult(item) {
  const el = document.getElementById('result');
  const label = document.getElementById('result-label');
  const catEl = document.getElementById('result-category');
  const typeEl = document.getElementById('result-aura-type');
  if (!el || !label) return;
  el.textContent = item.text;
  if (typeEl) {
    const at = item.auraType || classifyAuraType(item.text);
    const info = AURA_TYPE_INFO[at];
    if (info) {
      typeEl.textContent = `${info.label} · ${info.tag}`;
      typeEl.style.color = info.color;
      typeEl.style.display = '';
    } else {
      typeEl.style.display = 'none';
    }
  }
  el.style.fontFamily = `"${item.font}", sans-serif`;
  el.style.color = item.color;
  el.style.fontWeight = item.fontWeight || '400';
  el.style.fontStyle = item.fontStyle || 'normal';
  el.style.textShadow = item.textShadow || 'none';
  label.textContent = formatRarity(item.rarity);
  label.className = 'rarity-label';
  if (catEl) {
    const cat = item.isSupremeKing ? '♔ UNOBTAINABLE ♔'
      : item.isTier2 ? '✦ Tier 2 Aura'
      : item.isEmperor ? '♛ Emperor Aura ♛'
      : item.is100Q ? '✦ 100Q Aura ✦'
      : item.isAscendant ? '⬡ Ascendant Aura'
      : item.isElder ? '⬡ Elder Aura'
      : item.isSecret || item.rarity === 0 ? '⚠ Secret Aura'
      : item.isBiome ? '🌍 Biome Aura'
      : item.isNull ? 'NULL'
      : item.isMutation ? `⟁ Mutation: ${item.subtitle || 'Unknown'}`
      : '';
    catEl.textContent = cat;
    catEl.style.color = item.isSupremeKing ? '#ffd700'
      : item.isTier2 ? '#ffd700'
      : item.isEmperor ? '#ffd700'
      : item.is100Q ? '#ffd700'
      : item.isAscendant ? '#00ddaa'
      : item.isElder ? 'gold'
      : item.isSecret || item.rarity === 0 ? '#ff4444'
      : item.isBiome ? '#88cc44'
      : item.isNull ? '#666'
      : item.isMutation ? '#ff88ff'
      : '';
    catEl.style.display = cat ? '' : 'none';
  }
}

function renderCoins() {
  const el = document.getElementById('coins');
  if (el) el.textContent = getCoins().toLocaleString();
}

function renderRollCount() {
  const el = document.getElementById('roll-count');
  if (el) el.textContent = getElderRollTotal().toLocaleString();
}

function renderLuck() {
  const m = getLuckMultiplier();
  const gear = getGearBonus();
  const total = m + gear;
  const effectiveRaw = Math.pow(Math.max(total, 1), 0.4);
  const effectiveMult = Math.min(effectiveRaw, WORLD_CONFIG.luckCapEffective);
  const el = document.getElementById('luck-value');
  const btn = document.getElementById('luck-btn');
  if (el) {
    const fmt = (n) => Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
    if (WORLD_CONFIG.luckCapEffective !== Infinity && effectiveRaw >= WORLD_CONFIG.luckCapEffective) {
      el.textContent = `${fmt(effectiveMult)}× (capped)`;
    } else if (gear > 0) {
      el.textContent = `${fmt(effectiveMult)}× (${fmt(m)} + ${fmt(gear)} gear)`;
    } else {
      el.textContent = effectiveMult === 1 ? '1× (normal)' : `${fmt(effectiveMult)}×`;
    }
  }
  if (btn) {
    const cost = luckCost(m);
    btn.textContent = `Boost luck (${cost} coins)`;
    btn.disabled = getCoins() < cost;
  }
}

function luckCost(currentMult) {
  // Cost scales linearly with current multiplier so each +2 click gets progressively more expensive.
  return Math.floor(50 * Math.max(currentMult, 1));
}

// Theo's gears: permanent luck boosters bought with scraps
const GEAR_TIERS = [
  { id: 'gear_worn',      name: 'Worn Gear',      emoji: '⚙️',  luckBonus: 2,   cost: 10,  desc: 'A rusty old gear. Still spins.' },
  { id: 'gear_iron',      name: 'Iron Gear',      emoji: '🔩',  luckBonus: 6,   cost: 30,  desc: 'Solid iron. Noticeably luckier.' },
  { id: 'gear_steel',     name: 'Steel Gear',     emoji: '🔧',  luckBonus: 17,  cost: 80,  desc: 'Precision-crafted steel.' },
  { id: 'gear_enchanted', name: 'Enchanted Gear', emoji: '✨',  luckBonus: 50,  cost: 200, desc: 'Glows faintly. Luck surges.' },
  { id: 'gear_divine',    name: 'Divine Gear',    emoji: '🌟',  luckBonus: 125, cost: 600, desc: 'Radiates raw fortune.' },
];

// Scraps drop chance and amount from salvaging
function scrapsFromSalvage(rarity) {
  let chance, min, max;
  if      (rarity < 10)          { chance = 0.05; min = 1; max = 1; }
  else if (rarity < 100)         { chance = 0.10; min = 1; max = 1; }
  else if (rarity < 1_000)       { chance = 0.18; min = 1; max = 1; }
  else if (rarity < 10_000)      { chance = 0.28; min = 1; max = 1; }
  else if (rarity < 100_000)     { chance = 0.40; min = 1; max = 2; }
  else if (rarity < 1_000_000)   { chance = 0.55; min = 1; max = 2; }
  else if (rarity < 100_000_000) { chance = 0.70; min = 1; max = 3; }
  else                           { chance = 0.90; min = 2; max = 5; }
  if (Math.random() > chance) return 0;
  return min + Math.floor(Math.random() * (max - min + 1));
}

// Shop potions: id, name, cost, luckBonus (added to current multiplier for next roll)
const POTIONS = [
  { id: 'potion1', name: 'Minor Luck Potion', cost: 25,  luckBonus: 25,   emoji: '🧪' },
  { id: 'potion2', name: 'Luck Potion',        cost: 50,  luckBonus: 75,   emoji: '⚗️' },
  { id: 'potion3', name: 'Greater Luck Potion',cost: 120, luckBonus: 200,  emoji: '🔮' },
  { id: 'potion4', name: 'Supreme Luck Elixir',cost: 300, luckBonus: 600,  emoji: '✨' },
  { id: 'potion5', name: 'Mythic Fortune Brew', cost: 700, luckBonus: 1750, emoji: '🌟' },
];
// Very rare spawn in rotating shop only (not in Benny's list)
const LEGENDARY_LUCK_POTION = { id: 'potionLegendary3000', name: 'Legendary Luck Elixir', cost: 5000, luckBonus: 5000, emoji: '👑' };
const LEGENDARY_POTION_SPAWN_CHANCE = 0.008;
// Benny-exclusive potions (not sold anywhere else)
const BENNY_EXCLUSIVE_POTIONS = [
  { id: 'potionBennyBargain',    name: "Benny's Bargain Brew",  cost: 8,    luckBonus: 15,    emoji: '🎒', desc: "Dirt cheap and it works." },
  { id: 'potionBennyTonic',      name: "Old Road Tonic",        cost: 18,   luckBonus: 40,    emoji: '🫙', desc: "Brewed on the road. Surprisingly potent." },
  { id: 'potionBennyCraft',      name: "Crafter's Draft",       cost: 75,   luckBonus: 175,   emoji: '🔩', desc: "Concocted from leftover parts. Great deal." },
  { id: 'potionBennyUltraluck',  name: 'Ultraluck Potion',      cost: 5000, luckBonus: 25000, emoji: '⚡', desc: "Benny's rarest. Surprisingly affordable." },
];

// Patrick-exclusive potions — huge luck, hefty price. Patrick appears 2× rarer than Benny.
const PATRICK_EXCLUSIVE_POTIONS = [
  { id: 'potionPatrickMega',     name: "Patrick's Mega Brew",   cost: 50000,  luckBonus: 250_000,   emoji: '🌟', desc: 'Massive luck. Massive price.' },
  { id: 'potionPatrickTitan',    name: "Patrick's Titan Elixir", cost: 250_000, luckBonus: 1_250_000, emoji: '💫', desc: 'For those who spare no expense.' },
  { id: 'potionPatrickColossus', name: "Patrick's Colossus",    cost: 1_000_000, luckBonus: 7_500_000, emoji: '🔮', desc: 'The big one. You know what you\'re paying for.' },
];

// Supreme Luck Potion — 1/100 chance to appear in Benny's shop per visit
const SUPREME_LUCK_POTION = {
  id: 'potionSupremeLuck', name: 'Supreme Luck Potion', cost: 150000,
  luckBonus: 15_000_000, emoji: '👑✨', desc: 'The rarest potion in existence. Benny found it once. He may never find another.',
};
const SUPREME_POTION_APPEAR_CHANCE = 1 / 100;
const SUPREME_KING_SPAWN_CHANCE = 1 / 1_000;

// Potion of Destruction — crafted from Jia materials (World 2); guarantees Void Queen
const POTION_OF_DESTRUCTION = {
  id: 'potionDestruction', name: 'Potion of Destruction', luckBonus: 0, emoji: '💀',
  desc: 'Use in World 2 to summon THE VOID QUEEN. The enemy of the Supreme King.',
};

const ALL_POTIONS_BY_ID = {};
[...POTIONS, LEGENDARY_LUCK_POTION, ...BENNY_EXCLUSIVE_POTIONS, ...PATRICK_EXCLUSIVE_POTIONS, SUPREME_LUCK_POTION, POTION_OF_DESTRUCTION].forEach(p => {
  ALL_POTIONS_BY_ID[p.id] = p;
});

// ——— Sneho's forbidden shop ———
// Each item has a cursedChance: if the curse triggers the luck effect is negative (cursedPenalty)
const SNEHO_ITEMS = [
  { id: 'sneho1', name: 'Shadowed Vial',       cost: 8,    luckBonus: 12,    cursedChance: 0.50, cursedPenalty: -8,     emoji: '🫗',  desc: 'Could go either way.' },
  { id: 'sneho2', name: "Demon's Brew",         cost: 30,   luckBonus: 40,    cursedChance: 0.40, cursedPenalty: -25,    emoji: '😈',  desc: 'Smells of sulfur. High risk, high reward.' },
  { id: 'sneho3', name: 'Void Essence',         cost: 150,  luckBonus: 175,   cursedChance: 0.30, cursedPenalty: -100,   emoji: '🕳️', desc: 'Bottled nothing. Unstable.' },
  { id: 'sneho4', name: 'Blood Moon Extract',   cost: 800,  luckBonus: 600,   cursedChance: 0.25, cursedPenalty: -350,   emoji: '🌑',  desc: 'Only available on the wrong night.' },
  { id: 'sneho5', name: 'Forbidden Pact Seal',  cost: 5000, luckBonus: 2500, cursedChance: 0.20, cursedPenalty: -1500, emoji: '📜',  desc: 'Sign your soul away. Might be worth it.' },
  { id: 'sneho6', name: 'Cursed Coin',          cost: 50,   luckBonus: 30,    cursedChance: 0.65, cursedPenalty: -20,    emoji: '🪙',  desc: 'Suspiciously cheap.' },
  { id: 'sneho7', name: 'Hex Flask',            cost: 400,  luckBonus: 350,   cursedChance: 0.35, cursedPenalty: -200,   emoji: '💀',  desc: 'Handle with care. Or don\'t.' },
];

// Incarnatus — 1/5000 chance to appear in Sneho (no luck modifier). Grants a Geometrical aura.
const INCARNATUS_POTION = {
  id: 'snehoIncarnatus', name: 'Incarnatus', cost: 25000,
  emoji: '🔷', desc: 'Bottled geometry. Drink to manifest one of the top ten demons.',
  grantsAura: 'geometrical',
};
const INCARNATUS_APPEAR_CHANCE = 1 / 5000;

// ——— Rotating shop (resets every 5 min) ———
function getShopRotationEnd() {
  return Number(localStorage.getItem(STORAGE_KEYS.shopRotationEnd) || 0);
}
function setShopRotationEnd(ts) {
  localStorage.setItem(STORAGE_KEYS.shopRotationEnd, String(ts));
}
function getShopSeed() {
  return Number(localStorage.getItem(STORAGE_KEYS.shopSeed) || 0);
}
function setShopSeed(seed) {
  localStorage.setItem(STORAGE_KEYS.shopSeed, String(seed));
}

function advanceShopRotationIfNeeded() {
  const now = Date.now();
  let end = getShopRotationEnd();
  if (end === 0 || now >= end) {
    end = now + SHOP_ROTATION_MS;
    setShopRotationEnd(end);
    setShopSeed(Math.floor(Math.random() * 1e9));
  }
  return end;
}

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// ─── Quest Board ──────────────────────────────────────────────────────────────
const QUEST_DAILY_MS  = 30 * 60 * 1000; // 30 minutes
const QUEST_WEEKLY_MS = 7  * 24 * 60 * 60 * 1000;

const DAILY_QUESTS_POOL = [
  { id: 'D01', label: 'The Grinder',      desc: 'Roll 50 times',                  type: 'roll',        target: 50,       reward: 1_000_000 },
  { id: 'D02', label: 'Roll Fiend',       desc: 'Roll 100 times',                 type: 'roll',        target: 100,      reward: 2_000_000 },
  { id: 'D03', label: 'Junk Dealer',      desc: 'Salvage 5 items',                type: 'salvage',     target: 5,        reward: 1_200_000 },
  { id: 'D04', label: "Hoarder's Due",    desc: 'Salvage 15 items',               type: 'salvage',     target: 15,       reward: 2_500_000 },
  { id: 'D05', label: "Sneho's Regular",  desc: 'Buy 3 items from Sneho',         type: 'sneho_buy',   target: 3,        reward: 1_500_000 },
  { id: 'D06', label: 'Lucky Break',      desc: 'Reach 25× luck',                type: 'luck_reach',  target: 25,       reward: 1_000_000 },
  { id: 'D07', label: 'Rare Find',        desc: 'Roll a 10,000+ rarity item',     type: 'rarity_hit',  target: 10_000,   reward: 1_500_000 },
  { id: 'D08', label: 'Coin Spender',     desc: 'Spend 300 coins in the shop',    type: 'shop_spend',  target: 300,      reward: 1_000_000 },
  { id: 'D09', label: 'Scrap Hunter',     desc: 'Earn 10 scraps from salvaging',  type: 'earn_scraps', target: 10,       reward: 2_000_000 },
  { id: 'D10', label: 'High Stakes',      desc: 'Roll a 100,000+ rarity item',    type: 'rarity_hit',  target: 100_000,  reward: 3_000_000 },
  { id: 'D11', label: 'Potion Addict',    desc: 'Buy 5 potions from the shop',    type: 'potion_buy',  target: 5,        reward: 1_500_000 },
  { id: 'D12', label: 'Cursed Run',       desc: 'Get cursed by Sneho 2 times',    type: 'sneho_curse', target: 2,        reward: 2_000_000 },
];

const WEEKLY_QUESTS_POOL = [
  { id: 'W01', label: 'The Machine',        desc: 'Roll 500 times',                      type: 'roll',        target: 500,           reward: 10_000_000 },
  { id: 'W02', label: "Fortune's Witness",  desc: 'Roll a 1,000,000+ rarity item',       type: 'rarity_hit',  target: 1_000_000,     reward: 15_000_000 },
  { id: 'W03', label: "Sneho's Champion",   desc: 'Buy 20 items from Sneho',             type: 'sneho_buy',   target: 20,            reward: 12_000_000 },
  { id: 'W04', label: 'The Collector',      desc: 'Salvage 50 items',                    type: 'salvage',     target: 50,            reward: 20_000_000 },
  { id: 'W05', label: 'Coin King',          desc: 'Spend 5,000 coins in the shop',       type: 'shop_spend',  target: 5_000,         reward: 10_000_000 },
  { id: 'W06', label: 'Scrap Baron',        desc: 'Earn 100 scraps from salvaging',      type: 'earn_scraps', target: 100,           reward: 25_000_000 },
  { id: 'W07', label: 'High Roller',        desc: 'Reach 100× luck',                    type: 'luck_reach',  target: 100,           reward: 15_000_000 },
  { id: 'W08', label: 'Mythic Witness',     desc: 'Roll a 1,000,000,000+ rarity item',  type: 'rarity_hit',  target: 1_000_000_000, reward: 50_000_000 },
];

// Types where progress = max value seen (not cumulative sum)
const QUEST_MAX_TYPES = new Set(['rarity_hit', 'luck_reach']);

function getQuestDailyEnd()   { return Number(localStorage.getItem(STORAGE_KEYS.questDailyEnd)   || 0); }
function getQuestDailySeed()  { return Number(localStorage.getItem(STORAGE_KEYS.questDailySeed)  || 0); }
function getQuestWeeklyEnd()  { return Number(localStorage.getItem(STORAGE_KEYS.questWeeklyEnd)  || 0); }
function getQuestWeeklySeed() { return Number(localStorage.getItem(STORAGE_KEYS.questWeeklySeed) || 0); }
function getQuestDailyProg()  { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.questDailyProg)  || '{}'); } catch { return {}; } }
function getQuestDailyCl()    { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.questDailyClaimed) || '[]'); } catch { return []; } }
function getQuestWeeklyProg() { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.questWeeklyProg) || '{}'); } catch { return {}; } }
function getQuestWeeklyCl()   { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.questWeeklyClaimed) || '[]'); } catch { return []; } }

function advanceQuestRotationsIfNeeded() {
  const now = Date.now();
  if (getQuestDailyEnd() === 0 || now >= getQuestDailyEnd()) {
    localStorage.setItem(STORAGE_KEYS.questDailyEnd,  String(now + QUEST_DAILY_MS));
    localStorage.setItem(STORAGE_KEYS.questDailySeed, String(Math.floor(Math.random() * 1e9)));
    localStorage.setItem(STORAGE_KEYS.questDailyProg,    '{}');
    localStorage.setItem(STORAGE_KEYS.questDailyClaimed, '[]');
  }
  if (getQuestWeeklyEnd() === 0 || now >= getQuestWeeklyEnd()) {
    localStorage.setItem(STORAGE_KEYS.questWeeklyEnd,  String(now + QUEST_WEEKLY_MS));
    localStorage.setItem(STORAGE_KEYS.questWeeklySeed, String(Math.floor(Math.random() * 1e9)));
    localStorage.setItem(STORAGE_KEYS.questWeeklyProg,    '{}');
    localStorage.setItem(STORAGE_KEYS.questWeeklyClaimed, '[]');
  }
}

function seededShuffle(length, seed) {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getActiveDailyQuests() {
  advanceQuestRotationsIfNeeded();
  return seededShuffle(DAILY_QUESTS_POOL.length, getQuestDailySeed())
    .slice(0, 3)
    .map(i => ({ ...DAILY_QUESTS_POOL[i], period: 'daily' }));
}

function getActiveWeeklyQuests() {
  advanceQuestRotationsIfNeeded();
  return seededShuffle(WEEKLY_QUESTS_POOL.length, getQuestWeeklySeed())
    .slice(0, 2)
    .map(i => ({ ...WEEKLY_QUESTS_POOL[i], period: 'weekly' }));
}

function addQuestProgress(type, value = 1) {
  advanceQuestRotationsIfNeeded();
  const dailyQ  = getActiveDailyQuests();
  const weeklyQ = getActiveWeeklyQuests();
  const dp = getQuestDailyProg();   const dc = getQuestDailyCl();
  const wp = getQuestWeeklyProg();  const wc = getQuestWeeklyCl();
  let dChanged = false, wChanged = false;
  for (const q of dailyQ) {
    if (q.type !== type || dc.includes(q.id)) continue;
    const prev = dp[q.id] || 0;
    dp[q.id] = QUEST_MAX_TYPES.has(type) ? Math.max(prev, value) : prev + value;
    dChanged = true;
  }
  for (const q of weeklyQ) {
    if (q.type !== type || wc.includes(q.id)) continue;
    const prev = wp[q.id] || 0;
    wp[q.id] = QUEST_MAX_TYPES.has(type) ? Math.max(prev, value) : prev + value;
    wChanged = true;
  }
  if (dChanged) localStorage.setItem(STORAGE_KEYS.questDailyProg,  JSON.stringify(dp));
  if (wChanged) localStorage.setItem(STORAGE_KEYS.questWeeklyProg, JSON.stringify(wp));
}

function claimQuest(questId, period) {
  advanceQuestRotationsIfNeeded();
  const isDaily = period === 'daily';
  const quest = (isDaily ? getActiveDailyQuests() : getActiveWeeklyQuests()).find(q => q.id === questId);
  if (!quest) return;
  const prog    = isDaily ? getQuestDailyProg()  : getQuestWeeklyProg();
  const claimed = isDaily ? getQuestDailyCl()    : getQuestWeeklyCl();
  if (claimed.includes(questId) || (prog[questId] || 0) < quest.target) return;
  claimed.push(questId);
  localStorage.setItem(isDaily ? STORAGE_KEYS.questDailyClaimed : STORAGE_KEYS.questWeeklyClaimed, JSON.stringify(claimed));
  incrementCompetitionQuestsCompleted();
  setCoins(getCoins() + quest.reward);
  renderCoins();
  renderQuestBoard();
  renderCompetition();
}

function questTimeLeft(end) {
  const ms = end - Date.now();
  if (ms <= 0) return 'Resetting…';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function renderQuestBoard() {
  const panel = document.getElementById('tab-quests');
  if (!panel) return;
  advanceQuestRotationsIfNeeded();

  const dq = getActiveDailyQuests();
  const wq = getActiveWeeklyQuests();
  const dp = getQuestDailyProg();
  const wp = getQuestWeeklyProg();
  const dc = getQuestDailyCl();
  const wc = getQuestWeeklyCl();

  function card(q, prog, claimed) {
    const cur = Math.min(prog[q.id] || 0, QUEST_MAX_TYPES.has(q.type) ? Infinity : q.target);
    const pct = Math.min(100, Math.round(((QUEST_MAX_TYPES.has(q.type) ? Math.min(cur, q.target) : cur) / q.target) * 100));
    const done    = cur >= q.target;
    const isCl    = claimed.includes(q.id);
    const stCls   = isCl ? 'quest-card--claimed' : done ? 'quest-card--complete' : '';
    const isWeekly = q.period === 'weekly';
    const dispCur = QUEST_MAX_TYPES.has(q.type)
      ? (done ? '✓ Met' : cur.toLocaleString())
      : cur.toLocaleString();
    const dispTgt = q.target.toLocaleString();
    return `<div class="quest-card ${stCls}${isWeekly ? ' quest-card--weekly' : ''}">
      <div class="quest-card-top">
        <span class="quest-badge ${isWeekly ? 'quest-badge--weekly' : 'quest-badge--daily'}">${isWeekly ? 'WEEKLY' : 'DAILY'}</span>
        <span class="quest-label">${q.label}</span>
        ${isCl ? '<span class="quest-claimed-stamp">✓ CLAIMED</span>' : ''}
      </div>
      <p class="quest-desc-text">${q.desc}</p>
      <div class="quest-progress-wrap">
        <div class="quest-bar"><div class="quest-bar-fill${done && !isCl ? ' quest-bar-fill--ready' : ''}" style="width:${pct}%"></div></div>
        <span class="quest-prog-label">${dispCur} / ${dispTgt}</span>
      </div>
      <div class="quest-card-footer">
        <span class="quest-reward">🏆 ${q.reward.toLocaleString()} coins</span>
        ${isCl
          ? '<span class="quest-done-label">Done!</span>'
          : `<button type="button" class="quest-claim-btn${done ? ' quest-claim-btn--ready' : ''}"
              data-qid="${q.id}" data-qperiod="${q.period}" ${done ? '' : 'disabled'}>
              ${done ? 'CLAIM' : 'In Progress'}
            </button>`}
      </div>
    </div>`;
  }

  panel.innerHTML = `<div class="quest-board">
    <div class="quest-section">
      <div class="quest-section-hdr">
        <h3 class="quest-section-title">📋 Daily Quests</h3>
        <span class="quest-timer">Resets in ${questTimeLeft(getQuestDailyEnd())}</span>
      </div>
      <div class="quest-list">${dq.map(q => card(q, dp, dc)).join('')}</div>
    </div>
    <div class="quest-section">
      <div class="quest-section-hdr">
        <h3 class="quest-section-title">📜 Weekly Quests</h3>
        <span class="quest-timer">Resets in ${questTimeLeft(getQuestWeeklyEnd())}</span>
      </div>
      <div class="quest-list">${wq.map(q => card(q, wp, wc)).join('')}</div>
    </div>
  </div>`;

  panel.querySelectorAll('.quest-claim-btn--ready').forEach(btn => {
    btn.addEventListener('click', () => claimQuest(btn.dataset.qid, btn.dataset.qperiod));
  });

  // Live countdown tick
  clearTimeout(panel._questTimer);
  panel._questTimer = setTimeout(() => renderQuestBoard(), 1000);
}
// ─────────────────────────────────────────────────────────────────────────────

function getCurrentShopOffers() {
  advanceShopRotationIfNeeded();
  const seed = getShopSeed();
  const indices = [];
  for (let i = 0; i < POTIONS.length; i++) indices.push(i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const count = 3 + Math.floor(seededRandom(seed + 99) * 2);
  const offers = indices.slice(0, count).map((i) => {
    const p = POTIONS[i];
    const discount = 0.85 + seededRandom(seed + i * 7) * 0.15;
    return { ...p, cost: Math.max(1, Math.floor(p.cost * discount)) };
  });
  // Very rare chance to add the 3000× luck potion this rotation (seeded so same for whole rotation)
  if (seededRandom(seed + 1337) < LEGENDARY_POTION_SPAWN_CHANCE) {
    const discount = 0.9 + seededRandom(seed + 1338) * 0.1;
    offers.push({ ...LEGENDARY_LUCK_POTION, cost: Math.max(1, Math.floor(LEGENDARY_LUCK_POTION.cost * discount)) });
  }
  return offers;
}

function updateShopCountdown() {
  const el = document.getElementById('shop-reset-countdown');
  if (!el) return;
  const end = getShopRotationEnd();
  const now = Date.now();
  if (end <= now) {
    el.textContent = 'Resetting…';
    return;
  }
  const s = Math.ceil((end - now) / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  el.textContent = `Resets in ${m}:${sec.toString().padStart(2, '0')}`;
}

function buyPotion(potionId, fromBenny = false, fromPatrick = false) {
  const pool = fromPatrick
    ? PATRICK_EXCLUSIVE_POTIONS
    : fromBenny
      ? [...POTIONS.map((p) => ({ ...p, cost: Math.max(1, Math.floor(p.cost * 0.9)) })), ...BENNY_EXCLUSIVE_POTIONS, ...(bennyHasSupremeThisVisit ? [SUPREME_LUCK_POTION] : [])]
      : getCurrentShopOffers();
  const potion = pool.find((p) => p.id === potionId);
  if (!potion || getCoins() < potion.cost) return;
  setCoins(getCoins() - potion.cost);
  const inv = getPotionInventory();
  inv[potion.id] = (inv[potion.id] || 0) + 1;
  setPotionInventory(inv);
  addQuestProgress('potion_buy', 1);
  addQuestProgress('shop_spend', potion.cost);
  renderCoins();
  renderShop();
  renderPotionInventory();
  if (fromBenny) renderBennyShop();
  if (fromPatrick) renderPatrickShop();
}

function buyPotionMax(potionId, fromBenny = false, fromPatrick = false) {
  const pool = fromPatrick
    ? PATRICK_EXCLUSIVE_POTIONS
    : fromBenny
    ? [...POTIONS.map((p) => ({ ...p, cost: Math.max(1, Math.floor(p.cost * 0.9)) })), ...BENNY_EXCLUSIVE_POTIONS, ...(bennyHasSupremeThisVisit ? [SUPREME_LUCK_POTION] : [])]
    : getCurrentShopOffers();
  const potion = pool.find((p) => p.id === potionId);
  if (!potion || potion.cost < 1) return;
  const coins = getCoins();
  const count = Math.floor(coins / potion.cost);
  if (count < 1) return;
  setCoins(coins - potion.cost * count);
  const inv = getPotionInventory();
  inv[potion.id] = (inv[potion.id] || 0) + count;
  setPotionInventory(inv);
  addQuestProgress('potion_buy', count);
  addQuestProgress('shop_spend', potion.cost * count);
  renderCoins();
  renderShop();
  renderPotionInventory();
  if (fromBenny) renderBennyShop();
  if (fromPatrick) renderPatrickShop();
}

function usePotion(potionId) {
  const inv = getPotionInventory();
  if (!inv[potionId] || inv[potionId] < 1) return;
  const potion = ALL_POTIONS_BY_ID[potionId];
  if (!potion) return;
  if (potion.id === 'potionDestruction') {
    if (WORLD_ID !== 2) return; // Only usable in World 2; do not consume
    inv[potionId]--;
    if (inv[potionId] <= 0) delete inv[potionId];
    setPotionInventory(inv);
    triggerVoidQueen().catch(console.error);
    renderPotionInventory();
    return;
  }
  inv[potionId]--;
  if (inv[potionId] <= 0) delete inv[potionId];
  setPotionInventory(inv);
  setLuckMultiplier(getLuckMultiplier() + (potion.luckBonus || 0));
  addQuestProgress('luck_reach', getLuckMultiplier() + getGearBonus());
  if (potion.id === 'potionBennyUltraluck') triggerSecretAura(1).catch(console.error);
  if (potion.id === 'potionSupremeLuck') triggerSupremeKing().catch(console.error);
  renderLuck();
  renderPotionInventory();
}

function useAllPotions() {
  const inv = getPotionInventory();
  let totalLuck = 0;
  let ultraluckCount = 0;
  let hasSupreme = false;
  for (const [id, count] of Object.entries(inv)) {
    if (id === 'potionDestruction') continue; // Use individually in World 2 only
    const potion = ALL_POTIONS_BY_ID[id];
    if (!potion || count < 1) continue;
    totalLuck += (potion.luckBonus || 0) * count;
    if (id === 'potionBennyUltraluck') ultraluckCount += count;
    if (id === 'potionSupremeLuck') hasSupreme = true;
  }
  if (totalLuck === 0) return;
  const toRemove = Object.keys(inv).filter(k => k !== 'potionDestruction');
  const newInv = {};
  if (inv.potionDestruction) newInv.potionDestruction = inv.potionDestruction;
  setPotionInventory(newInv);
  setLuckMultiplier(getLuckMultiplier() + totalLuck);
  addQuestProgress('luck_reach', getLuckMultiplier() + getGearBonus());
  if (ultraluckCount > 0) triggerSecretAura(ultraluckCount).catch(console.error);
  if (hasSupreme) triggerSupremeKing().catch(console.error);
  renderLuck();
  renderPotionInventory();
}

function renderPotionInventory() {
  const container = document.getElementById('potion-inventory');
  if (!container) return;
  const inv = getPotionInventory();
  const entries = Object.entries(inv)
    .map(([id, count]) => ({ id, count, potion: ALL_POTIONS_BY_ID[id] }))
    .filter(e => e.potion && e.count > 0)
    .sort((a, b) => (a.potion.luckBonus || 0) - (b.potion.luckBonus || 0));

  if (entries.length === 0) {
    container.innerHTML = '<p class="potion-inv-empty">No potions in stock. Buy some below!</p>';
    return;
  }

  const totalLuck = entries.reduce((s, e) => s + (e.potion.luckBonus || 0) * e.count, 0);
  container.innerHTML = `
    <div class="potion-inv-header">
      <span>🧪 Potion Stash</span>
      <span class="potion-inv-total">Total: +${totalLuck.toLocaleString()}× luck</span>
    </div>
    <div class="potion-inv-list">${entries.map(e => {
      const bonusText = (e.potion.luckBonus || 0) > 0 ? `+${(e.potion.luckBonus * e.count).toLocaleString()}× luck` : (e.potion.desc || 'Special effect');
      return `
      <div class="potion-inv-row">
        <span class="potion-inv-emoji">${e.potion.emoji}</span>
        <span class="potion-inv-name">${e.potion.name}</span>
        <span class="potion-inv-count">×${e.count}</span>
        <span class="potion-inv-bonus">${bonusText}</span>
        <button type="button" class="potion-inv-use-btn" data-potion="${e.id}">Use 1</button>
      </div>`;
    }).join('')}
    </div>
    <button type="button" class="potion-inv-use-all-btn" id="potion-use-all">Use All (+${totalLuck.toLocaleString()}×)</button>
  `;

  container.querySelectorAll('.potion-inv-use-btn').forEach(btn => {
    btn.addEventListener('click', () => usePotion(btn.dataset.potion));
  });
  document.getElementById('potion-use-all')?.addEventListener('click', useAllPotions);
}

function renderShop() {
  const list = document.getElementById('shop-list');
  if (!list) return;
  advanceShopRotationIfNeeded();
  updateShopCountdown();
  const offers = getCurrentShopOffers();
  const coins = getCoins();
  list.innerHTML = offers.map(
    (p) => {
      const canBuy = coins >= p.cost;
      const maxCount = Math.floor(coins / p.cost);
      const canBuyMax = maxCount >= 1;
      return `<div class="shop-item">
        <span class="shop-item-emoji">${p.emoji}</span>
        <div class="shop-item-info">
          <span class="shop-item-name">${p.name}</span>
          <span class="shop-item-effect">+${p.luckBonus.toLocaleString()}× luck</span>
        </div>
        <div class="shop-item-actions">
          <button type="button" class="shop-buy-btn" data-potion="${p.id}" data-benny="false" ${!canBuy ? 'disabled' : ''}>
            ${p.cost} coins
          </button>
          <button type="button" class="shop-buy-max-btn" data-potion="${p.id}" data-benny="false" ${!canBuyMax ? 'disabled' : ''} title="${canBuyMax ? `Buy ${maxCount}` : ''}">
            Buy max${canBuyMax ? ` (${maxCount})` : ''}
          </button>
        </div>
      </div>`;
    }
  ).join('');
  list.querySelectorAll('.shop-buy-btn').forEach((btn) => {
    btn.addEventListener('click', () => buyPotion(btn.dataset.potion, false));
  });
  list.querySelectorAll('.shop-buy-max-btn').forEach((btn) => {
    btn.addEventListener('click', () => buyPotionMax(btn.dataset.potion, false));
  });
}

// ——— Benny (appears once every 60 min at a random time; no warning) ———
function getBennyNextAt() {
  return Number(localStorage.getItem(STORAGE_KEYS.bennyNextAt) || 0);
}
function setBennyNextAt(ts) {
  localStorage.setItem(STORAGE_KEYS.bennyNextAt, String(ts));
}

function initBennySchedule() {
  const next = getBennyNextAt();
  if (next === 0) {
    setBennyNextAt(Date.now() + Math.random() * BENNY_INTERVAL_MS);
  }
}

function showBennyButton() {
  const btn = document.getElementById('benny-popup-btn');
  if (btn) {
    btn.classList.remove('hidden');
    btn.setAttribute('aria-hidden', 'false');
  }
}

function hideBennyButton() {
  const btn = document.getElementById('benny-popup-btn');
  if (btn) {
    btn.classList.add('hidden');
    btn.setAttribute('aria-hidden', 'true');
  }
}

let bennyHasSupremeThisVisit = false;
function openBenny() {
  hideBennyButton();
  bennyHasSupremeThisVisit = Math.random() < SUPREME_POTION_APPEAR_CHANCE;
  const overlay = document.getElementById('benny-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    renderBennyShop();
  }
}

function closeBenny() {
  const overlay = document.getElementById('benny-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
  setBennyNextAt(Date.now() + BENNY_INTERVAL_MS);
}

function renderBennyShop() {
  const list = document.getElementById('benny-shop-list');
  if (!list) return;
  const coins = getCoins();
  const bennyPrices = [
    ...POTIONS.map((p) => ({ ...p, cost: Math.max(1, Math.floor(p.cost * 0.9)) })),
    ...BENNY_EXCLUSIVE_POTIONS,
    ...(bennyHasSupremeThisVisit ? [SUPREME_LUCK_POTION] : []),
  ];
  list.innerHTML = bennyPrices.map(
    (p) => {
      const canBuy = coins >= p.cost;
      const maxCount = Math.floor(coins / p.cost);
      const canBuyMax = maxCount >= 1;
      const isSupreme = p.id === 'potionSupremeLuck';
      return `<div class="shop-item${isSupreme ? ' shop-item--supreme' : ''}">
        <span class="shop-item-emoji">${p.emoji}</span>
        <div class="shop-item-info">
          <span class="shop-item-name">${p.name}</span>
          <span class="shop-item-effect">+${p.luckBonus.toLocaleString()}× luck${isSupreme ? ' — 1/1,000 chance to summon THE SUPREME KING' : ' (Benny\'s price)'}</span>
        </div>
        <div class="shop-item-actions">
          <button type="button" class="shop-buy-btn" data-potion="${p.id}" data-benny="true" ${!canBuy ? 'disabled' : ''}>
            ${p.cost} coins
          </button>
          <button type="button" class="shop-buy-max-btn" data-potion="${p.id}" data-benny="true" ${!canBuyMax ? 'disabled' : ''} title="${canBuyMax ? `Buy ${maxCount}` : ''}">
            Buy max${canBuyMax ? ` (${maxCount})` : ''}
          </button>
        </div>
      </div>`;
    }
  ).join('');
  list.querySelectorAll('.shop-buy-btn').forEach((btn) => {
    btn.addEventListener('click', () => buyPotion(btn.dataset.potion, true));
  });
  list.querySelectorAll('.shop-buy-max-btn').forEach((btn) => {
    btn.addEventListener('click', () => buyPotionMax(btn.dataset.potion, true));
  });
}

// ——— Patrick (appears once every 120 min — 2× rarer than Benny; huge luck, hefty price) ———
function getPatrickNextAt() {
  return Number(localStorage.getItem(STORAGE_KEYS.patrickNextAt) || 0);
}
function setPatrickNextAt(ts) {
  localStorage.setItem(STORAGE_KEYS.patrickNextAt, String(ts));
}

function initPatrickSchedule() {
  const next = getPatrickNextAt();
  if (next === 0) {
    setPatrickNextAt(Date.now() + Math.random() * PATRICK_INTERVAL_MS);
  }
}

function showPatrickButton() {
  const btn = document.getElementById('patrick-popup-btn');
  if (btn) {
    btn.classList.remove('hidden');
    btn.setAttribute('aria-hidden', 'false');
  }
}

function hidePatrickButton() {
  const btn = document.getElementById('patrick-popup-btn');
  if (btn) {
    btn.classList.add('hidden');
    btn.setAttribute('aria-hidden', 'true');
  }
}

function openPatrick() {
  hidePatrickButton();
  const overlay = document.getElementById('patrick-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    renderPatrickShop();
  }
}

function closePatrick() {
  const overlay = document.getElementById('patrick-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
  setPatrickNextAt(Date.now() + PATRICK_INTERVAL_MS);
}

function renderPatrickShop() {
  const list = document.getElementById('patrick-shop-list');
  if (!list) return;
  const coins = getCoins();
  list.innerHTML = PATRICK_EXCLUSIVE_POTIONS.map(
    (p) => {
      const canBuy = coins >= p.cost;
      const maxCount = Math.floor(coins / p.cost);
      const canBuyMax = maxCount >= 1;
      return `<div class="shop-item patrick-item">
        <span class="shop-item-emoji">${p.emoji}</span>
        <div class="shop-item-info">
          <span class="shop-item-name">${p.name}</span>
          <span class="shop-item-effect">+${p.luckBonus.toLocaleString()}× luck (Patrick's price)</span>
          <span class="shop-item-desc">${p.desc}</span>
        </div>
        <div class="shop-item-actions">
          <button type="button" class="shop-buy-btn" data-potion="${p.id}" data-patrick="true" ${!canBuy ? 'disabled' : ''}>
            ${p.cost.toLocaleString()} coins
          </button>
          <button type="button" class="shop-buy-max-btn" data-potion="${p.id}" data-patrick="true" ${!canBuyMax ? 'disabled' : ''} title="${canBuyMax ? `Buy ${maxCount}` : ''}">
            Buy max${canBuyMax ? ` (${maxCount})` : ''}
          </button>
        </div>
      </div>`;
    }
  ).join('');
  list.querySelectorAll('.shop-buy-btn').forEach((btn) => {
    btn.addEventListener('click', () => buyPotion(btn.dataset.potion, false, true));
  });
  list.querySelectorAll('.shop-buy-max-btn').forEach((btn) => {
    btn.addEventListener('click', () => buyPotionMax(btn.dataset.potion, false, true));
  });
}

// ——— Jia (World 2 only: 1/180 per minute; sell auras for NULL COINS, buy Void Potion / rare items) ———
function showJiaButton() {
  if (WORLD_ID !== 2) return;
  const btn = document.getElementById('jia-popup-btn');
  if (btn) {
    btn.classList.remove('hidden');
    btn.setAttribute('aria-hidden', 'false');
  }
}

function hideJiaButton() {
  const btn = document.getElementById('jia-popup-btn');
  if (btn) {
    btn.classList.add('hidden');
    btn.setAttribute('aria-hidden', 'true');
  }
}

function openJia() {
  hideJiaButton();
  const overlay = document.getElementById('jia-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    renderJiaPanel();
  }
}

function closeJia() {
  const overlay = document.getElementById('jia-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function sellAuraToJia(lockedIndex) {
  const locked = getLockedStorage();
  if (lockedIndex < 0 || lockedIndex >= locked.length) return;
  const [sold] = locked.splice(lockedIndex, 1);
  setLockedStorage(locked);
  const amount = nullCoinsForSale(sold.rarity || 1);
  setNullCoins(getNullCoins() + amount);
  renderJiaPanel();
  renderLockedStorage();
  const el = document.getElementById('jia-null-coins');
  if (el) el.textContent = getNullCoins().toLocaleString();
}

async function buyJiaVoidPotion() {
  const nc = getNullCoins();
  if (nc < JIA_VOID_POTION_COST) return;
  setNullCoins(nc - JIA_VOID_POTION_COST);
  const received = getElderReceived();
  const hasVoidQueen = received.includes(10140);
  const hasSupremeKing = received.includes(9999);
  const canRollBookOfPower = hasVoidQueen && hasSupremeKing && Math.random() < BOOK_OF_POWER_CHANCE;
  const aura = canRollBookOfPower
    ? { ...BOOK_OF_POWER_AURA, isBookOfPower: true }
    : JIA_VOID_AURAS[Math.floor(Math.random() * JIA_VOID_AURAS.length)];
  const fullAura = canRollBookOfPower ? { ...aura, isBookOfPower: true } : { ...aura, isSupremeKing: true };
  if (grantItemById(aura.id)) {
    closeJia();
    renderResult(fullAura);
    switchTab('past');
    await showElderCutscene(fullAura);
    renderHistory();
    renderLockedStorage();
  }
}

function buyJiaRareItem(item) {
  const nc = getNullCoins();
  if (nc < item.costNullCoins) return;
  setNullCoins(nc - item.costNullCoins);
  addMaterial(item.id, 1);
  renderJiaPanel();
  const balanceEl = document.getElementById('jia-null-coins');
  if (balanceEl) balanceEl.textContent = getNullCoins().toLocaleString();
}

function renderJiaPanel() {
  if (WORLD_ID !== 2) return;
  const balanceEl = document.getElementById('jia-null-coins');
  if (balanceEl) balanceEl.textContent = getNullCoins().toLocaleString();
  const sellList = document.getElementById('jia-sell-list');
  if (sellList) {
    const locked = getLockedStorage();
    if (locked.length === 0) {
      sellList.innerHTML = '<p class="tab-desc">No locked auras. Lock auras from Past rolls first.</p>';
    } else {
      sellList.innerHTML = locked
        .map((h, idx) => `<div class="shop-item jia-sell-item" data-locked-idx="${idx}">
          <span class="history-text" style="font-family:'${h.font}';color:${h.color}">${h.text}</span>
          <span class="history-rarity">${formatRarity(h.rarity)}</span>
          <button type="button" class="shop-buy-btn jia-sell-btn" data-locked-idx="${idx}">Sell to Jia</button>
        </div>`)
        .join('');
      sellList.querySelectorAll('.jia-sell-btn').forEach((btn) => {
        btn.addEventListener('click', () => sellAuraToJia(parseInt(btn.dataset.lockedIdx, 10)));
      });
    }
  }
  const shopList = document.getElementById('jia-shop-list');
  if (shopList) {
    const nc = getNullCoins();
    const voidCanBuy = nc >= JIA_VOID_POTION_COST;
    const itemsHtml = JIA_RARE_ITEMS.map(
      (item) => {
        const canBuy = nc >= item.costNullCoins;
        return `<div class="shop-item">
          <span class="shop-item-emoji">${item.emoji}</span>
          <div class="shop-item-info">
            <span class="shop-item-name">${item.text}</span>
            <span class="shop-item-effect">${item.costNullCoins} NULL COINS</span>
          </div>
          <button type="button" class="shop-buy-btn jia-buy-rare" data-item-id="${item.id}" ${!canBuy ? 'disabled' : ''}>Buy</button>
        </div>`;
      }
    ).join('');
    const voidHtml = `<div class="shop-item shop-item--void-potion">
      <span class="shop-item-emoji">⬛</span>
      <div class="shop-item-info">
        <span class="shop-item-name">Void Potion</span>
        <span class="shop-item-effect">One of three Supreme-level auras + extended cutscene. ${JIA_VOID_POTION_COST} NULL COINS.</span>
      </div>
      <button type="button" class="shop-buy-btn jia-buy-void" ${!voidCanBuy ? 'disabled' : ''}>Buy</button>
    </div>`;
    shopList.innerHTML = itemsHtml + voidHtml;
    shopList.querySelectorAll('.jia-buy-rare').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = JIA_RARE_ITEMS.find((i) => i.id === parseInt(btn.dataset.itemId, 10));
        if (item) buyJiaRareItem(item);
      });
    });
    shopList.querySelectorAll('.jia-buy-void').forEach((btn) => {
      btn.addEventListener('click', () => buyJiaVoidPotion());
    });
  }
}

// ——— Crafter (all worlds: craft potions from materials) ———
function getMaterialLabel(id) {
  const j = JIA_RARE_ITEMS.find(i => i.id === id);
  if (j) return j.text;
  const s = SELLER_MATERIALS.find(m => m.id === id);
  if (s) return s.name;
  return `Material ${id}`;
}

const CRAFTING_RECIPES = [
  { id: 'potionDestruction', name: 'Potion of Destruction', outputType: 'potion', outputId: 'potionDestruction', materials: [{ id: 10130, n: 5 }, { id: 10131, n: 5 }, { id: 10132, n: 5 }, { id: 10133, n: 5 }], world: 2 },
  { id: 'potionMinor', name: 'Minor Luck Potion', outputType: 'potion', outputId: 'potion1', materials: [{ id: 20101, n: 2 }, { id: 20102, n: 1 }] },
];

function openCrafter() {
  const overlay = document.getElementById('crafter-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    renderCrafterPanel();
  }
}

function closeCrafter() {
  const overlay = document.getElementById('crafter-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function renderCrafterPanel() {
  const materialsEl = document.getElementById('crafter-materials');
  const recipesEl = document.getElementById('crafter-recipes');
  if (!materialsEl || !recipesEl) return;
  const mats = getMaterials();
  const matIds = [...new Set([...JIA_RARE_ITEMS.map(i => i.id), ...SELLER_MATERIALS.map(m => m.id)])];
  const haveAny = matIds.some(id => (mats[id] || 0) > 0);
  materialsEl.innerHTML = haveAny
    ? matIds.filter(id => (mats[id] || 0) > 0).map(id => `<span class="crafter-mat">${getMaterialLabel(id)}: ${mats[id]}</span>`).join(' · ')
    : '<p class="tab-desc">No materials yet. Buy from the Material Seller or from Jia (World 2).</p>';
  const recipes = CRAFTING_RECIPES.filter(r => !r.world || r.world === WORLD_ID);
  recipesEl.innerHTML = recipes.map(rec => {
    const canCraft = hasMaterials(rec.materials);
    const reqText = rec.materials.map(({ id, n }) => `${n}× ${getMaterialLabel(id)}`).join(', ');
    return `<div class="shop-item crafter-recipe">
      <div class="crafter-recipe-info">
        <span class="shop-item-name">${rec.name}</span>
        <span class="shop-item-effect">Requires: ${reqText}</span>
      </div>
      <button type="button" class="shop-buy-btn crafter-craft-btn" data-recipe-id="${rec.id}" ${!canCraft ? 'disabled' : ''}>Craft</button>
    </div>`;
  }).join('');
  recipesEl.querySelectorAll('.crafter-craft-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const rec = CRAFTING_RECIPES.find(r => r.id === btn.dataset.recipeId);
      if (!rec || !hasMaterials(rec.materials)) return;
      if (!consumeMaterials(rec.materials)) return;
      if (rec.outputType === 'potion') {
        const inv = getPotionInventory();
        inv[rec.outputId] = (inv[rec.outputId] || 0) + 1;
        setPotionInventory(inv);
        renderPotionInventory();
      }
      renderCrafterPanel();
    });
  });
}

// ——— Material Seller (all worlds: buy materials for coins) ———
function openMaterialSeller() {
  const overlay = document.getElementById('materialseller-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    renderMaterialSellerShop();
  }
}

function closeMaterialSeller() {
  const overlay = document.getElementById('materialseller-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function renderMaterialSellerShop() {
  const list = document.getElementById('materialseller-shop-list');
  if (!list) return;
  const coins = getCoins();
  list.innerHTML = SELLER_MATERIALS.map(m => {
    const canBuy = coins >= m.costCoins;
    return `<div class="shop-item">
      <span class="shop-item-emoji">${m.emoji}</span>
      <div class="shop-item-info">
        <span class="shop-item-name">${m.name}</span>
        <span class="shop-item-effect">${m.costCoins} coins</span>
      </div>
      <button type="button" class="shop-buy-btn materialseller-buy" data-material-id="${m.id}" ${!canBuy ? 'disabled' : ''}>Buy</button>
    </div>`;
  }).join('');
  list.querySelectorAll('.materialseller-buy').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.materialId, 10);
      const m = SELLER_MATERIALS.find(x => x.id === id);
      if (!m || getCoins() < m.costCoins) return;
      setCoins(getCoins() - m.costCoins);
      addMaterial(id, 1);
      renderCoins();
      renderMaterialSellerShop();
    });
  });
}

// ——— Sneho (forbidden rotating shop, 10-min rotation) ———
function getSnehoRotationEnd() { return Number(localStorage.getItem(STORAGE_KEYS.snehoRotationEnd) || 0); }
function setSnehoRotationEnd(ts) { localStorage.setItem(STORAGE_KEYS.snehoRotationEnd, String(ts)); }
function getSnehoSeed() { return Number(localStorage.getItem(STORAGE_KEYS.snehoSeed) || 0); }
function setSnehoSeed(s) { localStorage.setItem(STORAGE_KEYS.snehoSeed, String(s)); }

function advanceSnehoRotationIfNeeded() {
  const now = Date.now();
  let end = getSnehoRotationEnd();
  if (end === 0 || now >= end) {
    end = now + SNEHO_ROTATION_MS;
    setSnehoRotationEnd(end);
    setSnehoSeed(Math.floor(Math.random() * 1e9));
  }
  return end;
}

function getSnehoOffers() {
  advanceSnehoRotationIfNeeded();
  const seed = getSnehoSeed();
  const indices = SNEHO_ITEMS.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  let offers = indices.slice(0, 3).map((i) => SNEHO_ITEMS[i]);
  // 1/5000 chance for Incarnatus (no luck modifier — uses seeded random only)
  const incarnatusRoll = seededRandom(seed + 77777);
  if (incarnatusRoll < INCARNATUS_APPEAR_CHANCE) {
    const slot = Math.floor(seededRandom(seed + 88888) * 3);
    offers = [...offers];
    offers[slot] = INCARNATUS_POTION;
  }
  return offers;
}

function updateSnehoCountdown() {
  const el = document.getElementById('sneho-countdown');
  if (!el) return;
  const end = getSnehoRotationEnd();
  const now = Date.now();
  if (end <= now) { el.textContent = 'Resetting…'; return; }
  const s = Math.ceil((end - now) / 1000);
  el.textContent = `Resets in ${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function buySnehoItem(itemId) {
  advanceSnehoRotationIfNeeded();
  const offers = getSnehoOffers();
  const item = offers.find((i) => i.id === itemId);
  if (!item || getCoins() < item.cost) return;
  setCoins(getCoins() - item.cost);

  // Incarnatus: grant a random Geometrical aura (no luck modifier)
  if (item.grantsAura === 'geometrical') {
    const aura = GEOMETRICAL_AURAS[Math.floor(Math.random() * GEOMETRICAL_AURAS.length)];
    const history = getHistory();
    history.push({
      historyId: `${Date.now()}-geometrical-${aura.id}`,
      id: aura.id, text: aura.text, font: aura.font,
      color: aura.color, fontWeight: aura.fontWeight,
      fontStyle: aura.fontStyle, textShadow: aura.textShadow,
      rarity: aura.rarity, auraType: 'myeongsa', isGeometrical: true,
    });
    setHistory(history);
    const newSneho = getElderSnehoTotal() + 1;
    localStorage.setItem(STORAGE_KEYS.elderSnehoTotal, String(newSneho));
    addQuestProgress('sneho_buy', 1);
    renderCoins();
    renderHistory();
    renderResult(aura);
    renderSneho();
    const feedback = document.getElementById('sneho-feedback');
    if (feedback) {
      feedback.textContent = `🔷 Incarnatus! You manifested ${aura.text}.`;
      feedback.className = 'sneho-feedback sneho-feedback--blessed';
      feedback.classList.remove('hidden');
      setTimeout(() => feedback.classList.add('hidden'), 4000);
    }
    checkElderUnlock();
    checkAscendantUnlock();
    checkEmperorUnlock();
    return;
  }

  const cursed = Math.random() < item.cursedChance;
  const effect = cursed ? item.cursedPenalty : item.luckBonus;
  const newLuck = Math.max(1, getLuckMultiplier() + effect);
  setLuckMultiplier(newLuck);

  // Elder tracking
  const newSneho = getElderSnehoTotal() + 1;
  localStorage.setItem(STORAGE_KEYS.elderSnehoTotal, String(newSneho));
  if (cursed) {
    const newCurse = getElderCurseTotal() + 1;
    localStorage.setItem(STORAGE_KEYS.elderCurseTotal, String(newCurse));
  }

  // Quest tracking
  addQuestProgress('sneho_buy', 1);
  if (cursed) addQuestProgress('sneho_curse', 1);
  addQuestProgress('luck_reach', newLuck + getGearBonus());

  renderCoins();
  renderLuck();
  renderSneho();
  // Show feedback
  const feedback = document.getElementById('sneho-feedback');
  if (feedback) {
    if (cursed) {
      feedback.textContent = `☠️ CURSED! ${effect.toLocaleString()}× luck applied.`;
      feedback.className = 'sneho-feedback sneho-feedback--cursed';
    } else {
      feedback.textContent = `✨ Blessed! +${effect.toLocaleString()}× luck!`;
      feedback.className = 'sneho-feedback sneho-feedback--blessed';
    }
    feedback.classList.remove('hidden');
    setTimeout(() => feedback.classList.add('hidden'), 3000);
  }
  checkElderUnlock();
  checkAscendantUnlock();
  checkEmperorUnlock();
  void checkAccomplishments();
}

function renderSneho() {
  const list = document.getElementById('sneho-list');
  if (!list) return;
  advanceSnehoRotationIfNeeded();
  updateSnehoCountdown();
  const offers = getSnehoOffers();
  const coins  = getCoins();
  list.innerHTML = offers.map((item) => {
    const canBuy = coins >= item.cost;
    const isIncarnatus = item.grantsAura === 'geometrical';
    const oddsHtml = isIncarnatus
      ? '<span class="sneho-odds">Grants a random Geometrical aura (1/5000 to appear)</span>'
      : `<span class="sneho-odds">${100 - Math.round((item.cursedChance || 0) * 100)}% blessed (+${item.luckBonus}×) &nbsp;|&nbsp; ${Math.round((item.cursedChance || 0) * 100)}% cursed (${item.cursedPenalty}×)</span>`;
    return `<div class="shop-item sneho-item">
      <span class="shop-item-emoji">${item.emoji}</span>
      <div class="shop-item-info">
        <span class="shop-item-name sneho-item-name">${item.name}</span>
        <span class="shop-item-cost">${item.cost.toLocaleString()} coins</span>
        ${oddsHtml}
        <span class="shop-item-desc">${item.desc}</span>
      </div>
      <div class="shop-item-actions">
        <button type="button" class="shop-buy-btn sneho-buy-btn" data-sneho="${item.id}" ${!canBuy ? 'disabled' : ''}>Buy</button>
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('.sneho-buy-btn').forEach((btn) => {
    btn.addEventListener('click', () => buySnehoItem(btn.dataset.sneho));
  });
}

function renderTheo() {
  const scrapsEl = document.getElementById('theo-scraps');
  const gearEl = document.getElementById('theo-gear-bonus');
  const listEl = document.getElementById('theo-gear-list');
  if (scrapsEl) scrapsEl.textContent = getScraps();
  if (gearEl) {
    const bonus = getGearBonus();
    gearEl.textContent = bonus > 0 ? `+${bonus.toFixed(2)}× permanent` : 'none';
  }
  if (!listEl) return;
  const scraps = getScraps();
  listEl.innerHTML = GEAR_TIERS.map((g) => {
    const canBuy = scraps >= g.cost;
    return `<div class="shop-item theo-gear-item">
      <span class="shop-item-emoji">${g.emoji}</span>
      <div class="shop-item-info">
        <span class="shop-item-name">${g.name}</span>
        <span class="shop-item-effect">+${g.luckBonus}× permanent luck — ${g.desc}</span>
      </div>
      <button type="button" class="shop-buy-btn theo-buy-btn" data-gear="${g.id}" ${!canBuy ? 'disabled' : ''}>
        ${g.cost} scrap${g.cost > 1 ? 's' : ''}
      </button>
    </div>`;
  }).join('');
  listEl.querySelectorAll('.theo-buy-btn').forEach((btn) => {
    btn.addEventListener('click', () => buyGear(btn.dataset.gear));
  });
}

function buyGear(gearId) {
  const gear = GEAR_TIERS.find((g) => g.id === gearId);
  if (!gear) return;
  if (getScraps() < gear.cost) return;
  setScraps(getScraps() - gear.cost);
  addGearBonus(gear.luckBonus);
  renderTheo();
  renderLuck();
}

// ——— Hub (global chat + trading) ———
const HUB_USERNAME_KEY = 'rng_hub_username';
const HUB_USERNAME_SET_AT_KEY = 'rng_hub_username_set_at';
const DEVICE_TOKEN_KEY = 'rng_device_token';
const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
const ADMIN_EMAIL = 'nicholas.mj.choe@gmail.com'; // admin panel + bypasses username cooldown
let hubChatSubscription = null;
let hubTradesSubscription = null;
let activeTab = 'past';
let hubUnreadCount = 0;

function getDeviceToken() {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  }
  return token;
}

function getHubUsername() {
  return (localStorage.getItem(HUB_USERNAME_KEY) || '').trim().slice(0, 24);
}
function getUsernameSetAt() {
  return parseInt(localStorage.getItem(HUB_USERNAME_SET_AT_KEY) || '0', 10);
}
function isAdminUser() {
  return authUser?.email === ADMIN_EMAIL;
}

function refreshUsernameUI() {
  const ms = getUsernameCooldownMs();
  const admin = isAdminUser();
  const locked = ms > 0 && !admin;

  const hubInput = document.getElementById('hub-username');
  const hubMsg   = document.getElementById('hub-username-cooldown');
  if (hubInput) {
    hubInput.disabled = locked;
    hubInput.title = locked ? `Username locked for ${formatCooldown(ms)}` : admin ? '(Admin — no cooldown)' : '';
  }
  if (hubMsg) {
    hubMsg.textContent = locked
      ? `Username locked — can change again in ${formatCooldown(ms)}`
      : admin ? '✓ Admin — change anytime' : '';
    hubMsg.style.color = locked ? '' : admin ? 'var(--roll)' : '';
  }

  const casinoInput = document.getElementById('casino-username');
  const casinoMsg   = document.getElementById('casino-username-cooldown');
  if (casinoInput) {
    casinoInput.disabled = locked;
    casinoInput.title = locked ? `Username locked for ${formatCooldown(ms)}` : '';
  }
  if (casinoMsg) {
    casinoMsg.textContent = locked ? `Username locked — can change again in ${formatCooldown(ms)}` : '';
  }
}
function getUsernameCooldownMs() {
  if (isAdminUser()) return 0; // admin can change anytime
  const setAt = getUsernameSetAt();
  if (!setAt) return 0;
  return Math.max(0, setAt + USERNAME_COOLDOWN_MS - Date.now());
}
function formatCooldown(ms) {
  if (ms <= 0) return '';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Returns null on success, or an error string explaining why it failed.
async function claimUsername(newName) {
  const trimmed = (newName || '').trim().slice(0, 24);
  if (!trimmed) return 'Name cannot be empty.';
  const current = getHubUsername();
  if (trimmed === current) return null; // no change needed

  // Re-fetch auth fresh — use safe destructuring so any failure keeps isAdmin false
  let isAdmin = false;
  try {
    if (supabase) {
      const result = await supabase.auth.getUser();
      isAdmin = result?.data?.user?.email === ADMIN_EMAIL;
    }
  } catch (_) { /* auth unavailable — not admin */ }

  if (!isAdmin) {
    const cooldown = getUsernameCooldownMs();
    if (cooldown > 0) return `Username locked — can change again in ${formatCooldown(cooldown)}.`;
  }

  // Uniqueness check + claim (skip entirely if table doesn't exist yet)
  if (supabase) {
    try {
      const myToken = getDeviceToken();

      if (!isAdmin) {
        const { data: existing } = await supabase
          .from('usernames')
          .select('token')
          .eq('username', trimmed)
          .maybeSingle();

        if (existing && existing.token !== myToken) {
          return `"${trimmed}" is already taken. Choose a different name.`;
        }
      }

      // Release old username claim
      if (current) {
        let del = supabase.from('usernames').delete().eq('username', current);
        if (!isAdmin) del = del.eq('token', myToken);
        await del;
      }

      // Claim the new username
      await supabase.from('usernames').upsert(
        { username: trimmed, token: myToken, updated_at: new Date().toISOString() },
        { onConflict: 'username' }
      );
    } catch (_) { /* table may not exist yet — allow change anyway */ }
  }

  localStorage.setItem(HUB_USERNAME_KEY, trimmed);
  if (trimmed) localStorage.setItem(HUB_USERNAME_SET_AT_KEY, String(Date.now()));
  return null; // success
}

const CHAT_KEEP = 50; // max messages kept in DB at once

// ——— Spam protection ———
const SPAM_MAX_MSGS      = 3;       // max messages in window
const SPAM_WINDOW_MS     = 10_000;  // 10-second window
const SPAM_COOLDOWN_BASE = 5_000;   // 5s base cooldown after spam
const SPAM_COOLDOWN_MAX  = 60_000;  // 60s max cooldown
let chatTimestamps  = [];
let spamCooldownEnd = 0;
let spamStrikes     = 0;

function isChatRateLimited() {
  const now = Date.now();
  if (now < spamCooldownEnd) {
    const secsLeft = Math.ceil((spamCooldownEnd - now) / 1000);
    return `Slow down! Wait ${secsLeft}s before sending another message.`;
  }
  chatTimestamps = chatTimestamps.filter(t => now - t < SPAM_WINDOW_MS);
  if (chatTimestamps.length >= SPAM_MAX_MSGS) {
    spamStrikes++;
    const cooldown = Math.min(SPAM_COOLDOWN_BASE * Math.pow(2, spamStrikes - 1), SPAM_COOLDOWN_MAX);
    spamCooldownEnd = now + cooldown;
    const secsLeft = Math.ceil(cooldown / 1000);
    return `Too many messages! You're muted for ${secsLeft}s.`;
  }
  return null;
}

function recordChatTimestamp() {
  chatTimestamps.push(Date.now());
}

// ——— Profanity / slur filter ———
const BLOCKED_PATTERNS = (() => {
  const raw = [
    'fuck','shit','bitch','ass','damn','dick','cock','pussy','cunt',
    'bastard','whore','slut','piss','crap','stfu','gtfo','wtf','lmao',
    'nigger','nigga','n1gger','n1gga','faggot','fag','retard','retarded',
    'tranny','kike','chink','spic','gook','wetback','beaner','cracker',
    'dyke','homo','queer','twat','wanker','bollocks',
    'kys','kill yourself','neck yourself',
  ];
  return raw.map(w => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flexible = escaped.replace(/[a-z]/gi, ch => {
      const leets = { a:'[a@4]', e:'[e3]', i:'[i1!|]', o:'[o0]', s:'[s$5]', t:'[t7]', l:'[l1|]', g:'[g9]' };
      return leets[ch.toLowerCase()] || `[${ch.toLowerCase()}${ch.toUpperCase()}]`;
    });
    return new RegExp(flexible, 'i');
  });
})();

function containsProfanity(text) {
  const cleaned = text.replace(/[\s._\-*#@!]+/g, '');
  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(text) || pat.test(cleaned)) return true;
  }
  return false;
}

// ——— Chat bans (Supabase-backed, graceful fallback) ———
let chatBanCache = new Set();
let chatBanCacheTime = 0;
const BAN_CACHE_TTL = 30_000;

async function refreshBanCache() {
  if (!supabase) return;
  if (Date.now() - chatBanCacheTime < BAN_CACHE_TTL) return;
  try {
    const { data } = await supabase.from('chat_bans').select('username');
    if (data) chatBanCache = new Set(data.map(r => r.username.toLowerCase()));
    chatBanCacheTime = Date.now();
  } catch (_) { /* table may not exist yet */ }
}

function isUserBanned(username) {
  return chatBanCache.has((username || '').toLowerCase());
}

async function banUser(username) {
  if (!supabase) return 'Supabase not connected.';
  const lower = username.toLowerCase();
  await supabase.from('chat_bans').delete().eq('username', lower);
  const { error } = await supabase.from('chat_bans').insert(
    { username: lower, banned_by: getHubUsername() || 'admin', created_at: new Date().toISOString() }
  );
  if (error) return error.message || 'Unknown error';
  chatBanCache.add(lower);
  return null;
}

async function unbanUser(username) {
  if (!supabase) return 'Supabase not connected.';
  const lower = username.toLowerCase();
  const { error } = await supabase.from('chat_bans').delete().eq('username', lower);
  if (error) return error.message || 'Unknown error';
  chatBanCache.delete(lower);
  return null;
}

async function listBannedUsers() {
  if (!supabase) return [];
  try {
    const { data } = await supabase.from('chat_bans').select('username, banned_by, banned_at').order('banned_at', { ascending: false });
    return data || [];
  } catch (_) { return []; }
}

function updateHubBadge() {
  const btn = document.querySelector('.tab-btn[data-tab="hub"]');
  if (!btn) return;
  let badge = btn.querySelector('.hub-notif-badge');
  if (hubUnreadCount > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'hub-notif-badge';
      btn.appendChild(badge);
    }
    badge.textContent = hubUnreadCount > 99 ? '99+' : hubUnreadCount;
  } else if (badge) {
    badge.remove();
  }
}

async function loadHubMessages() {
  const list = document.getElementById('hub-chat-list');
  if (!list || !supabase) return;
  const { data, error } = await supabase
    .from('messages')
    .select('id, username, body, created_at')
    .order('created_at', { ascending: true })
    .limit(CHAT_KEEP);
  if (error) {
    list.innerHTML = `<p class="hub-error">Could not load chat. Check your Supabase setup.</p>`;
    return;
  }
  const msgs = data || [];
  const countEl = document.getElementById('hub-chat-count');
  if (countEl) countEl.textContent = msgs.length ? `(${msgs.length}/${CHAT_KEEP})` : '';
  list.innerHTML = msgs.map((m) => {
    const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="hub-msg">
      <span class="hub-msg-time">${time}</span>
      <span class="hub-msg-user">${escapeHtml(m.username || '?')}</span>
      <span class="hub-msg-body">${escapeHtml(m.body || '')}</span>
    </div>`;
  }).join('');
  list.scrollTop = list.scrollHeight;
}

async function trimOldMessages() {
  if (!supabase) return;
  // Fetch all IDs oldest-first, delete any beyond CHAT_KEEP
  const { data } = await supabase
    .from('messages')
    .select('id')
    .order('created_at', { ascending: true });
  if (!data || data.length <= CHAT_KEEP) return;
  const toDelete = data.slice(0, data.length - CHAT_KEEP).map((r) => r.id);
  await supabase.from('messages').delete().in('id', toDelete);
}

function showChatWarning(msg) {
  const warn = document.getElementById('hub-chat-warning');
  if (!warn) return;
  warn.textContent = msg;
  warn.classList.remove('hidden');
  clearTimeout(warn._hideTimer);
  warn._hideTimer = setTimeout(() => warn.classList.add('hidden'), 4000);
}

async function sendHubMessage() {
  const input = document.getElementById('hub-chat-input');
  const body = (input?.value || '').trim().slice(0, 500);
  const username = getHubUsername();
  if (!body || !username || !supabase) return;
  const sendBtn = document.getElementById('hub-chat-send');

  // Admin commands: /ban, /unban, /banned
  if (isAdminUser() && body.startsWith('/')) {
    const parts = body.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const target = parts.slice(1).join(' ').trim();

    if (cmd === '/ban' && target) {
      const err = await banUser(target);
      showChatWarning(err ? `Failed to ban "${target}": ${err}` : `Banned "${target}" from chat.`);
      input.value = '';
      return;
    }
    if (cmd === '/unban' && target) {
      const err = await unbanUser(target);
      showChatWarning(err ? `Failed to unban "${target}": ${err}` : `Unbanned "${target}".`);
      input.value = '';
      return;
    }
    if (cmd === '/banned') {
      const bans = await listBannedUsers();
      if (bans.length === 0) { showChatWarning('No banned users.'); }
      else { showChatWarning(`Banned: ${bans.map(b => b.username).join(', ')}`); }
      input.value = '';
      return;
    }
  }

  // Ban check
  await refreshBanCache();
  if (isUserBanned(username)) {
    showChatWarning('You are banned from chat.');
    return;
  }

  // Spam check
  const spamMsg = isChatRateLimited();
  if (spamMsg) {
    showChatWarning(spamMsg);
    return;
  }

  // Profanity check
  if (containsProfanity(body)) {
    showChatWarning('Your message was blocked. Keep it clean.');
    return;
  }

  if (sendBtn) sendBtn.disabled = true;
  recordChatTimestamp();
  const { error } = await supabase.from('messages').insert({ username, body });
  if (!error) {
    input.value = '';
    spamStrikes = Math.max(0, spamStrikes - 1);
    await trimOldMessages();
  }
  if (sendBtn) sendBtn.disabled = false;
  loadHubMessages();
}

async function loadHubTrades() {
  const list = document.getElementById('hub-trades-list');
  if (!list || !supabase) return;
  const { data, error } = await supabase.from('trades').select('id, username, offering, wanting, created_at').eq('status', 'open').order('created_at', { ascending: false }).limit(50);
  if (error) {
    list.innerHTML = `<p class="hub-error">Could not load trades.</p>`;
    return;
  }
  list.innerHTML = (data || []).map((t) => `<div class="hub-trade"><span class="hub-trade-user">${escapeHtml(t.username || '?')}</span>: Offering <strong>${escapeHtml(t.offering || '')}</strong> — Wanting <strong>${escapeHtml(t.wanting || '')}</strong></div>`).join('');
}

async function postHubTrade() {
  const offerEl = document.getElementById('hub-trade-offer');
  const wantEl = document.getElementById('hub-trade-want');
  const offering = (offerEl?.value || '').trim().slice(0, 200);
  const wanting = (wantEl?.value || '').trim().slice(0, 200);
  const username = getHubUsername();
  if (!offering || !username || !supabase) return;
  await supabase.from('trades').insert({ username, offering, wanting, status: 'open' });
  if (offerEl) offerEl.value = '';
  if (wantEl) wantEl.value = '';
  loadHubTrades();
}

// ——— Casino (coinflip for coins, itemflip for auras) ———
let casinoCoinBalance = 0;
let casinoAuraVault = [];

function getCasinoUsername() {
  return getHubUsername();
}
// Casino username shares storage with hub; use claimUsername() for changes.
async function setCasinoUsername(name) {
  return claimUsername(name);
}

async function casinoFetchBalance() {
  const username = getCasinoUsername();
  if (!username || !supabase) return 0;
  const { data } = await supabase.from('casino_wallets').select('coins_balance').eq('username', username).single();
  casinoCoinBalance = data?.coins_balance ?? 0;
  return casinoCoinBalance;
}

async function casinoDepositCoins() {
  const username = getCasinoUsername();
  const input = document.getElementById('casino-deposit-amount');
  const amount = Math.floor(Number(input?.value || 0));
  if (!username || !supabase || amount <= 0) return;
  const localCoins = getCoins();
  if (localCoins < amount) {
    showCasinoMessage('casino-coinflip-msg', 'Not enough coins in game.', true);
    return;
  }
  const { data, error } = await supabase.rpc('casino_deposit_coins', { p_username: username, p_amount: amount });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) {
    showCasinoMessage('casino-coinflip-msg', result?.message || error?.message || 'Deposit failed', true);
    return;
  }
  setCoins(localCoins - amount);
  casinoCoinBalance = result.new_balance ?? casinoCoinBalance;
  if (input) input.value = '';
  renderCoins();
  renderCasino();
}

async function casinoWithdrawCoins() {
  const username = getCasinoUsername();
  const input = document.getElementById('casino-deposit-amount');
  const amount = Math.floor(Number(input?.value || 0));
  if (!username || !supabase || amount <= 0) return;
  const { data, error } = await supabase.rpc('casino_withdraw_coins', { p_username: username, p_amount: amount });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) {
    showCasinoMessage('casino-coinflip-msg', result?.message || error?.message || 'Withdraw failed', true);
    return;
  }
  setCoins(getCoins() + amount);
  casinoCoinBalance = result.new_balance ?? 0;
  if (input) input.value = '';
  renderCoins();
  renderCasino();
}

function showCasinoMessage(id, text, isError = false) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text || '';
    el.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
  }
}

async function casinoCreateCoinflip() {
  const username = getCasinoUsername();
  const amountEl = document.getElementById('casino-coinflip-amount');
  const sideEl = document.getElementById('casino-coinflip-side');
  const amount = Math.floor(Number(amountEl?.value || 0));
  const side = (sideEl?.value || 'heads').toLowerCase();
  if (!username || !supabase || amount <= 0) {
    showCasinoMessage('casino-coinflip-msg', 'Set name and amount.', true);
    return;
  }
  if (casinoCoinBalance < amount) {
    showCasinoMessage('casino-coinflip-msg', 'Not enough coins in casino balance. Deposit first.', true);
    return;
  }
  const { data, error } = await supabase.rpc('casino_create_coinflip', { p_username: username, p_side: side, p_amount: amount });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) {
    showCasinoMessage('casino-coinflip-msg', result?.message || error?.message || 'Create failed', true);
    return;
  }
  showCasinoMessage('casino-coinflip-msg', `Challenge #${result.challenge_id} created. Waiting for opponent.`);
  if (amountEl) amountEl.value = '';
  renderCasino();
}

async function casinoAcceptCoinflip(id) {
  const username = getCasinoUsername();
  if (!username || !supabase) return;
  const { data, error } = await supabase.rpc('casino_accept_coinflip', { p_challenge_id: id, p_username: username });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) {
    showCasinoMessage('casino-coinflip-msg', result?.message || error?.message || 'Accept failed', true);
    return;
  }
  showCasinoMessage('casino-coinflip-msg', 'Challenge accepted. Either player can resolve.');
  renderCasino();
}

async function casinoResolveCoinflip(id) {
  if (!supabase) return;
  const { data, error } = await supabase.rpc('casino_resolve_coinflip', { p_challenge_id: id });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) {
    showCasinoMessage('casino-coinflip-msg', result?.message || error?.message || 'Resolve failed', true);
    return;
  }
  showCasinoMessage('casino-coinflip-msg', `Result: ${result.result_side}. Winner: ${result.winner_username}`);
  renderCasino();
}

async function loadCasinoCoinflipList() {
  const list = document.getElementById('casino-coinflip-list');
  if (!list || !supabase) return;
  const { data: openList } = await supabase.from('coinflip_challenges').select('id, creator_username, creator_side, amount, status, acceptor_username, result').in('status', ['open', 'matched']).order('created_at', { ascending: false }).limit(30);
  const rows = (openList || []).map((c) => {
    if (c.status === 'open') {
      const canAfford = casinoCoinBalance >= c.amount;
      return `<div class="casino-row"><span class="casino-row-desc">${escapeHtml(c.creator_username)} — ${c.amount} coins on ${c.creator_side}</span><button type="button" class="hub-btn casino-accept-btn" data-id="${c.id}" data-amount="${c.amount}" ${!canAfford ? 'disabled title="Not enough casino balance"' : ''}>Accept (stake ${c.amount})</button></div>`;
    }
    const me = getCasinoUsername();
    const canResolve = me && (c.creator_username === me || c.acceptor_username === me);
    return `<div class="casino-row"><span class="casino-row-desc">${escapeHtml(c.creator_username)} vs ${escapeHtml(c.acceptor_username || '?')} — ${c.amount} coins</span>${canResolve ? `<button type="button" class="hub-btn casino-resolve-btn" data-id="${c.id}">Resolve</button>` : '<span class="casino-wait">Waiting for resolve</span>'}</div>`;
  });
  list.innerHTML = rows.length ? rows.join('') : '<p class="casino-empty">No open coinflip challenges.</p>';
  list.querySelectorAll('.casino-accept-btn').forEach((btn) => btn.addEventListener('click', () => casinoAcceptCoinflip(Number(btn.dataset.id))));
  list.querySelectorAll('.casino-resolve-btn').forEach((btn) => btn.addEventListener('click', () => casinoResolveCoinflip(Number(btn.dataset.id))));
}

async function loadCasinoAuraVault() {
  const username = getCasinoUsername();
  if (!username || !supabase) {
    casinoAuraVault = [];
    return;
  }
  const { data } = await supabase.from('casino_aura_inventory').select('id, item_json').eq('username', username).order('id', { ascending: false });
  casinoAuraVault = (data || []).map((r) => ({ id: r.id, ...r.item_json }));
}

async function casinoDepositAura(lockedIndex) {
  const username = getCasinoUsername();
  const locked = getLockedStorage();
  if (lockedIndex < 0 || lockedIndex >= locked.length || !username || !supabase) return;
  const item = locked[lockedIndex];
  const itemJson = { text: item.text, font: item.font, color: item.color, fontWeight: item.fontWeight, fontStyle: item.fontStyle, textShadow: item.textShadow, rarity: item.rarity };
  const { data, error } = await supabase.rpc('casino_deposit_aura', { p_username: username, p_item_json: itemJson });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) {
    showCasinoMessage('casino-itemflip-msg', result?.message || error?.message || 'Deposit failed', true);
    return;
  }
  locked.splice(lockedIndex, 1);
  setLockedStorage(locked);
  renderLockedStorage();
  await loadCasinoAuraVault();
  renderCasino();
}

async function casinoWithdrawAura(auraId) {
  const username = getCasinoUsername();
  const id = typeof auraId === 'number' && Number.isInteger(auraId) ? auraId : parseInt(auraId, 10);
  if (!username || !supabase || !Number.isInteger(id) || id < 1) {
    showCasinoMessage('casino-itemflip-msg', 'Invalid aura.', true);
    return;
  }
  const { data, error } = await supabase.rpc('casino_withdraw_aura', { p_username: username, p_aura_id: id });
  const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
  if (error || !result?.success) {
    showCasinoMessage('casino-itemflip-msg', result?.message || error?.message || 'Withdraw failed', true);
    return;
  }
  let item = result.item_json;
  if (item == null) {
    showCasinoMessage('casino-itemflip-msg', 'Withdraw failed: no data returned.', true);
    return;
  }
  if (typeof item === 'string') {
    try {
      item = JSON.parse(item);
    } catch {
      showCasinoMessage('casino-itemflip-msg', 'Withdraw failed: invalid data.', true);
      return;
    }
  }
  const locked = getLockedStorage();
  locked.push({ text: item.text, font: item.font, color: item.color, fontWeight: item.fontWeight, fontStyle: item.fontStyle, textShadow: item.textShadow, rarity: item.rarity });
  setLockedStorage(locked);
  await loadCasinoAuraVault();
  renderLockedStorage();
  renderCasino();
}

async function casinoCreateItemflip() {
  const username = getCasinoUsername();
  const select = document.getElementById('casino-itemflip-aura');
  const auraId = select?.value ? Number(select.value) : 0;
  if (!username || !supabase || !auraId) {
    showCasinoMessage('casino-itemflip-msg', 'Select an aura from vault.', true);
    return;
  }
  const { data, error } = await supabase.rpc('casino_create_itemflip', { p_username: username, p_aura_id: auraId });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) {
    showCasinoMessage('casino-itemflip-msg', result?.message || error?.message || 'Create failed', true);
    return;
  }
  showCasinoMessage('casino-itemflip-msg', `Itemflip #${result.challenge_id} created.`);
  if (select) select.value = '';
  renderCasino();
}

async function casinoAcceptItemflip(challengeId, auraId) {
  const username = getCasinoUsername();
  if (!username || !supabase) return;
  const { data, error } = await supabase.rpc('casino_accept_itemflip', { p_challenge_id: challengeId, p_username: username, p_aura_id: auraId });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) {
    showCasinoMessage('casino-itemflip-msg', result?.message || error?.message || 'Accept failed', true);
    return;
  }
  showCasinoMessage('casino-itemflip-msg', 'Accepted. Either player can resolve.');
  renderCasino();
}

async function casinoResolveItemflip(id) {
  if (!supabase) return;
  const { data, error } = await supabase.rpc('casino_resolve_itemflip', { p_challenge_id: id });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) {
    showCasinoMessage('casino-itemflip-msg', result?.message || error?.message || 'Resolve failed', true);
    return;
  }
  showCasinoMessage('casino-itemflip-msg', `Winner: ${result.result_winner}`);
  renderCasino();
}

function renderAuraPreview(aura) {
  if (!aura || aura.text == null) return '<span class="casino-aura-preview casino-aura-preview--unknown">?</span>';
  const font = (aura.font || '').replace(/'/g, "\\'");
  const style = `font-family:'${font}',sans-serif;color:${aura.color || '#fff'};font-weight:${aura.fontWeight || '400'};font-style:${aura.fontStyle || 'normal'};text-shadow:${aura.textShadow || 'none'}`;
  const title = `${String(aura.text).replace(/"/g, '&quot;')} (${formatRarity(aura.rarity)})`;
  return `<span class="casino-aura-preview" style="${style}" title="${title}">${escapeHtml(aura.text)}</span> <span class="casino-aura-rarity">${formatRarity(aura.rarity)}</span>`;
}

async function loadCasinoItemflipList() {
  const list = document.getElementById('casino-itemflip-list');
  if (!list || !supabase) return;
  const { data: openList } = await supabase.from('itemflip_challenges').select('id, creator_username, creator_aura_id, status, acceptor_username, acceptor_aura_id').in('status', ['open', 'matched']).order('created_at', { ascending: false }).limit(30);
  const auraIds = new Set();
  (openList || []).forEach((c) => {
    if (c.creator_aura_id) auraIds.add(c.creator_aura_id);
    if (c.acceptor_aura_id) auraIds.add(c.acceptor_aura_id);
  });
  const auraMap = {};
  if (auraIds.size > 0) {
    const { data: auras } = await supabase.from('casino_aura_inventory').select('id, item_json').in('id', [...auraIds]);
    (auras || []).forEach((r) => {
      let json = r.item_json;
      if (typeof json === 'string') { try { json = JSON.parse(json); } catch { json = {}; } }
      auraMap[r.id] = json || {};
    });
  }
  const rows = (openList || []).map((c) => {
    const creatorMe = c.creator_username === getCasinoUsername();
    const creatorAura = auraMap[c.creator_aura_id];
    const acceptorAura = auraMap[c.acceptor_aura_id];
    if (c.status === 'open' && !creatorMe) {
      const creatorRarity = creatorAura?.rarity ?? 0;
      const eligible = casinoAuraVault.filter((a) => (a.rarity ?? 0) >= creatorRarity);
      const options = eligible.map((a) => `<option value="${a.id}">${escapeHtml(a.text)} (${formatRarity(a.rarity)})</option>`).join('');
      const opponentAuraHtml = creatorAura
        ? `${escapeHtml(c.creator_username)} stakes ${renderAuraPreview(creatorAura)} <span class="casino-rarity-req">(need ≥ ${formatRarity(creatorRarity)})</span>`
        : `${escapeHtml(c.creator_username)} — 1 aura`;
      const noEligible = eligible.length === 0;
      const disabledAttr = noEligible ? ' disabled' : '';
      const disabledTitle = noEligible ? ` title="You have no auras rare enough to match (need rarity ≥ ${formatRarity(creatorRarity)})"` : '';
      return `<div class="casino-row"><span class="casino-row-desc">${opponentAuraHtml}</span><select class="casino-select casino-select--inline" data-challenge-id="${c.id}"${disabledAttr}>${options ? `<option value="">Your aura</option>${options}` : '<option value="">No eligible auras</option>'}</select><button type="button" class="hub-btn casino-itemflip-accept-btn" data-challenge-id="${c.id}"${disabledAttr}${disabledTitle}>Accept</button></div>`;
    }
    if (c.status === 'matched') {
      const me = getCasinoUsername();
      const canResolve = me && (c.creator_username === me || c.acceptor_username === me);
      const creatorPart = creatorAura ? `${escapeHtml(c.creator_username)} ${renderAuraPreview(creatorAura)}` : escapeHtml(c.creator_username);
      const acceptorPart = acceptorAura ? `${escapeHtml(c.acceptor_username || '?')} ${renderAuraPreview(acceptorAura)}` : (c.acceptor_username || '?');
      return `<div class="casino-row casino-row--itemflip"><span class="casino-row-desc">${creatorPart} <span class="casino-vs">vs</span> ${acceptorPart}</span>${canResolve ? `<button type="button" class="hub-btn casino-itemflip-resolve-btn" data-id="${c.id}">Resolve</button>` : '<span class="casino-wait">Waiting</span>'}</div>`;
    }
    return '';
  }).filter(Boolean);
  list.innerHTML = rows.length ? rows.join('') : '<p class="casino-empty">No open itemflip challenges.</p>';
  list.querySelectorAll('.casino-itemflip-accept-btn').forEach((btn) => {
    const cid = Number(btn.dataset.challengeId);
    const row = btn.closest('.casino-row');
    const sel = row?.querySelector('.casino-select');
    btn.addEventListener('click', () => { const aid = sel?.value ? Number(sel.value) : 0; if (aid) casinoAcceptItemflip(cid, aid); });
  });
  list.querySelectorAll('.casino-itemflip-resolve-btn').forEach((btn) => btn.addEventListener('click', () => casinoResolveItemflip(Number(btn.dataset.id))));
}

function renderCasino() {
  const status = document.getElementById('casino-status');
  const usernameInput = document.getElementById('casino-username');
  if (usernameInput) usernameInput.value = getCasinoUsername();
  if (status) status.textContent = isHubAvailable() ? 'Use the same display name as Hub. Deposit coins or auras to play.' : 'Casino is offline. Configure Supabase to play.';
  const coinsEl = document.getElementById('casino-coins');
  if (coinsEl) coinsEl.textContent = casinoCoinBalance.toLocaleString();
  if (!supabase) return;
  (async () => {
    if (authUser) await refreshAuthProfile();
    await casinoFetchBalance();
    if (coinsEl) coinsEl.textContent = casinoCoinBalance.toLocaleString();
    const amountInput = document.getElementById('casino-coinflip-amount');
    const createBtn = document.getElementById('casino-coinflip-create');
    if (createBtn && amountInput) {
      const amount = Math.floor(Number(amountInput.value || 0));
      createBtn.disabled = !getCasinoUsername() || amount <= 0 || casinoCoinBalance < amount;
      createBtn.title = amount > 0 && casinoCoinBalance < amount ? 'Deposit more coins to create' : '';
    }
    await loadCasinoAuraVault();
    await loadCasinoCoinflipList();
    const vaultEl = document.getElementById('casino-aura-vault');
    if (vaultEl) {
      const locked = getLockedStorage();
      const canImportToBazaar = authUser && authProfile?.casino_username && (authProfile.casino_username || '').toLowerCase() === (getCasinoUsername() || '').toLowerCase();
      let html = '<p class="casino-vault-label">In vault (for itemflip):</p>';
      if (casinoAuraVault.length) {
        if (canImportToBazaar) {
          html += `<button type="button" class="hub-btn hub-btn--small casino-import-all-to-bazaar-btn" data-count="${casinoAuraVault.length}">Import all to Bazaar (${casinoAuraVault.length})</button>`;
        }
        html += casinoAuraVault.map((a) => {
          const importBtn = canImportToBazaar ? `<button type="button" class="hub-btn hub-btn--small bazaar-import-from-casino-btn" data-aura-id="${a.id}" title="Send to Bazaar inventory">Import</button>` : '';
          return `<div class="casino-aura-row"><span class="history-text" style="font-family:'${a.font}';color:${a.color};font-weight:${a.fontWeight || '400'};font-style:${a.fontStyle || 'normal'};text-shadow:${a.textShadow || 'none'}">${escapeHtml(a.text)}</span><span class="history-rarity">${formatRarity(a.rarity)}</span>${importBtn}<button type="button" class="hub-btn casino-withdraw-aura-btn" data-aura-id="${a.id}">Withdraw</button></div>`;
        }).join('');
      } else html += '<p class="casino-empty">No auras in vault. Deposit from Locked tab.</p>';
      if (casinoAuraVault.length && authUser && !canImportToBazaar) {
        html += '<p class="casino-vault-import-hint">Link your vault in Bazaar (My shop) to enable Import to Bazaar.</p>';
      }
      html += '<p class="casino-vault-label">Deposit from Locked (below):</p>';
      if (locked.length) {
        html += locked.map((h, i) => `<div class="casino-aura-row"><span class="history-text" style="font-family:'${(h.font || '').replace(/'/g, "\\'")}';color:${h.color || '#fff'}">${escapeHtml(h.text)}</span><span class="history-rarity">${formatRarity(h.rarity)}</span><button type="button" class="hub-btn casino-deposit-aura-btn" data-locked-index="${i}">Deposit</button></div>`).join('');
      } else html += '<p class="casino-empty">No locked auras. Lock items from Past rolls first.</p>';
      vaultEl.innerHTML = html;
      vaultEl.querySelectorAll('.casino-withdraw-aura-btn').forEach((btn) => {
        const rawId = btn.dataset.auraId;
        const id = rawId !== undefined && rawId !== '' ? parseInt(rawId, 10) : NaN;
        btn.addEventListener('click', () => casinoWithdrawAura(id));
      });
      vaultEl.querySelectorAll('.casino-deposit-aura-btn').forEach((btn) => btn.addEventListener('click', () => casinoDepositAura(Number(btn.dataset.lockedIndex))));
      vaultEl.querySelectorAll('.bazaar-import-from-casino-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.auraId);
        if (!authUser || !supabase) return;
        await bazaarImportAura(id);
        switchTab('bazaar');
      }));
      vaultEl.querySelectorAll('.casino-import-all-to-bazaar-btn').forEach((btn) => btn.addEventListener('click', async () => {
        if (!authUser || !supabase) return;
        await bazaarImportAllFromCasino();
        switchTab('bazaar');
      }));
    }
    const auraSelect = document.getElementById('casino-itemflip-aura');
    if (auraSelect) {
      const opts = casinoAuraVault.map((a) => `<option value="${a.id}">${escapeHtml(a.text)} (${formatRarity(a.rarity)})</option>`).join('');
      auraSelect.innerHTML = opts ? `<option value="">Select aura</option>${opts}` : '<option value="">No auras in vault</option>';
    }
    await loadCasinoItemflipList();
    const linkToBazaarBtn = document.getElementById('casino-link-to-bazaar-btn');
    const linkToBazaarStatus = document.getElementById('casino-link-to-bazaar-status');
    if (linkToBazaarBtn && linkToBazaarStatus) {
      if (authProfile?.casino_username && (authProfile.casino_username || '').toLowerCase() === (getCasinoUsername() || '').toLowerCase()) {
        linkToBazaarBtn.textContent = 'Linked to Bazaar';
        linkToBazaarBtn.disabled = true;
        linkToBazaarStatus.textContent = `Linked as ${escapeHtml(authProfile.casino_username)}`;
        linkToBazaarStatus.style.color = 'var(--roll)';
      } else {
        linkToBazaarBtn.textContent = 'Link to Bazaar';
        linkToBazaarBtn.disabled = false;
        linkToBazaarStatus.textContent = '';
      }
    }
  })();
}

async function casinoGenerateLinkCode() {
  const username = getCasinoUsername();
  if (!username || !supabase) return;
  const { data, error } = await supabase.rpc('generate_casino_link_code', { p_username: username });
  const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
  const el = document.getElementById('casino-link-code-display');
  if (!el) return;
  if (error || !result?.code) {
    el.textContent = 'Could not generate code.';
    el.style.color = 'var(--danger)';
    return;
  }
  const exp = result.expires_at ? new Date(result.expires_at).toLocaleTimeString() : '10 min';
  el.textContent = `Code: ${result.code} (valid until ${exp}). Enter this in the Bazaar tab while signed in.`;
  el.style.color = 'var(--roll)';
}

// ——— Auth (email/password for Bazaar) ———
let authUser = null;
let authProfile = null;
let pendingCasinoLink = false; // after sign-in, auto-run link

function updateAuthUI() {
  const signupBtn = document.getElementById('auth-signup-btn');
  const signinBtn = document.getElementById('auth-signin-btn');
  const signoutBtn = document.getElementById('auth-signout-btn');
  const userLabel = document.getElementById('auth-user-label');
  const guestEl = document.getElementById('bazaar-guest');
  const authedEl = document.getElementById('bazaar-authed');
  if (authUser) {
    if (signupBtn) signupBtn.classList.add('hidden');
    if (signinBtn) signinBtn.classList.add('hidden');
    if (signoutBtn) signoutBtn.classList.remove('hidden');
    if (userLabel) {
      userLabel.textContent = authProfile?.display_name || authUser.email || 'Signed in';
      userLabel.classList.remove('hidden');
    }
    if (guestEl) guestEl.classList.add('hidden');
    if (authedEl) authedEl.classList.remove('hidden');
    const devBtn = document.getElementById('dev-panel-btn');
    if (devBtn) devBtn.classList.toggle('hidden', !isAdminUser());
    const linkCasinoBtn = document.getElementById('link-casino-btn');
    if (linkCasinoBtn) linkCasinoBtn.classList.toggle('hidden', !!authProfile?.casino_username);
  } else {
    if (signupBtn) signupBtn.classList.remove('hidden');
    if (signinBtn) signinBtn.classList.remove('hidden');
    if (signoutBtn) signoutBtn.classList.add('hidden');
    if (userLabel) userLabel.classList.add('hidden');
    if (guestEl) guestEl.classList.remove('hidden');
    if (authedEl) authedEl.classList.add('hidden');
    const devBtn = document.getElementById('dev-panel-btn');
    if (devBtn) devBtn.classList.add('hidden');
    const linkCasinoBtn = document.getElementById('link-casino-btn');
    if (linkCasinoBtn) linkCasinoBtn.classList.add('hidden');
  }
}

function openDevPanel() {
  if (!isAdminUser()) return;
  const overlay = document.getElementById('dev-panel-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    const msg = document.getElementById('dev-panel-msg');
    if (msg) msg.textContent = '';
  }
}
function closeDevPanel() {
  const overlay = document.getElementById('dev-panel-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function grantItemById(id) {
  const all = [SUPREME_KING_AURA, ...JIA_VOID_AURAS, VOID_QUEEN_AURA, BOOK_OF_POWER_AURA, ...ACCOMPLISHMENT_AURAS, ...JIA_RARE_ITEMS, ...EMPEROR_AURAS, ...AURAS_100Q, ...ELDER_AURAS, ...ASCENDANT_AURAS, ...TIER2_AURAS, ...BIOME_AURAS, ...SECRET_AURAS, ...GEOMETRICAL_AURAS, ...WORLD_CONFIG.items];
  const item = all.find(a => a.id === id);
  if (!item) return false;
  const isElder = ELDER_AURAS.some(a => a.id === id);
  const isAscendant = ASCENDANT_AURAS.some(a => a.id === id);
  const isEmperor = EMPEROR_AURAS.some(a => a.id === id);
  const is100Q = AURAS_100Q.some(a => a.id === id);
  const isTier2 = TIER2_AURAS.some(a => a.id === id);
  const isAccomplishment = ACCOMPLISHMENT_AURAS.some(a => a.id === id);
  const isSupremeKing = id === 9999 || JIA_VOID_AURAS.some(a => a.id === id);
  const isVoidQueen = id === VOID_QUEEN_AURA.id;
  const isBookOfPower = id === BOOK_OF_POWER_AURA.id;
  const isGeometrical = GEOMETRICAL_AURAS.some(a => a.id === id);
  if (isElder || isAscendant || isEmperor || is100Q || isTier2 || isAccomplishment || isSupremeKing || isVoidQueen || isBookOfPower) markElderReceived(id);
  const tierTag = isGeometrical ? 'geometrical' : isBookOfPower ? 'bookofpower' : isVoidQueen ? 'voidqueen' : isAccomplishment ? 'accomplishment' : isTier2 ? 'tier2' : is100Q ? '100q' : isEmperor ? 'emperor' : isAscendant ? 'ascendant' : isElder ? 'elder' : 'grant';
  const history = getHistory();
  history.push({
    historyId: `${Date.now()}-${tierTag}-${id}`,
    id: item.id, text: item.text, font: item.font,
    color: item.color, fontWeight: item.fontWeight || '400',
    fontStyle: item.fontStyle || 'normal', textShadow: item.textShadow || '',
    rarity: item.rarity ?? 0,
    isElder: isElder || false,
    isAscendant: isAscendant || false,
    isEmperor: isEmperor || false,
    is100Q: is100Q || false,
    isTier2: isTier2 || false,
    isAccomplishment: isAccomplishment || false,
    isSupremeKing: isSupremeKing || false,
    isVoidQueen: isVoidQueen || false,
    isBookOfPower: isBookOfPower || false,
    isGeometrical: isGeometrical || false,
  });
  setHistory(history);
  renderHistory();
  return true;
}

function openAuthOverlay(tab = 'signin') {
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  const emailEl = document.getElementById('auth-email');
  if (emailEl) emailEl.value = '';
  const passwordEl = document.getElementById('auth-password');
  if (passwordEl) passwordEl.value = '';
  const messageEl = document.getElementById('auth-message');
  if (messageEl) messageEl.textContent = '';
  const signupEmailEl = document.getElementById('auth-signup-email');
  if (signupEmailEl) signupEmailEl.value = '';
  const signupPasswordEl = document.getElementById('auth-signup-password');
  if (signupPasswordEl) signupPasswordEl.value = '';
  const signupDisplayNameEl = document.getElementById('auth-signup-displayname');
  if (signupDisplayNameEl) signupDisplayNameEl.value = '';
  const signupMessageEl = document.getElementById('auth-signup-message');
  if (signupMessageEl) signupMessageEl.textContent = '';
  if (tab === 'signup') {
    const tabSignin = document.getElementById('auth-tab-signin');
    if (tabSignin) tabSignin.classList.remove('active');
    const tabSignup = document.getElementById('auth-tab-signup');
    if (tabSignup) tabSignup.classList.add('active');
    const signinForm = document.getElementById('auth-signin-form');
    if (signinForm) signinForm.classList.add('hidden');
    const signupForm = document.getElementById('auth-signup-form');
    if (signupForm) signupForm.classList.remove('hidden');
  } else {
    const tabSignin = document.getElementById('auth-tab-signin');
    if (tabSignin) tabSignin.classList.add('active');
    const tabSignup = document.getElementById('auth-tab-signup');
    if (tabSignup) tabSignup.classList.remove('active');
    const signinForm = document.getElementById('auth-signin-form');
    if (signinForm) signinForm.classList.remove('hidden');
    const signupForm = document.getElementById('auth-signup-form');
    if (signupForm) signupForm.classList.add('hidden');
  }
}

function closeAuthOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

async function authSignIn() {
  const email = document.getElementById('auth-email')?.value?.trim();
  const password = document.getElementById('auth-password')?.value;
  const msg = document.getElementById('auth-message');
  if (!email || !password || !supabase) return;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (msg) { msg.textContent = error.message; msg.style.color = 'var(--danger)'; }
    return;
  }
  if (msg) msg.textContent = '';
  closeAuthOverlay();
  await refreshAuthProfile();
  updateAuthUI();
  renderBazaar();
  if (pendingCasinoLink) {
    pendingCasinoLink = false;
    const ok = await bazaarAutoLinkCasino();
    if (ok) {
      showBazaarBalanceMsg(`Linked as ${authProfile?.casino_username || getCasinoUsername()}`);
      updateAuthUI();
      renderBazaar();
      renderCasino();
      switchTab('bazaar');
    } else {
      showBazaarBalanceMsg('Link failed. Set display name in Hub first.', true);
    }
  }
}

async function authSignUp() {
  const email = document.getElementById('auth-signup-email')?.value?.trim();
  const password = document.getElementById('auth-signup-password')?.value;
  const displayName = document.getElementById('auth-signup-displayname')?.value?.trim()?.slice(0, 24) || '';
  const referralCode = document.getElementById('auth-signup-referral')?.value?.trim()?.toUpperCase()?.slice(0, 16) || '';
  const msg = document.getElementById('auth-signup-message');
  if (!email || !password || !supabase) return;
  const signUpOpts = referralCode ? { data: { referral_code: referralCode } } : {};
  const { data, error } = await supabase.auth.signUp({ email, password, options: signUpOpts });
  if (error) {
    if (msg) { msg.textContent = error.message; msg.style.color = 'var(--danger)'; }
    return;
  }
  if (data?.user && displayName) {
    await supabase.from('profiles').update({ display_name: displayName }).eq('id', data.user.id);
  }
  if (msg) { msg.textContent = 'Check your email to confirm, or sign in.'; msg.style.color = 'var(--roll)'; }
  setTimeout(async () => {
    closeAuthOverlay();
    await refreshAuthProfile();
    updateAuthUI();
    renderBazaar();
    if (pendingCasinoLink) {
      pendingCasinoLink = false;
      const ok = await bazaarAutoLinkCasino();
      if (ok) {
        showBazaarBalanceMsg(`Linked as ${authProfile?.casino_username || getCasinoUsername()}`);
        updateAuthUI();
        renderBazaar();
        renderCasino();
        switchTab('bazaar');
      } else {
        showBazaarBalanceMsg('Link failed. Set display name in Hub first.', true);
      }
    }
  }, 1500);
}

async function authSignOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  authUser = null;
  authProfile = null;
  updateAuthUI();
  renderBazaar();
}

async function refreshAuthProfile() {
  if (!authUser || !supabase) return;
  const { data } = await supabase.from('profiles').select('display_name, casino_username').eq('id', authUser.id).single();
  authProfile = data || null;
}

async function claimReferralLocalCoins() {
  if (!authUser || !supabase) return 0;
  const { data, error } = await supabase.rpc('claim_referral_local_coins');
  if (error) return 0;
  const row = Array.isArray(data) ? data[0] : data;
  const amount = row?.amount ?? 0;
  if (amount > 0) {
    setCoins(getCoins() + amount);
    renderCoins();
    showBazaarBalanceMsg(`Referral bonus: ${amount.toLocaleString()} coins!`, false);
  }
  return amount;
}

// ——— Bazaar ———
let bazaarCoinBalance = 0;

async function bazaarFetchBalance() {
  if (!authUser || !supabase) return 0;
  const { data } = await supabase.from('bazaar_wallets').select('coins_balance').eq('user_id', authUser.id);
  bazaarCoinBalance = (data && data[0]) ? data[0].coins_balance : 0;
  return bazaarCoinBalance;
}

function showBazaarBalanceMsg(text, isError = false) {
  const el = document.getElementById('bazaar-balance-msg');
  if (el) {
    el.textContent = text;
    el.style.color = isError ? 'var(--danger)' : 'var(--roll)';
    el.classList.remove('hidden');
    el.style.visibility = 'visible';
    setTimeout(() => el.classList.add('hidden'), 6000);
  }
}

async function bazaarDepositAllCoins() {
  if (!authUser || !supabase) return;
  const amount = getCoins();
  if (amount <= 0) { showBazaarBalanceMsg('No coins to deposit.', true); return; }
  document.getElementById('bazaar-deposit-amount').value = String(amount);
  await bazaarDepositCoins();
}

async function bazaarWithdrawAllCoins() {
  if (!authUser || !supabase) return;
  await bazaarFetchBalance();
  const amount = bazaarCoinBalance;
  if (amount <= 0) { showBazaarBalanceMsg('No Bazaar coins to withdraw.', true); return; }
  document.getElementById('bazaar-deposit-amount').value = String(amount);
  await bazaarWithdrawCoins();
}

async function bazaarDepositCoins() {
  const amount = Math.floor(Number(document.getElementById('bazaar-deposit-amount')?.value || 0));
  if (!authUser || !supabase || amount <= 0) { showBazaarBalanceMsg('Enter a valid amount.', true); return; }
  const localCoins = getCoins();
  if (localCoins < amount) { showBazaarBalanceMsg('Not enough coins in your game balance.', true); return; }
  const { data, error } = await supabase.rpc('bazaar_deposit_coins', { p_amount: amount });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) { showBazaarBalanceMsg(result?.message || error?.message || 'Deposit failed', true); return; }
  setCoins(localCoins - amount);
  bazaarCoinBalance = result.new_balance ?? 0;
  document.getElementById('bazaar-deposit-amount').value = '';
  showBazaarBalanceMsg('Deposited.');
  renderCoins();
  renderBazaar();
}

async function bazaarWithdrawCoins() {
  const amount = Math.floor(Number(document.getElementById('bazaar-deposit-amount')?.value || 0));
  if (!authUser || !supabase || amount <= 0) { showBazaarBalanceMsg('Enter a valid amount.', true); return; }
  const { data, error } = await supabase.rpc('bazaar_withdraw_coins', { p_amount: amount });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) { showBazaarBalanceMsg(result?.message || error?.message || 'Withdraw failed', true); return; }
  setCoins(getCoins() + amount);
  bazaarCoinBalance = result.new_balance ?? 0;
  document.getElementById('bazaar-deposit-amount').value = '';
  showBazaarBalanceMsg('Withdrawn.');
  renderCoins();
  renderBazaar();
}

let bazaarAutoLinkAttempted = false;

/** One-click link: generate code for game's casino username and immediately link (same device) */
async function bazaarAutoLinkCasino() {
  const username = getCasinoUsername()?.trim()?.slice(0, 24);
  if (!authUser || !supabase || !username) return false;
  const { data: codeData } = await supabase.rpc('generate_casino_link_code', { p_username: username });
  const codeRow = Array.isArray(codeData) ? codeData[0] : codeData;
  const code = codeRow?.code ? String(codeRow.code).padStart(6, '0').slice(0, 6) : '';
  if (!code) return false;
  const { data, error } = await supabase.rpc('link_casino_to_account', { p_username: username, p_code: code });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) return false;
  await refreshAuthProfile();
  return true;
}

async function bazaarLinkCasino() {
  const username = document.getElementById('bazaar-link-username')?.value?.trim()?.slice(0, 24) || getCasinoUsername()?.trim()?.slice(0, 24) || '';
  const codeInput = document.getElementById('bazaar-link-code')?.value?.trim()?.slice(0, 6) || '';
  let code = codeInput;
  if (!username || !code) {
    const statusEl = document.getElementById('bazaar-link-status');
    if (statusEl) { statusEl.textContent = 'Enter Casino name and 6-digit code, or use "Link my Casino".'; statusEl.style.color = 'var(--danger)'; }
    return;
  }
  if (!authUser || !supabase) return;
  const { data, error } = await supabase.rpc('link_casino_to_account', { p_username: username, p_code: code });
  const result = Array.isArray(data) ? data[0] : data;
  const statusEl = document.getElementById('bazaar-link-status');
  if (error || !result?.success) {
    if (statusEl) { statusEl.textContent = result?.message || error?.message || 'Link failed'; statusEl.style.color = 'var(--danger)'; }
    return;
  }
  if (statusEl) { statusEl.textContent = 'Vault linked.'; statusEl.style.color = 'var(--roll)'; }
  await refreshAuthProfile();
  renderBazaar();
}

async function sendLockedAuraToBazaar(lockedIndex) {
  if (!authUser || !supabase) {
    showBazaarBalanceMsg('Sign in to use Bazaar.', true);
    return;
  }
  await refreshAuthProfile();
  if (!authProfile?.casino_username) {
    showBazaarBalanceMsg('Link your Casino vault in the Bazaar tab first.', true);
    switchTab('bazaar');
    return;
  }
  const locked = getLockedStorage();
  if (lockedIndex < 0 || lockedIndex >= locked.length) return;
  const item = locked[lockedIndex];
  const itemJson = { text: item.text, font: item.font, color: item.color, fontWeight: item.fontWeight, fontStyle: item.fontStyle, textShadow: item.textShadow, rarity: item.rarity };
  const { data: depData, error: depErr } = await supabase.rpc('casino_deposit_aura', { p_username: authProfile.casino_username, p_item_json: itemJson });
  const depResult = Array.isArray(depData) ? depData[0] : depData;
  if (depErr || !depResult?.success) {
    showBazaarBalanceMsg(depResult?.message || depErr?.message || 'Deposit to vault failed', true);
    return;
  }
  const auraId = depResult?.aura_id;
  if (!auraId) {
    showBazaarBalanceMsg('Deposit succeeded but could not get aura ID.', true);
    return;
  }
  locked.splice(lockedIndex, 1);
  setLockedStorage(locked);
  const { data: impData, error: impErr } = await supabase.rpc('bazaar_import_aura_from_casino', { p_aura_id: auraId });
  const impResult = Array.isArray(impData) ? impData[0] : impData;
  if (impErr || !impResult?.success) {
    showBazaarBalanceMsg(impResult?.message || impErr?.message || 'Import to Bazaar failed', true);
    return;
  }
  renderLockedStorage();
  await loadCasinoAuraVault();
  renderCasino();
  await renderBazaar();
  switchTab('bazaar');
  showBazaarBalanceMsg('Aura in My inventory. Enter a price and click List for sale.');
  setTimeout(() => document.getElementById('bazaar-inventory-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
}

function setBazaarLockedImportStatus(text, isError = false) {
  const el = document.getElementById('bazaar-locked-import-status');
  if (el) { el.textContent = text; el.style.color = isError ? 'var(--danger)' : 'var(--roll)'; }
}

async function bazaarImportFromLocked(lockedIndex) {
  setBazaarLockedImportStatus('');
  if (!authUser) { setBazaarLockedImportStatus('Sign in to import.', true); showBazaarBalanceMsg('Sign in to import.', true); return; }
  if (!supabase) { setBazaarLockedImportStatus('Bazaar not configured.', true); showBazaarBalanceMsg('Bazaar not configured.', true); return; }
  const locked = getLockedStorage();
  if (lockedIndex < 0 || lockedIndex >= locked.length) { setBazaarLockedImportStatus('Invalid item.', true); return; }
  const item = locked[lockedIndex];
  const text = typeof item.text === 'string' ? item.text.trim() : String(item?.text ?? '').trim();
  if (!text) { setBazaarLockedImportStatus('Invalid aura data.', true); return; }
  const itemJson = {
    text,
    font: item.font || 'Inter',
    color: item.color || '#ffffff',
    fontWeight: item.fontWeight || '400',
    fontStyle: item.fontStyle || 'normal',
    textShadow: item.textShadow || 'none',
    rarity: item.rarity ?? 1
  };
  setBazaarLockedImportStatus('Importing…');
  try {
    const { error } = await supabase.from('bazaar_seller_inventory').insert({
      user_id: authUser.id,
      item_json: itemJson
    });
    if (error) {
      const msg = error.message || 'Unknown error';
      setBazaarLockedImportStatus('Import failed: ' + msg, true);
      showBazaarBalanceMsg('Import failed: ' + msg, true);
      return;
    }
  } catch (err) {
    const msg = err?.message || String(err);
    setBazaarLockedImportStatus('Import failed: ' + msg, true);
    showBazaarBalanceMsg('Import failed: ' + msg, true);
    return;
  }
  locked.splice(lockedIndex, 1);
  setLockedStorage(locked);
  renderLockedStorage();
  await renderBazaar();
  setBazaarLockedImportStatus('Imported. Enter a price and click List for sale.');
  showBazaarBalanceMsg('Imported. Enter a price and click List for sale.');
  setTimeout(() => document.getElementById('bazaar-inventory-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

async function bazaarImportAllFromLocked() {
  setBazaarLockedImportStatus('');
  if (!authUser) { setBazaarLockedImportStatus('Sign in to import.', true); return; }
  if (!supabase) { setBazaarLockedImportStatus('Bazaar not configured.', true); return; }
  const locked = getLockedStorage();
  if (!locked.length) { setBazaarLockedImportStatus('No locked auras.', true); return; }
  const btn = document.getElementById('bazaar-import-all-locked-btn');
  if (btn) btn.disabled = true;
  setBazaarLockedImportStatus('Importing…');
  let imported = 0;
  for (let i = locked.length - 1; i >= 0; i--) {
    const item = locked[i];
    const text = typeof item.text === 'string' ? item.text.trim() : String(item?.text ?? '').trim();
    if (!text) continue;
    const itemJson = { text, font: item.font || 'Inter', color: item.color || '#ffffff', fontWeight: item.fontWeight || '400', fontStyle: item.fontStyle || 'normal', textShadow: item.textShadow || 'none', rarity: item.rarity ?? 1 };
    try {
      const { error } = await supabase.from('bazaar_seller_inventory').insert({
        user_id: authUser.id,
        item_json: itemJson
      });
      if (!error) {
        locked.splice(i, 1);
        imported++;
      }
    } catch (_) { /* skip failed */ }
  }
  setLockedStorage(locked);
  if (btn) btn.disabled = false;
  renderLockedStorage();
  await renderBazaar();
  setBazaarLockedImportStatus(imported > 0 ? `Imported ${imported} aura${imported !== 1 ? 's' : ''}.` : 'Import failed. Sign in and ensure Bazaar tables exist.');
  showBazaarBalanceMsg(imported > 0 ? `Imported ${imported}. Enter prices and click List for sale.` : 'No auras imported.', imported === 0);
  if (imported) setTimeout(() => document.getElementById('bazaar-inventory-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

async function bazaarImportAura(auraId) {
  if (!authUser || !supabase) return;
  const { data, error } = await supabase.rpc('bazaar_import_aura_from_casino', { p_aura_id: auraId });
  const result = Array.isArray(data) ? data[0] : data;
  if (error) { showBazaarBalanceMsg('Import failed: ' + error.message, true); return; }
  if (!result?.success) { showBazaarBalanceMsg(result?.message || 'Import failed', true); return; }
  await loadCasinoAuraVault();
  renderCasino();
  await renderBazaar();
  showBazaarBalanceMsg('Aura imported. Enter a price and click List for sale in My inventory.');
  setTimeout(() => document.getElementById('bazaar-inventory-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

async function bazaarImportAllFromCasino() {
  if (!authUser || !supabase) return;
  const btn = document.getElementById('bazaar-import-all-btn');
  if (btn) btn.disabled = true;
  const { data, error } = await supabase.rpc('bazaar_import_all_from_casino');
  const result = Array.isArray(data) ? data[0] : data;
  if (btn) btn.disabled = false;
  if (error) { showBazaarBalanceMsg('Import all failed: ' + error.message, true); return; }
  if (!result?.success) { showBazaarBalanceMsg(result?.message || 'Import all failed', true); return; }
  const n = result?.imported_count ?? 0;
  await loadCasinoAuraVault();
  renderCasino();
  await renderBazaar();
  showBazaarBalanceMsg(n > 0 ? `Imported ${n} aura${n !== 1 ? 's' : ''}. Enter prices and click List for sale.` : 'No auras to import (none in vault or all staked).');
  if (n > 0) setTimeout(() => document.getElementById('bazaar-inventory-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

async function bazaarCreateListing(inventoryId, price) {
  if (!authUser || !supabase || !inventoryId || !price || price < 1) { showBazaarBalanceMsg('Enter a valid price.', true); return; }
  const { data, error } = await supabase.rpc('bazaar_create_listing', { p_inventory_id: inventoryId, p_price: price });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) { showBazaarBalanceMsg(result?.message || error?.message || 'List failed', true); return; }
  showBazaarBalanceMsg('Listed.');
  renderBazaar();
}

async function bazaarBuyListing(listingId) {
  if (!authUser || !supabase) return;
  const btn = document.querySelector(`.bazaar-buy-btn[data-id="${listingId}"]`);
  if (btn) btn.disabled = true;
  const { data, error } = await supabase.rpc('bazaar_buy_listing', { p_listing_id: listingId });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) {
    showBazaarBalanceMsg(result?.message || error?.message || 'Purchase failed', true);
    if (btn) btn.disabled = false;
  } else {
    showBazaarBalanceMsg('Purchased.');
    renderBazaar();
  }
}

async function bazaarCancelListing(listingId) {
  if (!authUser || !supabase) return;
  const { data, error } = await supabase.rpc('bazaar_cancel_listing', { p_listing_id: listingId });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) { showBazaarBalanceMsg(result?.message || error?.message || 'Cancel failed', true); return; }
  showBazaarBalanceMsg('Listing cancelled.');
  renderBazaar();
}

async function bazaarWithdrawAuraToCasino(inventoryId) {
  if (!authUser || !supabase) return;
  const { data, error } = await supabase.rpc('bazaar_withdraw_aura_to_casino', { p_inventory_id: inventoryId });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) { showBazaarBalanceMsg(result?.message || error?.message || 'Withdraw failed', true); return; }
  await loadCasinoAuraVault();
  renderCasino();
  renderBazaar();
}

async function bazaarStockBuyMax() {
  if (!authUser || !supabase) return;
  await bazaarFetchBalance();
  const priceEl = document.getElementById('bazaar-stock-price');
  const price = parseInt(priceEl?.textContent?.replace(/,/g, '') || '0', 10);
  if (price < 1) { showBazaarBalanceMsg('Price not loaded yet.', true); return; }
  const maxShares = Math.floor(bazaarCoinBalance / price);
  if (maxShares < 1) { showBazaarBalanceMsg('Not enough Bazaar balance.', true); return; }
  document.getElementById('bazaar-stock-buy-shares').value = String(maxShares);
  await bazaarStockBuy();
}

async function bazaarStockSellAll() {
  const holdingsEl = document.getElementById('bazaar-stock-holdings');
  const match = holdingsEl?.textContent?.match(/(\d[\d,]*)\s+shares/);
  const shares = match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
  if (shares < 1) { showBazaarBalanceMsg('No shares to sell.', true); return; }
  document.getElementById('bazaar-stock-sell-shares').value = String(shares);
  await bazaarStockSell();
}

async function bazaarStockBuy() {
  if (!authUser || !supabase) return;
  const shares = Math.floor(Number(document.getElementById('bazaar-stock-buy-shares')?.value || 0));
  if (shares < 1) { showBazaarBalanceMsg('Enter shares to buy.', true); return; }
  const btn = document.getElementById('bazaar-stock-buy-btn');
  if (btn) btn.disabled = true;
  const { data, error } = await supabase.rpc('bazaar_stock_buy', { p_symbol: 'BZX', p_shares: shares });
  const result = Array.isArray(data) ? data[0] : data;
  if (btn) btn.disabled = false;
  if (error || !result?.success) { showBazaarBalanceMsg(result?.message || error?.message || 'Buy failed', true); return; }
  document.getElementById('bazaar-stock-buy-shares').value = '';
  showBazaarBalanceMsg('Bought ' + shares + ' BZX shares.');
  renderBazaar();
}

async function bazaarStockSell() {
  if (!authUser || !supabase) return;
  const shares = Math.floor(Number(document.getElementById('bazaar-stock-sell-shares')?.value || 0));
  if (shares < 1) { showBazaarBalanceMsg('Enter shares to sell.', true); return; }
  const btn = document.getElementById('bazaar-stock-sell-btn');
  if (btn) btn.disabled = true;
  const { data, error } = await supabase.rpc('bazaar_stock_sell', { p_symbol: 'BZX', p_shares: shares });
  const result = Array.isArray(data) ? data[0] : data;
  if (btn) btn.disabled = false;
  if (error || !result?.success) { showBazaarBalanceMsg(result?.message || error?.message || 'Sell failed', true); return; }
  document.getElementById('bazaar-stock-sell-shares').value = '';
  showBazaarBalanceMsg('Sold ' + shares + ' BZX shares.');
  renderBazaar();
}

async function bazaarInvestInBusiness(ownerId, amount) {
  if (!authUser || !supabase) return;
  const amt = Math.floor(Number(amount || 0));
  if (amt < 1) { showBazaarBalanceMsg('Enter amount to invest.', true); return; }
  const { data, error } = await supabase.rpc('bazaar_invest_in_business', { p_owner_id: ownerId, p_amount: amt });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) { showBazaarBalanceMsg(result?.message || error?.message || 'Invest failed', true); return; }
  showBazaarBalanceMsg('Invested ' + amt.toLocaleString() + ' coins.');
  renderBazaar();
}

async function bazaarDivestFromBusiness(ownerId, amount) {
  if (!authUser || !supabase) return;
  const amt = Math.floor(Number(amount || 0));
  if (amt < 1) { showBazaarBalanceMsg('Enter amount to divest.', true); return; }
  const { data, error } = await supabase.rpc('bazaar_divest_from_business', { p_owner_id: ownerId, p_amount: amt });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) { showBazaarBalanceMsg(result?.message || error?.message || 'Divest failed', true); return; }
  showBazaarBalanceMsg('Divested ' + amt.toLocaleString() + ' coins.');
  renderBazaar();
}

function renderBazaar() {
  const guestEl = document.getElementById('bazaar-guest');
  const authedEl = document.getElementById('bazaar-authed');
  const coinsEl = document.getElementById('bazaar-coins');
  if (coinsEl) coinsEl.textContent = bazaarCoinBalance.toLocaleString();
  if (!authUser) {
    if (guestEl) guestEl.classList.remove('hidden');
    if (authedEl) authedEl.classList.add('hidden');
    return;
  }
  if (guestEl) guestEl.classList.add('hidden');
  if (authedEl) authedEl.classList.remove('hidden');
  if (!supabase) return;
  return (async () => {
    try {
    await bazaarFetchBalance();
    if (coinsEl) coinsEl.textContent = bazaarCoinBalance.toLocaleString();
    const linkStatus = document.getElementById('bazaar-link-status');
    const linkBtn = document.getElementById('bazaar-link-btn-single');
    const linkManual = document.querySelector('.bazaar-link-manual');
    const linkUsernameInput = document.getElementById('bazaar-link-username');
    if (authProfile?.casino_username) {
      if (linkStatus) linkStatus.textContent = `Linked as ${escapeHtml(authProfile.casino_username)}`;
      if (linkBtn) linkBtn.style.display = 'none';
      if (linkManual) linkManual.style.display = 'none';
    } else {
      if (linkStatus) linkStatus.textContent = '';
      if (linkBtn) linkBtn.style.display = '';
      if (linkManual) linkManual.style.display = '';
      if (linkUsernameInput && !linkUsernameInput.value) {
        const hubName = getCasinoUsername();
        if (hubName) linkUsernameInput.placeholder = `e.g. ${hubName}`;
      }
      const casinoName = getCasinoUsername();
      if (casinoName && !bazaarAutoLinkAttempted) {
        bazaarAutoLinkAttempted = true;
        if (linkStatus) linkStatus.textContent = 'Connecting…';
        const ok = await bazaarAutoLinkCasino();
        if (ok) {
          if (linkStatus) linkStatus.textContent = `Linked as ${escapeHtml(authProfile?.casino_username || casinoName)}`;
          if (linkBtn) linkBtn.style.display = 'none';
          if (linkManual) linkManual.style.display = 'none';
        } else {
          if (linkStatus) linkStatus.textContent = '';
        }
      }
    }
    const { data: listings } = await supabase.from('bazaar_listings').select('id, seller_id, item_json, price').eq('status', 'listed').order('created_at', { ascending: false }).limit(50);
    const sellerIds = [...new Set((listings || []).map((l) => l.seller_id))];
    const sellerNames = {};
    if (sellerIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', sellerIds);
      (profs || []).forEach((p) => { sellerNames[p.id] = p.display_name; });
    }
    const investSellerIds = [...new Set((listings || []).map((l) => l.seller_id))].filter((id) => id !== authUser.id);
    let businessStats = {};
    const idsToFetch = investSellerIds.length ? [...investSellerIds, authUser.id] : [authUser.id];
    const { data: statsRows } = await supabase.from('bazaar_business_stats').select('user_id, total_invested, investor_count, sales_count').in('user_id', idsToFetch);
    (statsRows || []).forEach((r) => { businessStats[r.user_id] = r; });
    const myStats = businessStats[authUser.id] || {};
    const mySales = myStats.sales_count || 0;
    checkAccomplishmentsBazaar(mySales);
    const investListEl = document.getElementById('bazaar-invest-list');
    if (investListEl) {
      const investRows = investSellerIds.map((ownerId) => {
        const name = sellerNames[ownerId] || '?';
        const stat = businessStats[ownerId] || {};
        const totalInv = stat.total_invested || 0;
        const sales = stat.sales_count || 0;
        return `<div class="casino-row"><span class="casino-row-desc">${escapeHtml(name)} — ${totalInv.toLocaleString()} invested · ${sales} sales</span><input type="number" class="casino-amount-input bazaar-invest-amount" placeholder="Amount" min="1" data-owner="${ownerId}" style="width:80px" /><button type="button" class="hub-btn bazaar-invest-btn" data-owner="${ownerId}">Invest</button></div>`;
      });
      investListEl.innerHTML = investRows.length ? investRows.join('') : '<p class="casino-empty">No other sellers with listings. List some auras to appear here.</p>';
      investListEl.querySelectorAll('.bazaar-invest-btn').forEach((btn) => {
        const ownerId = btn.dataset.owner;
        const row = btn.closest('.casino-row');
        const input = row?.querySelector('.bazaar-invest-amount');
        btn.addEventListener('click', () => bazaarInvestInBusiness(ownerId, input?.value));
      });
    }
    const { data: myInvData } = await supabase.from('bazaar_business_investments').select('business_owner_id, amount').eq('investor_id', authUser.id);
    const myInvOwnerIds = [...new Set((myInvData || []).map((i) => i.business_owner_id))];
    let myInvNames = {};
    if (myInvOwnerIds.length) {
      const { data: invProfs } = await supabase.from('profiles').select('id, display_name').in('id', myInvOwnerIds);
      (invProfs || []).forEach((p) => { myInvNames[p.id] = p.display_name; });
    }
    const myInvEl = document.getElementById('bazaar-my-investments');
    if (myInvEl) {
      const myInvRows = (myInvData || []).map((inv) => {
        const name = myInvNames[inv.business_owner_id] || '?';
        return `<div class="casino-row"><span class="casino-row-desc">${escapeHtml(name)} — ${(inv.amount || 0).toLocaleString()} invested</span><input type="number" class="casino-amount-input bazaar-divest-amount" placeholder="Amount" min="1" data-owner="${inv.business_owner_id}" style="width:80px" /><button type="button" class="hub-btn hub-btn--secondary bazaar-divest-btn" data-owner="${inv.business_owner_id}">Divest</button></div>`;
      });
      myInvEl.innerHTML = myInvRows.length ? myInvRows.join('') : '<p class="casino-empty">No investments yet.</p>';
      myInvEl.querySelectorAll('.bazaar-divest-btn').forEach((btn) => {
        const ownerId = btn.dataset.owner;
        const row = btn.closest('.casino-row');
        const input = row?.querySelector('.bazaar-divest-amount');
        btn.addEventListener('click', () => bazaarDivestFromBusiness(ownerId, input?.value));
      });
    }
    const listEl = document.getElementById('bazaar-listings');
    if (listEl) {
      const rows = (listings || []).map((l) => {
        const sellerName = sellerNames[l.seller_id] || '?';
        const aura = typeof l.item_json === 'string' ? (() => { try { return JSON.parse(l.item_json); } catch { return {}; } })() : (l.item_json || {});
        return `<div class="casino-row"><span class="casino-row-desc">${escapeHtml(sellerName)} — ${renderAuraPreview(aura)} <strong>${l.price} coins</strong></span><button type="button" class="hub-btn bazaar-buy-btn" data-id="${l.id}">Buy</button></div>`;
      });
      listEl.innerHTML = rows.length ? rows.join('') : '<p class="casino-empty">No listings.</p>';
      listEl.querySelectorAll('.bazaar-buy-btn').forEach((btn) => btn.addEventListener('click', () => bazaarBuyListing(Number(btn.dataset.id))));
    }
    const locked = getLockedStorage();
    const lockedImportEl = document.getElementById('bazaar-locked-import');
    if (lockedImportEl) {
      if (locked.length) {
        const importAllLockedHtml = `<button type="button" id="bazaar-import-all-locked-btn" class="hub-btn hub-btn--small bazaar-import-all-btn">Import all (${locked.length})</button>`;
        lockedImportEl.innerHTML = importAllLockedHtml + locked.map((h, i) => `<div class="casino-aura-row"><span class="history-text" style="font-family:'${(h.font || '').replace(/'/g, "\\'")}';color:${h.color || '#fff'}">${escapeHtml(h.text)}</span><span class="history-rarity">${formatRarity(h.rarity)}</span><button type="button" class="hub-btn bazaar-import-locked-btn" data-locked-index="${i}">Import</button></div>`).join('');
        lockedImportEl.querySelectorAll('.bazaar-import-locked-btn').forEach((btn) => {
          const idx = Number(btn.dataset.lockedIndex);
          btn.addEventListener('click', () => bazaarImportFromLocked(idx));
        });
        document.getElementById('bazaar-import-all-locked-btn')?.addEventListener('click', () => bazaarImportAllFromLocked());
      } else {
        lockedImportEl.innerHTML = '<p class="casino-empty">No locked auras. Lock items from Past rolls first.</p>';
      }
    }
    const { data: casinoVault } = authProfile?.casino_username
      ? await supabase.from('casino_aura_inventory').select('id, item_json').eq('username', authProfile.casino_username).order('id', { ascending: false })
      : { data: [] };
    const vaultEl = document.getElementById('bazaar-casino-vault');
    const importAllBtn = document.getElementById('bazaar-import-all-btn');
    if (vaultEl) {
      const vault = (casinoVault || []).map((r) => ({ id: r.id, ...(typeof r.item_json === 'string' ? (() => { try { return JSON.parse(r.item_json); } catch { return {}; } })() : r.item_json) }));
      const importAllHtml = vault.length ? `<button type="button" id="bazaar-import-all-btn" class="hub-btn hub-btn--small bazaar-import-all-btn">Import all (${vault.length})</button>` : '';
      vaultEl.innerHTML = (vault.length ? importAllHtml : '') + (vault.length
        ? vault.map((a) => `<div class="casino-aura-row"><span class="history-text" style="font-family:'${a.font}';color:${a.color}">${escapeHtml(a.text)}</span><span class="history-rarity">${formatRarity(a.rarity)}</span><button type="button" class="hub-btn bazaar-import-btn" data-aura-id="${a.id}">Import</button></div>`).join('')
        : '<p class="casino-empty">No auras in Casino vault. Link vault and deposit auras in Casino first.</p>');
      vaultEl.querySelectorAll('.bazaar-import-btn').forEach((btn) => btn.addEventListener('click', () => bazaarImportAura(Number(btn.dataset.auraId))));
      document.getElementById('bazaar-import-all-btn')?.addEventListener('click', bazaarImportAllFromCasino);
    }
    const { data: inv } = await supabase.from('bazaar_seller_inventory').select('id, item_json').eq('user_id', authUser.id).order('id', { ascending: false });
    const invList = (inv || []).map((r) => ({ id: r.id, ...(typeof r.item_json === 'string' ? (() => { try { return JSON.parse(r.item_json); } catch { return {}; } })() : r.item_json) }));
    const invEl = document.getElementById('bazaar-inventory');
    if (invEl) {
      invEl.innerHTML = invList.length
        ? invList.map((a) => `<div class="casino-aura-row"><span class="history-text" style="font-family:'${a.font}';color:${a.color}">${escapeHtml(a.text)}</span><span class="history-rarity">${formatRarity(a.rarity)}</span><input type="number" class="casino-amount-input bazaar-price-input" placeholder="Price (coins)" min="1" data-id="${a.id}" /><button type="button" class="hub-btn bazaar-list-btn" data-id="${a.id}">List for sale</button><button type="button" class="hub-btn hub-btn--secondary bazaar-withdraw-aura-btn" data-id="${a.id}">To Casino</button></div>`).join('')
        : '<p class="casino-empty">No auras in Bazaar inventory. Import from Locked or Casino vault above.</p>';
      invEl.querySelectorAll('.bazaar-list-btn').forEach((btn) => {
        const id = Number(btn.dataset.id);
        const row = btn.closest('.casino-aura-row');
        const priceInput = row?.querySelector('.bazaar-price-input');
        btn.addEventListener('click', () => {
          const p = Math.floor(Number(priceInput?.value || 0));
          if (p >= 1) bazaarCreateListing(id, p);
          else showBazaarBalanceMsg('Enter a price (1 or more) first.', true);
        });
      });
      invEl.querySelectorAll('.bazaar-withdraw-aura-btn').forEach((btn) => btn.addEventListener('click', () => bazaarWithdrawAuraToCasino(Number(btn.dataset.id))));
    }
    const { data: myListings } = await supabase.from('bazaar_listings').select('id, item_json, price').eq('seller_id', authUser.id).eq('status', 'listed').order('created_at', { ascending: false });
    const myEl = document.getElementById('bazaar-my-listings');
    if (myEl) {
      const myList = (myListings || []).map((l) => ({ id: l.id, ...(typeof l.item_json === 'string' ? (() => { try { return JSON.parse(l.item_json); } catch { return {}; } })() : l.item_json), price: l.price }));
      myEl.innerHTML = myList.length
        ? myList.map((a) => `<div class="casino-aura-row"><span class="history-text" style="font-family:'${a.font}';color:${a.color}">${escapeHtml(a.text)}</span><span class="history-rarity">${formatRarity(a.rarity)}</span> <strong>${a.price} coins</strong><button type="button" class="hub-btn hub-btn--secondary bazaar-cancel-btn" data-id="${a.id}">Cancel</button></div>`).join('')
        : '<p class="casino-empty">No active listings.</p>';
      myEl.querySelectorAll('.bazaar-cancel-btn').forEach((btn) => btn.addEventListener('click', () => bazaarCancelListing(Number(btn.dataset.id))));
    }
    const { data: stockData } = await supabase.rpc('bazaar_stock_get_price', { p_symbol: 'BZX' });
    const stockRow = Array.isArray(stockData) ? stockData[0] : stockData;
    const priceEl = document.getElementById('bazaar-stock-price');
    const salesEl = document.getElementById('bazaar-stock-sales');
    const volEl = document.getElementById('bazaar-stock-volume');
    if (priceEl) priceEl.textContent = stockRow?.price != null ? Math.round(stockRow.price).toLocaleString() : '—';
    if (salesEl) salesEl.textContent = stockRow?.sales_24h != null ? stockRow.sales_24h.toLocaleString() : '—';
    if (volEl) volEl.textContent = stockRow?.volume_24h != null ? stockRow.volume_24h.toLocaleString() : '—';
    const { data: holdingsData } = await supabase.from('bazaar_stock_holdings').select('shares, avg_buy_price').eq('user_id', authUser.id).eq('symbol', 'BZX').single();
    const holdingsEl = document.getElementById('bazaar-stock-holdings');
    if (holdingsEl) {
      const sh = holdingsData?.shares ?? 0;
      const avg = holdingsData?.avg_buy_price;
      const p = stockRow?.price ?? 0;
      const val = sh * p;
      const pl = avg != null && sh > 0 ? ((p - avg) / avg * 100).toFixed(1) : null;
      holdingsEl.textContent = `My BZX: ${sh.toLocaleString()} shares${val > 0 ? ` · Value: ${Math.round(val).toLocaleString()} coins` : ''}${pl != null ? ` · P/L: ${Number(pl) >= 0 ? '+' : ''}${pl}%` : ''}`;
    }
    } catch (err) {
      console.error('[Bazaar]', err);
      const listEl = document.getElementById('bazaar-listings');
      if (listEl) listEl.innerHTML = `<p class="casino-empty" style="color:var(--danger)">Failed to load Bazaar. Ensure supabase-bazaar.sql and supabase-casino.sql are deployed. Check console for details.</p>`;
    }
  })();
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function renderHub() {
  const status = document.getElementById('hub-status');
  const usernameInput = document.getElementById('hub-username');
  if (usernameInput) usernameInput.value = getHubUsername();
  if (status) status.textContent = isHubAvailable() ? 'Connected. Set a display name, then chat or post trades below.' : 'Hub is offline. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use chat and trading.';
  if (!supabase) return;
  refreshBanCache();
  loadHubMessages();
  loadHubTrades();
  if (!hubChatSubscription) {
    hubChatSubscription = supabase.channel('hub-messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
      loadHubMessages();
      if (activeTab !== 'hub') {
        hubUnreadCount++;
        updateHubBadge();
      }
    }).subscribe();
  }
  if (!hubTradesSubscription) {
    hubTradesSubscription = supabase.channel('hub-trades').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, () => loadHubTrades()).subscribe();
  }
}

function moveToLockedStorage(historyId) {
  const history = getHistory();
  const idx = history.findIndex((e, i) => (e.historyId || `legacy-${i}`) === historyId);
  if (idx === -1) return;
  const [entry] = history.splice(idx, 1);
  const locked = getLockedStorage();
  locked.push(entry);
  setHistory(history);
  setLockedStorage(locked);
}

function moveToHistory(lockedIndex) {
  const locked = getLockedStorage();
  if (lockedIndex < 0 || lockedIndex >= locked.length) return;
  const [entry] = locked.splice(lockedIndex, 1);
  const history = getHistory();
  history.push(entry);
  setLockedStorage(locked);
  setHistory(history);
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const history = getHistory();
  if (history.length === 0) {
    list.innerHTML = '<li class="history-item history-item--empty"><span class="history-text">No rolls yet. Hit Roll above.</span></li>';
    return;
  }
  list.innerHTML = history
    .slice()
    .reverse()
    .map((h, i) => {
      const idx = history.length - 1 - i;
      const id = h.historyId || `legacy-${idx}`;
      const isSecret    = h.isSecret    || h.rarity === 0;
      const isBiome     = h.isBiome     || false;
      const isElder     = h.isElder     || false;
      const isAscendant = h.isAscendant || false;
      const isEmperor   = h.isEmperor   || false;
      const is100Q      = h.is100Q      || false;
      const isTier2     = h.isTier2     || false;
      const isSupremeKing = h.isSupremeKing || false;
      const isVoidQueen   = h.isVoidQueen   || false;
      const isBookOfPower = h.isBookOfPower || false;
      const isAccomplishment = h.isAccomplishment || false;
      const isGeometrical = h.isGeometrical || false;
      const isMutation  = h.isMutation  || false;
      const isNull      = h.isNull      || false;
      const specialClass = isSupremeKing ? ' history-item--supreme-king'
        : isVoidQueen ? ' history-item--void-queen'
        : isBookOfPower ? ' history-item--book-of-power'
        : isAccomplishment ? ' history-item--accomplishment'
        : isSecret ? ' history-item--secret'
        : isBiome     ? ' history-item--biome'
        : isEmperor   ? ' history-item--emperor'
        : is100Q      ? ' history-item--100q'
        : isTier2     ? ' history-item--tier2'
        : isGeometrical ? ' history-item--geometrical'
        : isElder     ? ' history-item--elder'
        : isAscendant ? ' history-item--ascendant'
        : isMutation  ? ' history-item--mutation'
        : isNull      ? ' history-item--null'
        : '';
      const isSpecial = isSecret || isBiome || isElder || isAscendant || isEmperor || is100Q || isTier2 || isAccomplishment || isGeometrical || isNull || isSupremeKing || isVoidQueen || isBookOfPower;
      const categoryBadge = isSupremeKing
        ? `<span class="supreme-king-badge" style="font-size:0.55rem;font-weight:900;letter-spacing:.15em;color:#ffd700;opacity:.95;text-shadow:0 0 12px #ffd700, 0 0 24px #ff4400, 0 0 40px #ff2200;">♔ UNOBTAINABLE</span>`
        : isVoidQueen
        ? `<span class="void-queen-badge" style="font-size:0.55rem;font-weight:900;letter-spacing:.15em;color:#aa00ff;opacity:.95;text-shadow:0 0 12px #aa00ff, 0 0 24px #6600aa;">♔ VOID QUEEN</span>`
        : isBookOfPower
        ? `<span class="book-of-power-badge" style="font-size:0.55rem;font-weight:900;letter-spacing:.15em;color:#ffd700;opacity:.95;text-shadow:0 0 12px #ffd700, 0 0 24px #ffaa00;">📖 BOOK OF POWER</span>`
        : isAccomplishment
        ? `<span class="accomplishment-badge" style="font-size:0.55rem;font-weight:900;letter-spacing:.12em;color:#ffd700;opacity:.9;text-shadow:0 0 10px #ffd700, 0 0 20px #ff8800;">✦ ACCOMPLISHMENT</span>`
        : isSecret
        ? '<span class="secret-badge">⚠ SECRET</span>'
        : isBiome
          ? `<span class="biome-badge">🌍 BIOME</span>`
          : isEmperor
            ? `<span class="emperor-badge" style="font-size:0.55rem;font-weight:900;letter-spacing:.15em;color:#ffd700;opacity:.95;text-shadow:0 0 10px #ffd700, 0 0 20px #ff6600;">♛ EMPEROR</span>`
            : is100Q
              ? `<span class="100q-badge" style="font-size:0.55rem;font-weight:900;letter-spacing:.15em;color:#ffd700;opacity:.9;text-shadow:0 0 10px #ffd700, 0 0 20px #ff6600;">✦ 100Q</span>`
              : isTier2
              ? `<span class="tier2-badge" style="font-size:0.55rem;font-weight:900;letter-spacing:.15em;color:#ffd700;opacity:.9;text-shadow:0 0 10px #ffd700, 0 0 20px #ff6600;">✦ TIER 2</span>`
              : isGeometrical
                ? `<span class="geometrical-badge" style="font-size:0.55rem;font-weight:900;letter-spacing:.15em;color:#00d4ff;opacity:.9;text-shadow:0 0 10px #00d4ff;">🔷 GEOMETRICAL</span>`
                : isElder
                ? `<span class="elder-badge" style="font-size:0.55rem;font-weight:900;letter-spacing:.15em;color:gold;opacity:.85;text-shadow:0 0 8px gold;">ELDER</span>`
                : isAscendant
                  ? `<span class="ascendant-badge" style="font-size:0.55rem;font-weight:900;letter-spacing:.15em;color:#00ddaa;opacity:.9;text-shadow:0 0 8px #00ddaa;">ASCENDANT</span>`
                : isMutation
                  ? `<span class="mutation-badge" style="font-size:0.55rem;font-weight:900;letter-spacing:.12em;color:#ff88ff;opacity:.9;text-shadow:0 0 8px #ff88ff;">⟁ ${h.subtitle || 'MUTATED'}</span>`
                  : isNull
                    ? `<span class="null-badge" style="font-size:0.55rem;font-weight:900;letter-spacing:.2em;color:#666;opacity:.9;">NULL</span>`
                    : '';
      const lockBtn = `<button type="button" class="lock-btn" data-history-id="${id}" title="Lock — move to storage (no salvage)">🔒 Lock</button>`;
      const canSalvage = !isSpecial;
      const at = h.auraType || classifyAuraType(h.text);
      const atInfo = AURA_TYPE_INFO[at];
      const typeBadge = atInfo ? `<span class="aura-type-badge" style="color:${atInfo.color}">${atInfo.tag}</span>` : '';
      return `<li class="history-item${specialClass}" data-index="${idx}" data-history-id="${id}">
          ${categoryBadge}
          ${lockBtn}
          <span class="history-text" style="font-family:'${h.font}';color:${h.color};font-weight:${h.fontWeight};font-style:${h.fontStyle};text-shadow:${h.textShadow}">${h.text}</span>
          ${typeBadge}
          <span class="history-rarity">${formatRarity(h.rarity)}</span>
          ${canSalvage ? `<button type="button" class="salvage-btn" data-index="${idx}" title="Salvage for ${coinsForSalvage(h.rarity)} coins${h.rarity >= 100 ? ' + possible scraps' : ''}">Salvage</button>` : ''}
        </li>`;
    })
    .join('');
  list.querySelectorAll('.lock-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.historyId;
      if (!id) return;
      moveToLockedStorage(id);
      renderHistory();
      renderLockedStorage();
    });
  });
  list.querySelectorAll('.salvage-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      const history = getHistory();
      if (idx < 0 || idx >= history.length) return;
      const [removed] = history.splice(idx, 1);
      setHistory(history);
      setCoins(getCoins() + coinsForSalvage(removed.rarity));
      const scrapsGained = scrapsFromSalvage(removed.rarity);
      if (scrapsGained > 0) {
        setScraps(getScraps() + scrapsGained);
        renderTheo();
        const notif = document.createElement('span');
        notif.className = 'scrap-notif';
        notif.textContent = `+${scrapsGained} scrap${scrapsGained > 1 ? 's' : ''}`;
        btn.parentElement.appendChild(notif);
        setTimeout(() => notif.remove(), 1800);
      }
      addQuestProgress('salvage', 1);
      if (scrapsGained > 0) addQuestProgress('earn_scraps', scrapsGained);
      renderHistory();
      renderCoins();
      renderLuck();
    });
  });
}

function renderLockedStorage() {
  const list = document.getElementById('locked-list');
  if (!list) return;
  const locked = getLockedStorage();
  if (locked.length === 0) {
    list.innerHTML = '<li class="history-item history-item--empty"><span class="history-text">No locked auras. Lock items from Past rolls.</span></li>';
    return;
  }
  list.innerHTML = locked
    .slice()
    .reverse()
    .map((h, i) => {
      const idx = locked.length - 1 - i;
      const lineage = h.isSupremeKing ? '<span class="lineage-badge" style="color:#ffd700;text-shadow:0 0 12px #ffd700, 0 0 24px #ff4400, 0 0 40px #ff2200;">♔ UNOBTAINABLE</span>'
        : h.isVoidQueen ? '<span class="lineage-badge" style="color:#aa00ff;text-shadow:0 0 12px #aa00ff, 0 0 24px #6600aa;">♔ VOID QUEEN</span>'
        : h.isBookOfPower ? '<span class="lineage-badge" style="color:#ffd700;text-shadow:0 0 12px #ffd700, 0 0 24px #ffaa00;">📖 BOOK OF POWER</span>'
        : h.isAccomplishment ? '<span class="lineage-badge" style="color:#ffd700;text-shadow:0 0 10px #ffd700, 0 0 20px #ff8800;">✦ ACCOMPLISHMENT</span>'
        : h.isEmperor ? '<span class="lineage-badge" style="color:#ffd700;text-shadow:0 0 10px #ffd700, 0 0 20px #ff6600;">♛ EMPEROR</span>'
        : h.is100Q ? '<span class="lineage-badge" style="color:#ffd700;text-shadow:0 0 10px #ffd700, 0 0 20px #ff6600;">✦ 100Q</span>'
        : h.isTier2 ? '<span class="lineage-badge" style="color:#ffd700;text-shadow:0 0 10px #ffd700, 0 0 20px #ff6600;">✦ TIER 2</span>'
        : h.isGeometrical ? '<span class="lineage-badge" style="color:#00d4ff;text-shadow:0 0 10px #00d4ff;">🔷 GEOMETRICAL</span>'
        : h.isElder ? '<span class="lineage-badge" style="color:gold;text-shadow:0 0 8px gold;">ELDER</span>'
        : h.isAscendant ? '<span class="lineage-badge" style="color:#00ddaa;text-shadow:0 0 8px #00ddaa;">ASCENDANT</span>'
        : '';
      const tierClass = h.isSupremeKing ? ' history-item--supreme-king'
        : h.isVoidQueen ? ' history-item--void-queen'
        : h.isBookOfPower ? ' history-item--book-of-power'
        : h.isAccomplishment ? ' history-item--accomplishment'
        : h.isEmperor ? ' history-item--emperor'
        : h.is100Q ? ' history-item--100q'
        : h.isTier2 ? ' history-item--tier2'
        : h.isGeometrical ? ' history-item--geometrical'
        : h.isElder ? ' history-item--elder'
        : h.isAscendant ? ' history-item--ascendant'
        : '';
      return `<li class="history-item history-item--storage${tierClass}" data-locked-index="${idx}">
          ${lineage}
          <button type="button" class="unlock-btn" data-locked-index="${idx}" title="Unlock — send back to Past rolls">🔓 Unlock</button>
          <button type="button" class="to-bazaar-btn" data-locked-index="${idx}" title="Send to Bazaar (deposit to vault + import)">🏪 To Bazaar</button>
          <span class="history-text" style="font-family:'${h.font}';color:${h.color};font-weight:${h.fontWeight};font-style:${h.fontStyle};text-shadow:${h.textShadow}">${h.text}</span>
          <span class="history-rarity">${formatRarity(h.rarity)}</span>
        </li>`;
    })
    .join('');
  list.querySelectorAll('.unlock-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.lockedIndex, 10);
      moveToHistory(idx);
      renderHistory();
      renderLockedStorage();
    });
  });
  list.querySelectorAll('.to-bazaar-btn').forEach((btn) => {
    btn.addEventListener('click', () => sendLockedAuraToBazaar(parseInt(btn.dataset.lockedIndex, 10)));
  });
}

function switchTab(tabName) {
  activeTab = tabName;
  if (tabName === 'hub') {
    hubUnreadCount = 0;
    updateHubBadge();
  }
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });
  ['past', 'locked', 'shop', 'hub', 'casino', 'bazaar', 'tycoon', 'store', 'quests', 'competition'].forEach((id) => {
    const panel = document.getElementById(`tab-${id}`);
    if (panel) {
      panel.classList.toggle('hidden', tabName !== id);
      panel.setAttribute('aria-hidden', tabName !== id);
    }
  });
  if (tabName === 'shop') { renderShop(); renderSneho(); }
  if (tabName === 'hub') renderHub();
  if (tabName === 'casino') renderCasino();
  if (tabName === 'bazaar') renderBazaar();
  if (tabName === 'tycoon') renderTycoon();
  if (tabName === 'store')  renderStore();
  if (tabName === 'quests') renderQuestBoard();
  if (tabName === 'competition') renderCompetition();
}

const RARE_ROLL_THRESHOLD  = 1_000_000_000_000;   // Jerry broadcast threshold (1T)
const GLOBAL_THRESHOLD     = 100_000_000;       // 100M — Global aura animation
const UNIVERSAL_THRESHOLD  = 100_000_000_000;   // 100B — Universal aura animation
const MYTHIC_THRESHOLD     = 1_000_000_000_000; // 1T  — Mythic aura animation

let isAnimating = false; // blocks rolling while a cutscene is playing

const MYTHIC_CUTSCENES = {
  9000: { quote: 'The void stares back.',          bg: '#050010', accentA: '#9900ff', accentB: '#330044' },
  9001: { quote: 'Here, all things end.',           bg: '#100300', accentA: '#ff6600', accentB: '#ff2200' },
  9002: { quote: 'Born before time itself.',        bg: '#0a0500', accentA: '#ffcc00', accentB: '#ff4400' },
  9003: { quote: 'The final light goes out.',       bg: '#000508', accentA: '#aaccff', accentB: '#ffffff' },
  9004: { quote: 'Nothing is beyond your reach.',   bg: '#000f0a', accentA: '#00ffcc', accentB: '#00aa88' },
  9005: { quote: 'The rules no longer apply.',      bg: '#0f0008', accentA: '#ff00aa', accentB: '#ff66dd' },
  9006: { quote: 'Two truths. One aura.',           bg: '#080500', accentA: '#d4af37', accentB: '#ffeeaa' },
  9007: { quote: 'Beyond question. Beyond doubt.',  bg: '#000008', accentA: '#8888ff', accentB: '#e8e8ff' },
  9008: { quote: 'This was never supposed to drop.',bg: '#000a02', accentA: '#00ff44', accentB: '#00cc33' },
  9009: { quote: 'You have transcended everything.',       bg: '#000000', accentA: '#ff00ff', accentB: '#ffff00' },
  9010: { quote: 'It does not destroy. It erases.',        bg: '#0a0000', accentA: '#ff2200', accentB: '#880000' },
  9011: { quote: 'No word exists for what this is.',       bg: '#070707', accentA: '#e8e8e8', accentB: '#888888' },
  9012: { quote: 'The throne sits above all thrones.',     bg: '#060008', accentA: '#bb00ff', accentB: '#440055' },
  9013: { quote: 'Even gods answer to this.',              bg: '#000208', accentA: '#ffd700', accentB: '#003399' },
  9014: { quote: 'Before the beginning, there was this.', bg: '#000a04', accentA: '#00ff88', accentB: '#004422' },
  9015: { quote: 'It has always been. It always will be.', bg: '#000308', accentA: '#c0e8ff', accentB: '#002244' },
  9016: { quote: 'Worlds are merely a meal.',              bg: '#080100', accentA: '#ff4400', accentB: '#550000' },
  9017: { quote: 'Will shapes reality. Yours bends it.',   bg: '#030003', accentA: '#ff00ff', accentB: '#ffff00' },
  9018: { quote: 'The blueprint of existence itself.',     bg: '#000008', accentA: '#4488ff', accentB: '#d4af37' },
  9019: { quote: 'It has no shape. No name. No limit.',    bg: '#050505', accentA: '#aaaaaa', accentB: '#333333' },
  9020: { quote: 'The last word in every language.',       bg: '#000000', accentA: '#ffffff', accentB: '#555555' },
  9021: { quote: 'Even divinity must fall eventually.',    bg: '#080004', accentA: '#ff44ff', accentB: '#ff2200' },
  9022: { quote: 'There is nothing left to surpass.',      bg: '#000508', accentA: '#00eeff', accentB: '#003344' },
  9023: { quote: 'It was here before names were spoken.',  bg: '#060500', accentA: '#ffee88', accentB: '#443300' },
  9024: { quote: 'When all else fades — this endures.',       bg: '#000004', accentA: '#e0e0ff', accentB: '#0000aa' },
  9025: { quote: 'Older than the first law of nature.',       bg: '#080200', accentA: '#ff7700', accentB: '#cc3300' },
  9026: { quote: 'No chain can hold what has no limit.',      bg: '#000806', accentA: '#66ffee', accentB: '#00aaaa' },
  9027: { quote: 'The void does not bow. It rules.',          bg: '#060008', accentA: '#aa00ff', accentB: '#550088' },
  9028: { quote: 'After this, there is nothing to build.',    bg: '#080400', accentA: '#ffddaa', accentB: '#ff8800' },
  9029: { quote: 'One. Just one. There can be no other.',     bg: '#030303', accentA: '#ffffff', accentB: '#888888' },
  9030: { quote: 'Everything folds inward. Even infinity.',   bg: '#000005', accentA: '#3300ff', accentB: '#aa00ff' },
  9031: { quote: 'Two truths collide. Only one survives.',    bg: '#060002', accentA: '#ff44aa', accentB: '#ffcc00' },
  9032: { quote: 'Ideas end here. This is the last one.',     bg: '#000a04', accentA: '#aaffcc', accentB: '#00ff88' },
  9033: { quote: 'The blueprint that made everything else.',  bg: '#040400', accentA: '#ffcc44', accentB: '#4433ff' },
  9034: { quote: 'This was written before you were born.',    bg: '#080000', accentA: '#ff0000', accentB: '#880000' },
  9035: { quote: 'The universe did not contain it. It IS it.',bg: '#010101', accentA: '#ff00ff', accentB: '#00ffff' },
  9036: { quote: 'Not darkness. The absence of everything.',  bg: '#000000', accentA: '#aaaaff', accentB: '#ffffff' },
  9037: { quote: 'One hundred trillion. You have no words.',  bg: '#000000', accentA: '#ffd700', accentB: '#ff00ff' },

  // Beyond Mythic: 110T – 400T
  9038: { quote: 'This was not meant to be rolled.',                             bg: '#1a0000', accentA: '#ff3311', accentB: '#880000' },
  9039: { quote: 'The gods exhaled. You caught their last breath.',              bg: '#1a0e00', accentA: '#ffcc88', accentB: '#ff8800' },
  9040: { quote: 'Some things were never supposed to be written.',               bg: '#00111a', accentA: '#aaddff', accentB: '#3399cc' },
  9041: { quote: 'Even stars do not last this long.',                            bg: '#1a0015', accentA: '#ff88ee', accentB: '#cc0099' },
  9042: { quote: 'When everything collapses, this remains.',                     bg: '#001a0d', accentA: '#00ff99', accentB: '#00aa55' },
  9043: { quote: 'The key that was never supposed to be found.',                 bg: '#0d0022', accentA: '#ddbbff', accentB: '#8800ff' },
  9044: { quote: 'There are no borders left. You crossed them all.',             bg: '#1a0800', accentA: '#ff6600', accentB: '#cc3300' },
  9045: { quote: 'Where no light travels. You went anyway.',                     bg: '#000d1a', accentA: '#5577aa', accentB: '#aabbcc' },
  9046: { quote: 'An age passed in silence. You were still here.',               bg: '#00001a', accentA: '#c8c8ff', accentB: '#6666ff' },
  9047: { quote: 'To know everything is to shatter.',                            bg: '#000000', accentA: '#ffffff', accentB: '#ff00ff' },

  // Stellar: 430T – 950T
  9048: { quote: 'A pulse so strong it unmade reality.',                         bg: '#1a1a00', accentA: '#ffff00', accentB: '#aaaa00' },
  9049: { quote: 'They forgot about this. You found it anyway.',                 bg: '#1a0d00', accentA: '#ffaa66', accentB: '#ff6600' },
  9050: { quote: 'Ground zero. The beginning of the end.',                       bg: '#001122', accentA: '#00ffff', accentB: '#0088cc' },
  9051: { quote: 'The last photon in the dying universe.',                       bg: '#111100', accentA: '#ffffee', accentB: '#ffff88' },
  9052: { quote: 'Buried under infinite layers. Until now.',                     bg: '#110022', accentA: '#cc88ff', accentB: '#883399' },
  9053: { quote: 'A dominion without a throne. Yours now.',                      bg: '#001a0d', accentA: '#99ffcc', accentB: '#00cc77' },
  9054: { quote: 'The cosmos unchained itself. So did you.',                     bg: '#1a0011', accentA: '#ff4477', accentB: '#cc0033' },
  9055: { quote: 'Inside the hollow: everything and nothing.',                   bg: '#0a0a14', accentA: '#8888cc', accentB: '#ccccff' },

  // Quadrillion Gate: 1Q – 4.5Q
  9056: { quote: 'A crown forged in the ash of dead suns.',                      bg: '#1a0d00', accentA: '#ffddbb', accentB: '#cc8800' },
  9057: { quote: 'Rising through decay. The only way up.',                       bg: '#001a14', accentA: '#00ffcc', accentB: '#009966' },
  9058: { quote: 'A wound that never healed. A clock that never stopped.',       bg: '#1a0011', accentA: '#ff6688', accentB: '#cc0033' },
  9059: { quote: 'Not the absence of things — the absence of absence itself.',   bg: '#1a001a', accentA: '#ff00ff', accentB: '#8800aa' },
  9060: { quote: 'You bent gravity to your will.',                               bg: '#000d1a', accentA: '#88bbff', accentB: '#0044cc' },
  9061: { quote: 'The universe winds down. But not yet.',                        bg: '#1a1100', accentA: '#ffee00', accentB: '#ff8800' },
  9062: { quote: 'After this, there is no sequel.',                              bg: '#0d001a', accentA: '#ffffff', accentB: '#ff00ff' },
  9063: { quote: 'Not yet shaped. Not yet named. Not yet yours. Until now.',     bg: '#111a00', accentA: '#eeffaa', accentB: '#aacc00' },
  9064: { quote: 'It was always going to happen. Always.',                       bg: '#111111', accentA: '#cccccc', accentB: '#ffffff' },
  9065: { quote: 'A whisper from before time began.',                            bg: '#001a1a', accentA: '#aaffff', accentB: '#00aaaa' },
  9066: { quote: 'What was whole is now split forever.',                         bg: '#1a0800', accentA: '#ff8800', accentB: '#ff0033' },
  9067: { quote: 'You have gone beyond. There is no way back.',                  bg: '#00001a', accentA: '#eeeeff', accentB: '#aaaaff' },

  // Apex: 5Q – 9Q (safe ceiling)
  9068: { quote: 'Tyrant of space, time, and every axis between.',               bg: '#1a0000', accentA: '#ff1111', accentB: '#880000' },
  9069: { quote: 'The purest form of nothing becoming something terrible.',      bg: '#1a0000', accentA: '#ff3300', accentB: '#aa0000' },
  9070: { quote: 'The hand that shaped creation. Unseen until now.',             bg: '#111110', accentA: '#ccccbb', accentB: '#888877' },
  9071: { quote: 'A frequency no device can measure.',                           bg: '#001100', accentA: '#00ff00', accentB: '#00aa00' },
  9072: { quote: 'The very last aura ever to be catalogued.',                    bg: '#1a1100', accentA: '#ffcc00', accentB: '#cc9900' },

  // ─── Biome Auras (only during active Global Biomes) ─────────────────────
  9910: { quote: 'The earth folded. You caught what poured out.',                bg: '#1a0300', accentA: '#ff6600', accentB: '#ff2200' },
  9911: { quote: 'Forged in pressure. Born in flame. Never meant to cool.',      bg: '#1a0000', accentA: '#ff4400', accentB: '#cc0000' },
  9912: { quote: 'A seat at the table of stars. Earned by impossible odds.',     bg: '#0a0800', accentA: '#ffd700', accentB: '#ff8800' },
  9913: { quote: 'An empire stretching light-years in every direction. Yours.',  bg: '#0a0015', accentA: '#cc88ff', accentB: '#8800ff' },
  9914: { quote: 'Beyond emptiness. The form that nothingness takes.',           bg: '#060010', accentA: '#8800ff', accentB: '#440088' },
  9915: { quote: 'It existed before it was created. Think about that.',          bg: '#030008', accentA: '#aa44ff', accentB: '#550088' },
  9916: { quote: 'Every angle a different truth. All of them correct.',          bg: '#001515', accentA: '#aaffff', accentB: '#00cccc' },
  9917: { quote: 'The first ice ever to form anywhere. Still unmelted.',         bg: '#000a15', accentA: '#88ccff', accentB: '#4488ff' },
  9918: { quote: 'The original storm. All others are echoes of this one.',       bg: '#070710', accentA: '#ffffff', accentB: '#aaaaff' },
  9919: { quote: 'Everything electrical bows to this frequency.',                bg: '#0a0a00', accentA: '#ffff00', accentB: '#ff8800' },

  // ─── Secret Auras (Ultraluck-only, 1/10M per use) ────────────────────────
  9900: { quote: 'This aura does not exist. You should not be seeing this.',     bg: '#000000', accentA: '#ff0000', accentB: '#ff4444' },
  9901: { quote: 'The data has been classified. Yet here you are.',              bg: '#050505', accentA: '#cccccc', accentB: '#888888' },
  9902: { quote: 'You rolled nothing. And nothing rolled back.',                 bg: '#000000', accentA: '#ffffff', accentB: '#555555' },
  9903: { quote: 'The sum of all luck. Spent in a single instant.',              bg: '#000a0a', accentA: '#00ffff', accentB: '#003344' },
  9904: { quote: 'No one wrote this down. It wrote itself.',                     bg: '#080808', accentA: '#e8e8e8', accentB: '#888888' },
  9905: { quote: 'A transmission from a game that no longer runs.',              bg: '#000a02', accentA: '#44ff88', accentB: '#004422' },
  9906: { quote: 'Built every system you have ever played within. Now yours.',   bg: '#0a0800', accentA: '#d4af37', accentB: '#664400' },
  9907: { quote: "It can't exist and it does. Pick one.",                        bg: '#080008', accentA: '#ff00ff', accentB: '#00ffff' },
  9908: { quote: 'The very first thing this game ever created.',                 bg: '#0a0800', accentA: '#ffffff', accentB: '#ffaa00' },
  9909: { quote: 'Even the developer does not know where this came from.',       bg: '#000a0a', accentA: '#aaffff', accentB: '#003344' },

  // ─── Mutation Auras (twisted variants with flavor text) ─────────────────
  9100: { quote: 'The void looked inward. It did not like what it saw.',               bg: '#001a12', accentA: '#44ffcc', accentB: '#004433' },
  9101: { quote: 'Not the end of eternity. The end that eternity became.',             bg: '#0a0a14', accentA: '#6688aa', accentB: '#334455' },
  9102: { quote: 'The first fire, extinguished. What remains is colder than nothing.', bg: '#000a14', accentA: '#88ccff', accentB: '#002244' },
  9103: { quote: 'All power. No purpose. The worst kind of strength.',                 bg: '#0a0400', accentA: '#ff6644', accentB: '#441100' },
  9104: { quote: 'Reality broke. Then it healed wrong.',                               bg: '#000a00', accentA: '#88ff88', accentB: '#114411' },
  9105: { quote: 'A god that learned to die. It did not forget how.',                  bg: '#080808', accentA: '#888888', accentB: '#222222' },
  9106: { quote: 'It stopped destroying. That is worse.',                              bg: '#060a10', accentA: '#446688', accentB: '#223344' },
  9107: { quote: 'The crown broke. The pieces still rule.',                            bg: '#0a0400', accentA: '#ff8844', accentB: '#441100' },
  9108: { quote: 'It ruled the heavens. Then it fell through them.',                   bg: '#060818', accentA: '#334499', accentB: '#ff3300' },
  9109: { quote: 'It found its limit. The limit was you.',                             bg: '#0a0000', accentA: '#ff4444', accentB: '#880000' },
  9110: { quote: 'No more worlds left. It started eating itself.',                     bg: '#000a00', accentA: '#aaffaa', accentB: '#113311' },
  9111: { quote: 'Cast out of the void. Even emptiness has standards.',                bg: '#0a0600', accentA: '#ffaa00', accentB: '#442200' },
  9112: { quote: 'There was only one. Then it disagreed with itself.',                 bg: '#0a000a', accentA: '#ff00ff', accentB: '#440044' },
  9113: { quote: 'It collapsed. Then it un-collapsed. Nobody was prepared.',            bg: '#0a0800', accentA: '#ffcc00', accentB: '#442200' },
  9114: { quote: 'The same number. But wrong. Profoundly, irreversibly wrong.',        bg: '#000000', accentA: '#ffffff', accentB: '#ff0000' },

  // ─── Geometrical Auras (Incarnatus potion, pointercrate top 10) ────────────
  9200: { quote: 'Six minutes of relentless chaos.',   bg: '#000510', accentA: '#00d4ff', accentB: '#003344' },
  9201: { quote: 'Thin edge-flying. No room for error.', bg: '#100300', accentA: '#ff4400', accentB: '#550000' },
  9202: { quote: 'Frame-perfect. Memory barriers.',     bg: '#080008', accentA: '#9966ff', accentB: '#220044' },
  9203: { quote: 'The wave that never stops.',           bg: '#000510', accentA: '#00aaff', accentB: '#003366' },
  9204: { quote: 'Nothing. And everything.',            bg: '#050505', accentA: '#666666', accentB: '#111111' },
  9205: { quote: 'Processing. Always processing.',      bg: '#000a04', accentA: '#00ff88', accentB: '#004422' },
  9206: { quote: 'You know what this is.',               bg: '#0a000a', accentA: '#ff00ff', accentB: '#440044' },
  9207: { quote: 'Every end. Every single one.',        bg: '#100800', accentA: '#ffaa00', accentB: '#442200' },
  9208: { quote: 'Beyond the galaxy.',                  bg: '#080008', accentA: '#aa66ff', accentB: '#220055' },
  9209: { quote: 'Subsumed. Consumed. One.',            bg: '#100300', accentA: '#ff3300', accentB: '#440000' },

  // ─── Elder Auras (hidden condition unlocks, unskippable cutscene) ─────────
  9950: { bg: '#0a0000', accentA: '#cc2200', accentB: '#660000' },
  9951: { bg: '#0a0800', accentA: '#d4af37', accentB: '#886600' },
  9952: { bg: '#050505', accentA: '#b8b8b8', accentB: '#666666' },
  9953: { bg: '#040008', accentA: '#9900dd', accentB: '#440066' },
  9954: { bg: '#080808', accentA: '#ffffff', accentB: '#aaaaaa' },

  // ─── Rare Biome Auras (divine_collapse / astral_fracture / primordial_storm) ─
  9920: { quote: 'The divine did not die. It became something else.',        bg: '#1a1000', accentA: '#ffd700', accentB: '#ff8800' },
  9921: { quote: 'Even gods fall. Especially the ones who made you.',        bg: '#1a0800', accentA: '#cc8800', accentB: '#661100' },
  9922: { quote: 'The fabric between stars never fully heals.',              bg: '#000a1a', accentA: '#aaddff', accentB: '#0055aa' },
  9923: { quote: 'After the last star goes out — this is what remains.',     bg: '#000005', accentA: '#ffffff',  accentB: '#8888ff' },
  9924: { quote: 'Before structure, before order: only this.',              bg: '#1a0a00', accentA: '#ff8800', accentB: '#cc3300' },
  9925: { quote: "The storm that started everything. Still hasn't stopped.", bg: '#080814', accentA: '#ffffff',  accentB: '#0088ff' },
  // ─── NULL Biome Aura ─────────────────────────────────────────────────────
  9930: { quote: '', bg: '#000000', accentA: '#333333', accentB: '#111111' },

  // ─── Ascendant Auras (dual-prerequisite unlocks, unskippable cutscene) ────
  9960: { bg: '#001a12', accentA: '#00ddaa', accentB: '#004433' },
  9961: { bg: '#1a0008', accentA: '#ff0044', accentB: '#880022' },
  9962: { bg: '#0f0f00', accentA: '#ffeeaa', accentB: '#cc9900' },
  9963: { bg: '#1a0800', accentA: '#ff6600', accentB: '#881100' },
  9964: { bg: '#0d0020', accentA: '#cc66ff', accentB: '#550099' },

  // ─── Emperor Auras (extreme-prerequisite unlocks, unskippable cutscene) ────
  9970: { bg: '#0f0a00', accentA: '#ffd700', accentB: '#aa8800' },
  9971: { bg: '#060618', accentA: '#e0e0ff', accentB: '#8888ff' },
  9972: { bg: '#120012', accentA: '#ff44ff', accentB: '#aa00aa' },
  9973: { bg: '#0f0000', accentA: '#ff2222', accentB: '#aa0000' },
  9974: { bg: '#0a0a0a', accentA: '#ffffff', accentB: '#ffd700' },

  // ─── 100Q Auras (Emperor-level cutscene) ────────────────────────────────────
  9975: { bg: '#0f0a00', accentA: '#ffd700', accentB: '#aa8800' },
  9976: { bg: '#060618', accentA: '#e0e0ff', accentB: '#8888ff' },
  9977: { bg: '#120012', accentA: '#ff44ff', accentB: '#aa00aa' },
  9978: { bg: '#0f0000', accentA: '#ff2222', accentB: '#aa0000' },
  9979: { bg: '#0a0a0a', accentA: '#ffffff', accentB: '#ffd700' },

  // ─── Supreme King (potion-triggered, unobtainable, 15s cutscene) ────────────
  9999: { bg: '#000000', accentA: '#ffd700', accentB: '#ff4400' },

  // ─── Tier 2 Auras (post-Supreme King, Sol's RNG-style cutscenes) ────────────
  9980: { quote: 'Beyond the throne. Beyond the crown.',  bg: '#0a0500', accentA: '#ffd700', accentB: '#ff6600' },
  9981: { quote: 'The void ascended. The void became.', bg: '#080008', accentA: '#aa00ff', accentB: '#550088' },
  9982: { quote: 'A crown that never ends.',           bg: '#080808', accentA: '#ffffff', accentB: '#ffd700' },
  9983: { quote: 'The pulse that shapes reality.',     bg: '#000a0a', accentA: '#00ffff', accentB: '#003333' },
  9984: { quote: 'There is nothing left to become.',   bg: '#0a0000', accentA: '#ff4444', accentB: '#880000' },
  9985: { quote: 'The dawn that never sets.',         bg: '#0a0800', accentA: '#ffaa00', accentB: '#cc6600' },
  9986: { quote: 'Reality ends. This begins.',        bg: '#080008', accentA: '#ff00ff', accentB: '#550055' },
  9987: { quote: 'The final form of fortune.',        bg: '#000a04', accentA: '#00ff88', accentB: '#004422' },
  9988: { quote: 'Supreme was only the beginning.',   bg: '#0a0800', accentA: '#ffd700', accentB: '#ff4400' },
  9989: { quote: 'The last word. The last aura.',     bg: '#050505', accentA: '#e8e8e8', accentB: '#ffd700' },

  // ─── Accomplishment Auras (milestone-granted, Emperor-level cutscene) ───────
  10151: { quote: 'Twenty auras. One scholar.',           bg: '#0a0800', accentA: '#d4af37', accentB: '#886600' },
  10152: { quote: 'Supreme met quadrillion. The bridge holds.', bg: '#0f0a00', accentA: '#ffd700', accentB: '#ff8800' },
  10153: { quote: 'Fifty thousand rolls. Patience rewarded.', bg: '#080a0d', accentA: '#aabbcc', accentB: '#668899' },
  10154: { quote: 'Seven legends. Seven lights.',         bg: '#0a0800', accentA: '#ffaa00', accentB: '#cc6600' },
  10155: { quote: 'One hundred curses. You endured.',    bg: '#0a0008', accentA: '#9900dd', accentB: '#550099' },
  10156: { quote: 'Ten sales. The Tycoon awakens.',       bg: '#0a0800', accentA: '#ffd700', accentB: '#cc9900' },
  10157: { quote: 'World 1 to World 2. The Pilgrim\'s path.', bg: '#000508', accentA: '#88ccff', accentB: '#4488cc' },
};

// World 2 exclusive: 20 auras (ids 10000–10019), each with cutscene
const WORLD2_CUTSCENES = {
  10000: { quote: 'The void has a ruler. You found them.',           bg: '#050010', accentA: '#9900ff', accentB: '#330044' },
  10001: { quote: 'Eternal is not a word. It is this.',              bg: '#0a0500', accentA: '#ffcc00', accentB: '#ff4400' },
  10002: { quote: 'Before the first law, there was this shard.',      bg: '#000508', accentA: '#aaccff', accentB: '#ffffff' },
  10003: { quote: 'Every echo leads here. Every echo ends here.',     bg: '#000f0a', accentA: '#00ffcc', accentB: '#00aa88' },
  10004: { quote: 'The cosmos does not end. It surrenders.',          bg: '#0f0008', accentA: '#ff00aa', accentB: '#ff66dd' },
  10005: { quote: 'A spark that outlived every star.',               bg: '#080500', accentA: '#d4af37', accentB: '#ffeeaa' },
  10006: { quote: 'The last star did not fade. It became this.',      bg: '#000008', accentA: '#8888ff', accentB: '#e8e8ff' },
  10007: { quote: 'Before the first light, there was one.',           bg: '#000a02', accentA: '#00ff44', accentB: '#00cc33' },
  10008: { quote: 'Reality tore. You stepped through.',               bg: '#000000', accentA: '#ff00ff', accentB: '#ffff00' },
  10009: { quote: 'The seed from which every world grew.',            bg: '#0a0000', accentA: '#ff2200', accentB: '#880000' },
  10010: { quote: 'The final pulse. The last frequency.',             bg: '#070707', accentA: '#e8e8e8', accentB: '#888888' },
  10011: { quote: 'The first wave. It never stopped.',                bg: '#060008', accentA: '#bb00ff', accentB: '#440055' },
  10012: { quote: 'A flame that does not consume. It transforms.',  bg: '#000208', accentA: '#ffd700', accentB: '#003399' },
  10013: { quote: 'A heart that outlived every body.',                bg: '#000a04', accentA: '#00ff88', accentB: '#004422' },
  10014: { quote: 'Where light dies, a god remains.',                 bg: '#000308', accentA: '#c0e8ff', accentB: '#002244' },
  10015: { quote: 'The moon that was never meant to rise.',           bg: '#080100', accentA: '#ff4400', accentB: '#550000' },
  10016: { quote: 'Soul is not enough. This is beyond soul.',          bg: '#000008', accentA: '#4488ff', accentB: '#d4af37' },
  10017: { quote: 'Heaven was lost. You found what replaced it.',      bg: '#030003', accentA: '#ff00ff', accentB: '#ffff00' },
  10018: { quote: 'The star that died. The star that stayed.',         bg: '#050505', accentA: '#aaaaaa', accentB: '#333333' },
  10019: { quote: 'The void is not empty. It is alive.',              bg: '#000000', accentA: '#ffffff', accentB: '#555555' },
};

const JIA_VOID_CUTSCENES = {
  10120: { quote: 'The void has a sovereign. You met them.',   bg: '#0a0015', accentA: '#8800ff', accentB: '#330044' },
  10121: { quote: 'Nothing rules. You bowed anyway.',          bg: '#050505', accentA: '#333333', accentB: '#000000' },
  10122: { quote: 'Eternal is not a word. It is this.',        bg: '#080808', accentA: '#ffffff', accentB: '#666666' },
  10140: { quote: 'The Supreme King has an enemy. You summoned her.', bg: '#0f0018', accentA: '#aa00ff', accentB: '#440066' },
  10150: { quote: 'Well, you found me.', bg: '#0a0800', accentA: '#ffd700', accentB: '#ff6600' },
};

// ─── Elder Aura stage texts (played sequentially, unskippable) ──────────────
const ELDER_STAGES = {
  9950: [
    'You returned to Sneho.',
    'Again. And again. And again.',
    'One thousand transactions.',
    'Something ancient has noticed your hunger.',
  ],
  9951: [
    'Others discarded it without a thought.',
    'You kept every fragment.',
    'Five hundred pieces of nothing.',
    'Together, they became something else entirely.',
  ],
  9952: [
    'The wheel has turned ten thousand times for you.',
    'Each roll a thread.',
    'Each thread, a year.',
    'You have become part of the pattern.',
  ],
  9953: [
    'Cursed once.',
    'Then again. And again. One hundred times broken.',
    'But you came back every single time.',
    'And something cursed came back with you.',
  ],
  9954: [
    'A million coins.',
    'Gone.',
    'Every. Single. One.',
    'Some devotions are rewarded.',
  ],

  // NULL aura — unskippable void cutscene
  9930: [
    'You found it.',
    'Or it found nothing.',
    'The same thing.',
    '.',
  ],

  // Geometrical Auras (Incarnatus potion — pointercrate top 10)
  9200: [
    'Six minutes.',
    'Memory. Ship. Wave. Spam.',
    'Every frame a decision. Every decision final.',
    'Thinking Space II.',
    'CairoX built it. Zoink conquered it.',
    'You have manifested the first.',
  ],
  9201: [
    'Thin. So thin.',
    'Edge-flying for six minutes straight.',
    'One mistake. One.',
    'Flamewall.',
    'Narwall created hell. CuatrocientosYT survived it.',
    'The second demon answers.',
  ],
  9202: [
    'Frame-perfect cube.',
    'Memory barriers at the end of everything.',
    'Amethyst.',
    'iMist forged it. wPopoff claimed it.',
    'The third has arrived.',
  ],
  9203: [
    'The wave that never stops.',
    'OniLink gave it form.',
    'Tidal Wave.',
    'Seventy-two percent. Then one hundred.',
    'The fourth demon stirs.',
  ],
  9204: [
    'Null.',
    'Scapes.',
    'Kiba drew the line between something and nothing.',
    'Nullscapes.',
    'The fifth. The void between.',
  ],
  9205: [
    'Processing.',
    'Quanteuse. Always processing.',
    'Renn241 built the machine.',
    'Sixty percent. Then completion.',
    'The sixth demon awakens.',
  ],
  9206: [
    'You know the name.',
    'Akunakunn made it. The world has not recovered.',
    'BOOBAWAMBA.',
    'The seventh. Unforgettable.',
  ],
  9207: [
    'Every end.',
    'MindCap asked the question.',
    'Every. End.',
    'The eighth demon remembers.',
  ],
  9208: [
    'Beyond the galaxy.',
    'Insxne97 charted the path.',
    'andromeda.',
    'The ninth. Distant. Absolute.',
  ],
  9209: [
    'Subsuming.',
    'Vortex.',
    '[TCD] Cursed gave it form.',
    'Everything folds inward. Everything becomes one.',
    'The tenth demon. The last of the top ten.',
  ],

  // Ascendant stage texts (dual-prerequisite)
  9960: [
    'Ten thousand turns of the wheel.',
    'Five hundred fragments kept safe.',
    'You have outlasted everything that tried to stop you.',
    'Even time has grown tired of watching.',
  ],
  9961: [
    'A thousand transactions with the dark.',
    'A hundred curses endured.',
    'Sneho does not know what to make of you.',
    'Neither does the darkness.',
  ],
  9962: [
    'A million coins. Ten thousand chances.',
    'You left nothing on the table.',
    'Not greed. Not desperation.',
    'Pure, unyielding resolve.',
  ],
  9963: [
    'Every coin.',
    'Every deal.',
    'A thousand transactions. A million spent.',
    'You did not stop. You did not stop at all.',
  ],
  9964: [
    'Broken a hundred times.',
    'And you kept every piece.',
    'The cursed and the collected.',
    'Two refusals to let go. One consequence.',
  ],

  // Emperor stage texts (extreme-prerequisite, symbols woven in)
  9970: [
    '♛',
    'Fifty million coins.',
    'Not spent. Not traded. Held.',
    'Every single one, a testament to restraint.',
    'Wealth this absolute bends reality around it.',
    '♛ The throne was always yours. ♛',
  ],
  9971: [
    '⚜',
    'One hundred thousand rolls.',
    'Five thousand fragments preserved.',
    'Time lost meaning somewhere around the ten-thousandth turn.',
    'You did not stop. You could not stop.',
    '⚜ Death forgot about you. ⚜',
  ],
  9972: [
    '✧',
    'Every Elder. Every Ascendant.',
    'Ten hidden trials, each meant to be the last.',
    'You completed them all.',
    'They were never separate. They were pieces.',
    '✧ The pieces remember being whole. ✧',
  ],
  9973: [
    '☠',
    'Five hundred curses endured.',
    'Ten thousand deals with Sneho.',
    'Fifty million coins fed to the machine.',
    'Ruin did not find you. You built it yourself.',
    '☠ And from the wreckage — something crowned. ☠',
  ],
  9974: [
    '✦',
    '♛',
    '✦',
    'Four Emperors claimed.',
    'Sovereign. Immortal. Convergence. Ruinborn.',
    'There is nothing left to prove.',
    'There is nothing left at all.',
    '✦♛✦ Except this. ✦♛✦',
  ],

  // Secret aura stage texts (Ultraluck-triggered, unskippable)
  9900: [
    'A red line appeared in the code.',
    'Not a bug. Not a feature.',
    'Something that was never supposed to compile.',
    'ERROR.',
  ],
  9901: [
    'The file was there.',
    'Then it wasn\'t.',
    'Someone removed it. Or something.',
    'All that remains is [ REDACTED ].',
  ],
  9902: [
    'You searched for something.',
    'You found nothing.',
    'And then nothing looked back.',
    'It has a name now.',
  ],
  9903: [
    'Every probability curve.',
    'Every weighted table.',
    'All of them, collapsed into one point.',
    'ΣIGMA.',
  ],
  9904: [
    'There is no documentation for this.',
    'There never was.',
    'It wrote itself into existence.',
    'And now it refuses to be erased.',
  ],
  9905: [
    'A signal from nowhere.',
    'Frequency unknown. Source unknown.',
    'The game it came from shut down years ago.',
    'But the signal never stopped.',
  ],
  9906: [
    'Someone built this.',
    'Not a player. Not a developer.',
    'Something underneath both.',
    'THE ARCHITECT was here before the game was.',
  ],
  9907: [
    'It exists.',
    'It doesn\'t exist.',
    'Both are true at the same time.',
    'PARADOX.',
  ],
  9908: [
    'Before the first item.',
    'Before the first roll.',
    'Before the first line of code.',
    'There was ORIGIN.',
  ],
  9909: [
    'The answer changes every time you look.',
    'The question was never asked.',
    'It solved itself before you arrived.',
    'ΞNIGMA.',
  ],

  // ─── Supreme King (15-second cutscene, triggered by Supreme Luck Potion) ────
  9999: [
    'You drank something that should not exist.',
    'The potion burns through every vein. Every thought.',
    'Reality bends. The sky inverts.',
    'A throne materializes from pure light.',
    'And upon it sits something older than luck itself.',
    '♔ THE SUPREME KING has arrived. ♔',
  ],

  // ─── Jia Void auras (World 2 — Void Potion from Jia) ─────────────────────────
  10120: [
    'You traded NULL COINS for a potion that does not exist.',
    'It has no color. No taste. No weight.',
    'You drink it anyway.',
    'The void behind the world stirs.',
    'Something that was never born opens its eyes.',
    '♔ VOID SOVEREIGN ♔',
  ],
  10121: [
    'Where there is no light, no sound, no law.',
    'There is still rule.',
    'You paid in NULL. You received the opposite of everything.',
    'The throne of nothing has a name.',
    '♔ THE NULL EMPEROR ♔',
  ],
  10122: [
    'Time ends. Luck ends. The roll ends.',
    'One thing was here before the first roll.',
    'It will be here after the last.',
    'You have touched it. It has touched you.',
    '♔ ETERNAL NULL ♔',
  ],

  // ─── Void Queen (World 2 — Potion of Destruction) ─────────────────────────
  10140: [
    'You drank the Potion of Destruction.',
    'Where the Supreme King rules, something else opposes.',
    'The void does not bow. It has a Queen.',
    'She who was never meant to be summoned — is here.',
    '♔ THE VOID QUEEN ♔',
  ],

  // ─── Book of Power (Void Potion, super rare after Void Queen + Supreme King) ─
  10150: [
    'Well, you found me.',
    'After all of that suffering, how do you feel?',
    'Great, its time for your REAL journey to begin.',
    '📖 BOOK OF POWER 📖',
  ],

  // ─── Tier 2 Auras (post-Supreme King, Sol's RNG-style) ─────────────────────
  9980: ['You have surpassed the throne.', 'Light bends. Time folds.', 'THE TRANSCENDENT awakens.', 'Beyond Supreme. Beyond all.'],
  9981: ['The void looked up.', 'It saw something higher.', 'VOID ASCENSION.', 'From nothing. To everything.'],
  9982: ['Every crown before this was a shadow.', 'This one never fades.', 'ETERNAL CROWN.', 'Worn by the one who outlasted fate.'],
  9983: ['A single beat.', 'The universe echoes.', 'OMEGA PULSE.', 'The rhythm that shapes reality.'],
  9984: ['There was nothing left to become.', 'Until now.', 'THE FINAL FORM.', 'The end of evolution.'],
  9985: ['The sun never sets here.', 'Because there is no night.', 'INFINITE DAWN.', 'The light that never ends.'],
  9986: ['Reality reached its limit.', 'You did not.', "REALITY'S END.", 'Where the rules stop. You continue.'],
  9987: ['Fortune has a final shape.', 'You have found it.', 'THE ULTIMATE.', 'The last word in luck.'],
  9988: ['Supreme was the door.', 'You walked through.', 'BEYOND SUPREME.', 'What lies beyond the throne.'],
  9989: ['Every aura before this was a draft.', 'This is the final.', 'THE LAST AURA.', 'There will be no other.'],

  // ─── Accomplishment Auras (milestone-granted) ──────────────────────────────────
  10151: ['Twenty auras. One scholar.', 'You have learned all there was to learn.', '📚 THE SCHOLAR 📚'],
  10152: ['Supreme met quadrillion.', 'The bridge holds.', '🌉 THE BRIDGE 🌉'],
  10153: ['Fifty thousand rolls.', 'Patience rewarded.', '⏳ THE PATIENT ⏳'],
  10154: ['Seven legends. Seven lights.', 'Fortune favors the persistent.', '7️⃣ THE LUCKY SEVEN 7️⃣'],
  10155: ['One hundred curses.', 'You endured.', '☠ THE CURSED CHAMPION ☠'],
  10156: ['Ten sales.', 'The Tycoon awakens.', '💰 THE TYCOON 💰'],
  10157: ['World 1 to World 2.', 'The Pilgrim\'s path.', '🚶 THE PILGRIM 🚶'],
};

// ─── Tier 2 cutscene effects (Sol's RNG-style: particles, flashing symbols) ───
const TIER2_SYMBOLS = ['★', '♔', '♦', '✦', '✧', '♛', '◆', '●', '▲', '■', '♥', '♠', '♣', '∞', '⚡', '🔥', '💎', '🌟'];
function startTier2CutsceneEffects(overlay, cfg) {
  const canvas = document.getElementById('rarity-overlay-tier2-canvas');
  const symbolsEl = document.getElementById('rarity-overlay-tier2-symbols');
  if (!canvas || !symbolsEl) return () => {};

  const accentA = cfg.accentA || '#ffd700';
  const accentB = cfg.accentB || '#ff4400';
  const w = overlay.offsetWidth || window.innerWidth;
  const h = overlay.offsetHeight || window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  canvas.style.display = 'block';
  canvas.style.pointerEvents = 'none';
  symbolsEl.style.display = 'block';
  symbolsEl.innerHTML = '';

  const particles = [];
  for (let i = 0; i < 80; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2 - 0.3,
      r: 1 + Math.random() * 2,
      opacity: 0.2 + Math.random() * 0.5,
      life: 0.5 + Math.random() * 1,
    });
  }

  let animId = 0;
  let symbolInterval = 0;
  const ctx = canvas.getContext('2d');

  function drawParticles() {
    if (!ctx || !canvas.width) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      if (p.y < 0) p.y = 0;
      p.life -= 0.008;
      if (p.life <= 0) {
        p.x = Math.random() * canvas.width;
        p.y = canvas.height;
        p.life = 0.5 + Math.random() * 1;
      }
      const alpha = Math.max(0.1, p.opacity * p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(255, 215, 0, ${alpha * 0.8})`);
      g.addColorStop(1, `rgba(255, 68, 0, ${alpha * 0.2})`);
      ctx.fillStyle = g;
      ctx.fill();
    }
    animId = requestAnimationFrame(drawParticles);
  }

  function spawnFlashingSymbol() {
    const sym = TIER2_SYMBOLS[Math.floor(Math.random() * TIER2_SYMBOLS.length)];
    const el = document.createElement('span');
    el.className = 'tier2-flash-symbol';
    el.textContent = sym;
    el.style.left = `${10 + Math.random() * 80}%`;
    el.style.top = `${10 + Math.random() * 80}%`;
    el.style.fontSize = `${20 + Math.random() * 40}px`;
    el.style.color = Math.random() > 0.5 ? accentA : accentB;
    el.style.opacity = '0';
    el.style.animation = 'tier2-symbol-flash 0.8s ease-out forwards';
    symbolsEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  drawParticles();
  symbolInterval = setInterval(spawnFlashingSymbol, 120);

  return () => {
    cancelAnimationFrame(animId);
    clearInterval(symbolInterval);
    canvas.style.display = 'none';
    symbolsEl.style.display = 'none';
    symbolsEl.innerHTML = '';
  };
}

// ─── Elder Aura helpers ──────────────────────────────────────────────────────
function elderSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function elderFade(el, toOpacity, durationMs) {
  return new Promise(r => {
    if (!el) { setTimeout(r, durationMs); return; }
    el.style.transition = `opacity ${durationMs}ms ease`;
    el.style.opacity = String(toOpacity);
    setTimeout(r, durationMs + 30);
  });
}

async function showElderCutscene(aura) {
  while (isAnimating) await elderSleep(200);
  isAnimating = true;

  const overlay  = document.getElementById('rarity-overlay');
  if (!overlay) { isAnimating = false; return; }

  const tierEl   = document.getElementById('rarity-overlay-tier');
  const labelEl  = document.getElementById('rarity-overlay-label');
  const rarityEl = document.getElementById('rarity-overlay-rarity');
  const quoteEl  = document.getElementById('rarity-overlay-quote');
  const subEl    = overlay.querySelector('.rarity-overlay__sub');

  const cfg    = MYTHIC_CUTSCENES[aura.id] || JIA_VOID_CUTSCENES[aura.id] || { bg: '#000', accentA: '#fff', accentB: '#888' };
  const stages = ELDER_STAGES[aura.id] || [];

  // Apply theme vars
  overlay.style.setProperty('--mythic-bg', cfg.bg);
  overlay.style.setProperty('--mythic-a',  cfg.accentA);
  overlay.style.setProperty('--mythic-b',  cfg.accentB);

  // Strip other tier classes, add elder (and tier2/has-star if applicable)
  overlay.classList.remove(
    'hidden',
    'rarity-overlay--global', 'rarity-overlay--universal',
    'rarity-overlay--mythic', 'rarity-overlay--secret', 'rarity-overlay--biome',
    'rarity-overlay--tier2', 'rarity-overlay--has-star'
  );
  overlay.classList.add('rarity-overlay--elder');
  if (aura.isTier2) overlay.classList.add('rarity-overlay--tier2');
  if (aura.isSupremeKing || aura.isVoidQueen || aura.isBookOfPower || aura.isTier2 || aura.isAccomplishment) overlay.classList.add('rarity-overlay--has-star');
  if (aura.isBookOfPower || aura.isAccomplishment) overlay.classList.add('rarity-overlay--tier2');
  overlay.style.opacity = '1';
  overlay.setAttribute('aria-hidden', 'false');

  // Reset all overlay elements to invisible
  for (const el of [tierEl, labelEl, rarityEl, quoteEl]) {
    if (!el) continue;
    el.style.transition = 'none';
    el.style.opacity    = '0';
    el.style.transform  = '';
  }
  if (subEl) subEl.style.display = 'none';

  // Tier 2 / Book of Power / Accomplishment: start particle canvas and flashing symbols
  let tier2Cleanup = null;
  if (aura.isTier2 || aura.isBookOfPower || aura.isAccomplishment) {
    tier2Cleanup = startTier2CutsceneEffects(overlay, cfg);
  }

  // --- Stage text sequence ---
  for (let i = 0; i < stages.length; i++) {
    if (!quoteEl) break;
    quoteEl.textContent  = stages[i];
    quoteEl.style.display = '';
    await elderFade(quoteEl, 1, 650);
    await elderSleep(2000);
    await elderFade(quoteEl, 0, 450);
    await elderSleep(250);
  }

  if (tier2Cleanup) tier2Cleanup();

  // --- Final aura reveal ---
  const tierLabel = aura.isSupremeKing ? '♔ UNOBTAINABLE ♔'
    : aura.isVoidQueen ? '♔ THE VOID QUEEN ♔'
    : aura.isBookOfPower ? '📖 BOOK OF POWER 📖'
    : aura.isAccomplishment ? '✦ Accomplishment Aura ✦'
    : aura.isTier2 ? '✦ Tier 2 Aura ✦'
    : aura.is100Q ? '✦ 100Q Aura ✦'
    : aura.isEmperor ? '♛ Emperor Aura ♛'
    : aura.isAscendant ? '⬡ Ascendant Aura ⬡'
    : aura.isSecret ? '⚠ Secret Aura ⚠'
    : aura.isGeometrical ? '🔷 Geometrical Aura 🔷'
    : '⬡ Elder Aura ⬡';
  if (tierEl) tierEl.textContent = tierLabel;
  if (labelEl) {
    labelEl.textContent  = aura.text;
    labelEl.style.fontFamily = `"${aura.font}", serif`;
    labelEl.style.color      = aura.color;
    labelEl.style.textShadow = aura.textShadow || '';
    labelEl.style.transform  = 'scale(0.55)';
    labelEl.style.transition = 'none';
  }
  if (rarityEl) rarityEl.textContent = formatRarity(aura.rarity);

  await elderFade(tierEl, 1, 900);
  await elderSleep(500);

  // Label bursts in
  if (labelEl) {
    labelEl.style.transition = 'opacity 0.85s ease, transform 0.85s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    labelEl.style.opacity    = '1';
    labelEl.style.transform  = 'scale(1)';
    await elderSleep(900);
  }

  await elderSleep(400);
  await elderFade(rarityEl, 0.85, 700);
  await elderSleep(3500);

  // Fade out the whole overlay
  await elderFade(overlay, 0, 900);

  // Clean up
  overlay.classList.add('hidden');
  overlay.classList.remove('rarity-overlay--elder', 'rarity-overlay--tier2', 'rarity-overlay--has-star');
  overlay.style.opacity = '';
  overlay.style.removeProperty('--mythic-bg');
  overlay.style.removeProperty('--mythic-a');
  overlay.style.removeProperty('--mythic-b');
  overlay.setAttribute('aria-hidden', 'true');
  for (const el of [tierEl, labelEl, rarityEl, quoteEl]) {
    if (!el) continue;
    el.style.opacity    = '';
    el.style.transition = '';
    el.style.transform  = '';
    el.style.fontFamily = '';
    el.style.color      = '';
    el.style.textShadow = '';
  }
  if (subEl) subEl.style.display = '';

  isAnimating = false;
}

// ─── Elder / Ascendant tracking ──────────────────────────────────────────────
function getElderReceived() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.elderReceived) || '[]'); }
  catch { return []; }
}
function markElderReceived(id) {
  const arr = getElderReceived();
  if (!arr.includes(id)) arr.push(id);
  localStorage.setItem(STORAGE_KEYS.elderReceived, JSON.stringify(arr));
}
function getElderUnlocked() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.elderUnlocked) || '[]'); }
  catch { return []; }
}
function markElderUnlocked(id) {
  const arr = getElderUnlocked();
  if (!arr.includes(id)) arr.push(id);
  localStorage.setItem(STORAGE_KEYS.elderUnlocked, JSON.stringify(arr));
}

function getElderSnehoTotal() { return Number(localStorage.getItem(STORAGE_KEYS.elderSnehoTotal) || 0); }
function getElderRollTotal()  { return Number(localStorage.getItem(STORAGE_KEYS.elderRollTotal)  || 0); }
function getElderCurseTotal() { return Number(localStorage.getItem(STORAGE_KEYS.elderCurseTotal) || 0); }
function getElderCoinsSpent() { return Number(localStorage.getItem(STORAGE_KEYS.elderCoinsSpent) || 0); }

// Returns the live pool of unlocked-but-not-yet-rolled elders/ascendants/emperors/tier2
// injected into weightedRandom on every roll.
// Tier 2 auras only appear after Supreme King (9999) has been received.
function getUnlockedElderPool() {
  const received = getElderReceived();
  const unlocked = getElderUnlocked();
  const hasSupremeKing = received.includes(9999);
  const elderItems = ELDER_AURAS
    .filter(a => unlocked.includes(a.id) && !received.includes(a.id))
    .map(a => ({ ...a, weight: ELDER_ROLL_WEIGHT, isElder: true }));
  const ascendantItems = ASCENDANT_AURAS
    .filter(a => unlocked.includes(a.id) && !received.includes(a.id))
    .map(a => ({ ...a, weight: ELDER_ROLL_WEIGHT, isAscendant: true }));
  const emperorItems = EMPEROR_AURAS
    .filter(a => unlocked.includes(a.id) && !received.includes(a.id))
    .map(a => ({ ...a, weight: ELDER_ROLL_WEIGHT, isEmperor: true }));
  const hundredQItems = AURAS_100Q
    .filter(a => !received.includes(a.id))
    .map(a => ({ ...a, weight: ELDER_ROLL_WEIGHT, is100Q: true }));
  const tier2Items = hasSupremeKing
    ? TIER2_AURAS
        .filter(a => !received.includes(a.id))
        .map(a => ({ ...a, weight: ELDER_ROLL_WEIGHT, isTier2: true }))
    : [];
  return [...elderItems, ...ascendantItems, ...emperorItems, ...hundredQItems, ...tier2Items];
}

// Check elder conditions — adds to unlocked pool (does NOT auto-grant)
function checkElderUnlock() {
  const received = getElderReceived();
  const unlocked = getElderUnlocked();
  const pending  = ELDER_AURAS.filter(a => !received.includes(a.id) && !unlocked.includes(a.id));
  if (!pending.length) return;

  const sneho  = getElderSnehoTotal();
  const rolls  = getElderRollTotal();
  const curses = getElderCurseTotal();
  const spent  = getElderCoinsSpent();
  const scraps = getScraps();

  for (const aura of pending) {
    let meets = false;
    if (aura.id === 9950 && sneho  >= 1000)    meets = true; // THE GLUTTON
    if (aura.id === 9951 && scraps >= 500)     meets = true; // THE HOARDER
    if (aura.id === 9952 && rolls  >= 10000)   meets = true; // THE ANCIENT
    if (aura.id === 9953 && curses >= 100)     meets = true; // THE FORSAKEN
    if (aura.id === 9954 && spent  >= 1000000) meets = true; // THE DEVOTED
    if (meets) markElderUnlocked(aura.id);
  }
}

// Check ascendant conditions — adds to unlocked pool (does NOT auto-grant)
function checkAscendantUnlock() {
  const received = getElderReceived();
  const unlocked = getElderUnlocked();
  const pending  = ASCENDANT_AURAS.filter(a => !received.includes(a.id) && !unlocked.includes(a.id));
  if (!pending.length) return;

  const sneho  = getElderSnehoTotal();
  const rolls  = getElderRollTotal();
  const curses = getElderCurseTotal();
  const spent  = getElderCoinsSpent();
  const scraps = getScraps();

  for (const aura of pending) {
    let meets = false;
    if (aura.id === 9960 && rolls >= 10000 && scraps >= 500)     meets = true; // THE PRIMORDIAL
    if (aura.id === 9961 && curses >= 100  && sneho >= 1000)     meets = true; // THE CONDEMNED
    if (aura.id === 9962 && spent >= 1000000 && rolls >= 10000)  meets = true; // THE ABSOLUTE
    if (aura.id === 9963 && sneho >= 1000  && spent >= 1000000)  meets = true; // THE RELENTLESS
    if (aura.id === 9964 && curses >= 100  && scraps >= 500)     meets = true; // THE OMNISCIENT
    if (meets) markElderUnlocked(aura.id);
  }
}

// Check emperor conditions — adds to unlocked pool (does NOT auto-grant)
function checkEmperorUnlock() {
  const received = getElderReceived();
  const unlocked = getElderUnlocked();
  const pending  = EMPEROR_AURAS.filter(a => !received.includes(a.id) && !unlocked.includes(a.id));
  if (!pending.length) return;

  const sneho  = getElderSnehoTotal();
  const rolls  = getElderRollTotal();
  const curses = getElderCurseTotal();
  const spent  = getElderCoinsSpent();
  const scraps = getScraps();
  const coins  = getCoins();

  const allElderIds     = ELDER_AURAS.map(a => a.id);
  const allAscendantIds = ASCENDANT_AURAS.map(a => a.id);
  const hasAllElders     = allElderIds.every(id => received.includes(id));
  const hasAllAscendants = allAscendantIds.every(id => received.includes(id));

  const otherEmperorIds = [9970, 9971, 9972, 9973];
  const hasAllOtherEmperors = otherEmperorIds.every(id => received.includes(id));

  for (const aura of pending) {
    let meets = false;
    if (aura.id === 9970 && coins >= 50_000_000)                                  meets = true; // ♛ THE SOVEREIGN ♛
    if (aura.id === 9971 && rolls >= 100_000 && scraps >= 5_000)                   meets = true; // ⚜ THE IMMORTAL ⚜
    if (aura.id === 9972 && hasAllElders && hasAllAscendants)                       meets = true; // ✧ THE CONVERGENCE ✧
    if (aura.id === 9973 && curses >= 500 && sneho >= 10_000 && spent >= 50_000_000) meets = true; // ☠ THE RUINBORN ☠
    if (aura.id === 9974 && hasAllOtherEmperors)                                    meets = true; // ✦♛✦ THE INFINITE ✦♛✦
    if (meets) markElderUnlocked(aura.id);
  }
}

// Accomplishment auras — auto-granted when milestones are met
const SCHOLAR_IDS = [...ELDER_AURAS.map(a => a.id), ...ASCENDANT_AURAS.map(a => a.id), ...EMPEROR_AURAS.map(a => a.id), ...AURAS_100Q.map(a => a.id)];
const LEGENDARY_IDS = [...EMPEROR_AURAS.map(a => a.id), ...AURAS_100Q.map(a => a.id), ...TIER2_AURAS.map(a => a.id)];

async function grantAccomplishmentAura(aura) {
  markElderReceived(aura.id);
  const hist = getHistory();
  hist.push({
    historyId: `${Date.now()}-accomplishment-${aura.id}`,
    id: aura.id, text: aura.text, font: aura.font, color: aura.color,
    fontWeight: aura.fontWeight, fontStyle: aura.fontStyle, textShadow: aura.textShadow,
    rarity: aura.rarity, isAccomplishment: true,
  });
  setHistory(hist);
  renderHistory();
  renderCoins();
  await showElderCutscene({ ...aura, isAccomplishment: true });
}

async function checkAccomplishments(opts = {}) {
  if (WORLD_ID !== 1) return; // Accomplishments only in World 1 (except Tycoon/Pilgrim which run elsewhere)
  const received = getElderReceived();
  const rolls = getElderRollTotal();
  const curses = getElderCurseTotal();

  // Scholar: all 20 Elders + Ascendants + Emperors + 100Qs
  const scholarAura = ACCOMPLISHMENT_AURAS.find(a => a.accomplishmentType === 'scholar');
  if (scholarAura && !received.includes(scholarAura.id) && SCHOLAR_IDS.every(id => received.includes(id))) {
    await grantAccomplishmentAura(scholarAura);
    return;
  }

  // Bridge: 100Q rolled after Supreme King
  const bridgeAura = ACCOMPLISHMENT_AURAS.find(a => a.accomplishmentType === 'bridge');
  if (bridgeAura && !received.includes(bridgeAura.id) && received.includes(9999) && AURAS_100Q.some(a => received.includes(a.id))) {
    await grantAccomplishmentAura(bridgeAura);
    return;
  }

  // Patient: 50K rolls + at least 1 100Q
  const patientAura = ACCOMPLISHMENT_AURAS.find(a => a.accomplishmentType === 'patient');
  if (patientAura && !received.includes(patientAura.id) && rolls >= 50_000 && AURAS_100Q.some(a => received.includes(a.id))) {
    await grantAccomplishmentAura(patientAura);
    return;
  }

  // Lucky Seven: 7+ from Emperor + 100Q + Tier2
  const luckyAura = ACCOMPLISHMENT_AURAS.find(a => a.accomplishmentType === 'luckySeven');
  const legendaryCount = LEGENDARY_IDS.filter(id => received.includes(id)).length;
  if (luckyAura && !received.includes(luckyAura.id) && legendaryCount >= 7) {
    await grantAccomplishmentAura(luckyAura);
    return;
  }

  // Cursed Champion: 100 curses + at least 1 100Q
  const cursedAura = ACCOMPLISHMENT_AURAS.find(a => a.accomplishmentType === 'cursedChampion');
  if (cursedAura && !received.includes(cursedAura.id) && curses >= 100 && AURAS_100Q.some(a => received.includes(a.id))) {
    await grantAccomplishmentAura(cursedAura);
    return;
  }
}

async function checkAccomplishmentsBazaar(bazaarSales) {
  const received = getElderReceived();
  const tycoonAura = ACCOMPLISHMENT_AURAS.find(a => a.accomplishmentType === 'tycoon');
  if (tycoonAura && !received.includes(tycoonAura.id) && bazaarSales >= 10) {
    await grantAccomplishmentAura(tycoonAura);
  }
}

async function checkAccomplishmentsPilgrim() {
  const received = getElderReceived();
  const w1ElderReceived = (() => { try { return JSON.parse(localStorage.getItem('rng_elder_received') || '[]'); } catch { return []; } })();
  const hasElderInW1 = ELDER_AURAS.some(a => w1ElderReceived.includes(a.id));
  const hasVisitedW2 = localStorage.getItem(STORAGE_KEYS.visitedWorld2) === '1';
  if (WORLD_ID === 2) localStorage.setItem(STORAGE_KEYS.visitedWorld2, '1');
  const pilgrimAura = ACCOMPLISHMENT_AURAS.find(a => a.accomplishmentType === 'pilgrim');
  if (pilgrimAura && !received.includes(pilgrimAura.id) && (hasVisitedW2 || WORLD_ID === 2) && hasElderInW1) {
    await grantAccomplishmentAura(pilgrimAura);
  }
}

function showRarityAnimation(item, tier) {
  return new Promise((resolve) => {
    const overlay  = document.getElementById('rarity-overlay');
    const tierEl   = document.getElementById('rarity-overlay-tier');
    const labelEl  = document.getElementById('rarity-overlay-label');
    const rarityEl = document.getElementById('rarity-overlay-rarity');
    const quoteEl  = document.getElementById('rarity-overlay-quote');
    if (!overlay) { resolve(); return; }

    // Set tier label
    if (tier === 'world2') {
      tierEl.textContent = '◆ World 2 Aura ◆';
    } else if (tier === 'secret') {
      tierEl.textContent = '⚠ Secret Aura ⚠';
    } else if (tier === 'biome') {
      const biomeCfg = activeBiome ? (BIOME_CONFIG[activeBiome.biome_type] || {}) : {};
      tierEl.textContent = `${biomeCfg.emoji || '🌍'} Biome Exclusive`;
    } else if (tier === 'mythic') {
      tierEl.textContent = '✦ Mythic Aura ✦';
    } else if (tier === 'universal') {
      tierEl.textContent = '✦ Universal Aura ✦';
    } else {
      tierEl.textContent = '✦ Global Aura ✦';
    }

    // Set aura name
    labelEl.textContent = item.text;
    labelEl.style.fontFamily = `"${item.font}", sans-serif`;
    labelEl.style.color = (tier === 'universal') ? '' : item.color;

    rarityEl.textContent = formatRarity(item.rarity);

    // Set quote (mythic + secret + world2)
    if (quoteEl) {
      const cfg = tier === 'world2' ? WORLD2_CUTSCENES[item.id] : MYTHIC_CUTSCENES[item.id];
      quoteEl.textContent = cfg ? cfg.quote : '';
      quoteEl.style.display = cfg ? '' : 'none';
    }

    // Apply CSS custom properties for mythic/secret/biome/world2 theming
    if (tier === 'world2') {
      const cfg = WORLD2_CUTSCENES[item.id] || { bg: '#000', accentA: '#fff', accentB: '#888' };
      overlay.style.setProperty('--mythic-bg', cfg.bg);
      overlay.style.setProperty('--mythic-a', cfg.accentA);
      overlay.style.setProperty('--mythic-b', cfg.accentB);
      labelEl.style.color = item.color;
    } else if (tier === 'mythic' || tier === 'secret' || tier === 'biome') {
      const cfg = MYTHIC_CUTSCENES[item.id] || { bg: '#000', accentA: '#fff', accentB: '#888' };
      overlay.style.setProperty('--mythic-bg', cfg.bg);
      overlay.style.setProperty('--mythic-a', cfg.accentA);
      overlay.style.setProperty('--mythic-b', cfg.accentB);
      labelEl.style.color = item.color;
    } else {
      overlay.style.removeProperty('--mythic-bg');
      overlay.style.removeProperty('--mythic-a');
      overlay.style.removeProperty('--mythic-b');
    }

    // Apply tier class
    overlay.classList.remove('hidden', 'rarity-overlay--global', 'rarity-overlay--universal', 'rarity-overlay--mythic', 'rarity-overlay--secret', 'rarity-overlay--biome', 'rarity-overlay--world2');
    overlay.classList.add(`rarity-overlay--${tier}`);
    overlay.setAttribute('aria-hidden', 'false');

    const dismiss = () => {
      clearTimeout(timer);
      overlay.removeEventListener('click', dismiss);
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('rarity-overlay--global', 'rarity-overlay--universal', 'rarity-overlay--mythic', 'rarity-overlay--secret', 'rarity-overlay--biome', 'rarity-overlay--world2');
      resolve();
    };

    const duration  = tier === 'world2' ? 7000 : tier === 'secret' ? 10000 : tier === 'biome' ? 8000 : tier === 'mythic' ? 7000 : tier === 'universal' ? 5000 : 3000;
    const minView   = tier === 'world2' ? 6000 : tier === 'secret' ? 8000  : tier === 'biome' ? 6500 : tier === 'mythic' ? 6000 : tier === 'universal' ? 4000 : 2500;
    const timer = setTimeout(dismiss, duration);
    // Only allow click-to-dismiss after the minimum mandatory view time
    setTimeout(() => overlay.addEventListener('click', dismiss, { once: true }), minView);
  });
}

// ─── Global Biome System ───────────────────────────────────────────────────
const BIOME_CONFIG = {
  // ─ Common biomes (1/5 per minute) ────────────────────────────────────────
  volcanic:        { name: 'Volcanic Surge',      emoji: '🌋', color: '#ff4400', glow: '#ff220066', desc: 'Magma mythics rise from the deep.' },
  celestial:       { name: 'Celestial Alignment', emoji: '✨', color: '#ffd700', glow: '#ffd70055', desc: 'The cosmos aligns. Star auras manifest.' },
  void:            { name: 'Void Convergence',    emoji: '🌑', color: '#8800ff', glow: '#8800ff55', desc: 'Ancient darkness stirs. Void auras awaken.' },
  crystal:         { name: 'Crystal Resonance',   emoji: '💎', color: '#00ffff', glow: '#00ffff44', desc: 'Reality crystallizes. Prismatic auras take form.' },
  storm:           { name: 'Tempest Protocol',    emoji: '⚡', color: '#ffffff', glow: '#ffffff33', desc: 'The sky tears open. Storm auras overcharge.' },
  // ─ Rare biomes (1/10,000 per minute) ─────────────────────────────────────
  divine_collapse: { name: 'Divine Collapse',     emoji: '⚱️', color: '#ffd700', glow: '#ffd70044', desc: 'The heavens fracture. What was divine spills down.', isRare: true },
  astral_fracture: { name: 'Astral Fracture',     emoji: '🌌', color: '#aaddff', glow: '#aaddff33', desc: 'The stellar membrane tears. Something older bleeds through.', isRare: true },
  primordial_storm:{ name: 'Primordial Storm',    emoji: '🌪️', color: '#ff8800', glow: '#ff880044', desc: 'Chaos before creation. The first storm never stopped.', isRare: true },
  // ─ NULL biome (1/10,000 per minute) ─────────────────────────────────────
  null:            { name: 'NULL',                emoji: '⬛', color: '#444444', glow: '#22222244', desc: 'Everything is unavailable. Including this message.', isRare: true, isNull: true },
};
const BIOME_ROLL_CHANCE = 1 / 500_000; // chance per roll during active biome

let activeBiome = null;         // current active_biome row
let biomeTimerInterval = null;  // countdown interval ID

function showBiomeBanner(biome) {
  const cfg = BIOME_CONFIG[biome.biome_type] || { name: biome.biome_name, emoji: '🌍', color: '#ffffff', glow: '#ffffff33', desc: '' };
  const banner = document.getElementById('biome-banner');
  if (!banner) return;
  document.getElementById('biome-emoji').textContent = cfg.emoji;
  document.getElementById('biome-name').textContent = (cfg.isRare ? '⚠ ' : '') + cfg.name;
  document.getElementById('biome-desc').textContent = cfg.desc;
  banner.style.setProperty('--biome-color', cfg.color);
  banner.style.setProperty('--biome-glow', cfg.glow);
  banner.dataset.rare = cfg.isRare ? 'true' : 'false';
  banner.classList.remove('hidden');

  clearInterval(biomeTimerInterval);
  const timerEl = document.getElementById('biome-timer');
  function tick() {
    const msLeft = new Date(biome.ends_at) - Date.now();
    if (msLeft <= 0) {
      hideBiomeBanner();
      return;
    }
    const m = Math.floor(msLeft / 60000);
    const s = Math.floor((msLeft % 60000) / 1000);
    if (timerEl) timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }
  tick();
  biomeTimerInterval = setInterval(tick, 1000);
}

function hideBiomeBanner() {
  clearInterval(biomeTimerInterval);
  biomeTimerInterval = null;
  activeBiome = null;
  document.getElementById('biome-banner')?.classList.add('hidden');
}

async function loadActiveBiome() {
  if (!supabase) return;
  const { data } = await supabase
    .from('active_biome')
    .select('*')
    .gt('ends_at', new Date().toISOString())
    .order('started_at', { ascending: false })
    .limit(1);
  if (data && data.length > 0) {
    activeBiome = data[0];
    showBiomeBanner(activeBiome);
  }
}

function subscribeActiveBiome() {
  if (!supabase) return;
  supabase.channel('active-biome-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'active_biome' }, (payload) => {
      const biome = payload.new;
      if (new Date(biome.ends_at) > new Date()) {
        activeBiome = biome;
        showBiomeBanner(biome);
      }
    })
    .subscribe();
  loadActiveBiome();
}

const NULL_BIOME_ROLL_CHANCE = 1 / 10_000; // rarer biome itself, so higher per-roll access

function tryBiomeRoll(biomeType) {
  const chance = biomeType === 'null' ? NULL_BIOME_ROLL_CHANCE : BIOME_ROLL_CHANCE;
  if (Math.random() >= chance) return null;
  const eligible = BIOME_AURAS.filter(a => a.biome === biomeType);
  if (!eligible.length) return null;
  return { ...eligible[Math.floor(Math.random() * eligible.length)] };
}

// ─── Secret Aura Trigger ───────────────────────────────────────────────────
// 1 in 5,000,000 flat chance per Ultraluck Potion use. Multiple Ultraluck potions stack: chance = 1 - (1 - p)^count.
const SECRET_SPAWN_CHANCE = 1 / 5_000_000;

async function triggerSecretAura(count = 1) {
  const stackedChance = 1 - Math.pow(1 - SECRET_SPAWN_CHANCE, Math.max(1, count));
  if (Math.random() >= stackedChance) return;
  while (isAnimating) await new Promise(r => setTimeout(r, 200));
  const aura = SECRET_AURAS[Math.floor(Math.random() * SECRET_AURAS.length)];
  const secretAura = { ...aura, isSecret: true };
  const history = getHistory();
  history.push({
    historyId: `${Date.now()}-secret-${Math.random().toString(36).slice(2)}`,
    id: aura.id,
    text: aura.text,
    font: aura.font,
    color: aura.color,
    fontWeight: aura.fontWeight,
    fontStyle: aura.fontStyle,
    textShadow: aura.textShadow,
    rarity: aura.rarity,
    isSecret: true,
  });
  setHistory(history);
  renderHistory();
  renderResult(secretAura);
  await reportRareRoll({ ...aura, aura_rarity_label: 'SECRET' });
  await showElderCutscene(secretAura);
}

async function triggerSupremeKing() {
  if (Math.random() >= SUPREME_KING_SPAWN_CHANCE) return;
  while (isAnimating) await new Promise(r => setTimeout(r, 200));
  const aura = { ...SUPREME_KING_AURA, isSupremeKing: true };
  const history = getHistory();
  history.push({
    historyId: `${Date.now()}-supreme-${Math.random().toString(36).slice(2)}`,
    id: aura.id,
    text: aura.text,
    font: aura.font,
    color: aura.color,
    fontWeight: aura.fontWeight,
    fontStyle: aura.fontStyle,
    textShadow: aura.textShadow,
    rarity: aura.rarity,
    isSupremeKing: true,
  });
  setHistory(history);
  renderHistory();
  renderResult(aura);
  await reportRareRoll({ ...aura, aura_rarity_label: 'UNOBTAINABLE' });
  await showElderCutscene(aura);
}

async function triggerVoidQueen() {
  while (isAnimating) await new Promise(r => setTimeout(r, 200));
  const aura = { ...VOID_QUEEN_AURA, isVoidQueen: true };
  markElderReceived(aura.id);
  const history = getHistory();
  history.push({
    historyId: `${Date.now()}-voidqueen-${Math.random().toString(36).slice(2)}`,
    id: aura.id,
    text: aura.text,
    font: aura.font,
    color: aura.color,
    fontWeight: aura.fontWeight || '400',
    fontStyle: aura.fontStyle || 'normal',
    textShadow: aura.textShadow || '',
    rarity: aura.rarity,
    isVoidQueen: true,
  });
  setHistory(history);
  renderHistory();
  renderResult(aura);
  await reportRareRoll({ ...aura, aura_rarity_label: 'VOID_QUEEN' });
  await showElderCutscene(aura);
}

async function reportRareRoll(item) {
  if (!supabase) return;
  const username = getHubUsername() || null;
  const tierLabel = item.aura_rarity_label
    || (item.isSupremeKing ? 'UNOBTAINABLE'
      : item.isVoidQueen ? 'VOID_QUEEN'
      : item.isBookOfPower ? 'BOOK_OF_POWER'
      : item.isAccomplishment ? 'ACCOMPLISHMENT'
      : item.isEmperor ? 'EMPEROR'
      : item.is100Q ? '100Q'
      : item.isTier2 ? 'TIER2'
      : item.isAscendant ? 'ASCENDANT'
      : item.isElder ? 'ELDER'
      : item.isSecret || item.rarity === 0 ? 'SECRET'
      : null);
  const row = {
    username,
    aura_text: item.text,
    aura_rarity: item.rarity,
    font: item.font || null,
    color: item.color || null,
    font_weight: item.fontWeight || null,
    font_style: item.fontStyle || null,
    text_shadow: item.textShadow || null,
  };
  if (tierLabel) row.aura_tier = tierLabel;
  const { error } = await supabase.from('rare_rolls').insert(row);
  if (error && tierLabel) {
    delete row.aura_tier;
    await supabase.from('rare_rolls').insert(row);
  }
}

async function roll() {
  if (isAnimating) return;
  const rollBtn = document.getElementById('roll-btn');
  if (rollBtn) rollBtn.disabled = true;

  // Elder/Ascendant roll tracking (sneho/curse/spent tracked elsewhere)
  const newRolls = getElderRollTotal() + 1;
  localStorage.setItem(STORAGE_KEYS.elderRollTotal, String(newRolls));
  renderRollCount();

  const mult = getLuckMultiplier() + getGearBonus();
  const item = weightedRandom(mult, WORLD_ID === 2 ? [] : getUnlockedElderPool());

  // Quest: track peak luck before it resets, and count the roll
  addQuestProgress('roll', 1);
  addQuestProgress('luck_reach', mult);
  addQuestProgress('rarity_hit', item.rarity);

  if (mult > 1) setLuckMultiplier(1);

  // ── Elder / Ascendant / Emperor / 100Q / Tier 2 rolled ────────────────────────
  if (item.isElder || item.isAscendant || item.isEmperor || item.is100Q || item.isTier2) {
    markElderReceived(item.id);
    const tierTag = item.isTier2 ? 'tier2' : item.is100Q ? '100q' : item.isEmperor ? 'emperor' : item.isAscendant ? 'ascendant' : 'elder';
    const histE = getHistory();
    histE.push({
      historyId: `${Date.now()}-${tierTag}-${item.id}`,
      id: item.id, text: item.text, font: item.font,
      color: item.color, fontWeight: item.fontWeight,
      fontStyle: item.fontStyle, textShadow: item.textShadow,
      rarity: item.rarity,
      isElder: item.isElder || false,
      isAscendant: item.isAscendant || false,
      isEmperor: item.isEmperor || false,
      is100Q: item.is100Q || false,
      isTier2: item.isTier2 || false,
    });
    setHistory(histE);
    renderResult(item);
    renderHistory();
    renderCoins();
    renderLuck();
    reportRareRoll(item);
    if (rollBtn) rollBtn.disabled = false;
    checkElderUnlock();
    checkAscendantUnlock();
    checkEmperorUnlock();
    await showElderCutscene(item);
    await checkAccomplishments();
    return;
  }
  // ── Normal roll ───────────────────────────────────────────────────────────
  const history = getHistory();
  const histEntry = {
    historyId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    id: item.id,
    text: item.text,
    font: item.font,
    color: item.color,
    fontWeight: item.fontWeight,
    fontStyle: item.fontStyle,
    textShadow: item.textShadow,
    rarity: item.rarity,
    auraType: item.auraType || classifyAuraType(item.text),
  };
  if (item.isMutation) {
    histEntry.isMutation = true;
    histEntry.subtitle = item.subtitle || '';
    histEntry.flavor = item.flavor || '';
  }
  history.push(histEntry);
  setHistory(history);

  const isWorld2Aura = WORLD_ID === 2 && item.id >= 10000 && item.id < 10020;
  const cutsceneSetting = getCutsceneThreshold();
  const cutsceneMin = cutsceneSetting === 'never' ? Infinity : Number(cutsceneSetting);
  const showCutscene = isWorld2Aura || (item.rarity >= GLOBAL_THRESHOLD && item.rarity >= cutsceneMin);
  if (showCutscene) {
    let tier = 'global';
    if (isWorld2Aura) tier = 'world2';
    else if (item.rarity >= MYTHIC_THRESHOLD) tier = 'mythic';
    else if (item.rarity >= UNIVERSAL_THRESHOLD) tier = 'universal';
    isAnimating = true;
    await showRarityAnimation(item, tier);
    isAnimating = false;
  }

  renderResult(item);
  renderHistory();
  renderCoins();
  renderLuck();
  if (item.rarity >= RARE_ROLL_THRESHOLD) reportRareRoll(item);

  // Biome bonus roll — only fires during an active biome
  if (activeBiome && new Date(activeBiome.ends_at) > Date.now()) {
    const biomeAura = tryBiomeRoll(activeBiome.biome_type);
    if (biomeAura) {
      const history2 = getHistory();
      history2.push({
        historyId: `${Date.now()}-biome-${Math.random().toString(36).slice(2)}`,
        id: biomeAura.id,
        text: biomeAura.text,
        font: biomeAura.font,
        color: biomeAura.color,
        fontWeight: biomeAura.fontWeight,
        fontStyle: biomeAura.fontStyle,
        textShadow: biomeAura.textShadow,
        rarity: biomeAura.rarity,
        isBiome: !biomeAura.isNull,
        isNull: biomeAura.isNull || false,
      });
      setHistory(history2);
      renderHistory();
      reportRareRoll(biomeAura);
      if (biomeAura.isNull) {
        // NOTHING gets the full unskippable staged cutscene
        await showElderCutscene(biomeAura);
      } else {
        isAnimating = true;
        await showRarityAnimation(biomeAura, 'biome');
        isAnimating = false;
      }
    }
  }

  if (rollBtn) rollBtn.disabled = false;
  checkElderUnlock();
  checkAscendantUnlock();
  checkEmperorUnlock();
  void checkAccomplishments();
}

function buyLuck() {
  const cost = luckCost(getLuckMultiplier());
  if (getCoins() < cost) return;
  setCoins(getCoins() - cost);
  setLuckMultiplier(getLuckMultiplier() + 2);
  addQuestProgress('shop_spend', cost);
  addQuestProgress('luck_reach', getLuckMultiplier() + getGearBonus());
  renderCoins();
  renderLuck();
}

const ADMIN_CODE = import.meta.env.VITE_ADMIN_CODE || '';
const ADMIN_COINS = 1_000_000;

function openAdminPanel() {
  const overlay = document.getElementById('admin-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('admin-code').value = '';
    document.getElementById('admin-message').textContent = '';
    document.getElementById('admin-code').focus();
  }
}

function closeAdminPanel() {
  const overlay = document.getElementById('admin-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function submitAdminCode() {
  const input = document.getElementById('admin-code');
  const msg = document.getElementById('admin-message');
  const code = (input?.value || '').trim().toLowerCase();

  // "supreme" — play the Supreme King cutscene
  if (code === 'supreme') {
    closeAdminPanel();
    showElderCutscene({ ...SUPREME_KING_AURA, isSupremeKing: true });
    return;
  }

  // "incarnatus" — grant a random Geometrical aura (same as Incarnatus potion)
  if (code === 'incarnatus') {
    const aura = GEOMETRICAL_AURAS[Math.floor(Math.random() * GEOMETRICAL_AURAS.length)];
    if (grantItemById(aura.id)) {
      closeAdminPanel();
      renderResult({ ...aura, isGeometrical: true });
      switchTab(document.querySelector('[data-tab="past"]'));
    }
    return;
  }

  // "geodash" or "geodash <id>" — play Geometrical aura cutscene (IDs 9200–9209)
  if (code === 'geodash' || code.startsWith('geodash ')) {
    const id = code === 'geodash' ? GEOMETRICAL_AURAS[Math.floor(Math.random() * GEOMETRICAL_AURAS.length)].id : parseInt(code.slice(8).trim(), 10);
    const aura = GEOMETRICAL_AURAS.find(a => a.id === id);
    if (aura) {
      closeAdminPanel();
      showElderCutscene({ ...aura });
    } else {
      if (msg) msg.textContent = `Geometrical ID 9200–9209. Use: geodash or geodash 9200`;
      if (msg) msg.style.color = 'var(--danger)';
    }
    return;
  }

  // "test <id>" — fire any aura's cutscene for preview
  if (code.startsWith('test ')) {
    const id = parseInt(code.slice(5).trim(), 10);
    const all = [SUPREME_KING_AURA, ...JIA_VOID_AURAS, VOID_QUEEN_AURA, BOOK_OF_POWER_AURA, ...ACCOMPLISHMENT_AURAS, ...JIA_RARE_ITEMS, ...EMPEROR_AURAS, ...AURAS_100Q, ...ELDER_AURAS, ...ASCENDANT_AURAS, ...TIER2_AURAS, ...BIOME_AURAS, ...SECRET_AURAS, ...GEOMETRICAL_AURAS, ...WORLD_CONFIG.items];
    const aura = all.find(a => a.id === id);
    if (aura) {
      closeAdminPanel();
      showElderCutscene({ ...aura, isSupremeKing: aura.isSupremeKing || false });
    } else {
      if (msg) msg.textContent = `No aura with ID ${id}.`;
      if (msg) msg.style.color = 'var(--danger)';
    }
    return;
  }

  // "unlock <id>" — add elder/ascendant/emperor to the rollable pool
  if (code.startsWith('unlock ')) {
    const id = parseInt(code.slice(7).trim(), 10);
    const all = [...ELDER_AURAS, ...ASCENDANT_AURAS];
    const aura = all.find(a => a.id === id);
    if (aura) {
      markElderUnlocked(id);
      if (msg) msg.textContent = `Aura ${id} unlocked — it will now appear in rolls.`;
      if (msg) msg.style.color = 'var(--roll)';
      input.value = '';
    } else {
      if (msg) msg.textContent = `No Elder/Ascendant with ID ${id}.`;
      if (msg) msg.style.color = 'var(--danger)';
    }
    return;
  }

  if (code === ADMIN_CODE) {
    setCoins(getCoins() + ADMIN_COINS);
    renderCoins();
    if (msg) msg.textContent = `Granted ${ADMIN_COINS.toLocaleString()} coins!`;
    if (msg) msg.style.color = 'var(--roll)';
    input.value = '';
    // Show the extra admin actions (e.g. reset local data)
    const extra = document.getElementById('admin-extra-actions');
    if (extra) extra.classList.remove('hidden');
    setTimeout(closeAdminPanel, 1500);
  } else {
    if (msg) msg.textContent = 'Invalid code.';
    if (msg) msg.style.color = 'var(--danger)';
  }
}

function resetLocalData() {
  if (!confirm('This will wipe ALL your local data (coins, history, luck, scraps, gears, locked items). This cannot be undone. Continue?')) return;
  localStorage.clear();
  location.reload();
}

// ——— Settings ———
function getCutsceneThreshold() {
  return localStorage.getItem(STORAGE_KEYS.cutsceneThreshold) ?? '100000000';
}
function setCutsceneThreshold(val) {
  localStorage.setItem(STORAGE_KEYS.cutsceneThreshold, val);
}

function openSettings() {
  const overlay = document.getElementById('settings-overlay');
  const sel = document.getElementById('settings-cutscene-threshold');
  if (sel) sel.value = getCutsceneThreshold();
  if (overlay) { overlay.classList.remove('hidden'); overlay.setAttribute('aria-hidden', 'false'); }
}
function closeSettings() {
  const overlay = document.getElementById('settings-overlay');
  if (overlay) { overlay.classList.add('hidden'); overlay.setAttribute('aria-hidden', 'true'); }
}

// ——— Tycoon ———
function getTycoonCpc()      { return Number(localStorage.getItem(STORAGE_KEYS.tycoonCpc)      || 1); }
function setTycoonCpc(n)     { localStorage.setItem(STORAGE_KEYS.tycoonCpc, String(n)); }
function getTycoonUpgrades() { return Number(localStorage.getItem(STORAGE_KEYS.tycoonUpgrades) || 0); }
function setTycoonUpgrades(n){ localStorage.setItem(STORAGE_KEYS.tycoonUpgrades, String(n)); }
function getTycoonClicks()   { return Number(localStorage.getItem(STORAGE_KEYS.tycoonClicks)   || 0); }
function setTycoonClicks(n)  { localStorage.setItem(STORAGE_KEYS.tycoonClicks, String(n)); }
function getTycoonEarned()   { return Number(localStorage.getItem(STORAGE_KEYS.tycoonEarned)   || 0); }
function setTycoonEarned(n)  { localStorage.setItem(STORAGE_KEYS.tycoonEarned, String(n)); }

// Upgrade N (0-indexed): costs 100,000 * 2^N coins, gives +1 CPC. Cap at 20 upgrades.
const TYCOON_MAX_UPGRADES   = 50;
const TYCOON_BASE_COST      = 500;
const TYCOON_CPC_PER_UPGRADE = 10;
function tycoonUpgradeCost(upgradeIndex) {
  // 1.5x scaling instead of 2x — hard but not astronomically hard
  return Math.floor(TYCOON_BASE_COST * Math.pow(1.5, upgradeIndex));
}

function tycoonClick() {
  const cpc = getTycoonCpc();
  setCoins(getCoins() + cpc);
  setTycoonClicks(getTycoonClicks() + 1);
  setTycoonEarned(getTycoonEarned() + cpc);
  renderCoins();
  renderTycoonStats();
  spawnTycoonFloat(`+${cpc}`);
}

function buyTycoonUpgrade() {
  const bought = getTycoonUpgrades();
  if (bought >= TYCOON_MAX_UPGRADES) return;
  const cost = tycoonUpgradeCost(bought);
  if (getCoins() < cost) return;
  setCoins(getCoins() - cost);
  setTycoonCpc(getTycoonCpc() + TYCOON_CPC_PER_UPGRADE);
  setTycoonUpgrades(bought + 1);
  renderCoins();
  renderTycoon();
}

function spawnTycoonFloat(text) {
  const container = document.getElementById('tycoon-floats');
  if (!container) return;
  const el = document.createElement('span');
  el.className = 'tycoon-float';
  el.textContent = text;
  // randomise horizontal position slightly
  el.style.left = `${30 + Math.random() * 40}%`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function renderTycoonStats() {
  const cpcEl     = document.getElementById('tycoon-cpc');
  const clicksEl  = document.getElementById('tycoon-clicks');
  const earnedEl  = document.getElementById('tycoon-earned');
  if (cpcEl)    cpcEl.textContent    = getTycoonCpc().toLocaleString();
  if (clicksEl) clicksEl.textContent = getTycoonClicks().toLocaleString();
  if (earnedEl) earnedEl.textContent = getTycoonEarned().toLocaleString();
}

function renderTycoon() {
  renderTycoonStats();
  const list   = document.getElementById('tycoon-upgrade-list');
  if (!list) return;
  const bought = getTycoonUpgrades();
  const coins  = getCoins();
  let html = '';
  for (let i = 0; i < TYCOON_MAX_UPGRADES; i++) {
    const cost      = tycoonUpgradeCost(i);
    const isNext    = i === bought;
    const isPast    = i < bought;
    const canAfford = coins >= cost;
    if (isPast) {
      html += `<div class="tycoon-upgrade tycoon-upgrade--owned">
        <span class="tycoon-upgrade-name">Upgrade ${i + 1}</span>
        <span class="tycoon-upgrade-effect">+1 CPC</span>
        <span class="tycoon-upgrade-badge">✓ Owned</span>
      </div>`;
    } else if (isNext) {
      html += `<div class="tycoon-upgrade tycoon-upgrade--available">
        <span class="tycoon-upgrade-name">Upgrade ${i + 1}</span>
        <span class="tycoon-upgrade-effect">+${TYCOON_CPC_PER_UPGRADE} coins per click</span>
        <span class="tycoon-upgrade-cost">${cost.toLocaleString()} coins</span>
        <button type="button" class="shop-buy-btn tycoon-buy-btn" id="tycoon-buy-btn" ${!canAfford ? 'disabled' : ''}>Buy</button>
      </div>`;
    } else {
      html += `<div class="tycoon-upgrade tycoon-upgrade--locked">
        <span class="tycoon-upgrade-name">Upgrade ${i + 1}</span>
        <span class="tycoon-upgrade-effect">+${TYCOON_CPC_PER_UPGRADE} coins per click</span>
        <span class="tycoon-upgrade-cost">${cost.toLocaleString()} coins</span>
        <span class="tycoon-upgrade-badge">🔒 Locked</span>
      </div>`;
    }
  }
  if (bought >= TYCOON_MAX_UPGRADES) {
    html += `<p class="tycoon-maxed">Maximum upgrades reached. You are a coin god.</p>`;
  }
  list.innerHTML = html;
  document.getElementById('tycoon-buy-btn')?.addEventListener('click', buyTycoonUpgrade);
}

// ——— Store (PayPal in-app purchases) ———
const STORE_PRODUCTS = [
  { id: 'coin_s', name: 'Coin Pack S',   price: '$0.49', emoji: '🪙', reward: '500M coins',    type: 'coins',  amount: 500_000_000 },
  { id: 'coin_m', name: 'Coin Pack M',   price: '$2.49', emoji: '💰', reward: '3B coins',      type: 'coins',  amount: 3_000_000_000 },
  { id: 'coin_l', name: 'Coin Pack L',   price: '$4.99', emoji: '💎', reward: '7.5B coins',    type: 'coins',  amount: 7_500_000_000 },
  { id: 'luck_s', name: 'Luck Boost S',  price: '$0.99', emoji: '🍀', reward: 'x10M luck',     type: 'luck',   amount: 10_000_000 },
  { id: 'luck_l', name: 'Luck Boost L',  price: '$2.49', emoji: '⚡', reward: 'x100M luck',    type: 'luck',   amount: 100_000_000 },
];

let _paypalReady = false;

function loadPayPalSDK() {
  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
  if (!clientId || _paypalReady) return;
  const script = document.getElementById('paypal-sdk-script');
  if (!script) return;
  script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
  script.onload = () => {
    _paypalReady = true;
    mountPayPalButtons();
  };
}

function mountPayPalButtons() {
  if (!window.paypal) return;
  STORE_PRODUCTS.forEach((product) => {
    const container = document.getElementById(`paypal-btn-${product.id}`);
    if (!container || container.children.length > 0) return;

    window.paypal.Buttons({
      style: { layout: 'horizontal', color: 'gold', shape: 'rect', label: 'pay', height: 35 },

      createOrder: async () => {
        const res = await fetch('/.netlify/functions/create-paypal-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: product.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Order creation failed');
        return data.orderID;
      },

      onApprove: async (data) => {
        const res = await fetch('/.netlify/functions/capture-paypal-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderID: data.orderID, productId: product.id }),
        });
        const result = await res.json();
        if (!res.ok) {
          alert('Payment failed: ' + (result.error || 'Unknown error'));
          return;
        }
        showStoreClaimCode(result.claimCode, product);
      },

      onError: (err) => {
        console.error('[store] PayPal error:', err);
        alert('Something went wrong with PayPal. Please try again.');
      },
    }).render(`#paypal-btn-${product.id}`);
  });
}

function showStoreClaimCode(code, product) {
  const msg = document.getElementById('store-claim-msg');
  const input = document.getElementById('store-claim-input');
  // Pre-fill the redeem box for convenience
  if (input) input.value = code;
  if (msg) {
    msg.textContent = '';
  }
  // Show a prominent modal-style alert with the code
  alert(
    `Payment successful!\n\nYour claim code for ${product.name}:\n\n${code}\n\nThis code has been pre-filled in the Redeem box. Click Redeem to receive your ${product.reward}.`
  );
}

async function redeemClaimCode() {
  const input = document.getElementById('store-claim-input');
  const msg   = document.getElementById('store-claim-msg');
  const code  = (input?.value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');

  if (!code) {
    if (msg) { msg.textContent = 'Enter a claim code first.'; msg.className = 'store-claim-msg store-claim-msg--error'; }
    return;
  }
  if (!supabase) {
    if (msg) { msg.textContent = 'Cannot connect to server. Try again later.'; msg.className = 'store-claim-msg store-claim-msg--error'; }
    return;
  }

  const btn = document.getElementById('store-claim-btn');
  if (btn) btn.disabled = true;
  if (msg) { msg.textContent = 'Verifying…'; msg.className = 'store-claim-msg'; }

  const { data, error } = await supabase.rpc('redeem_purchase_code', { p_code: code });

  if (btn) btn.disabled = false;

  if (error || !data?.success) {
    if (msg) { msg.textContent = data?.error || 'Invalid or already claimed code.'; msg.className = 'store-claim-msg store-claim-msg--error'; }
    return;
  }

  // Apply the reward
  const product = STORE_PRODUCTS.find((p) => p.id === data.product_id);
  if (!product) {
    if (msg) { msg.textContent = 'Code redeemed but product not recognised. Contact support.'; msg.className = 'store-claim-msg store-claim-msg--error'; }
    return;
  }

  if (product.type === 'coins') {
    setCoins(getCoins() + product.amount);
    renderCoins();
  } else if (product.type === 'luck') {
    setLuckMultiplier(getLuckMultiplier() + product.amount);
    renderLuck();
  }

  if (input) input.value = '';
  if (msg) {
    msg.textContent = `Redeemed! You received ${product.reward}.`;
    msg.className = 'store-claim-msg store-claim-msg--success';
  }
}

function renderStore() {
  const grid = document.getElementById('store-product-grid');
  if (!grid) return;

  grid.innerHTML = STORE_PRODUCTS.map((p) => `
    <div class="store-card">
      <div class="store-card-emoji">${p.emoji}</div>
      <div class="store-card-name">${p.name}</div>
      <div class="store-card-reward">${p.reward}</div>
      <div class="store-card-price">${p.price}</div>
      <div id="paypal-btn-${p.id}" class="store-paypal-btn-container"></div>
    </div>
  `).join('');

  // Load SDK on first open, or mount buttons if already loaded
  if (!_paypalReady) {
    loadPayPalSDK();
  } else {
    mountPayPalButtons();
  }
}

function init() {
  migrateLockedToStorage();
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  const worldSwitcher = document.getElementById('world-switcher');
  if (worldSwitcher) {
    if (WORLD_ID === 1) {
      worldSwitcher.innerHTML = `<a href="${base}world2.html" class="world-switcher-link">World 2</a>`;
    } else {
      worldSwitcher.innerHTML = `<a href="${base === '/' ? '/' : base}" class="world-switcher-link">World 1</a>`;
    }
  }
  const worldBadge = document.getElementById('world-badge');
  if (worldBadge) {
    if (WORLD_ID === 2) {
      worldBadge.textContent = 'World 2';
      worldBadge.classList.remove('hidden');
    } else {
      worldBadge.textContent = 'World 1';
      worldBadge.classList.add('hidden');
    }
  }
  const rollBtn = document.getElementById('roll-btn');
  const luckBtn = document.getElementById('luck-btn');
  if (rollBtn) rollBtn.addEventListener('click', roll);
  if (luckBtn) luckBtn.addEventListener('click', buyLuck);
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });


  let titleClicks = 0;
  let titleTimer = 0;
  const headerTitle = document.querySelector('.header-title');
  if (headerTitle) {
    headerTitle.addEventListener('click', () => {
      titleClicks++;
      clearTimeout(titleTimer);
      if (titleClicks >= 3) {
        titleClicks = 0;
        openAdminPanel();
      }
      titleTimer = setTimeout(() => { titleClicks = 0; }, 500);
    });
  }
  document.getElementById('admin-submit')?.addEventListener('click', submitAdminCode);
  document.getElementById('admin-reset-local')?.addEventListener('click', resetLocalData);
  document.getElementById('admin-close')?.addEventListener('click', closeAdminPanel);
  document.getElementById('admin-code')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitAdminCode();
  });
  document.getElementById('admin-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'admin-overlay') closeAdminPanel();
  });

  // Dev panel (nicholas.mj.choe only)
  document.getElementById('dev-panel-btn')?.addEventListener('click', () => {
    if (isAdminUser()) openDevPanel();
  });
  document.getElementById('dev-panel-close')?.addEventListener('click', closeDevPanel);
  document.getElementById('dev-panel-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'dev-panel-overlay') closeDevPanel();
  });
  document.getElementById('dev-summon-benny')?.addEventListener('click', () => {
    setBennyNextAt(1);
    showBennyButton();
    const msg = document.getElementById('dev-panel-msg');
    if (msg) { msg.textContent = 'Benny summoned!'; msg.style.color = 'var(--roll)'; }
  });
  document.getElementById('dev-summon-patrick')?.addEventListener('click', () => {
    setPatrickNextAt(1);
    showPatrickButton();
    const msg = document.getElementById('dev-panel-msg');
    if (msg) { msg.textContent = 'Patrick summoned!'; msg.style.color = 'var(--roll)'; }
  });
  const devSummonJia = document.getElementById('dev-summon-jia');
  if (devSummonJia) {
    devSummonJia.classList.toggle('hidden', WORLD_ID !== 2);
    devSummonJia.addEventListener('click', () => {
      if (WORLD_ID === 2) {
        showJiaButton();
        closeDevPanel();
        const msg = document.getElementById('dev-panel-msg');
        if (msg) { msg.textContent = 'Jia summoned!'; msg.style.color = 'var(--roll)'; }
      }
    });
  }
  document.getElementById('dev-grant-item')?.addEventListener('click', () => {
    const input = document.getElementById('dev-item-id');
    const msg = document.getElementById('dev-panel-msg');
    const id = parseInt(input?.value || '0', 10);
    if (!id) {
      if (msg) { msg.textContent = 'Enter a valid item ID.'; msg.style.color = 'var(--danger)'; }
      return;
    }
    if (grantItemById(id)) {
      if (msg) { msg.textContent = `Granted item ${id}!`; msg.style.color = 'var(--roll)'; }
      if (input) input.value = '';
    } else {
      if (msg) { msg.textContent = `No item with ID ${id}.`; msg.style.color = 'var(--danger)'; }
    }
  });

  renderPotionInventory();
  renderTheo();
  renderSneho();
  renderQuestBoard();

  // Tycoon click button (persistent listener, not inside renderTycoon)
  document.getElementById('tycoon-click-btn')?.addEventListener('click', tycoonClick);

  // Settings
  document.getElementById('settings-btn')?.addEventListener('click', openSettings);
  document.getElementById('settings-close')?.addEventListener('click', closeSettings);
  document.getElementById('settings-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'settings-overlay') closeSettings();
  });
  document.getElementById('settings-cutscene-threshold')?.addEventListener('change', (e) => {
    setCutsceneThreshold(e.target.value);
  });

  // Store redeem
  document.getElementById('store-claim-btn')?.addEventListener('click', redeemClaimCode);
  document.getElementById('store-claim-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') redeemClaimCode();
  });

  initBennySchedule();
  initPatrickSchedule();
  setInterval(() => {
    const next = getBennyNextAt();
    if (next > 0 && Date.now() >= next) showBennyButton();
  }, 1000);
  setInterval(() => {
    const next = getPatrickNextAt();
    if (next > 0 && Date.now() >= next) showPatrickButton();
  }, 1000);
  if (WORLD_ID === 2) {
    setInterval(() => {
      if (Math.random() < JIA_SPAWN_CHANCE) showJiaButton();
    }, JIA_MINUTE_MS);
  }
  checkAccomplishmentsPilgrim();
  // Check accomplishments on load (e.g. already have all 20 for Scholar, or 50K rolls + 100Q for Patient)
  if (WORLD_ID === 1) setTimeout(() => void checkAccomplishments(), 800);
  setInterval(updateShopCountdown, 1000);
  setInterval(updateSnehoCountdown, 1000);

  document.getElementById('benny-popup-btn')?.addEventListener('click', openBenny);
  document.getElementById('benny-close')?.addEventListener('click', closeBenny);
  document.getElementById('benny-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'benny-overlay') closeBenny();
  });
  document.getElementById('patrick-popup-btn')?.addEventListener('click', openPatrick);
  document.getElementById('patrick-close')?.addEventListener('click', closePatrick);
  document.getElementById('patrick-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'patrick-overlay') closePatrick();
  });
  document.getElementById('jia-popup-btn')?.addEventListener('click', openJia);
  document.getElementById('jia-close')?.addEventListener('click', closeJia);
  document.getElementById('jia-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'jia-overlay') closeJia();
  });
  document.getElementById('crafter-popup-btn')?.addEventListener('click', openCrafter);
  document.getElementById('crafter-close')?.addEventListener('click', closeCrafter);
  document.getElementById('crafter-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'crafter-overlay') closeCrafter();
  });
  document.getElementById('materialseller-popup-btn')?.addEventListener('click', openMaterialSeller);
  document.getElementById('materialseller-close')?.addEventListener('click', closeMaterialSeller);
  document.getElementById('materialseller-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'materialseller-overlay') closeMaterialSeller();
  });

  // Wire up username inputs — listeners only, UI state set by refreshUsernameUI()
  const hubUsernameInput = document.getElementById('hub-username');
  if (hubUsernameInput) {
    const hubUsernameCooldownMsg = document.getElementById('hub-username-cooldown');
    hubUsernameInput.addEventListener('change', async () => {
      const before = getHubUsername();
      hubUsernameInput.disabled = true;
      const err = await claimUsername(hubUsernameInput.value);
      if (err) {
        hubUsernameInput.value = before;
        if (hubUsernameCooldownMsg) { hubUsernameCooldownMsg.textContent = err; hubUsernameCooldownMsg.style.color = 'var(--danger)'; }
      } else {
        if (hubUsernameCooldownMsg) { hubUsernameCooldownMsg.textContent = '✓ Username set'; hubUsernameCooldownMsg.style.color = 'var(--roll)'; }
        setTimeout(() => refreshUsernameUI(), 2000);
      }
      refreshUsernameUI();
    });
  }
  document.getElementById('hub-chat-send')?.addEventListener('click', sendHubMessage);
  document.getElementById('competition-submit-btn')?.addEventListener('click', submitCompetitionScore);
  document.getElementById('hub-chat-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendHubMessage(); });
  document.getElementById('hub-trade-post')?.addEventListener('click', postHubTrade);

  const casinoUsernameInput = document.getElementById('casino-username');
  if (casinoUsernameInput) {
    const casinoUsernameCooldownMsg = document.getElementById('casino-username-cooldown');
    casinoUsernameInput.addEventListener('change', async () => {
      const before = getHubUsername();
      casinoUsernameInput.disabled = true;
      const err = await claimUsername(casinoUsernameInput.value);
      if (err) {
        casinoUsernameInput.value = before;
        if (casinoUsernameCooldownMsg) { casinoUsernameCooldownMsg.textContent = err; casinoUsernameCooldownMsg.style.color = 'var(--danger)'; }
      } else {
        if (casinoUsernameCooldownMsg) { casinoUsernameCooldownMsg.textContent = '✓ Username set'; casinoUsernameCooldownMsg.style.color = 'var(--roll)'; }
        setTimeout(() => refreshUsernameUI(), 2000);
      }
      refreshUsernameUI();
    });
  }
  document.getElementById('casino-deposit-btn')?.addEventListener('click', casinoDepositCoins);
  document.getElementById('casino-withdraw-btn')?.addEventListener('click', casinoWithdrawCoins);
  document.getElementById('casino-coinflip-create')?.addEventListener('click', casinoCreateCoinflip);
  document.getElementById('casino-coinflip-amount')?.addEventListener('input', () => {
    const amountInput = document.getElementById('casino-coinflip-amount');
    const createBtn = document.getElementById('casino-coinflip-create');
    if (createBtn && amountInput) {
      const amount = Math.floor(Number(amountInput.value || 0));
      createBtn.disabled = !getCasinoUsername() || amount <= 0 || casinoCoinBalance < amount;
    }
  });
  document.getElementById('casino-itemflip-create')?.addEventListener('click', casinoCreateItemflip);

  document.getElementById('auth-signup-btn')?.addEventListener('click', () => openAuthOverlay('signup'));
  document.getElementById('auth-signin-btn')?.addEventListener('click', () => openAuthOverlay('signin'));
  document.getElementById('auth-signout-btn')?.addEventListener('click', authSignOut);
  document.getElementById('auth-tab-signin')?.addEventListener('click', () => { document.getElementById('auth-tab-signin')?.classList.add('active'); document.getElementById('auth-tab-signup')?.classList.remove('active'); document.getElementById('auth-signin-form')?.classList.remove('hidden'); document.getElementById('auth-signup-form')?.classList.add('hidden'); });
  document.getElementById('auth-tab-signup')?.addEventListener('click', () => { document.getElementById('auth-tab-signup')?.classList.add('active'); document.getElementById('auth-tab-signin')?.classList.remove('active'); document.getElementById('auth-signup-form')?.classList.remove('hidden'); document.getElementById('auth-signin-form')?.classList.add('hidden'); });
  document.getElementById('auth-signin-submit')?.addEventListener('click', authSignIn);
  document.getElementById('auth-signup-submit')?.addEventListener('click', authSignUp);
  document.getElementById('auth-overlay-close')?.addEventListener('click', closeAuthOverlay);
  document.getElementById('auth-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'auth-overlay') closeAuthOverlay(); });
  document.getElementById('bazaar-quick-btn')?.addEventListener('click', () => switchTab('bazaar'));
  document.getElementById('link-casino-btn')?.addEventListener('click', async () => {
    if (!authUser || !supabase) {
      pendingCasinoLink = true;
      openAuthOverlay('signin');
      return;
    }
    if (!getCasinoUsername()) {
      showBazaarBalanceMsg('Set display name in Hub first.', true);
      switchTab('hub');
      return;
    }
    const btn = document.getElementById('link-casino-btn');
    if (btn) btn.disabled = true;
    const ok = await bazaarAutoLinkCasino();
    if (btn) btn.disabled = false;
    if (ok) {
      showBazaarBalanceMsg(`Linked as ${authProfile?.casino_username || getCasinoUsername()}`);
      updateAuthUI();
      renderBazaar();
      renderCasino();
    } else {
      showBazaarBalanceMsg('Link failed. That name may already be linked.', true);
    }
  });
  document.getElementById('bazaar-deposit-btn')?.addEventListener('click', bazaarDepositCoins);
  document.getElementById('bazaar-deposit-all-btn')?.addEventListener('click', bazaarDepositAllCoins);
  document.getElementById('bazaar-withdraw-btn')?.addEventListener('click', bazaarWithdrawCoins);
  document.getElementById('bazaar-withdraw-all-btn')?.addEventListener('click', bazaarWithdrawAllCoins);
  document.getElementById('bazaar-link-btn')?.addEventListener('click', bazaarLinkCasino);
  document.getElementById('bazaar-link-btn-single')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('bazaar-link-status');
    const btn = document.getElementById('bazaar-link-btn-single');
    if (!getCasinoUsername()) {
      if (statusEl) { statusEl.textContent = 'Set display name in Hub/Casino first.'; statusEl.style.color = 'var(--danger)'; }
      return;
    }
    if (btn) btn.disabled = true;
    if (statusEl) { statusEl.textContent = 'Connecting…'; statusEl.style.color = ''; }
    const ok = await bazaarAutoLinkCasino();
    if (btn) btn.disabled = false;
    if (ok) {
      if (statusEl) { statusEl.textContent = `Linked as ${escapeHtml(authProfile?.casino_username || getCasinoUsername())}`; statusEl.style.color = 'var(--roll)'; }
      renderBazaar();
    } else {
      if (statusEl) { statusEl.textContent = 'Link failed. That name may already be linked. Try manual link below.'; statusEl.style.color = 'var(--danger)'; }
    }
  });
  document.getElementById('bazaar-stock-buy-btn')?.addEventListener('click', bazaarStockBuy);
  document.getElementById('bazaar-stock-buy-max-btn')?.addEventListener('click', bazaarStockBuyMax);
  document.getElementById('bazaar-stock-sell-btn')?.addEventListener('click', bazaarStockSell);
  document.getElementById('bazaar-stock-sell-all-btn')?.addEventListener('click', bazaarStockSellAll);
  document.querySelectorAll('.bazaar-jump-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.scrollTo;
      if (!id) return;
      switchTab('bazaar');
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    });
  });

  if (supabase) {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      authUser = session?.user ?? null;
      if (authUser) {
        await refreshAuthProfile();
        await claimReferralLocalCoins();
        updateAuthUI();
        renderBazaar();
        refreshUsernameUI();
      } else {
        updateAuthUI();
        renderBazaar();
        refreshUsernameUI();
      }
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      authUser = session?.user ?? null;
      if (authUser) {
        refreshAuthProfile().then(() => claimReferralLocalCoins()).then(() => {
          updateAuthUI();
          renderBazaar();
          refreshUsernameUI();
        });
      } else {
        authProfile = null;
        updateAuthUI();
        renderBazaar();
        refreshUsernameUI();
      }
    });
  } else {
    updateAuthUI();
    refreshUsernameUI();
  }

  document.getElementById('casino-link-to-bazaar-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('casino-link-to-bazaar-status');
    const btn = document.getElementById('casino-link-to-bazaar-btn');
    if (!authUser || !supabase) {
      pendingCasinoLink = true;
      openAuthOverlay('signin');
      if (statusEl) { statusEl.textContent = 'Sign in to link your vault.'; statusEl.style.color = 'var(--text-dim)'; }
      return;
    }
    if (!getCasinoUsername()) {
      if (statusEl) { statusEl.textContent = 'Set display name above first.'; statusEl.style.color = 'var(--danger)'; }
      return;
    }
    if (btn) btn.disabled = true;
    if (statusEl) { statusEl.textContent = 'Linking…'; statusEl.style.color = ''; }
    const ok = await bazaarAutoLinkCasino();
    if (ok) {
      if (statusEl) { statusEl.textContent = `Linked as ${escapeHtml(authProfile?.casino_username || getCasinoUsername())}`; statusEl.style.color = 'var(--roll)'; }
      if (btn) { btn.textContent = 'Linked to Bazaar'; btn.disabled = true; }
      switchTab('bazaar');
      renderBazaar();
    } else {
      if (btn) btn.disabled = false;
      if (statusEl) { statusEl.textContent = 'Link failed. Name may already be linked.'; statusEl.style.color = 'var(--danger)'; }
    }
  });

  refreshUsernameUI();
  setInterval(refreshUsernameUI, 60_000);
  subscribeActiveBiome();
  advanceShopRotationIfNeeded();
  renderCoins();
  renderRollCount();
  renderLuck();
  renderHistory();
  renderLockedStorage();
  const last = getHistory()[getHistory().length - 1];
  if (last) renderResult(last);
}

init();

// ─── Dev / testing helpers (browser console) ─────────────────────────────────
window.__rng = {
  /** Fire any aura's cutscene by ID.  e.g. __rng.cutscene(9970) or __rng.cutscene(9200) */
  cutscene(id) {
    const all = [SUPREME_KING_AURA, ...JIA_VOID_AURAS, VOID_QUEEN_AURA, BOOK_OF_POWER_AURA, ...ACCOMPLISHMENT_AURAS, ...JIA_RARE_ITEMS, ...EMPEROR_AURAS, ...AURAS_100Q, ...ELDER_AURAS, ...ASCENDANT_AURAS, ...TIER2_AURAS, ...BIOME_AURAS, ...SECRET_AURAS, ...GEOMETRICAL_AURAS, ...WORLD_CONFIG.items];
    const aura = all.find(a => a.id === id);
    if (!aura) { console.warn(`[__rng] No aura with id ${id}`); return; }
    showElderCutscene({ ...aura, isSupremeKing: aura.isSupremeKing || false });
  },
  /** Add an elder/ascendant/emperor to the rollable pool by ID.  e.g. __rng.unlock(9970) */
  unlock(id) {
    markElderUnlocked(id);
    console.log(`[__rng] Unlocked aura ${id} — it will now appear in rolls.`);
  },
  /** List all elder, ascendant & emperor IDs. */
  list() {
    console.table([...ELDER_AURAS, ...ASCENDANT_AURAS, ...EMPEROR_AURAS, ...AURAS_100Q, ...ACCOMPLISHMENT_AURAS, ...TIER2_AURAS].map(a => ({ id: a.id, text: a.text })));
  },
};
