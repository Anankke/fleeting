/**
 * logRegex.ts
 *
 * EVE Online combat log parsing based on PyEveLiveDPS patterns.
 * Reference: https://github.com/ArtificialQualia/PyEveLiveDPS
 *
 * Log line format:
 *   [ YYYY.MM.DD HH:MM:SS ] (combat) <colorTag><b>amount</b> ... direction ...
 *       <b><color=0xffffffff>Actor[Corp (Ship)]</color></b><font size=10> - Weapon - Quality</font>
 */

export type Category =
  | 'dpsOut'
  | 'dpsIn'
  | 'logiOut'
  | 'logiIn'
  | 'capTransfered'
  | 'capRecieved'
  | 'capDamageOut'
  | 'capDamageIn'
  | 'mined';

export type HitQuality =
  | 'Wrecks'
  | 'Smashes'
  | 'Penetrates'
  | 'Hits'
  | 'Glances Off'
  | 'Grazes'
  | 'Misses'
  | string; // allow raw untranslated strings from non-English clients

export interface LogEntry {
  category:   Category;
  amount:     number;
  /** The acting character: attacker for dpsIn/logiIn/capDamageIn, or the log owner for outgoing events. */
  pilotName:  string;
  weaponType: string;
  /** The acting character's ship type. */
  shipType:   string;
  /** The receiving character: victim for dpsOut/logiOut, or the log owner for incoming events. */
  targetName: string;
  hitQuality: HitQuality | null;
  occurredAt: string;
  /** Character name whose log file this entry came from — always the log file owner. */
  logOwner:   string;
}

// ── Log file header ───────────────────────────────────────────────────────────
// Line 3 of the log file is "Listener: <name>" (language-specific prefix).
export interface LogHeader { characterName: string; language: string; }

const HEADER_PATTERNS: Array<{ lang: string; re: RegExp }> = [
  { lang: 'english',  re: /^Listener:\s*(.+)/ },
  { lang: 'russian',  re: /^Слушатель:\s*(.+)/ },
  { lang: 'french',   re: /^Auditeur:\s*(.+)/ },
  { lang: 'german',   re: /^Empfänger:\s*(.+)/ },
  { lang: 'japanese', re: /^傍聴者:\s*(.+)/ },
  { lang: 'chinese',  re: /^收听者:\s*(.+)/ },
];

/** Parse the first ~512 bytes of a log file to get character name + language. */
export function parseHeader(text: string): LogHeader | null {
  for (const line of text.split('\n').slice(0, 8).map(l => l.trim())) {
    for (const { lang, re } of HEADER_PATTERNS) {
      const m = re.exec(line);
      if (m) return { characterName: m[1].trim(), language: lang };
    }
  }
  return null;
}

// ── Shared primitives ─────────────────────────────────────────────────────────
const TS_RE     = /\[ (\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}) \]/;
const AMOUNT_RE = /<b>(\d+)<\/b>/;
const MINING_RE = /\(mining\) .*?<[^>]*><[^>]*>(\d+)/;

function parseTs(raw: string): string {
  return raw.replace(/\./g, '-').replace(' ', 'T') + '.000Z';
}

// Hit quality — extracted from the trailing <font> tag in the log line.
// EVE log format:  <font size=10><color=0x77ffffff> - WeaponType - HitQuality
// (no closing </font> — the line simply ends after the quality string)
// Strategy: anchor to <font>, skip optional inner tags (color etc.), consume
// the weapon segment greedily so backtracking lands us on the LAST " - ",
// then capture the quality. Lines with only one " - " (logi/cap/neut) don't
// match, so hitQuality is correctly null for those events.
export const HIT_QUALITY_RAW_RE = /<font[^>]*>(?:<[^>]*>)* - [^<\r\n]+ - ([^<\r\n]+?)\s*(?:<\/font>|[\r\n]|$)/;

/** Canonical English quality strings in descending quality order. */
export const CANONICAL_QUALITIES = [
  'Wrecks', 'Smashes', 'Penetrates', 'Hits', 'Glances Off', 'Grazes', 'Misses',
] as const;

/**
 * Map of known alternative spellings / translations → canonical English.
 * Extend this table as needed for additional client languages.
 */
