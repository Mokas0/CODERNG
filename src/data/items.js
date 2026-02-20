// 500 rollable items: text, font, color, style. Rarity from 1/2 to 1/10 billion (log-spaced).
const TEXTS = [
  'LUCKY', 'JACKPOT', 'WIN', 'RARE', 'EPIC', 'LEGEND', 'MYTHIC', 'GOLD', 'STAR', 'FIRE',
  'ICE', 'VOID', 'SOUL', 'DRAGON', 'PHOENIX', 'ANGEL', 'DEMON', 'CROWN', 'SWORD', 'SHIELD',
  '777', '∞', '★', '♦', '♥', '♠', '♣', '⚡', '🔥', '💎', '🌟', '✨', '💫', '🎲', '🎰',
  'FORTUNE', 'CHAOS', 'ORDER', 'FATE', 'DESTINY', 'POWER', 'MAGIC', 'CURSE', 'BLESS', 'HOPE',
  'DOOM', 'GLORY', 'HONOR', 'VALOR', 'GRACE', 'WRATH', 'ZEAL', 'NOVA', 'PRIME', 'ALPHA',
  'OMEGA', 'ZERO', 'ONE', 'ECHO', 'PULSE', 'FLUX', 'CORE', 'EDGE', 'PEAK', 'VOID',
  'NEXUS', 'AXIOM', 'SIGIL', 'RUNE', 'CHARM', 'TOKEN', 'KEY', 'GATE', 'PORTAL', 'REALM',
  'DUSK', 'DAWN', 'NOON', 'MIDNIGHT', 'STORM', 'CALM', 'BLUR', 'SHINE', 'GLOW', 'FLARE',
  'BLAST', 'STRIKE', 'SLASH', 'CRUSH', 'PIERCE', 'GUARD', 'EVADE', 'RUSH', 'FLEET', 'SWIFT',
  'BOLD', 'PURE', 'TRUE', 'DARK', 'LIGHT', 'VOID', 'NULL', 'VOID', 'CHOSEN', 'CURSED',
  'BLESSED', 'SACRED', 'CURSED', 'FORGED', 'BORN', 'RISEN', 'FALLEN', 'LOST', 'FOUND', 'SOLD',
  'FREE', 'BOUND', 'WILD', 'TAME', 'RAW', 'REFINED', 'OLD', 'NEW', 'FIRST', 'LAST',
  'ALONE', 'UNITED', 'DIVIDED', 'WHOLE', 'BROKEN', 'MENDED', 'PURE', 'TAINTED', 'CLEAN', 'FOUL',
  'HOLY', 'UNHOLY', 'LIVING', 'DEAD', 'UNDEAD', 'ETERNAL', 'MORTAL', 'DIVINE', 'HUMAN', 'BEAST',
  'GHOST', 'SPIRIT', 'DEMON', 'ANGEL', 'SAINT', 'SINNER', 'HERO', 'VILLAIN', 'KING', 'QUEEN',
  'KNIGHT', 'MAGE', 'ROGUE', 'HEALER', 'WARRIOR', 'SAGE', 'FOOL', 'ORACLE', 'PROPHET', 'SEER',
  'GUARDIAN', 'SENTINEL', 'WARDEN', 'HUNTER', 'SLAYER', 'SEEKER', 'WALKER', 'RUNNER', 'RIDER', 'FLYER',
  'SHADOW', 'ECHO', 'MIRROR', 'TWIN', 'COPY', 'REAL', 'FAKE', 'TRUE', 'FALSE', 'HIDDEN',
  'SECRET', 'OPEN', 'CLOSED', 'LOCKED', 'UNLOCKED', 'SEALED', 'BROKEN', 'WHOLE', 'EMPTY', 'FULL',
  'RICH', 'POOR', 'HIGH', 'LOW', 'UP', 'DOWN', 'IN', 'OUT', 'HERE', 'THERE',
  'NOW', 'THEN', 'SOON', 'LATE', 'EARLY', 'FAST', 'SLOW', 'HOT', 'COLD', 'WARM',
  'WET', 'DRY', 'SOFT', 'HARD', 'SHARP', 'DULL', 'BRIGHT', 'DIM', 'LOUD', 'QUIET',
  'SWEET', 'SOUR', 'BITTER', 'SALTY', 'SPICY', 'MILD', 'WILD', 'MILD', 'CRAZY', 'SANE',
  'ALIVE', 'DEAD', 'AWAKE', 'ASLEEP', 'READY', 'NOT', 'YES', 'NO', 'MAYBE', 'NEVER',
  'ALWAYS', 'SOMETIMES', 'OFTEN', 'RARELY', 'ONCE', 'TWICE', 'THRICE', 'MANY', 'FEW', 'ALL',
  'NONE', 'SOME', 'MOST', 'MORE', 'LESS', 'SAME', 'DIFF', 'OTHER', 'ANOTHER', 'SELF',
  'FATE', 'LUCK', 'CHANCE', 'ROLL', 'DICE', 'CARD', 'COIN', 'SPIN', 'DROP', 'PULL',
  'DRAW', 'DEAL', 'SHUFFLE', 'MIX', 'BLEND', 'FUSE', 'SPLIT', 'MERGE', 'JOIN', 'PART',
  'BIND', 'RELEASE', 'HOLD', 'LET', 'TAKE', 'GIVE', 'KEEP', 'LOSE', 'GAIN', 'EARN',
  'SPEND', 'SAVE', 'WASTE', 'USE', 'ABUSE', 'CHERISH', 'HATE', 'LOVE', 'FEAR', 'HOPE',
  'DREAM', 'NIGHTMARE', 'VISION', 'PROPHECY', 'OMEN', 'SIGN', 'MARK', 'BRAND', 'SCAR', 'TATTOO',
  'INK', 'BLOOD', 'TEARS', 'SWEAT', 'GOLD', 'SILVER', 'BRONZE', 'IRON', 'STEEL', 'COPPER',
  'RUBY', 'EMERALD', 'SAPPHIRE', 'AMETHYST', 'TOPAZ', 'OPAL', 'JADE', 'PEARL', 'DIAMOND', 'ONYX',
  'JET', 'IVORY', 'EBONY', 'MAHOGANY', 'OAK', 'ASH', 'PINE', 'CEDAR', 'WILLOW', 'ELM',
  'ROSE', 'LILY', 'LOTUS', 'SUNFLOWER', 'DAISY', 'TULIP', 'VIOLET', 'IRIS', 'ORCHID', 'PEONY',
  'THORN', 'PETAL', 'STEM', 'ROOT', 'SEED', 'LEAF', 'BRANCH', 'TRUNK', 'BARK', 'SAP',
  'RIVER', 'OCEAN', 'LAKE', 'STREAM', 'WELL', 'SPRING', 'FALL', 'RAPIDS', 'CASCADE', 'DELTA',
  'MOUNTAIN', 'VALLEY', 'HILL', 'PEAK', 'SLOPE', 'CLIFF', 'CAVE', 'DEN', 'LAIR', 'NEST',
  'SKY', 'CLOUD', 'STAR', 'MOON', 'SUN', 'COMET', 'METEOR', 'AURORA', 'RAINBOW', 'STORM',
  'WIND', 'BREEZE', 'GALE', 'GUST', 'WHIRL', 'TWISTER', 'CYCLONE', 'HURRICANE', 'TYPHOON', 'MONSOON',
  'FROST', 'SNOW', 'HAIL', 'SLEET', 'RAIN', 'DRIZZLE', 'MIST', 'FOG', 'DEW', 'STEAM',
  'FLAME', 'EMBER', 'SPARK', 'BLAZE', 'INFERNO', 'BONFIRE', 'TORCH', 'LANTERN', 'CANDLE', 'MATCH',
  'SHARD', 'SLIVER', 'CHIP', 'CRUMB', 'GRAIN', 'DUST', 'ASH', 'SOOT', 'SMOKE', 'FUME',
  'BONE', 'SKULL', 'SPINE', 'RIB', 'CLAW', 'FANG', 'HORN', 'ANTLER', 'TUSK', 'BEAK',
  'WING', 'FEATHER', 'SCALE', 'SHELL', 'ARMOR', 'PLATE', 'MAIL', 'LEATHER', 'SILK', 'LINEN',
  'CHAIN', 'ROPE', 'CORD', 'THREAD', 'WIRE', 'NAIL', 'SCREW', 'BOLT', 'RIVET', 'PIN',
  'RING', 'BRACELET', 'NECKLACE', 'CROWN', 'TIARA', 'DIADEM', 'SCEPTER', 'ORB', 'STAFF', 'WAND',
  'SCROLL', 'TOME', 'CODEX', 'MANUAL', 'GUIDE', 'MAP', 'CHART', 'LIST', 'DEED', 'PACT',
  'OATH', 'VOW', 'PROMISE', 'PRAYER', 'CHANT', 'SONG', 'HYMN', 'ANTHEM', 'MARCH', 'WALTZ',
  'BEAT', 'RHYTHM', 'MELODY', 'HARMONY', 'CHORD', 'NOTE', 'TONE', 'PITCH', 'SOUND', 'SILENCE',
  'WORD', 'NAME', 'TITLE', 'LABEL', 'SIGN', 'SYMBOL', 'ICON', 'IMAGE', 'IDOL', 'IDEA',
  'THOUGHT', 'MIND', 'SOUL', 'HEART', 'WILL', 'DESIRE', 'NEED', 'WANT', 'WISH', 'DREAM',
  'FEAR', 'DOUBT', 'FAITH', 'TRUST', 'PRIDE', 'SHAME', 'GUILT', 'GRACE', 'MERCY', 'JUSTICE',
  'VENGEANCE', 'WRATH', 'FURY', 'RAGE', 'CALM', 'PEACE', 'WAR', 'STRIFE', 'CHAOS', 'ORDER',
  'BALANCE', 'SCALE', 'WEIGHT', 'MEASURE', 'COUNT', 'SUM', 'TOTAL', 'PART', 'PIECE', 'BIT',
  'LOT', 'FEW', 'MANY', 'MULTitude', 'LEGION', 'HORDE', 'SWARM', 'PACK', 'FLOCK', 'SCHOOL',
  'PRIDE', 'MURDER', 'CONGREGATION', 'COUNCIL', 'COURT', 'GUILD', 'ORDER', 'LEAGUE', 'BAND', 'CREW',
  'SQUAD', 'TEAM', 'UNIT', 'FORCE', 'ARMY', 'NAVY', 'FLEET', 'ARMADA', 'LEGION', 'COHORT',
  'SERIES', 'SEQUENCE', 'CHAIN', 'LINE', 'ROW', 'RANK', 'TIER', 'LEVEL', 'STAGE', 'PHASE',
  'STEP', 'LEAP', 'JUMP', 'BOUND', 'STRIDE', 'MARCH', 'WALK', 'RUN', 'RACE', 'CHASE',
  'HUNT', 'TRACK', 'TRAIL', 'PATH', 'ROAD', 'WAY', 'ROUTE', 'PASSAGE', 'GATE', 'DOOR',
  'PORTAL', 'BRIDGE', 'CROSSING', 'FORD', 'FERRY', 'RAFT', 'BOAT', 'SHIP', 'VESSEL', 'CRAFT',
  'VEHICLE', 'CARRIER', 'CONVOY', 'CARAVAN', 'PARADE', 'PROCESSION', 'TRAIN', 'LINE', 'QUEUE', 'STACK',
  'HEAP', 'PILE', 'MOUND', 'HILL', 'MOUNTAIN', 'TOWER', 'SPIRE', 'PILLAR', 'COLUMN', 'POST',
  'BEAM', 'GIRDER', 'TRUSS', 'FRAME', 'STRUCTURE', 'BUILDING', 'HOUSE', 'HOME', 'ABODE', 'DOMAIN',
  'REALM', 'KINGDOM', 'EMPIRE', 'NATION', 'STATE', 'LAND', 'COUNTRY', 'WORLD', 'UNIVERSE', 'COSMOS',
  'REALITY', 'EXISTENCE', 'BEING', 'ENTITY', 'CREATURE', 'BEAST', 'MONSTER', 'DEMON', 'GOD', 'DEITY',
];

