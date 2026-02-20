import './style.css';
import { ITEMS } from './data/items.js';

const STORAGE_KEYS = { coins: 'rng_coins', history: 'rng_history', luck: 'rng_luck' };

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

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const history = getHistory();
  list.innerHTML = history
    .slice()
    .reverse()
    .map(
      (h, i) =>
        `<li class="history-item" data-index="${history.length - 1 - i}">
          <span class="history-text" style="font-family:'${h.font}';color:${h.color};font-weight:${h.fontWeight};font-style:${h.fontStyle};text-shadow:${h.textShadow}">${h.text}</span>
          <span class="history-rarity">${formatRarity(h.rarity)}</span>
          <button type="button" class="salvage-btn" data-index="${history.length - 1 - i}" title="Salvage for ${coinsForSalvage(h.rarity)} coins">Salvage</button>
        </li>`
    )
    .join('');
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

function roll() {
  const mult = getLuckMultiplier();
  const item = weightedRandom(mult);
  const history = getHistory();
  history.push({
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

function init() {
  const rollBtn = document.getElementById('roll-btn');
  const luckBtn = document.getElementById('luck-btn');
  if (rollBtn) rollBtn.addEventListener('click', roll);
  if (luckBtn) luckBtn.addEventListener('click', buyLuck);
  renderCoins();
  renderLuck();
  renderHistory();
  const last = getHistory()[getHistory().length - 1];
  if (last) renderResult(last);
}

init();
