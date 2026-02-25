import './style.css';
import { ITEMS } from './data/items.js';
import { supabase, isHubAvailable } from './supabase.js';

const STORAGE_KEYS = {
  coins: 'rng_coins', history: 'rng_history', luck: 'rng_luck', locked: 'rng_locked', lockedStorage: 'rng_locked_storage',
  shopRotationEnd: 'rng_shop_rotation_end', shopSeed: 'rng_shop_seed',
  bennyNextAt: 'rng_benny_next_at',
  scraps: 'rng_scraps', gearBonus: 'rng_gear_bonus',
  snehoRotationEnd: 'rng_sneho_rotation_end', snehoSeed: 'rng_sneho_seed',
  tycoonCpc: 'rng_tycoon_cpc', tycoonUpgrades: 'rng_tycoon_upgrades',
  tycoonClicks: 'rng_tycoon_clicks', tycoonEarned: 'rng_tycoon_earned',
  cutsceneThreshold: 'rng_settings_cutscene_threshold',
};
const SHOP_ROTATION_MS  = 5  * 60 * 1000;  // 5 minutes
const SNEHO_ROTATION_MS = 10 * 60 * 1000;  // 10 minutes
const BENNY_INTERVAL_MS = 60 * 60 * 1000;  // 60 minutes

function getCoins() {
  return Number(localStorage.getItem(STORAGE_KEYS.coins) || 0);
}
function setCoins(n) {
  localStorage.setItem(STORAGE_KEYS.coins, String(Math.max(0, Math.floor(n))));
}
function getScraps() {
  return Number(localStorage.getItem(STORAGE_KEYS.scraps) || 0);
}
function setScraps(n) {
  localStorage.setItem(STORAGE_KEYS.scraps, String(Math.max(0, Math.floor(n))));
}
function getGearBonus() {
  return Number(localStorage.getItem(STORAGE_KEYS.gearBonus) || 0);
}
function addGearBonus(amount) {
  localStorage.setItem(STORAGE_KEYS.gearBonus, String(Math.max(0, getGearBonus() + amount)));
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
  return Number(localStorage.getItem(STORAGE_KEYS.luck) || 1);
}
function setLuckMultiplier(m) {
  localStorage.setItem(STORAGE_KEYS.luck, String(m));
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

function weightedRandom(multiplier = 1) {
  // Compress luck logarithmically so high values don't make all items equally likely.
  // effectiveMult = 1 + log10(luck):
  //   luck=1  → 1.0  (no change — original weights)
  //   luck=10 → 2.0  (1T mythic still ~1 million× rarer than common)
  //   luck=100→ 3.0  (1T mythic ~8,000× rarer than common)
  //   luck=1k → 4.0  (1T mythic ~840× rarer than common)
  //   luck=15k→ 5.2  (1T mythic ~180× rarer — hard but rollable)
  const effectiveMult = 1 + Math.log10(Math.max(multiplier, 1));
  const weights = ITEMS.map((i) => Math.pow(i.weight, 1 / effectiveMult));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < ITEMS.length; i++) {
    r -= weights[i];
    if (r <= 0) return { ...ITEMS[i], index: i };
  }
  return { ...ITEMS[ITEMS.length - 1], index: ITEMS.length - 1 };
}