const FONTS = [
  'Bebas Neue', 'Cinzel', 'Comfortaa', 'Cormorant Garamond', 'Creepster', 'DM Serif Display',
  'Fredoka', 'Great Vibes', 'Inter', 'JetBrains Mono', 'Lobster', 'Montserrat', 'Oswald',
  'Playfair Display', 'Poiret One', 'Press Start 2P', 'Quicksand', 'Raleway', 'Righteous',
  'Rubik', 'Space Mono', 'Syne', 'Unbounded', 'cursive', 'system-ui', 'monospace',
];

const COLORS = [
  '#ff6b6b', '#ee5a24', '#f9ca24', '#6ab04c', '#22a6b3', '#4834d4', '#be2edd', '#eb4d4b',
  '#f0932b', '#fdcb6e', '#00b894', '#00cec9', '#0984e3', '#6c5ce7', '#a29bfe', '#fd79a8',
  '#e17055', '#fab1a0', '#ffeaa7', '#55efc4', '#81ecec', '#74b9ff', '#a29bfe', '#dfe6e9',
  '#2d3436', '#000000', '#ffffff', '#ff7675', '#fd79a8', '#e84393', '#6c5ce7', '#a29bfe',
  '#00b894', '#00cec9', '#0984e3', '#e17055', '#fdcb6e', '#e17055', '#b2bec3', '#636e72',
  '#ffeaa7', '#dfe6e9', '#b2bec3', '#74b9ff', '#81ecec', '#55efc4', '#00cec9', '#00b894',
  '#fd79a8', '#e84393', '#a29bfe', '#6c5ce7', '#0984e3', '#4834d4', '#22a6b3', '#6ab04c',
  '#f9ca24', '#ee5a24', '#ff6b6b', '#ffEaa7', '#DDA0DD', '#98FB98', '#F0E68C', '#FFB6C1',
  '#E6E6FA', '#FFD700', '#FF6347', '#40E0D0', '#EE82EE', '#F5DEB3', '#FFFFE0', '#00FF7F',
];