const QUALITY_MAP: Record<string, string> = {
  // English (already canonical)
  wrecks: 'Wrecks', smashes: 'Smashes', penetrates: 'Penetrates',
  hits: 'Hits', 'glances off': 'Glances Off', grazes: 'Grazes', misses: 'Misses',
  // Russian (approximate — adjust once confirmed from actual logs)
  'уничтожает': 'Wrecks', 'разрушает': 'Smashes', 'пробивает': 'Penetrates',
  'попадает': 'Hits', 'скользит': 'Glances Off', 'царапает': 'Grazes',
  'промахивается': 'Misses',
  // German
  'vernichtet': 'Wrecks', 'zerschmettert': 'Smashes', 'durchdringt': 'Penetrates',
  'trifft': 'Hits', 'streift': 'Glances Off', 'kratzt': 'Grazes',
  'verfehlt': 'Misses',
};

/** Translate a raw quality string to its canonical form; falls back to raw value. */
export function translateQuality(raw: string): string {
  return QUALITY_MAP[raw.toLowerCase().trim()] ?? raw.trim();
}

// ── Category detection (real PELD patterns) ──────────────────────────────────
// Specific phrases are ordered BEFORE generic direction keywords to avoid
// false-positive matches (e.g. "remote armor repaired to" contains "to").

// Logi: English phrases work in English-client logs.
const RE_LOGI_OUT = /\(combat\) <[^>]+><b>\d+<\/b>.*?remote (?:armor|shield|hull) (?:repaired|boosted) to /;
const RE_LOGI_IN  = /\(combat\) <[^>]+><b>\d+<\/b>.*?remote (?:armor|shield|hull) (?:repaired|boosted) by /;
// Cap transfer
const RE_CAP_OUT  = /\(combat\) <[^>]+><b>\d+<\/b>.*?remote capacitor transmitted to /;
const RE_CAP_IN   = /\(combat\) <[^>]+><b>\d+<\/b>.*?remote capacitor transmitted by /;
// Cap neut: distinguished by color code: ff7fffff=we neut (out), ffe57f7f=they neut us (in).
const RE_NEUT_OUT = /\(combat\) <[^>]*ff7fffff><b>\d+<\/b>/;
const RE_NEUT_IN  = /\(combat\) <[^>]*ffe57f7f><b>\d+<\/b>/;

// Damage direction keywords per language (PELD-style ">keyword<" tag boundary matching).
const DAMAGE_DIR: Record<string, { out: string; in: string }> = {
  english:  { out: '>to<',      in: '>from<' },
  russian:  { out: '>\u043d\u0430<',    in: '>\u0438\u0437<' },
  french:   { out: '>\u00e0<',      in: '>de<' },
  german:   { out: '>nach<',    in: '>von<' },
  japanese: { out: '>\u5bfe\u8c61:<',  in: '>\u653b\u6483\u8005:<' },
  chinese:  { out: '>\u5bf9<',      in: '>\u6765\u81ea<' },
};

function detectCategory(line: string, language = 'english'): Category | null {
  if (RE_LOGI_OUT.test(line)) return 'logiOut';
  if (RE_LOGI_IN.test(line))  return 'logiIn';
  if (RE_CAP_OUT.test(line))  return 'capTransfered';
  if (RE_CAP_IN.test(line))   return 'capRecieved';
  if (RE_NEUT_OUT.test(line)) return 'capDamageOut';
  if (RE_NEUT_IN.test(line))  return 'capDamageIn';
  const dir = DAMAGE_DIR[language] ?? DAMAGE_DIR.english;
  if (line.includes(dir.out)) return 'dpsOut';
  if (line.includes(dir.in))  return 'dpsIn';
  return null;
}

