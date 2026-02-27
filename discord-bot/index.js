import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { createClient } from '@supabase/supabase-js';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// ── Global Biome Config ────────────────────────────────────────────────────
const BIOME_CHANCE           = 1 / 5;      // 20% per minute → avg 1 biome every 5 min
const RARE_BIOME_CHANCE      = 1 / 10_000; // 0.01% per minute → ~1 per week
const BIOME_DURATION_MINUTES = 5;

const BIOMES = [
  { type: 'volcanic',  name: 'Volcanic Surge',      emoji: '🌋', color: 0xFF4400, desc: 'The earth cracks open. Magma mythics rise from the deep.' },
  { type: 'celestial', name: 'Celestial Alignment',  emoji: '✨', color: 0xFFD700, desc: 'The cosmos aligns. Starbound auras manifest across the sky.' },
  { type: 'void',      name: 'Void Convergence',     emoji: '🌑', color: 0x8800FF, desc: 'Ancient darkness stirs. Void auras breach the surface.' },
  { type: 'crystal',   name: 'Crystal Resonance',    emoji: '💎', color: 0x00FFFF, desc: 'Reality crystallizes. Prismatic auras take form from thin air.' },
  { type: 'storm',     name: 'Tempest Protocol',     emoji: '⚡', color: 0xFFFFFF, desc: 'The sky tears apart. Storm auras overcharge with raw power.' },
];

const RARE_BIOMES = [
  { type: 'divine_collapse',  name: 'Divine Collapse',  emoji: '⚱️', color: 0xFFD700, desc: 'The heavens fracture. What was divine spills down in ruin. Mythical power beyond reckoning.' },
  { type: 'astral_fracture',  name: 'Astral Fracture',  emoji: '🌌', color: 0xAADDFF, desc: 'The stellar membrane tears. Something older than stars bleeds through the rift.' },
  { type: 'primordial_storm', name: 'Primordial Storm', emoji: '🌪️', color: 0xFF8800, desc: 'Chaos before creation. The first storm that ever existed — and it never stopped.' },
  { type: 'null',             name: 'NULL',             emoji: '⬛', color: 0x444444, desc: 'Everything is unavailable. Including this message.' },
];

if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing required environment variables. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const discord = new Client({ intents: [GatewayIntentBits.Guilds] });
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function formatRarity(rarity) {
  if (rarity === -1) return 'UNOBTAINABLE';
  if (rarity === 0) return 'SECRET';
  if (rarity >= 1e18) return `1 / ${(rarity / 1e18).toFixed(2)}Qi`;
  if (rarity >= 1e15) return `1 / ${(rarity / 1e15).toFixed(2)}Q`;
  if (rarity >= 1e12) return `1 / ${(rarity / 1e12).toFixed(2)}T`;
  if (rarity >= 1e9)  return `1 / ${(rarity / 1e9).toFixed(1)}B`;
  if (rarity >= 1e6)  return `1 / ${(rarity / 1e6).toFixed(1)}M`;
  if (rarity >= 1e3)  return `1 / ${(rarity / 1e3).toFixed(1)}K`;
  return `1 / ${rarity}`;
}

function rarityColor(rarity) {
  if (rarity === -1)           return 0xFFD700; // gold — unobtainable
  if (rarity === 0)            return 0xFF0000; // red — secret aura
  if (rarity >= 1_000_000_000) return 0xFFD700; // gold — 1B+
  if (rarity >= 500_000_000)   return 0xFF4500; // red-orange — 500M+
  if (rarity >= 100_000_000)   return 0x9B59B6; // purple — 100M+
  return 0x3498DB;
}