const STYLES = [
  { fontWeight: '400', fontStyle: 'normal', textShadow: 'none' },
  { fontWeight: '700', fontStyle: 'normal', textShadow: 'none' },
  { fontWeight: '900', fontStyle: 'normal', textShadow: 'none' },
  { fontWeight: '400', fontStyle: 'italic', textShadow: 'none' },
  { fontWeight: '700', fontStyle: 'italic', textShadow: 'none' },
  { fontWeight: '400', fontStyle: 'normal', textShadow: '0 0 20px currentColor' },
  { fontWeight: '700', fontStyle: 'normal', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' },
  { fontWeight: '400', fontStyle: 'normal', textShadow: '0 2px 10px rgba(0,0,0,0.3)' },
  { fontWeight: '700', fontStyle: 'normal', textShadow: '0 0 30px rgba(255,255,255,0.8)' },
  { fontWeight: '900', fontStyle: 'italic', textShadow: '3px 3px 6px rgba(0,0,0,0.4)' },
  { fontWeight: '400', fontStyle: 'normal', textShadow: '-1px -1px 0 #fff, 1px 1px 0 #333' },
  { fontWeight: '700', fontStyle: 'normal', textShadow: '0 0 15px currentColor, 0 0 30px currentColor' },
];

// Rarity: denominator from 2 (1/2) to 10^10 (1/10 billion). Log-spaced over 500 items.
function buildItems() {
  const items = [];
  const n = 500;
  const logLow = Math.log10(2);
  const logHigh = Math.log10(10e9);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const logR = logLow + t * (logHigh - logLow);
    const rarity = Math.round(Math.pow(10, logR));
    const text = TEXTS[i % TEXTS.length];
    const font = FONTS[i % FONTS.length];
    const color = COLORS[i % COLORS.length];
    const style = STYLES[i % STYLES.length];
    items.push({
      id: i,
      text,
      font,
      color,
      ...style,
      rarity,
      weight: 1 / rarity,
    });
  }
  const totalWeight = items.reduce((s, x) => s + x.weight, 0);
  items.forEach((x) => {
    x.probability = x.weight / totalWeight;
  });
  return items;
}

export const ITEMS = buildItems();
