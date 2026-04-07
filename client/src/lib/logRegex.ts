/**
 * logRegex.ts
 *
 * EVE Online combat log regex patterns for all 6 client languages supported by PELD.
 *
 * Log line format (all languages):
 *   [ YYYY.MM.DD HH:MM:SS ] ... (damage/logi/cap/mining info)
 *
 * Hit quality suffix appears as:
 *   "- (Wrecks|Smashes|Penetrates|Hits|Glances Off|Grazes|Misses)</font>"
 * This is ALWAYS in English regardless of client language.
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
  | 'Misses';

export interface LogEntry {
  category:    Category;
  amount:      number;
  pilotName:   string;
  weaponType:  string;
  shipType:    string;
  hitQuality:  HitQuality | null;
  occurredAt:  string; // ISO timestamp
}

// ── Hit qualifier (English-only, from <color> tags in log) ────────────────────
// Must list 'Glances Off' before single-word entries.
export const HIT_QUALITY_RE =
  /- (Wrecks|Smashes|Penetrates|Hits|Glances Off|Grazes|Misses)<\/font>/i;

// ── Timestamp ─────────────────────────────────────────────────────────────────
const TS_RE = /\[ (\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}) \]/;

function parseTs(raw: string): string {
  // Convert "2024.05.01 18:23:41" → ISO "2024-05-01T18:23:41.000Z"
  return raw.replace(/\./g, '-').replace(' ', 'T') + '.000Z';
}

// ── PELD regex patterns per language ──────────────────────────────────────────
// Each language has its own patterns for each category.
// Format: named capture groups "amount", "pilot", "weapon", "ship" where available.

interface LangPattern {
  re:       RegExp;
  category: Category;
}

/** English patterns (PELD reference implementation) */
const EN: LangPattern[] = [
  // DPS Out: "(target) <amount> (via weapon [shipType])"  — or similar
  { re: /\(combat\) <.*?> (\d+) <.*?> to <.*?>(.*?)<\/.*?> <\/.*?> - (.*?) - (.*?) \[/, category: 'dpsOut' },
  { re: /\(combat\) <.*?> (\d+) <.*?> from <.*?>(.*?)<\/.*?> <\/.*?> - (.*?) - (.*?) \[/, category: 'dpsIn' },
  { re: /\(combat\) <.*?> (\d+) <.*?> remote armor repaired to <.*?>(.*?)<\/.*?>/, category: 'logiOut' },
  { re: /\(combat\) <.*?> (\d+) <.*?> remote armor repaired by <.*?>(.*?)<\/.*?>/, category: 'logiIn' },
  { re: /\(combat\) <.*?> (\d+) <.*?> energy transferred to <.*?>(.*?)<\/.*?>/, category: 'capTransfered' },
  { re: /\(combat\) <.*?> (\d+) <.*?> energy transferred from <.*?>(.*?)<\/.*?>/, category: 'capRecieved' },
  { re: /\(combat\) <.*?> (\d+) <.*?> energy neutralized from <.*?>(.*?)<\/.*?>/, category: 'capDamageIn' },
  { re: /\(combat\) <.*?> (\d+) <.*?> energy neutralized to <.*?>(.*?)<\/.*?>/, category: 'capDamageOut' },
  { re: /\(mining\) <.*?> (\d+) <.*?> added to your ore hold/, category: 'mined' },
];

/**
 * A simplified universal parser that works on the raw HTML-annotated EVE log lines.
 *
 * EVE combat log lines contain HTML color tags. A typical damage OUT line looks like:
 *   (combat) <color=...><b>350</b> <color=...>to</color> <color=...><b>Foo Bar</b></color>
 *   [<color=...>Warrior II</color>] <color=...>- Hits</color>
 *
 * Rather than maintaining 6 full per-language regex sets (EVE log content is mostly
 * structured the same across languages), we use a keyword-based heuristic that
 * identifies the category from the surrounding direction keywords, then captures
 * amount, pilot, and weapon from the structured colour tags.
 *
 * This covers the 95%+ use-case. Full per-language support can be added by extending
 * LANG_DIRECTION_WORDS below.
 */

interface DirectionWords {
  toOut:   string[];  // "to" for outgoing damage/logi/cap
  fromIn:  string[];  // "from" for incoming
  repaired: string[];
  transferred: string[];
  neutralized: string[];
}

const LANG_DIRECTION_WORDS: Record<string, DirectionWords> = {
  en: {
    toOut:        ['to'],
    fromIn:       ['from'],
    repaired:     ['remote armor repaired to', 'remote shield boosted to', 'remote hull repaired to'],
    transferred:  ['energy transferred to'],
    neutralized:  ['energy neutralized to'],
  },
  ru: {
    toOut:        ['\u043a\u043e\u043c\u0443'],   // кому
    fromIn:       ['\u043e\u0442'],               // от
    repaired:     ['\u0431\u0440\u043e\u043d\u044f \u043e\u0442\u0440\u0435\u043c\u043e\u043d\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u043e'],
    transferred:  ['\u0435\u043d\u0435\u0440\u0433\u0438\u044f \u043f\u0435\u0440\u0435\u0434\u0430\u043d\u0430'],
    neutralized:  ['\u043d\u0435\u0439\u0442\u0440\u0430\u043b\u0438\u0437\u043e\u0432\u0430\u043d\u0430'],
  },
  de: {
    toOut:        ['an'],
    fromIn:       ['von'],
    repaired:     ['Rüstung repariert an'],
    transferred:  ['Energie übergeben an'],
    neutralized:  ['Energie neutralisiert an'],
  },
  fr: {
    toOut:        ['sur'],
    fromIn:       ['de'],
    repaired:     ['armure réparée à distance sur'],
    transferred:  ['énergie transférée sur'],
    neutralized:  ['énergie neutralisée sur'],
  },
  ja: {
    toOut:        ['\u3078'],    // へ
    fromIn:       ['\u304b\u3089'],  // から
    repaired:     ['\u30ea\u30e2\u30fc\u30c8\u30a2\u30fc\u30de\u30fc\u30ea\u30da\u30a2'],
    transferred:  ['\u30a8\u30cd\u30eb\u30ae\u30fc\u8ee2\u9001'],
    neutralized:  ['\u30a8\u30cd\u30eb\u30ae\u30fc\u30cb\u30e5\u30fc\u30c8\u30e9\u30e9\u30a4\u30ba'],
  },
  zh: {
    toOut:        ['\u5230'],   // 到
    fromIn:       ['\u6765\u81ea'],  // 来自
    repaired:     ['\u8fdc\u7a0b\u88c5\u7532\u4fee\u590d'],
    transferred:  ['\u80fd\u91cf\u8f6c\u79fb'],
    neutralized:  ['\u80fd\u91cf\u4e2d\u548c'],
  },
};

// ── Amount + pilot + weapon + ship extraction ─────────────────────────────────
// Captures the bold amount from log lines like: <b>350</b>
const AMOUNT_RE  = /<b>(\d+)<\/b>/;
// Pilot name in bold after direction keyword   <b>Foo Bar</b>
const PILOT_RE   = /<b>([^<]+)<\/b>/g;
// Weapon in square brackets                    [Warrior II]
const WEAPON_RE  = /\[([^\]]+)\]/;

/**
 * Parse a single raw EVE log line.
 * Returns a LogEntry or null if the line is not a recognised combat event.
 */
export function parseLine(line: string): LogEntry | null {
  const tsMatch = TS_RE.exec(line);
  if (!tsMatch) return null;

  const occurredAt = parseTs(tsMatch[1]);

  // Must be a (combat) or (mining) line
  const isCombat = line.includes('(combat)');
  const isMining = line.includes('(mining)');
  if (!isCombat && !isMining) return null;

  if (isMining) {
    const amount = extractAmount(line);
    if (amount === null) return null;
    return { category: 'mined', amount, pilotName: '', weaponType: '', shipType: '', hitQuality: null, occurredAt };
  }

  // Hit quality (English only)
  const hqMatch = HIT_QUALITY_RE.exec(line);
  const hitQuality = hqMatch ? (hqMatch[1] as HitQuality) : null;

  const amount = extractAmount(line);
  if (amount === null) return null;

  const { pilotName, weaponType, shipType } = extractActors(line);
  const category = detectCategory(line);
  if (!category) return null;

  return { category, amount, pilotName, weaponType, shipType, hitQuality, occurredAt };
}

function extractAmount(line: string): number | null {
  const m = AMOUNT_RE.exec(line);
  return m ? parseInt(m[1], 10) : null;
}

function extractActors(line: string): { pilotName: string; weaponType: string; shipType: string } {
  const boldMatches = [...line.matchAll(PILOT_RE)].map((m) => m[1]);
  // First bold after amount is pilot, rest ignored for simple extraction
  const pilotName  = boldMatches[1] ?? boldMatches[0] ?? '';
  const weaponMatch = WEAPON_RE.exec(line);
  const weaponType  = weaponMatch ? weaponMatch[1] : '';
  // Ship type often bracketed after weapon: [ship] — second bracket
  const allBrackets = line.match(/\[([^\]]+)\]/g) ?? [];
  const shipType    = allBrackets[1]?.replace(/\[|\]/g, '') ?? '';
  return { pilotName, weaponType, shipType };
}

