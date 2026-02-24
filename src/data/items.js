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

// 300 extremely rare aura names (rarities 100M → 100B)
const AURA_TEXTS = [
  'Aura of the First Dawn', 'Aura of Eternal Twilight', 'Aura of the Void Heart', 'Aura of Cosmic Weave',
  'Aura of the Forgotten God', 'Aura of Infinite Echo', 'Aura of the World Seed', 'Aura of Unbroken Oath',
  'Aura of the Last Star', 'Aura of Primordial Flame', 'Aura of the Silent Watcher', 'Aura of Shattered Time',
  'Aura of the Dreaming Dead', 'Aura of Celestial Blood', 'Aura of the Nameless One', 'Aura of Endless Winter',
  'Aura of the Iron Covenant', 'Aura of Phantom Crown', 'Aura of the Lost Empire', 'Aura of Unspoken Truth',
  'Aura of the Seventh Seal', 'Aura of Obsidian Tears', 'Aura of the Hollow Throne', 'Aura of Whispered Curses',
  'Aura of the Undying Ember', 'Aura of Starlight Ashes', 'Aura of the Broken Chain', 'Aura of Midnight Sun',
  'Aura of the Fallen Seraph', 'Aura of Crimson Oath', 'Aura of the Unwritten Law', 'Aura of Ghostly Dominion',
  'Aura of the Final Breath', 'Aura of Silver Silence', 'Aura of the Drowned Kingdom', 'Aura of Burning Ice',
  'Aura of the Blind Oracle', 'Aura of Golden Ruin', 'Aura of the Unchosen Path', 'Aura of Shadowed Mercy',
  'Aura of the Ninth Hell', 'Aura of Pale Dominion', 'Aura of the Sleeping Titan', 'Aura of Fractured Soul',
  'Aura of the Last Prayer', 'Aura of Emerald Decay', 'Aura of the Unbound Will', 'Aura of Crystalline Sorrow',
  'Aura of the Hollow Victory', 'Aura of Violet Storm', 'Aura of the Eternal Return', 'Aura of Rust and Bone',
  'Aura of the Shattered Mirror', 'Aura of Amber Stasis', 'Aura of the Unseen Hand', 'Aura of Bleeding Sky',
  'Aura of the Dying Light', 'Aura of Jade Oblivion', 'Aura of the Unspoken Name', 'Aura of Frozen Fire',
  'Aura of the First and Last', 'Aura of Pearl and Ash', 'Aura of the Unwritten End', 'Aura of Hollow Glory',
  'Aura of the Zero Hour', 'Aura of Ivory Despair', 'Aura of the Unbroken Storm', 'Aura of Silent Thunder',
  'Aura of the Forgotten Tongue', 'Aura of Sapphire Ruin', 'Aura of the Unchained Fate', 'Aura of Dust and Glory',
  'Aura of the Empty Throne', 'Aura of Ruby Vengeance', 'Aura of the Unseen Crown', 'Aura of Twilight Reign',
  'Aura of the Last Witness', 'Aura of Onyx Mercy', 'Aura of the Unspoken Bond', 'Aura of Eternal Frost',
  'Aura of the Dormant God', 'Aura of Topaz Judgment', 'Aura of the Unwritten Word', 'Aura of Crimson Dawn',
  'Aura of the Final Silence', 'Aura of Opal Madness', 'Aura of the Unbound Chain', 'Aura of Ghost Flame',
  'Aura of the Lost Horizon', 'Aura of Amethyst Sorrow', 'Aura of the Unchosen One', 'Aura of Silver Ruin',
  'Aura of the Broken Oath', 'Aura of Diamond Dust', 'Aura of the Unseen Gate', 'Aura of Blood Moon',
  'Aura of the Sleeping Dragon', 'Aura of Jade Storm', 'Aura of the Unspoken Vow', 'Aura of Iron and Silk',
  'Aura of the Last Guardian', 'Aura of Emerald Fire', 'Aura of the Unwritten Tale', 'Aura of Hollow Echo',
  'Aura of the Forgotten Crown', 'Aura of Pearl Dominion', 'Aura of the Unbound Oath', 'Aura of Ash and Gold',
  'Aura of the Hollow King', 'Aura of Sapphire Tears', 'Aura of the Unseen Blade', 'Aura of Midnight Bloom',
  'Aura of the Dying Empire', 'Aura of Ruby Silence', 'Aura of the Unchained Soul', 'Aura of Frost and Flame',
  'Aura of the Seventh Heaven', 'Aura of Onyx Storm', 'Aura of the Unspoken Truth', 'Aura of Starlight Fall',
  'Aura of the Blind King', 'Aura of Topaz Ruin', 'Aura of the Unwritten Law', 'Aura of Phantom and Bone',
  'Aura of the Last Breath', 'Aura of Opal Dominion', 'Aura of the Unbound Will', 'Aura of Crimson Tide',
  'Aura of the Empty Crown', 'Aura of Amethyst Flame', 'Aura of the Unseen Hand', 'Aura of Silver and Shadow',
  'Aura of the Shattered Oath', 'Aura of Diamond Storm', 'Aura of the Unchosen Path', 'Aura of Eternal Dusk',
  'Aura of the Dormant Storm', 'Aura of Jade Dominion', 'Aura of the Unspoken Name', 'Aura of Iron Dawn',
  'Aura of the Lost Covenant', 'Aura of Emerald Ruin', 'Aura of the Unwritten End', 'Aura of Ghost and Ash',
  'Aura of the Final Dawn', 'Aura of Pearl Storm', 'Aura of the Unbound Chain', 'Aura of Violet Ruin',
  'Aura of the Hollow Seraph', 'Aura of Sapphire Dominion', 'Aura of the Unseen Crown', 'Aura of Burning Dusk',
  'Aura of the Dying Star', 'Aura of Ruby Flame', 'Aura of the Unchained Fate', 'Aura of Crystal and Blood',
  'Aura of the Ninth Gate', 'Aura of Onyx Dominion', 'Aura of the Unspoken Bond', 'Aura of Frozen Dawn',
  'Aura of the Sleeping Empire', 'Aura of Topaz Storm', 'Aura of the Unwritten Word', 'Aura of Pale Fire',
  'Aura of the Forgotten Oath', 'Aura of Opal Ruin', 'Aura of the Unbound Oath', 'Aura of Amber and Iron',
  'Aura of the Last Covenant', 'Aura of Amethyst Dominion', 'Aura of the Unseen Gate', 'Aura of Twilight Flame',
  'Aura of the Broken Crown', 'Aura of Diamond Dominion', 'Aura of the Unchosen One', 'Aura of Shadow and Gold',
  'Aura of the Empty Throne', 'Aura of Jade Flame', 'Aura of the Unspoken Vow', 'Aura of Crimson Storm',
  'Aura of the Shattered Empire', 'Aura of Emerald Dominion', 'Aura of the Unwritten Tale', 'Aura of Bone and Silk',
  'Aura of the Dormant Crown', 'Aura of Pearl Flame', 'Aura of the Unbound Will', 'Aura of Sapphire Ruin',
  'Aura of the Lost Throne', 'Aura of Ruby Dominion', 'Aura of the Unseen Blade', 'Aura of Midnight and Ash',
  'Aura of the Final Throne', 'Aura of Onyx Flame', 'Aura of the Unspoken Truth', 'Aura of Eternal Storm',
  'Aura of the Blind Seraph', 'Aura of Topaz Dominion', 'Aura of the Unwritten Law', 'Aura of Ghost Flame',
  'Aura of the Dying Covenant', 'Aura of Opal Flame', 'Aura of the Unchained Soul', 'Aura of Violet Dominion',
  'Aura of the Hollow Dawn', 'Aura of Amethyst Ruin', 'Aura of the Unseen Hand', 'Aura of Silver Storm',
  'Aura of the Seventh Throne', 'Aura of Diamond Flame', 'Aura of the Unchosen Path', 'Aura of Iron and Pearl',
  'Aura of the Forgotten Throne', 'Aura of Jade Ruin', 'Aura of the Unspoken Name', 'Aura of Crimson Dominion',
  'Aura of the Last Throne', 'Aura of Emerald Flame', 'Aura of the Unbound Oath', 'Aura of Starlight Ruin',
  'Aura of the Empty Covenant', 'Aura of Pearl Ruin', 'Aura of the Unwritten End', 'Aura of Onyx and Gold',
  'Aura of the Shattered Throne', 'Aura of Sapphire Flame', 'Aura of the Unseen Crown', 'Aura of Frost Dominion',
  'Aura of the Sleeping Throne', 'Aura of Ruby Ruin', 'Aura of the Unspoken Bond', 'Aura of Burning Dominion',
  'Aura of the Dormant Covenant', 'Aura of Onyx Ruin', 'Aura of the Unbound Chain', 'Aura of Jade Dominion',
  'Aura of the Lost Dawn', 'Aura of Topaz Flame', 'Aura of the Unwritten Word', 'Aura of Phantom Dominion',
  'Aura of the Final Covenant', 'Aura of Opal Dominion', 'Aura of the Unchained Fate', 'Aura of Amethyst Storm',
  'Aura of the Hollow Covenant', 'Aura of Diamond Ruin', 'Aura of the Unseen Gate', 'Aura of Eternal Dominion',
  'Aura of the Dying Throne', 'Aura of Jade Flame', 'Aura of the Unspoken Vow', 'Aura of Ivory Dominion',
  'Aura of the Ninth Throne', 'Aura of Emerald Ruin', 'Aura of the Unchosen One', 'Aura of Crimson Flame',
  'Aura of the Blind Throne', 'Aura of Pearl Flame', 'Aura of the Unwritten Law', 'Aura of Sapphire Storm',
  'Aura of the Forgotten Covenant', 'Aura of Ruby Flame', 'Aura of the Unbound Will', 'Aura of Midnight Dominion',
  'Aura of the Broken Covenant', 'Aura of Onyx Storm', 'Aura of the Unseen Blade', 'Aura of Twilight Dominion',
  'Aura of the Last Dawn', 'Aura of Topaz Ruin', 'Aura of the Unspoken Truth', 'Aura of Silver Flame',
  'Aura of the Empty Dawn', 'Aura of Opal Storm', 'Aura of the Unwritten Tale', 'Aura of Amber Dominion',
  'Aura of the Shattered Covenant', 'Aura of Amethyst Flame', 'Aura of the Unchained Soul', 'Aura of Pale Dominion',
  'Aura of the Dormant Dawn', 'Aura of Diamond Storm', 'Aura of the Unseen Hand', 'Aura of Ghost Dominion',
  'Aura of the Lost Covenant', 'Aura of Jade Storm', 'Aura of the Unspoken Name', 'Aura of Iron Dominion',
  'Aura of the Final Dawn', 'Aura of Emerald Storm', 'Aura of the Unbound Oath', 'Aura of Violet Flame',
  'Aura of the Hollow Throne', 'Aura of Pearl Storm', 'Aura of the Unwritten End', 'Aura of Crystal Dominion',
  'Aura of the Dying Dawn', 'Aura of Sapphire Ruin', 'Aura of the Unchosen Path', 'Aura of Bone Dominion',
  'Aura of the Seventh Covenant', 'Aura of Ruby Storm', 'Aura of the Unseen Crown', 'Aura of Ash Dominion',
  'Aura of the Forgotten Dawn', 'Aura of Onyx Flame', 'Aura of the Unspoken Bond', 'Aura of Gold Dominion',
  'Aura of the Last Covenant', 'Aura of Topaz Dominion', 'Aura of the Unwritten Word', 'Aura of Blood Dominion',
  'Aura of the Empty Throne', 'Aura of Opal Ruin', 'Aura of the Unbound Chain', 'Aura of Shadow Dominion',
  'Aura of the Shattered Dawn', 'Aura of Amethyst Ruin', 'Aura of the Unseen Gate', 'Aura of Flame Dominion',
  'Aura of the Sleeping Covenant', 'Aura of Diamond Flame', 'Aura of the Unspoken Truth', 'Aura of Storm Dominion',
  'Aura of the Dormant Throne', 'Aura of Jade Ruin', 'Aura of the Unwritten Law', 'Aura of Void Dominion',
  'Aura of the Lost Throne', 'Aura of Emerald Flame', 'Aura of the Unchained Fate', 'Aura of Cosmic Dominion',
  'Aura of the Final Throne', 'Aura of Pearl Ruin', 'Aura of the Unseen Blade', 'Aura of Primordial Dominion',
  'Aura of the Hollow Dawn', 'Aura of Sapphire Storm', 'Aura of the Unchosen One', 'Aura of Infinite Dominion',
  'Aura of the Dying Covenant', 'Aura of Ruby Ruin', 'Aura of the Unspoken Vow', 'Aura of Absolute Dominion',
  'Aura of the Ninth Covenant', 'Aura of Onyx Dominion', 'Aura of the Unbound Will', 'Aura of Transcendent Aura',
  'Aura of the Blind Covenant', 'Aura of Topaz Ruin', 'Aura of the Unwritten End', 'Aura of Divine Aura',
  'Aura of the Forgotten Throne', 'Aura of Opal Flame', 'Aura of the Unseen Hand', 'Aura of Mythic Aura',
  'Aura of the Broken Dawn', 'Aura of Amethyst Dominion', 'Aura of the Unspoken Name', 'Aura of Legendary Aura',
  'Aura of the Last Throne', 'Aura of Diamond Ruin', 'Aura of the Unbound Oath', 'Aura of Omega Aura',
  'Aura of the Empty Covenant', 'Aura of Jade Flame', 'Aura of the Unwritten Tale', 'Aura of Alpha Aura',
  'Aura of the Shattered Throne', 'Aura of Emerald Ruin', 'Aura of the Unchained Soul', 'Aura of Zero Aura',
  'Aura of the Dormant Dawn', 'Aura of Pearl Storm', 'Aura of the Unseen Crown', 'Aura of Infinity Aura',
];