const TIER_CONFIG = {
  UNOBTAINABLE: { title: '♔ UNOBTAINABLE AURA SUMMONED', color: 0xFFD700, emoji: '♔',
    desc: (player, name) => `${player} has summoned **${name}** — an aura that should not exist.\n\n*It was never meant to be obtained. Yet here it is.*`,
    rarityText: '**UNOBTAINABLE** *(1 in 1,000 per Supreme Luck Potion)*',
    footer: "Nico's RNG • nicos-rng.netlify.app • The impossible happened." },
  EMPEROR: { title: '♛ EMPEROR AURA UNLOCKED', color: 0xFFD700, emoji: '♛',
    desc: (player, name) => `${player} has unlocked **${name}** — a legendary Emperor Aura.\n\n*Only those who have conquered the impossible may claim this crown.*`,
    rarityText: null,
    footer: "Nico's RNG • nicos-rng.netlify.app • All hail." },
  ASCENDANT: { title: '⬡ ASCENDANT AURA UNLOCKED', color: 0x00DDAA, emoji: '⬡',
    desc: (player, name) => `${player} has unlocked **${name}** — a rare Ascendant Aura.\n\n*Earned through perseverance beyond what most would endure.*`,
    rarityText: null,
    footer: "Nico's RNG • nicos-rng.netlify.app • Ascension complete." },
  ELDER: { title: '⬡ ELDER AURA UNLOCKED', color: 0xFFD700, emoji: '⬡',
    desc: (player, name) => `${player} has unlocked **${name}** — an Elder Aura.\n\n*Hidden behind ancient conditions. Discovered by the devoted.*`,
    rarityText: null,
    footer: "Nico's RNG • nicos-rng.netlify.app • The elders acknowledge you." },
  TIER2: { title: '✦ TIER 2 AURA UNLOCKED', color: 0xFFD700, emoji: '✦',
    desc: (player, name) => `${player} has unlocked **${name}** — a Tier 2 Aura.\n\n*Beyond the Supreme King. What lies after the throne.*`,
    rarityText: null,
    footer: "Nico's RNG • nicos-rng.netlify.app • Beyond Supreme." },
};

async function fetchChannel() {
  try {
    const channel = await discord.channels.fetch(DISCORD_CHANNEL_ID);
    if (!channel) { console.error('[announceRoll] Channel is null'); return null; }
    if (!channel.isTextBased()) { console.error(`[announceRoll] Not a text channel (type: ${channel.type})`); return null; }
    const me = channel.guild?.members?.me;
    if (me) {
      const perms = channel.permissionsFor(me);
      const canSend = perms?.has(PermissionsBitField.Flags.SendMessages);
      const canEmbed = perms?.has(PermissionsBitField.Flags.EmbedLinks);
      console.log(`[announceRoll] Permissions — SendMessages: ${canSend}, EmbedLinks: ${canEmbed}`);
      if (!canSend || !canEmbed) { console.error('[announceRoll] Missing permissions'); return null; }
    }
    return channel;
  } catch (err) {
    console.error(`[announceRoll] Failed to fetch channel: ${err.message}`);
    return null;
  }
}

async function announceRoll(roll) {
  console.log(`[announceRoll] Fetching channel ${DISCORD_CHANNEL_ID}...`);
  const channel = await fetchChannel();
  if (!channel) return;

  const tier = roll.aura_tier || null;
  const isSecret = tier === 'SECRET' || roll.aura_rarity === 0;
  const player = roll.username ? `**${roll.username}**` : 'An anonymous player';
  const rarityStr = formatRarity(roll.aura_rarity);
  const timestamp = `<t:${Math.floor(new Date(roll.rolled_at).getTime() / 1000)}:R>`;

  let embed;

  const tierCfg = TIER_CONFIG[tier];
  if (tierCfg) {
    embed = new EmbedBuilder()
      .setTitle(tierCfg.title)
      .setDescription(tierCfg.desc(player, roll.aura_text))
      .addFields(
        { name: 'Rarity', value: tierCfg.rarityText || `**${rarityStr}** *(display only)*`, inline: true },
        { name: 'Discovered', value: timestamp, inline: true },
      )
      .setColor(tierCfg.color)
      .setFooter({ text: tierCfg.footer });
  } else if (isSecret) {
    embed = new EmbedBuilder()
      .setTitle('⚠️ SECRET AURA DISCOVERED')
      .setDescription(
        `${player} has unlocked a **${roll.aura_text}** — a hidden aura that was never supposed to exist.\n\n` +
        `*This aura cannot be rolled. It can only be awakened.*`
      )
      .addFields(
        { name: 'Rarity', value: '**SECRET** *(1 in 5,000,000 per Ultraluck)*', inline: true },
        { name: 'Discovered', value: timestamp, inline: true },
      )
      .setColor(0xFF0000)
      .setFooter({ text: "Nico's RNG • nicos-rng.netlify.app • This should not have happened." });
  } else {
    embed = new EmbedBuilder()
      .setTitle('🎲 Rare Aura Rolled!')
      .setDescription(`${player} just rolled a **${roll.aura_text}** on [Nico's RNG](https://nicos-rng.netlify.app)!`)
      .addFields(
        { name: 'Rarity', value: rarityStr, inline: true },
        { name: 'Rolled at', value: timestamp, inline: true },
      )
      .setColor(rarityColor(roll.aura_rarity))
      .setFooter({ text: "Nico's RNG • nicos-rng.netlify.app" });
  }

  try {
    await channel.send({ embeds: [embed] });
    console.log(`[announceRoll] ✓ Announced: ${roll.aura_text} (${rarityStr}) [tier: ${tier || 'normal'}] by ${roll.username || 'anon'}`);
  } catch (err) {
    console.error(`[announceRoll] Failed to send message: ${err.message}`);
  }
}

