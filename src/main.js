import './style.css';
import { ITEMS } from './data/items.js';
import { supabase, isHubAvailable } from './supabase.js';

const STORAGE_KEYS = {
  coins: 'rng_coins', history: 'rng_history', luck: 'rng_luck', locked: 'rng_locked', lockedStorage: 'rng_locked_storage',
  shopRotationEnd: 'rng_shop_rotation_end', shopSeed: 'rng_shop_seed',
  bennyNextAt: 'rng_benny_next_at',
};
const SHOP_ROTATION_MS = 5 * 60 * 1000;  // 5 minutes
const BENNY_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

function getCoins() {
  return Number(localStorage.getItem(STORAGE_KEYS.coins) || 0);
}
function setCoins(n) {
  localStorage.setItem(STORAGE_KEYS.coins, String(Math.max(0, Math.floor(n))));
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
  const weights = ITEMS.map((i) => Math.pow(i.weight, 1 / multiplier));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < ITEMS.length; i++) {
    r -= weights[i];
    if (r <= 0) return { ...ITEMS[i], index: i };
  }
  return { ...ITEMS[ITEMS.length - 1], index: ITEMS.length - 1 };
}

function formatRarity(rarity) {
  if (rarity >= 1e9) return `1 / ${(rarity / 1e9).toFixed(1)}B`;
  if (rarity >= 1e6) return `1 / ${(rarity / 1e6).toFixed(1)}M`;
  if (rarity >= 1e3) return `1 / ${(rarity / 1e3).toFixed(1)}K`;
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
  const el = document.getElementById('luck-value');
  const btn = document.getElementById('luck-btn');
  if (el) el.textContent = m === 1 ? '1× (normal)' : `${m.toFixed(1)}×`;
  if (btn) {
    const cost = luckCost(m);
    btn.textContent = `Boost luck (${cost} coins)`;
    btn.disabled = getCoins() < cost;
  }
}

function luckCost(currentMult) {
  if (currentMult <= 1) return 50;
  return Math.floor(100 * (currentMult + 0.5));
}