// 30 ultra-rare auras beyond 100B → 999B, 1–3 words
const ULTRA_AURA_TEXTS = [
  'Void King', 'Eternal Star', 'God Shard', 'Last Breath', 'True Myth',
  'Omega Pulse', 'Infinite Crown', 'Primordial One', 'Cosmic End', 'Divine Spark',
  'First Light', 'Final Dawn', 'Zero Hour', 'Alpha Wave', 'Sacred Flame',
  'Cursed Bloom', 'Phantom Heart', 'Shadow God', 'Blood Moon', 'Crystal Soul',
  'Lost Heaven', 'Dead Star', 'Living Void', 'Silent God', 'Broken Infinity',
  'Eternal Night', 'Last Divine', 'One Truth', 'World Seed', 'Reality Tear',
];

// Rarity: denominator from 2 (1/2) to 10^10 (1/10 billion). Log-spaced over 500 items.
function buildBaseItems() {
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
  return items;
}

// 300 extremely rare auras: rarities from 100M (1e8) to 100B (1e11), log-spaced
function buildAuraItems(startId) {
  const items = [];
  const n = 300;
  const logLow = Math.log10(100e6);   // 100 million
  const logHigh = Math.log10(100e9);  // 100 billion
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const logR = logLow + t * (logHigh - logLow);
    const rarity = Math.round(Math.pow(10, logR));
    const text = AURA_TEXTS[i % AURA_TEXTS.length];
    const font = FONTS[i % FONTS.length];
    const color = COLORS[i % COLORS.length];
    const style = STYLES[i % STYLES.length];
    items.push({
      id: startId + i,
      text,
      font,
      color,
      ...style,
      rarity,
      weight: 1 / rarity,
    });
  }
  return items;
}