function formatRarity(rarity) {
  // Use integer-safe comparisons. MAX_SAFE_INTEGER ≈ 9.007×10^15.
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

function renderResult(item) {
  const el = document.getElementById('result');
  const label = document.getElementById('result-label');
  if (!el || !label) return;
  el.textContent = item.text;
  el.style.fontFamily = `"${item.font}", sans-serif`;
  el.style.color = item.color;
  el.style.fontWeight = item.fontWeight || '400';
  el.style.fontStyle = item.fontStyle || 'normal';
  el.style.textShadow = item.textShadow || 'none';
  label.textContent = formatRarity(item.rarity);
  label.className = 'rarity-label';
}

function renderCoins() {
  const el = document.getElementById('coins');
  if (el) el.textContent = getCoins().toLocaleString();
}

function renderLuck() {
  const m = getLuckMultiplier();
  const gear = getGearBonus();
  const total = m + gear;
  const el = document.getElementById('luck-value');
  const btn = document.getElementById('luck-btn');
  if (el) {
    const fmt = (n) => Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
    if (gear > 0) {
      el.textContent = `${fmt(total)}× (${fmt(m)} + ${fmt(gear)} gear)`;
    } else {
      el.textContent = m === 1 ? '1× (normal)' : `${fmt(m)}×`;
    }
  }
  if (btn) {
    const cost = luckCost(m);
    btn.textContent = `Boost luck (${cost} coins)`;
    btn.disabled = getCoins() < cost;
  }
}

function luckCost(currentMult) {
  // Cost scales linearly with current multiplier so each +5 click gets progressively more expensive.
  return Math.floor(50 * Math.max(currentMult, 1));
}

// Theo's gears: permanent luck boosters bought with scraps
const GEAR_TIERS = [
  { id: 'gear_worn',      name: 'Worn Gear',      emoji: '⚙️',  luckBonus: 2,   cost: 10,  desc: 'A rusty old gear. Still spins.' },
  { id: 'gear_iron',      name: 'Iron Gear',      emoji: '🔩',  luckBonus: 5,   cost: 30,  desc: 'Solid iron. Noticeably luckier.' },
  { id: 'gear_steel',     name: 'Steel Gear',     emoji: '🔧',  luckBonus: 15,  cost: 80,  desc: 'Precision-crafted steel.' },
  { id: 'gear_enchanted', name: 'Enchanted Gear', emoji: '✨',  luckBonus: 40,  cost: 200, desc: 'Glows faintly. Luck surges.' },
  { id: 'gear_divine',    name: 'Divine Gear',    emoji: '🌟',  luckBonus: 100, cost: 600, desc: 'Radiates raw fortune.' },
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
  { id: 'potion1', name: 'Minor Luck Potion', cost: 25,  luckBonus: 20,  emoji: '🧪' },
  { id: 'potion2', name: 'Luck Potion',        cost: 50,  luckBonus: 55,  emoji: '⚗️' },
  { id: 'potion3', name: 'Greater Luck Potion',cost: 120, luckBonus: 110, emoji: '🔮' },
  { id: 'potion4', name: 'Supreme Luck Elixir',cost: 300, luckBonus: 275, emoji: '✨' },
  { id: 'potion5', name: 'Mythic Fortune Brew', cost: 700, luckBonus: 550, emoji: '🌟' },
];
// Very rare spawn in rotating shop only (not in Benny's list)
const LEGENDARY_LUCK_POTION = { id: 'potionLegendary3000', name: '3000× Luck Elixir', cost: 5000, luckBonus: 2999, emoji: '👑' };
const LEGENDARY_POTION_SPAWN_CHANCE = 0.008;
// Benny-exclusive potions (not sold anywhere else)
const BENNY_EXCLUSIVE_POTIONS = [
  { id: 'potionBennyBargain',    name: "Benny's Bargain Brew",  cost: 8,    luckBonus: 10,    emoji: '🎒', desc: "Dirt cheap and it works." },
  { id: 'potionBennyTonic',      name: "Old Road Tonic",        cost: 18,   luckBonus: 25,    emoji: '🫙', desc: "Brewed on the road. Surprisingly potent." },
  { id: 'potionBennyCraft',      name: "Crafter's Draft",       cost: 75,   luckBonus: 75,    emoji: '🔩', desc: "Concocted from leftover parts. Great deal." },
  { id: 'potionBennyUltraluck',  name: 'Ultraluck Potion',      cost: 5000, luckBonus: 15000, emoji: '⚡', desc: "Benny's rarest. Surprisingly affordable." },
];

// ——— Sneho's forbidden shop ———
// Each item has a cursedChance: if the curse triggers the luck effect is negative (cursedPenalty)
const SNEHO_ITEMS = [
  { id: 'sneho1', name: 'Shadowed Vial',       cost: 8,    luckBonus: 8,    cursedChance: 0.50, cursedPenalty: -5,    emoji: '🫗',  desc: 'Could go either way.' },
  { id: 'sneho2', name: "Demon's Brew",         cost: 30,   luckBonus: 25,   cursedChance: 0.40, cursedPenalty: -15,   emoji: '😈',  desc: 'Smells of sulfur. High risk, high reward.' },
  { id: 'sneho3', name: 'Void Essence',         cost: 150,  luckBonus: 75,   cursedChance: 0.30, cursedPenalty: -50,   emoji: '🕳️', desc: 'Bottled nothing. Unstable.' },
  { id: 'sneho4', name: 'Blood Moon Extract',   cost: 800,  luckBonus: 200,  cursedChance: 0.25, cursedPenalty: -130,  emoji: '🌑',  desc: 'Only available on the wrong night.' },
  { id: 'sneho5', name: 'Forbidden Pact Seal',  cost: 5000, luckBonus: 600,  cursedChance: 0.20, cursedPenalty: -400,  emoji: '📜',  desc: 'Sign your soul away. Might be worth it.' },
  { id: 'sneho6', name: 'Cursed Coin',          cost: 50,   luckBonus: 20,   cursedChance: 0.65, cursedPenalty: -12,   emoji: '🪙',  desc: 'Suspiciously cheap.' },
  { id: 'sneho7', name: 'Hex Flask',            cost: 400,  luckBonus: 120,  cursedChance: 0.35, cursedPenalty: -75,   emoji: '💀',  desc: 'Handle with care. Or don\'t.' },
];

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

function buyPotion(potionId, fromBenny = false) {
  const pool = fromBenny
    ? [...POTIONS.map((p) => ({ ...p, cost: Math.max(1, Math.floor(p.cost * 0.9)) })), ...BENNY_EXCLUSIVE_POTIONS]
    : getCurrentShopOffers();
  const potion = pool.find((p) => p.id === potionId);
  if (!potion || getCoins() < potion.cost) return;
  setCoins(getCoins() - potion.cost);
  setLuckMultiplier(getLuckMultiplier() + potion.luckBonus);
  renderCoins();
  renderLuck();
  renderShop();
  if (fromBenny) renderBennyShop();
}

function buyPotionMax(potionId, fromBenny = false) {
  const pool = fromBenny
    ? [...POTIONS.map((p) => ({ ...p, cost: Math.max(1, Math.floor(p.cost * 0.9)) })), ...BENNY_EXCLUSIVE_POTIONS]
    : getCurrentShopOffers();
  const potion = pool.find((p) => p.id === potionId);
  if (!potion || potion.cost < 1) return;
  const coins = getCoins();
  const count = Math.floor(coins / potion.cost);
  if (count < 1) return;
  setCoins(coins - potion.cost * count);
  setLuckMultiplier(getLuckMultiplier() + potion.luckBonus * count);
  renderCoins();
  renderLuck();
  renderShop();
  if (fromBenny) renderBennyShop();
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
          <span class="shop-item-effect">+${p.luckBonus}× luck for next roll</span>
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

function openBenny() {
  hideBennyButton();
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
  ];
  list.innerHTML = bennyPrices.map(
    (p) => {
      const canBuy = coins >= p.cost;
      const maxCount = Math.floor(coins / p.cost);
      const canBuyMax = maxCount >= 1;
      return `<div class="shop-item">
        <span class="shop-item-emoji">${p.emoji}</span>
        <div class="shop-item-info">
          <span class="shop-item-name">${p.name}</span>
          <span class="shop-item-effect">+${p.luckBonus}× luck (Benny's price)</span>
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
  return indices.slice(0, 3).map((i) => SNEHO_ITEMS[i]);
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
  const cursed = Math.random() < item.cursedChance;
  const effect = cursed ? item.cursedPenalty : item.luckBonus;
  const newLuck = Math.max(1, getLuckMultiplier() + effect);
  setLuckMultiplier(newLuck);
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
    const pctCursed = Math.round(item.cursedChance * 100);
    return `<div class="shop-item sneho-item">
      <span class="shop-item-emoji">${item.emoji}</span>
      <div class="shop-item-info">
        <span class="shop-item-name sneho-item-name">${item.name}</span>
        <span class="shop-item-cost">${item.cost.toLocaleString()} coins</span>
        <span class="sneho-odds">${100 - pctCursed}% blessed (+${item.luckBonus}×) &nbsp;|&nbsp; ${pctCursed}% cursed (${item.cursedPenalty}×)</span>
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

// Memory match: 4×4 grid, 8 pairs. Reward: +0.5 luck on win.
const MEMORY_SYMBOLS = ['🎲', '🎰', '⭐', '🌟', '🔥', '💎', '🔮', '✨'];
let memoryCards = [];
let memoryFlipped = [];
let memoryMatched = new Set();
let memoryBusy = false;

function startMemoryGame() {
  const pairs = [...MEMORY_SYMBOLS, ...MEMORY_SYMBOLS];
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  memoryCards = pairs.map((symbol, i) => ({ id: i, symbol }));
  memoryFlipped = [];
  memoryMatched = new Set();
  memoryBusy = false;
  renderMemoryMatch();
}

function onMemoryCardClick(index) {
  if (memoryBusy || memoryFlipped.includes(index) || memoryMatched.has(memoryCards[index].symbol)) return;
  memoryFlipped.push(index);
  renderMemoryMatch();
  if (memoryFlipped.length === 2) {
    const [a, b] = memoryFlipped;
    const match = memoryCards[a].symbol === memoryCards[b].symbol;
    memoryBusy = true;
    setTimeout(() => {
      if (match) {
        memoryMatched.add(memoryCards[a].symbol);
        if (memoryMatched.size === MEMORY_SYMBOLS.length) {
          setLuckMultiplier(getLuckMultiplier() + 10);
          renderLuck();
        }
      }
      memoryFlipped = [];
      memoryBusy = false;
      renderMemoryMatch();
    }, 600);
  }
}

function renderMemoryMatch() {
  const grid = document.getElementById('memory-grid');
  const status = document.getElementById('memory-status');
  if (!grid) return;
  if (memoryCards.length === 0) {
    startMemoryGame();
    return;
  }
  const won = memoryMatched.size === MEMORY_SYMBOLS.length;
  if (status) status.textContent = won ? 'You won! +10× luck. Play again?' : `Matches: ${memoryMatched.size} / ${MEMORY_SYMBOLS.length}`;
  grid.innerHTML = memoryCards
    .map((card, i) => {
      const isFlipped = memoryFlipped.includes(i) || memoryMatched.has(card.symbol);
      return `<button type="button" class="memory-card ${isFlipped ? 'flipped' : ''}" data-index="${i}" ${won ? 'disabled' : ''}>${isFlipped ? card.symbol : '?'}</button>`;
    })
    .join('');
  grid.querySelectorAll('.memory-card').forEach((btn) => {
    btn.addEventListener('click', () => onMemoryCardClick(parseInt(btn.dataset.index, 10)));
  });
}

// ——— Hub (global chat + trading) ———
const HUB_USERNAME_KEY = 'rng_hub_username';
const HUB_USERNAME_SET_AT_KEY = 'rng_hub_username_set_at';
const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
let hubChatSubscription = null;
let hubTradesSubscription = null;

function getHubUsername() {
  return (localStorage.getItem(HUB_USERNAME_KEY) || '').trim().slice(0, 24);
}
function getUsernameSetAt() {
  return parseInt(localStorage.getItem(HUB_USERNAME_SET_AT_KEY) || '0', 10);
}
function getUsernameCooldownMs() {
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
function setHubUsername(name) {
  const trimmed = (name || '').trim().slice(0, 24);
  const current = getHubUsername();
  if (trimmed === current) return; // no actual change
  const cooldown = getUsernameCooldownMs();
  if (cooldown > 0) return; // blocked — caller should check and show message
  localStorage.setItem(HUB_USERNAME_KEY, trimmed);
  if (trimmed) localStorage.setItem(HUB_USERNAME_SET_AT_KEY, String(Date.now()));
}

async function loadHubMessages() {
  const list = document.getElementById('hub-chat-list');
  if (!list || !supabase) return;
  const { data, error } = await supabase.from('messages').select('id, username, body, created_at').order('created_at', { ascending: true }).limit(100);
  if (error) {
    list.innerHTML = `<p class="hub-error">Could not load chat. Check your Supabase setup.</p>`;
    return;
  }
  list.innerHTML = (data || []).map((m) => `<div class="hub-msg"><span class="hub-msg-user">${escapeHtml(m.username || '?')}</span>: <span class="hub-msg-body">${escapeHtml(m.body || '')}</span></div>`).join('');
  list.scrollTop = list.scrollHeight;
}

async function sendHubMessage() {
  const input = document.getElementById('hub-chat-input');
  const body = (input?.value || '').trim().slice(0, 500);
  const username = getHubUsername();
  if (!body || !username || !supabase) return;
  const { error } = await supabase.from('messages').insert({ username, body });
  if (!error) input.value = '';
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
function setCasinoUsername(name) {
  setHubUsername(name);
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
      let html = '<p class="casino-vault-label">In vault (for itemflip):</p>';
      if (casinoAuraVault.length) {
        html += casinoAuraVault.map((a) => `<div class="casino-aura-row"><span class="history-text" style="font-family:'${a.font}';color:${a.color};font-weight:${a.fontWeight || '400'};font-style:${a.fontStyle || 'normal'};text-shadow:${a.textShadow || 'none'}">${escapeHtml(a.text)}</span><span class="history-rarity">${formatRarity(a.rarity)}</span><button type="button" class="hub-btn casino-withdraw-aura-btn" data-aura-id="${a.id}">Withdraw</button></div>`).join('');
      } else html += '<p class="casino-empty">No auras in vault. Deposit from Locked tab.</p>';
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
    }
    const auraSelect = document.getElementById('casino-itemflip-aura');
    if (auraSelect) {
      const opts = casinoAuraVault.map((a) => `<option value="${a.id}">${escapeHtml(a.text)} (${formatRarity(a.rarity)})</option>`).join('');
      auraSelect.innerHTML = opts ? `<option value="">Select aura</option>${opts}` : '<option value="">No auras in vault</option>';
    }
    await loadCasinoItemflipList();
    const linkCodeDisplay = document.getElementById('casino-link-code-display');
    if (linkCodeDisplay) linkCodeDisplay.textContent = '';
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
  } else {
    if (signupBtn) signupBtn.classList.remove('hidden');
    if (signinBtn) signinBtn.classList.remove('hidden');
    if (signoutBtn) signoutBtn.classList.add('hidden');
    if (userLabel) userLabel.classList.add('hidden');
    if (guestEl) guestEl.classList.remove('hidden');
    if (authedEl) authedEl.classList.add('hidden');
  }
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
}

async function authSignUp() {
  const email = document.getElementById('auth-signup-email')?.value?.trim();
  const password = document.getElementById('auth-signup-password')?.value;
  const displayName = document.getElementById('auth-signup-displayname')?.value?.trim()?.slice(0, 24) || '';
  const msg = document.getElementById('auth-signup-message');
  if (!email || !password || !supabase) return;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    if (msg) { msg.textContent = error.message; msg.style.color = 'var(--danger)'; }
    return;
  }
  if (data?.user && displayName) {
    await supabase.from('profiles').update({ display_name: displayName }).eq('id', data.user.id);
  }
  if (msg) { msg.textContent = 'Check your email to confirm, or sign in.'; msg.style.color = 'var(--roll)'; }
  setTimeout(() => { closeAuthOverlay(); refreshAuthProfile(); updateAuthUI(); renderBazaar(); }, 1500);
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

// ——— Bazaar ———
let bazaarCoinBalance = 0;

async function bazaarFetchBalance() {
  if (!authUser || !supabase) return 0;
  const { data } = await supabase.from('bazaar_wallets').select('coins_balance').eq('user_id', authUser.id).single();
  bazaarCoinBalance = data?.coins_balance ?? 0;
  return bazaarCoinBalance;
}

async function bazaarDepositCoins() {
  const amount = Math.floor(Number(document.getElementById('bazaar-deposit-amount')?.value || 0));
  if (!authUser || !supabase || amount <= 0) return;
  const localCoins = getCoins();
  if (localCoins < amount) return;
  const { data, error } = await supabase.rpc('bazaar_deposit_coins', { p_amount: amount });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) return;
  setCoins(localCoins - amount);
  bazaarCoinBalance = result.new_balance ?? 0;
  document.getElementById('bazaar-deposit-amount').value = '';
  renderCoins();
  renderBazaar();
}

async function bazaarWithdrawCoins() {
  const amount = Math.floor(Number(document.getElementById('bazaar-deposit-amount')?.value || 0));
  if (!authUser || !supabase || amount <= 0) return;
  const { data, error } = await supabase.rpc('bazaar_withdraw_coins', { p_amount: amount });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) return;
  setCoins(getCoins() + amount);
  bazaarCoinBalance = result.new_balance ?? 0;
  document.getElementById('bazaar-deposit-amount').value = '';
  renderCoins();
  renderBazaar();
}

async function bazaarLinkCasino() {
  const username = document.getElementById('bazaar-link-username')?.value?.trim()?.slice(0, 24) || '';
  const code = document.getElementById('bazaar-link-code')?.value?.trim()?.slice(0, 6) || '';
  if (!authUser || !supabase || !username || !code) return;
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

async function bazaarImportAura(auraId) {
  if (!authUser || !supabase) return;
  const { data, error } = await supabase.rpc('bazaar_import_aura_from_casino', { p_aura_id: auraId });
  const result = Array.isArray(data) ? data[0] : data;
  if (error) { alert('Import failed: ' + error.message); return; }
  if (!result?.success) { alert('Import failed: ' + (result?.message || 'Unknown error')); return; }
  await loadCasinoAuraVault();
  renderCasino();
  renderBazaar();
}

async function bazaarCreateListing(inventoryId, price) {
  if (!authUser || !supabase || !inventoryId || !price || price < 1) return;
  const { data, error } = await supabase.rpc('bazaar_create_listing', { p_inventory_id: inventoryId, p_price: price });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) return;
  renderBazaar();
}

async function bazaarBuyListing(listingId) {
  if (!authUser || !supabase) return;
  const { data, error } = await supabase.rpc('bazaar_buy_listing', { p_listing_id: listingId });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) return;
  renderBazaar();
}

async function bazaarCancelListing(listingId) {
  if (!authUser || !supabase) return;
  const { data, error } = await supabase.rpc('bazaar_cancel_listing', { p_listing_id: listingId });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) return;
  renderBazaar();
}