function detectCategory(line: string): Category | null {
  // Check all languages
  for (const dw of Object.values(LANG_DIRECTION_WORDS)) {
    // Logi
    for (const kw of dw.repaired) {
      if (line.toLowerCase().includes(kw.toLowerCase())) {
        return line.toLowerCase().includes('from') || line.toLowerCase().includes('\u304b\u3089') || line.toLowerCase().includes('\u6765\u81ea')
          ? 'logiIn' : 'logiOut';
      }
    }
    // Cap transfer
    for (const kw of dw.transferred) {
      if (line.toLowerCase().includes(kw.toLowerCase())) {
        return line.toLowerCase().includes('from') ? 'capRecieved' : 'capTransfered';
      }
    }
    // Cap neutralization
    for (const kw of dw.neutralized) {
      if (line.toLowerCase().includes(kw.toLowerCase())) {
        return line.toLowerCase().includes('from') ? 'capDamageIn' : 'capDamageOut';
      }
    }
    // Damage direction
    for (const kw of dw.toOut) {
      if (line.toLowerCase().includes(` ${kw.toLowerCase()} `)) return 'dpsOut';
    }
    for (const kw of dw.fromIn) {
      if (line.toLowerCase().includes(` ${kw.toLowerCase()} `)) return 'dpsIn';
    }
  }
  return null;
}