discord.once('ready', async () => {
  console.log(`Jerry is online as ${discord.user.tag}`);
  console.log(`Channel ID: ${DISCORD_CHANNEL_ID}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);

  // Test channel access on startup
  try {
    const ch = await discord.channels.fetch(DISCORD_CHANNEL_ID);
    console.log(`[startup] Channel found: #${ch.name} in ${ch.guild?.name}`);
  } catch (err) {
    console.error(`[startup] Cannot access channel ${DISCORD_CHANNEL_ID}: ${err.message}`);
    console.error(`[startup] Make sure Jerry is in the server and the channel ID is correct.`);
  }

  console.log('Watching for rare rolls on Supabase Realtime...');

  let realtimeChannel = null;

  function subscribeRealtime() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel).catch(() => {});
    }
    realtimeChannel = supabase
      .channel('rare-rolls-broadcast-' + Date.now())
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rare_rolls' },
        (payload) => {
          console.log('[realtime] New rare roll received:', payload.new);
          announceRoll(payload.new).catch(console.error);
        }
      )
      .subscribe((status) => {
        console.log('[realtime] Supabase Realtime status:', status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.log('[realtime] Reconnecting in 10 seconds...');
          setTimeout(subscribeRealtime, 10_000);
        }
      });
  }

  subscribeRealtime();

  // ── Biome trigger — checked every 60 seconds ─────────────────────────────
  async function triggerBiome(biome, isRare = false) {
    // Don't stack biomes — skip if one is already active
    const { data: existing } = await supabase
      .from('active_biome')
      .select('id')
      .gt('ends_at', new Date().toISOString())
      .limit(1);
    if (existing && existing.length > 0) return false;

    const endsAt = new Date(Date.now() + BIOME_DURATION_MINUTES * 60_000).toISOString();
    const { error } = await supabase.from('active_biome').insert({
      biome_type: biome.type,
      biome_name: biome.name,
      ends_at: endsAt,
    });
    if (error) { console.error('[biome] Failed to insert biome:', error.message); return false; }

    console.log(`[biome${isRare ? ':RARE' : ''}] Triggered: ${biome.name} (${biome.type}) for ${BIOME_DURATION_MINUTES} min`);

    const channel = await fetchChannel();
    if (!channel) return true;

    const isNull = biome.type === 'null';
    const embed = new EmbedBuilder()
      .setTitle(isRare
        ? `${biome.emoji} ⚠ RARE BIOME — ${biome.name.toUpperCase()}`
        : `${biome.emoji} GLOBAL BIOME — ${biome.name.toUpperCase()}`)
      .setDescription(
        isNull
          ? `${biome.desc}\n\n` +
            `**THE NOTHING** can be discovered for the next **${BIOME_DURATION_MINUTES} minutes**.\n\n` +
            `Roll now on [Nico's RNG](https://nicos-rng.netlify.app) — if anything is even there.`
          : `${biome.desc}\n\n` +
            `**${isRare ? 'Mythical' : 'Biome-exclusive quintillion-rare'} auras** can now be discovered for the next **${BIOME_DURATION_MINUTES} minutes**.\n\n` +
            `Roll now on [Nico's RNG](https://nicos-rng.netlify.app) before it ends!`
      )
      .setColor(biome.color)
      .setFooter({ text: `Nico's RNG • Active for the next ${BIOME_DURATION_MINUTES} minutes${isRare ? ' • RARE EVENT' : ''}` });

    try { await channel.send({ embeds: [embed] }); } catch (err) {
      console.error('[biome] Failed to announce:', err.message);
    }
    return true;
  }

  setInterval(async () => {
    // Rare biome check (1/10,000) — runs first; if triggered, skips common check
    if (Math.random() < RARE_BIOME_CHANCE) {
      const rareBiome = RARE_BIOMES[Math.floor(Math.random() * RARE_BIOMES.length)];
      const triggered = await triggerBiome(rareBiome, true);
      if (triggered) return;
    }

    // Common biome check (1/5)
    if (Math.random() >= BIOME_CHANCE) return;
    const biome = BIOMES[Math.floor(Math.random() * BIOMES.length)];
    await triggerBiome(biome, false);
  }, 60_000);
});

discord.login(DISCORD_BOT_TOKEN);