// ── Pilot / weapon extraction ─────────────────────────────────────────────────
// The acting character's name appears in the log after <color=0xffffffff> (pure white).
// Standard EVE overview format: PilotName[CorpTag (ShipType)]
// Weapon appears after "</b> - " separator.
//
// Pattern translated directly from PELD's default pilotAndWeapon regex:
//   (?:.*ffffffff>pilot[corp(ship)]</b> - weapon)
export const DEFAULT_PILOT_WEAPON_RE =
  /ffffffff>(?:<[^>]*>)*(?<pilot>[^([<\r\n]*)(?:.*?\((?<ship>[^)]*)\))?.*?<\/b>.*? - (?<weapon>[^-<\r\n]+?)(?= -|<)/s;

/** Build a custom pilot+weapon regex from EVE overview settings YAML content.
 *  Mirrors PyEveLiveDPS createOverviewRegex logic.
 *  Returns null if the overview data is insufficient to build a valid pattern. */
export function buildOverviewRegex(overview: {
  shipLabelOrder: string[];
  shipLabels: Array<[string, { state: number | boolean; pre: string; post: string; type: string | null }]>;
}): RegExp | null {
  function esc(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Build a map from type→config.
  const cfgByType = new Map<string, { state: number | boolean; pre: string; post: string; type: string | null }>();
  for (const [typeName, cfg] of overview.shipLabels) {
    // Use the first array element (type name) as the key when cfg.type is null
    cfgByType.set(cfg.type ?? typeName, cfg);
  }

  let hasPilot  = false;
  let hasWeapon = false;
  let pat = '.*?ffffffff>';

  for (const key of overview.shipLabelOrder) {
    const cfg     = cfgByType.get(key);
    const enabled = cfg ? (cfg.state === true || cfg.state === 1) : false;
    const pre  = esc(cfg?.pre  ?? '');
    const post = esc(cfg?.post ?? '');

    if (key === 'pilot name') {
      if (enabled) {
        pat += `(?:${pre}(?:<[^>]*>)?(?<pilot>[^<]*)${post})`;
        hasPilot = true;
      } else {
        pat += '(?:(?:<[^>]*>)?[^<]*)?';
      }
    } else if (key === 'ship type') {
      if (enabled) {
        pat += `(?:${pre}(?:<[^>]*>)?(?<ship>[^<]*)${post})?`;
      }
    } else if (['alliance', 'corporation', 'ship name'].includes(key)) {
      if (enabled) pat += `(?:${pre}.*?${post})?`;
    }
  }

  pat += '.*?<\\/b>.*? - (?<weapon>[^-<\\r\\n]+?)(?= -|<)';
  hasWeapon = true;

  if (!hasPilot || !hasWeapon) return null;

  try {
    return new RegExp(pat, 's');
  } catch {
    return null;
  }
}

/**
 * Parse a single raw EVE log line.
 *
 * @param line          Raw text line from the EVE log file
 * @param characterName Character who owns this log (from file header — see parseHeader)
 * @param language      Client language of this log (from file header)
 * @param pilotWeaponRe Optional custom regex built from the user's overview settings
 */
export function parseLine(
  line: string,
  characterName = '',
  language = 'english',
  pilotWeaponRe: RegExp = DEFAULT_PILOT_WEAPON_RE,
): LogEntry | null {
  const tsMatch = TS_RE.exec(line);
  if (!tsMatch) return null;
  const occurredAt = parseTs(tsMatch[1]);

  const isMining = line.includes('(mining)');
  const isCombat = line.includes('(combat)');
  if (!isCombat && !isMining) return null;

  if (isMining) {
    const m = MINING_RE.exec(line);
    if (!m) return null;
    return { category: 'mined', amount: parseInt(m[1], 10), pilotName: characterName, weaponType: '', shipType: '', targetName: '', hitQuality: null, occurredAt, logOwner: characterName };
  }

  const amtMatch = AMOUNT_RE.exec(line);
  if (!amtMatch) return null;
  const amount = parseInt(amtMatch[1], 10);

  const category = detectCategory(line, language);
  if (!category) return null;

  // Extract raw quality string and translate to canonical form
  const hqRawMatch = HIT_QUALITY_RAW_RE.exec(line);
  const hitQuality = hqRawMatch ? translateQuality(hqRawMatch[1]) : null;

  // Try the (potentially overview-derived) regex first; fall back to default if needed
  function extractGroups(re: RegExp) {
    re.lastIndex = 0;
    const match = re.exec(line);
    return {
      pilot:  (match?.groups?.pilot  ?? '').trim(),
      ship:   (match?.groups?.ship   ?? '').trim(),
      weapon: (match?.groups?.weapon ?? '').trim(),
    };
  }

  let { pilot: otherActor, ship: shipType, weapon: weaponType } = extractGroups(pilotWeaponRe);

  // If the overview regex yielded nothing useful, try the default
  if (!otherActor && !weaponType && pilotWeaponRe !== DEFAULT_PILOT_WEAPON_RE) {
    ({ pilot: otherActor, ship: shipType, weapon: weaponType } = extractGroups(DEFAULT_PILOT_WEAPON_RE));
  }

  // For outgoing events: we are the actor, the other party is the target.
  // For incoming events: the other party is the actor, we are the target.
  const isOutgoing = category === 'dpsOut' || category === 'logiOut' ||
    category === 'capTransfered' || category === 'capDamageOut';

  return {
    category,
    amount,
    pilotName:  isOutgoing ? characterName : otherActor,
    targetName: isOutgoing ? otherActor    : characterName,
    weaponType,
    shipType,
    hitQuality,
    occurredAt,
    logOwner: characterName,
  };
}