async function bazaarWithdrawAuraToCasino(inventoryId) {
  if (!authUser || !supabase) return;
  const { data, error } = await supabase.rpc('bazaar_withdraw_aura_to_casino', { p_inventory_id: inventoryId });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) return;
  await loadCasinoAuraVault();
  renderCasino();
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
  (async () => {
    await bazaarFetchBalance();
    if (coinsEl) coinsEl.textContent = bazaarCoinBalance.toLocaleString();
    const linkStatus = document.getElementById('bazaar-link-status');
    const linkForm = document.getElementById('bazaar-link-form');
    const linkUsernameInput = document.getElementById('bazaar-link-username');
    if (authProfile?.casino_username) {
      if (linkStatus) linkStatus.textContent = `Linked as ${escapeHtml(authProfile.casino_username)}`;
      if (linkForm) linkForm.classList.add('hidden');
    } else {
      if (linkStatus) linkStatus.textContent = 'Link your Casino vault to import auras.';
      if (linkForm) linkForm.classList.remove('hidden');
      if (linkUsernameInput && !linkUsernameInput.value) {
        const hubName = getCasinoUsername();
        if (hubName) linkUsernameInput.placeholder = `e.g. ${hubName}`;
      }
    }
    const { data: listings } = await supabase.from('bazaar_listings').select('id, seller_id, item_json, price').eq('status', 'listed').order('created_at', { ascending: false }).limit(50);
    const sellerIds = [...new Set((listings || []).map((l) => l.seller_id))];
    const sellerNames = {};
    if (sellerIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', sellerIds);
      (profs || []).forEach((p) => { sellerNames[p.id] = p.display_name; });
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
    const { data: casinoVault } = authProfile?.casino_username
      ? await supabase.from('casino_aura_inventory').select('id, item_json').eq('username', authProfile.casino_username).order('id', { ascending: false })
      : { data: [] };
    const vaultEl = document.getElementById('bazaar-casino-vault');
    if (vaultEl) {
      const vault = (casinoVault || []).map((r) => ({ id: r.id, ...(typeof r.item_json === 'string' ? (() => { try { return JSON.parse(r.item_json); } catch { return {}; } })() : r.item_json) }));
      vaultEl.innerHTML = vault.length
        ? vault.map((a) => `<div class="casino-aura-row"><span class="history-text" style="font-family:'${a.font}';color:${a.color}">${escapeHtml(a.text)}</span><span class="history-rarity">${formatRarity(a.rarity)}</span><button type="button" class="hub-btn bazaar-import-btn" data-aura-id="${a.id}">Import to Bazaar</button></div>`).join('')
        : '<p class="casino-empty">No auras in Casino vault. Link vault and deposit auras in Casino first.</p>';
      vaultEl.querySelectorAll('.bazaar-import-btn').forEach((btn) => btn.addEventListener('click', () => bazaarImportAura(Number(btn.dataset.auraId))));
    }
    const { data: inv } = await supabase.from('bazaar_seller_inventory').select('id, item_json').eq('user_id', authUser.id).order('id', { ascending: false });
    const invList = (inv || []).map((r) => ({ id: r.id, ...(typeof r.item_json === 'string' ? (() => { try { return JSON.parse(r.item_json); } catch { return {}; } })() : r.item_json) }));
    const invEl = document.getElementById('bazaar-inventory');
    if (invEl) {
      invEl.innerHTML = invList.length
        ? invList.map((a) => `<div class="casino-aura-row"><span class="history-text" style="font-family:'${a.font}';color:${a.color}">${escapeHtml(a.text)}</span><span class="history-rarity">${formatRarity(a.rarity)}</span><input type="number" class="casino-amount-input bazaar-price-input" placeholder="Price" min="1" data-id="${a.id}" /><button type="button" class="hub-btn bazaar-list-btn" data-id="${a.id}">List for sale</button><button type="button" class="hub-btn hub-btn--secondary bazaar-withdraw-aura-btn" data-id="${a.id}">To Casino</button></div>`).join('')
        : '<p class="casino-empty">No auras in Bazaar inventory. Import from Casino vault above.</p>';
      invEl.querySelectorAll('.bazaar-list-btn').forEach((btn) => {
        const id = Number(btn.dataset.id);
        const row = btn.closest('.casino-aura-row');
        const priceInput = row?.querySelector('.bazaar-price-input');
        btn.addEventListener('click', () => { const p = Math.floor(Number(priceInput?.value || 0)); if (p >= 1) bazaarCreateListing(id, p); });
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
  loadHubMessages();
  loadHubTrades();
  if (!hubChatSubscription) {
    hubChatSubscription = supabase.channel('hub-messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => loadHubMessages()).subscribe();
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
      return `<li class="history-item" data-index="${idx}" data-history-id="${id}">
          <button type="button" class="lock-btn" data-history-id="${id}" title="Lock — move to storage (no salvage)">🔒 Lock</button>
          <span class="history-text" style="font-family:'${h.font}';color:${h.color};font-weight:${h.fontWeight};font-style:${h.fontStyle};text-shadow:${h.textShadow}">${h.text}</span>
          <span class="history-rarity">${formatRarity(h.rarity)}</span>
          <button type="button" class="salvage-btn" data-index="${idx}" title="Salvage for ${coinsForSalvage(h.rarity)} coins${h.rarity >= 100 ? ' + possible scraps' : ''}">Salvage</button>
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
      return `<li class="history-item history-item--storage" data-locked-index="${idx}">
          <button type="button" class="unlock-btn" data-locked-index="${idx}" title="Unlock — send back to Past rolls">🔓 Unlock</button>
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
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });
  ['past', 'locked', 'shop', 'memory', 'hub', 'casino', 'bazaar', 'tycoon', 'store'].forEach((id) => {
    const panel = document.getElementById(`tab-${id}`);
    if (panel) {
      panel.classList.toggle('hidden', tabName !== id);
      panel.setAttribute('aria-hidden', tabName !== id);
    }
  });
  if (tabName === 'shop') renderShop();
  if (tabName === 'memory') renderMemoryMatch();
  if (tabName === 'hub') renderHub();
  if (tabName === 'casino') renderCasino();
  if (tabName === 'bazaar') renderBazaar();
  if (tabName === 'tycoon') renderTycoon();
  if (tabName === 'store')  renderStore();
}

const RARE_ROLL_THRESHOLD  = 100_000_000_000;   // Jerry broadcast threshold
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
};

function showRarityAnimation(item, tier) {
  return new Promise((resolve) => {
    const overlay  = document.getElementById('rarity-overlay');
    const tierEl   = document.getElementById('rarity-overlay-tier');
    const labelEl  = document.getElementById('rarity-overlay-label');
    const rarityEl = document.getElementById('rarity-overlay-rarity');
    const quoteEl  = document.getElementById('rarity-overlay-quote');
    if (!overlay) { resolve(); return; }

    // Set tier label
    if (tier === 'mythic') {
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

    // Set quote (mythic only)
    if (quoteEl) {
      const mythicConfig = MYTHIC_CUTSCENES[item.id];
      quoteEl.textContent = mythicConfig ? mythicConfig.quote : '';
      quoteEl.style.display = mythicConfig ? '' : 'none';
    }

    // Apply CSS custom properties for mythic theming
    if (tier === 'mythic') {
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
    overlay.classList.remove('hidden', 'rarity-overlay--global', 'rarity-overlay--universal', 'rarity-overlay--mythic');
    overlay.classList.add(`rarity-overlay--${tier}`);
    overlay.setAttribute('aria-hidden', 'false');

    const dismiss = () => {
      clearTimeout(timer);
      overlay.removeEventListener('click', dismiss);
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('rarity-overlay--global', 'rarity-overlay--universal', 'rarity-overlay--mythic');
      resolve();
    };

    const duration  = tier === 'mythic' ? 7000 : tier === 'universal' ? 5000 : 3000;
    const minView   = tier === 'mythic' ? 6000 : tier === 'universal' ? 4000 : 2500;
    const timer = setTimeout(dismiss, duration);
    // Only allow click-to-dismiss after the minimum mandatory view time
    setTimeout(() => overlay.addEventListener('click', dismiss, { once: true }), minView);
  });
}

async function reportRareRoll(item) {
  if (!supabase) return;
  const username = getHubUsername() || null;
  await supabase.from('rare_rolls').insert({
    username,
    aura_text: item.text,
    aura_rarity: item.rarity,
    font: item.font || null,
    color: item.color || null,
    font_weight: item.fontWeight || null,
    font_style: item.fontStyle || null,
    text_shadow: item.textShadow || null,
  });
}

async function roll() {
  if (isAnimating) return;
  const rollBtn = document.getElementById('roll-btn');
  if (rollBtn) rollBtn.disabled = true;

  const mult = getLuckMultiplier() + getGearBonus();
  const item = weightedRandom(mult);
  const history = getHistory();
  history.push({
    historyId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    id: item.id,
    text: item.text,
    font: item.font,
    color: item.color,
    fontWeight: item.fontWeight,
    fontStyle: item.fontStyle,
    textShadow: item.textShadow,
    rarity: item.rarity,
  });
  setHistory(history);
  if (mult > 1) setLuckMultiplier(1);

  const cutsceneSetting = getCutsceneThreshold();
  const cutsceneMin = cutsceneSetting === 'never' ? Infinity : Number(cutsceneSetting);
  if (item.rarity >= GLOBAL_THRESHOLD && item.rarity >= cutsceneMin) {
    let tier = 'global';
    if (item.rarity >= MYTHIC_THRESHOLD) tier = 'mythic';
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

  if (rollBtn) rollBtn.disabled = false;
}

function buyLuck() {
  const cost = luckCost(getLuckMultiplier());
  if (getCoins() < cost) return;
  setCoins(getCoins() - cost);
  setLuckMultiplier(getLuckMultiplier() + 5);
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
  { id: 'coin_s', name: 'Coin Pack S',   price: '$0.99', emoji: '🪙', reward: '5,000 coins',    type: 'coins',  amount: 5_000 },
  { id: 'coin_m', name: 'Coin Pack M',   price: '$4.99', emoji: '💰', reward: '30,000 coins',   type: 'coins',  amount: 30_000 },
  { id: 'coin_l', name: 'Coin Pack L',   price: '$9.99', emoji: '💎', reward: '75,000 coins',   type: 'coins',  amount: 75_000 },
  { id: 'luck_s', name: 'Luck Boost S',  price: '$1.99', emoji: '🍀', reward: 'x100 luck',      type: 'luck',   amount: 100 },
  { id: 'luck_l', name: 'Luck Boost L',  price: '$4.99', emoji: '⚡', reward: 'x1,000 luck',    type: 'luck',   amount: 1_000 },
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
  const rollBtn = document.getElementById('roll-btn');
  const luckBtn = document.getElementById('luck-btn');
  if (rollBtn) rollBtn.addEventListener('click', roll);
  if (luckBtn) luckBtn.addEventListener('click', buyLuck);
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  const memoryNewBtn = document.getElementById('memory-new-btn');
  if (memoryNewBtn) memoryNewBtn.addEventListener('click', startMemoryGame);

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

  renderTheo();
  renderSneho();

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
  setInterval(() => {
    const next = getBennyNextAt();
    if (next > 0 && Date.now() >= next) showBennyButton();
  }, 1000);
  setInterval(updateShopCountdown, 1000);
  setInterval(updateSnehoCountdown, 1000);

  document.getElementById('benny-popup-btn')?.addEventListener('click', openBenny);
  document.getElementById('benny-close')?.addEventListener('click', closeBenny);
  document.getElementById('benny-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'benny-overlay') closeBenny();
  });

  const hubUsernameInput = document.getElementById('hub-username');
  if (hubUsernameInput) {
    const hubUsernameCooldownMsg = document.getElementById('hub-username-cooldown');
    const updateHubCooldownUI = () => {
      const ms = getUsernameCooldownMs();
      if (ms > 0) {
        hubUsernameInput.disabled = true;
        hubUsernameInput.title = `Username locked for ${formatCooldown(ms)}`;
        if (hubUsernameCooldownMsg) hubUsernameCooldownMsg.textContent = `Username locked — can change again in ${formatCooldown(ms)}`;
      } else {
        hubUsernameInput.disabled = false;
        hubUsernameInput.title = '';
        if (hubUsernameCooldownMsg) hubUsernameCooldownMsg.textContent = '';
      }
    };
    updateHubCooldownUI();
    setInterval(updateHubCooldownUI, 60000);
    hubUsernameInput.addEventListener('change', () => {
      const before = getHubUsername();
      setHubUsername(hubUsernameInput.value);
      const after = getHubUsername();
      if (after !== before) updateHubCooldownUI();
      else hubUsernameInput.value = before; // revert if blocked
    });
  }
  document.getElementById('hub-chat-send')?.addEventListener('click', sendHubMessage);
  document.getElementById('hub-chat-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendHubMessage(); });
  document.getElementById('hub-trade-post')?.addEventListener('click', postHubTrade);

  const casinoUsernameInput = document.getElementById('casino-username');
  if (casinoUsernameInput) {
    const casinoUsernameCooldownMsg = document.getElementById('casino-username-cooldown');
    const updateCasinoCooldownUI = () => {
      const ms = getUsernameCooldownMs();
      if (ms > 0) {
        casinoUsernameInput.disabled = true;
        casinoUsernameInput.title = `Username locked for ${formatCooldown(ms)}`;
        if (casinoUsernameCooldownMsg) casinoUsernameCooldownMsg.textContent = `Username locked — can change again in ${formatCooldown(ms)}`;
      } else {
        casinoUsernameInput.disabled = false;
        casinoUsernameInput.title = '';
        if (casinoUsernameCooldownMsg) casinoUsernameCooldownMsg.textContent = '';
      }
    };
    updateCasinoCooldownUI();
    casinoUsernameInput.addEventListener('change', () => {
      const before = getHubUsername();
      setCasinoUsername(casinoUsernameInput.value);
      const after = getHubUsername();
      if (after !== before) updateCasinoCooldownUI();
      else casinoUsernameInput.value = before;
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
  document.getElementById('bazaar-deposit-btn')?.addEventListener('click', bazaarDepositCoins);
  document.getElementById('bazaar-withdraw-btn')?.addEventListener('click', bazaarWithdrawCoins);
  document.getElementById('bazaar-link-btn')?.addEventListener('click', bazaarLinkCasino);

  if (supabase) {
    supabase.auth.getSession().then(({ data: { session } }) => {
      authUser = session?.user ?? null;
      if (authUser) refreshAuthProfile().then(() => { updateAuthUI(); });
      else updateAuthUI();
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      authUser = session?.user ?? null;
      if (authUser) refreshAuthProfile().then(() => { updateAuthUI(); renderBazaar(); });
      else { authProfile = null; updateAuthUI(); renderBazaar(); }
    });
  } else {
    updateAuthUI();
  }

  document.getElementById('casino-generate-link-code-btn')?.addEventListener('click', casinoGenerateLinkCode);

  advanceShopRotationIfNeeded();
  renderCoins();
  renderLuck();
  renderHistory();
  renderLockedStorage();
  const last = getHistory()[getHistory().length - 1];
  if (last) renderResult(last);
}

init();