// 30 auras beyond 100B: rarities from 100B to 999B, log-spaced
function buildUltraAuraItems(startId) {
  const items = [];
  const n = 30;
  const logLow = Math.log10(100e9);   // 100 billion
  const logHigh = Math.log10(999e9);  // 999 billion
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const logR = logLow + t * (logHigh - logLow);
    const rarity = Math.round(Math.pow(10, logR));
    const text = ULTRA_AURA_TEXTS[i % ULTRA_AURA_TEXTS.length];
    const font = FONTS[i % FONTS.length];
    const color = COLORS[i % COLORS.length];
    const style = STYLES[i % STYLES.length];
    items.push({
      id: startId + i,
      text,
      font,
      color,
      ...style,
      rarity,
      weight: 1 / rarity,
    });
  }
  return items;
}

// 10 hand-crafted Mythic auras: 1T–2T rarity, each with a unique identity
const MYTHIC_ITEMS = [
  {
    id: 9000, text: 'THE VOID SOVEREIGN',
    font: 'Unbounded', color: '#9900ff',
    fontWeight: '900', fontStyle: 'normal',
    textShadow: '0 0 30px #9900ff, 0 0 60px #4400aa, 0 0 100px #220055',
    rarity: 1_000_000_000_000, weight: 1 / 1_000_000_000_000,
  },
  {
    id: 9001, text: "ETERNITY'S END",
    font: 'Cinzel', color: '#ff6600',
    fontWeight: '700', fontStyle: 'normal',
    textShadow: '0 0 25px #ff6600, 0 0 50px #ff2200, 0 0 90px #880000',
    rarity: 1_100_000_000_000, weight: 1 / 1_100_000_000_000,
  },
  {
    id: 9002, text: 'PRIMORDIAL FLAME',
    font: 'Bebas Neue', color: '#ffcc00',
    fontWeight: '400', fontStyle: 'normal',
    textShadow: '0 0 20px #ffcc00, 0 0 50px #ff8800, 0 0 80px #ff4400',
    rarity: 1_200_000_000_000, weight: 1 / 1_200_000_000_000,
  },
  {
    id: 9003, text: 'THE LAST STAR',
    font: 'Cormorant Garamond', color: '#ffffff',
    fontWeight: '700', fontStyle: 'italic',
    textShadow: '0 0 20px #ffffff, 0 0 50px #aaccff, 0 0 100px #4488ff',
    rarity: 1_350_000_000_000, weight: 1 / 1_350_000_000_000,
  },
  {
    id: 9004, text: 'OMNIPOTENCE',
    font: 'Syne', color: '#00ffcc',
    fontWeight: '800', fontStyle: 'normal',
    textShadow: '0 0 25px #00ffcc, 0 0 60px #00aa88, 0 0 100px #004433',
    rarity: 1_450_000_000_000, weight: 1 / 1_450_000_000_000,
  },
  {
    id: 9005, text: 'REALITY BREAKER',
    font: 'Press Start 2P', color: '#ff00aa',
    fontWeight: '400', fontStyle: 'normal',
    textShadow: '0 0 15px #ff00aa, 0 0 40px #aa0066, 0 0 80px #550033',
    rarity: 1_550_000_000_000, weight: 1 / 1_550_000_000_000,
  },
  {
    id: 9006, text: 'DIVINE PARADOX',
    font: 'Playfair Display', color: '#d4af37',
    fontWeight: '700', fontStyle: 'italic',
    textShadow: '0 0 20px #d4af37, 0 0 50px #aa8800, 0 0 90px #553300',
    rarity: 1_650_000_000_000, weight: 1 / 1_650_000_000_000,
  },
  {
    id: 9007, text: 'THE ABSOLUTE',
    font: 'Raleway', color: '#e8e8ff',
    fontWeight: '900', fontStyle: 'normal',
    textShadow: '0 0 30px #ffffff, 0 0 70px #8888ff, 0 0 120px #0000ff',
    rarity: 1_750_000_000_000, weight: 1 / 1_750_000_000_000,
  },
  {
    id: 9008, text: 'BEYOND ALL',
    font: 'Space Mono', color: '#00ff44',
    fontWeight: '400', fontStyle: 'normal',
    textShadow: '0 0 20px #00ff44, 0 0 50px #00aa22, 0 0 90px #004411',
    rarity: 1_900_000_000_000, weight: 1 / 1_900_000_000_000,
  },
  {
    id: 9009, text: 'ASCENDANT',
    font: 'Montserrat', color: '#ffffff',
    fontWeight: '900', fontStyle: 'normal',
    textShadow: '0 0 20px #ff00ff, 0 0 40px #ff8800, 0 0 60px #ffff00, 0 0 80px #00ffff, 0 0 100px #0000ff',
    rarity: 2_000_000_000_000, weight: 1 / 2_000_000_000_000,
  },
];

function buildItems() {
  const base = buildBaseItems();
  const auras = buildAuraItems(base.length);
  const ultraAuras = buildUltraAuraItems(base.length + auras.length);
  const items = [...base, ...auras, ...ultraAuras, ...MYTHIC_ITEMS];
  const totalWeight = items.reduce((s, x) => s + x.weight, 0);
  items.forEach((x) => {
    x.probability = x.weight / totalWeight;
  });
  return items;
}

export const ITEMS = buildItems();