// Shop potions: id, name, cost, luckBonus (added to current multiplier for next roll)
const POTIONS = [
  { id: 'potion1', name: 'Minor Luck Potion', cost: 25, luckBonus: 0.25, emoji: '🧪' },
  { id: 'potion2', name: 'Luck Potion', cost: 50, luckBonus: 0.5, emoji: '⚗️' },
  { id: 'potion3', name: 'Greater Luck Potion', cost: 120, luckBonus: 1, emoji: '🔮' },
  { id: 'potion4', name: 'Supreme Luck Elixir', cost: 300, luckBonus: 1.5, emoji: '✨' },
  { id: 'potion5', name: 'Mythic Fortune Brew', cost: 700, luckBonus: 2, emoji: '🌟' },
];
// Very rare spawn in rotating shop only (not in Benny's list)
const LEGENDARY_LUCK_POTION = { id: 'potionLegendary3000', name: '3000× Luck Elixir', cost: 5000, luckBonus: 2999, emoji: '👑' };
const LEGENDARY_POTION_SPAWN_CHANCE = 0.008;

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
  const pool = fromBenny ? POTIONS : getCurrentShopOffers();
  const potion = pool.find((p) => p.id === potionId);
  if (!potion || getCoins() < potion.cost) return;
  setCoins(getCoins() - potion.cost);
  setLuckMultiplier(getLuckMultiplier() + potion.luckBonus);
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
    (p) =>
      `<div class="shop-item">
        <span class="shop-item-emoji">${p.emoji}</span>
        <div class="shop-item-info">
          <span class="shop-item-name">${p.name}</span>
          <span class="shop-item-effect">+${p.luckBonus}× luck for next roll</span>
        </div>
        <button type="button" class="shop-buy-btn" data-potion="${p.id}" data-benny="false" ${coins < p.cost ? 'disabled' : ''}>
          ${p.cost} coins
        </button>
      </div>`
  ).join('');
  list.querySelectorAll('.shop-buy-btn').forEach((btn) => {
    btn.addEventListener('click', () => buyPotion(btn.dataset.potion, false));
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
  const bennyPrices = POTIONS.map((p) => ({ ...p, cost: Math.max(1, Math.floor(p.cost * 0.9)) }));
  list.innerHTML = bennyPrices.map(
    (p) =>
      `<div class="shop-item">
        <span class="shop-item-emoji">${p.emoji}</span>
        <div class="shop-item-info">
          <span class="shop-item-name">${p.name}</span>
          <span class="shop-item-effect">+${p.luckBonus}× luck (Benny's price)</span>
        </div>
        <button type="button" class="shop-buy-btn" data-potion="${p.id}" data-benny="true" ${coins < p.cost ? 'disabled' : ''}>
          ${p.cost} coins
        </button>
      </div>`
  ).join('');
  list.querySelectorAll('.shop-buy-btn').forEach((btn) => {
    btn.addEventListener('click', () => buyPotion(btn.dataset.potion, true));
  });
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
          setLuckMultiplier(getLuckMultiplier() + 0.5);
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
  if (status) status.textContent = won ? 'You won! +0.5× luck. Play again?' : `Matches: ${memoryMatched.size} / ${MEMORY_SYMBOLS.length}`;
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
let hubChatSubscription = null;
let hubTradesSubscription = null;

function getHubUsername() {
  return (localStorage.getItem(HUB_USERNAME_KEY) || '').trim().slice(0, 24);
}
function setHubUsername(name) {
  localStorage.setItem(HUB_USERNAME_KEY, (name || '').trim().slice(0, 24));
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
  if (!username || !supabase) return;
  const { data, error } = await supabase.rpc('casino_withdraw_aura', { p_username: username, p_aura_id: auraId });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.success) {
    showCasinoMessage('casino-itemflip-msg', result?.message || error?.message || 'Withdraw failed', true);
    return;
  }
  const locked = getLockedStorage();
  locked.push(result.item_json);
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

async function loadCasinoItemflipList() {
  const list = document.getElementById('casino-itemflip-list');
  if (!list || !supabase) return;
  const { data: openList } = await supabase.from('itemflip_challenges').select('id, creator_username, creator_aura_id, status, acceptor_username, acceptor_aura_id').in('status', ['open', 'matched']).order('created_at', { ascending: false }).limit(30);
  const myAuras = casinoAuraVault.map((a) => a.id);
  const rows = (openList || []).map((c) => {
    const creatorMe = c.creator_username === getCasinoUsername();
    if (c.status === 'open' && !creatorMe) {
      const options = casinoAuraVault.map((a) => `<option value="${a.id}">${escapeHtml(a.text)} (${formatRarity(a.rarity)})</option>`).join('');
      return `<div class="casino-row"><span class="casino-row-desc">${escapeHtml(c.creator_username)} — 1 aura</span><select class="casino-select casino-select--inline" data-challenge-id="${c.id}">${options ? `<option value="">Your aura</option>${options}` : '<option value="">No auras</option>'}</select><button type="button" class="hub-btn casino-itemflip-accept-btn" data-challenge-id="${c.id}">Accept</button></div>`;
    }
    if (c.status === 'matched') {
      const me = getCasinoUsername();
      const canResolve = me && (c.creator_username === me || c.acceptor_username === me);
      return `<div class="casino-row"><span class="casino-row-desc">${escapeHtml(c.creator_username)} vs ${escapeHtml(c.acceptor_username || '?')}</span>${canResolve ? `<button type="button" class="hub-btn casino-itemflip-resolve-btn" data-id="${c.id}">Resolve</button>` : '<span class="casino-wait">Waiting</span>'}</div>`;
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
      vaultEl.querySelectorAll('.casino-withdraw-aura-btn').forEach((btn) => btn.addEventListener('click', () => casinoWithdrawAura(Number(btn.dataset.auraId))));
      vaultEl.querySelectorAll('.casino-deposit-aura-btn').forEach((btn) => btn.addEventListener('click', () => casinoDepositAura(Number(btn.dataset.lockedIndex))));
    }
    const auraSelect = document.getElementById('casino-itemflip-aura');
    if (auraSelect) {
      const opts = casinoAuraVault.map((a) => `<option value="${a.id}">${escapeHtml(a.text)} (${formatRarity(a.rarity)})</option>`).join('');
      auraSelect.innerHTML = opts ? `<option value="">Select aura</option>${opts}` : '<option value="">No auras in vault</option>';
    }
    await loadCasinoItemflipList();
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
          <button type="button" class="salvage-btn" data-index="${idx}" title="Salvage for ${coinsForSalvage(h.rarity)} coins">Salvage</button>
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
  ['past', 'locked', 'shop', 'memory', 'hub', 'casino'].forEach((id) => {
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
}

function roll() {
  const mult = getLuckMultiplier();
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
  renderResult(item);
  renderHistory();
  renderCoins();
  renderLuck();
}

function buyLuck() {
  const cost = luckCost(getLuckMultiplier());
  if (getCoins() < cost) return;
  setCoins(getCoins() - cost);
  setLuckMultiplier(getLuckMultiplier() + 0.5);
  renderCoins();
  renderLuck();
}

const ADMIN_CODE = 'banana';
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
    setTimeout(closeAdminPanel, 1500);
  } else {
    if (msg) msg.textContent = 'Invalid code.';
    if (msg) msg.style.color = 'var(--danger)';
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
  document.getElementById('admin-close')?.addEventListener('click', closeAdminPanel);
  document.getElementById('admin-code')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitAdminCode();
  });
  document.getElementById('admin-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'admin-overlay') closeAdminPanel();
  });

  initBennySchedule();
  setInterval(() => {
    const next = getBennyNextAt();
    if (next > 0 && Date.now() >= next) showBennyButton();
  }, 1000);
  setInterval(updateShopCountdown, 1000);

  document.getElementById('benny-popup-btn')?.addEventListener('click', openBenny);
  document.getElementById('benny-close')?.addEventListener('click', closeBenny);
  document.getElementById('benny-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'benny-overlay') closeBenny();
  });

  const hubUsernameInput = document.getElementById('hub-username');
  if (hubUsernameInput) hubUsernameInput.addEventListener('input', () => setHubUsername(hubUsernameInput.value));
  document.getElementById('hub-chat-send')?.addEventListener('click', sendHubMessage);
  document.getElementById('hub-chat-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendHubMessage(); });
  document.getElementById('hub-trade-post')?.addEventListener('click', postHubTrade);

  const casinoUsernameInput = document.getElementById('casino-username');
  if (casinoUsernameInput) casinoUsernameInput.addEventListener('input', () => setCasinoUsername(casinoUsernameInput.value));
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

  advanceShopRotationIfNeeded();
  renderCoins();
  renderLuck();
  renderHistory();
  renderLockedStorage();
  const last = getHistory()[getHistory().length - 1];
  if (last) renderResult(last);
}

init();
