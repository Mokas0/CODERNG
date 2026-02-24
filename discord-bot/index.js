import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { createClient } from '@supabase/supabase-js';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing required environment variables. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const discord = new Client({ intents: [GatewayIntentBits.Guilds] });
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function formatRarity(rarity) {
  if (rarity >= 1e9) return `1 / ${(rarity / 1e9).toFixed(1)}B`;
  if (rarity >= 1e6) return `1 / ${(rarity / 1e6).toFixed(1)}M`;
  if (rarity >= 1e3) return `1 / ${(rarity / 1e3).toFixed(1)}K`;
  return `1 / ${rarity}`;
}

function rarityColor(rarity) {
  if (rarity >= 1_000_000_000) return 0xFFD700; // gold  — 1B+
  if (rarity >= 500_000_000)   return 0xFF4500; // red-orange — 500M+
  if (rarity >= 100_000_000)   return 0x9B59B6; // purple — 100M+
  return 0x3498DB;
}

async function announceRoll(roll) {
  console.log(`[announceRoll] Fetching channel ${DISCORD_CHANNEL_ID}...`);
  let channel;
  try {
    channel = await discord.channels.fetch(DISCORD_CHANNEL_ID);
  } catch (err) {
    console.error(`[announceRoll] Failed to fetch channel: ${err.message}`);
    return;
  }

  if (!channel) {
    console.error(`[announceRoll] Channel is null — bot may not be in the server or channel ID is wrong`);
    return;
  }

  console.log(`[announceRoll] Channel type: ${channel.type}, isTextBased: ${channel.isTextBased()}`);

  if (!channel.isTextBased()) {
    console.error(`[announceRoll] Channel ${DISCORD_CHANNEL_ID} is not a text channel (type: ${channel.type})`);
    return;
  }

  // Check bot permissions in this channel
  const me = channel.guild?.members?.me;
  if (me) {
    const perms = channel.permissionsFor(me);
    const canSend = perms?.has(PermissionsBitField.Flags.SendMessages);
    const canEmbed = perms?.has(PermissionsBitField.Flags.EmbedLinks);
    console.log(`[announceRoll] Permissions — SendMessages: ${canSend}, EmbedLinks: ${canEmbed}`);
    if (!canSend || !canEmbed) {
      console.error(`[announceRoll] Missing permissions in channel. SendMessages: ${canSend}, EmbedLinks: ${canEmbed}`);
      return;
    }
  }

  const player = roll.username ? `**${roll.username}**` : 'An anonymous player';
  const rarityStr = formatRarity(roll.aura_rarity);

  const embed = new EmbedBuilder()
    .setTitle('🎲 Rare Aura Rolled!')
    .setDescription(`${player} just rolled a **${roll.aura_text}** on [Nico's RNG](https://nicos-rng.netlify.app)!`)
    .addFields(
      { name: 'Rarity', value: rarityStr, inline: true },
      { name: 'Rolled at', value: `<t:${Math.floor(new Date(roll.rolled_at).getTime() / 1000)}:R>`, inline: true },
    )
    .setColor(rarityColor(roll.aura_rarity))
    .setFooter({ text: "Nico's RNG • nicos-rng.netlify.app" });

  try {
    await channel.send({ embeds: [embed] });
    console.log(`[announceRoll] ✓ Announced: ${roll.aura_text} (${rarityStr}) by ${roll.username || 'anon'}`);
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

  supabase
    .channel('rare-rolls-broadcast')
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
    });
});

discord.login(DISCORD_BOT_TOKEN);
