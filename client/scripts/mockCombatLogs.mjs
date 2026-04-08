import { mkdirSync, existsSync, writeFileSync, appendFileSync } from 'fs';
import { resolve } from 'path';

const argv = process.argv.slice(2);

function positionalArg(index, fallback) {
  const value = argv[index];
  return value == null || value.startsWith('--') ? fallback : value;
}

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const targetDir = resolve(process.cwd(), getArg('dir', positionalArg(0, './mock-logs')));
const count = Number.parseInt(getArg('count', positionalArg(1, '120')), 10);
const intervalMs = Number.parseInt(getArg('interval', positionalArg(2, '1000')), 10);
const MOCK_CHARACTER_NAME = 'Maria Taylor';
const MOCK_CHARACTER_ID = '2114299824';

const opponents = [
  { pilot: 'Opionia Tek', corp: 'AIR', alliance: 'INIT.', ship: 'Devoter' },
  { pilot: 'boernl', corp: 'FALG', alliance: 'INIT.', ship: 'Stiletto' },
  { pilot: 'James Cendragon', corp: 'BANR', alliance: 'INIT.', ship: 'Crow' },
  { pilot: 'tag123k', corp: 'YAGAS', alliance: 'INIT.', ship: 'Muninn' },
  { pilot: 'linx005 Shiyurida', corp: '.DSN', alliance: 'FRT', ship: 'Guardian' },
  { pilot: 'MatatabiSoundSystem', corp: '.SMAC', alliance: 'FRT', ship: 'Guardian' },
];

const damageWeapons = [
  '200mm AutoCannon I',
  'Heavy Missile Launcher II',
  'Focused Medium Pulse Laser II',
  'Mega Pulse Laser II',
  'Tachyon Beam Laser II',
];
const capWeapon = 'Large Inductive Compact Remote Capacitor Transmitter';
const armorWeapon = 'Large Coaxial Compact Remote Armor Repairer';

const hitQualities = ['Hits', 'Penetrates', 'Smashes', 'Glances Off', 'Grazes', 'Wrecks'];
const hints = [
  'Attempting to join a channel',
  'Please wait...',
  'Following Ezio Harry in warp',
  'Target is invulnerable.',
];
const notifications = [
  'Karacal Aivoras has initiated self-destruct of their Capsule, it will explode in 120 seconds.',
  'Machuugoo has initiated self-destruct of their Capsule, it will explode in 120 seconds.',
  'Capsule belonging to Ocho Askiras self-destructs.',
];

function rand(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function eveTimestamp(date = new Date()) {
  return `${date.getUTCFullYear()}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function fileStamp(date = new Date()) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}_${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function eventTimestamp(date = new Date()) {
  return `${date.getUTCFullYear()}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function actorBlock(actor) {
  return `${actor.pilot}[${actor.corp} (${actor.ship})]`;
}

function buildHeader(characterName) {
  return [
    '------------------------------------------------------------',
    '  Gamelog',
    `Listener: ${characterName}`,
    `Session Started: ${eveTimestamp()}`,
    '------------------------------------------------------------',
    '',
  ].join('\n');
}

function combatLine(characterName, mode) {
  const ts = eventTimestamp();
  const other = rand(opponents);
  const amount = Math.floor(Math.random() * 1800);
  const quality = rand(hitQualities);

  if (mode === 'dpsOut') {
    return `[ ${ts} ] (combat) <color=0xff00ffff><b>${amount}</b><color=0x77ffffff><font size=10>to</font> <color=0xffffffff><b>${actorBlock(other)}</b><color=0xFFFFFFFF><b> -</b> <color=0x77ffffff><font size=10> - ${rand(damageWeapons)} - ${quality}</font>`;
  }
  if (mode === 'dpsIn') {
    return `[ ${ts} ] (combat) <color=0xff00ffff><b>${amount}</b><color=0x77ffffff><font size=10>from</font> <color=0xffffffff><b>${actorBlock(other)}</b><color=0xFFFFFFFF><b> -</b> <color=0x77ffffff><font size=10> - ${rand(damageWeapons)} - ${quality}</font>`;
  }
  if (mode === 'capOut') {
    return `[ ${ts} ] (combat) <color=0xffccff66><b>${amount}</b><color=0x77ffffff><font size=10> remote capacitor transmitted to </font><b><color=0xffffffff>${actorBlock(other)}<color=0xFFFFFFFF><b> -</b><color=0x77ffffff><font size=10> - ${capWeapon}</font>`;
  }
  if (mode === 'capIn') {
    return `[ ${ts} ] (combat) <color=0xffccff66><b>${amount}</b><color=0x77ffffff><font size=10> remote capacitor transmitted by </font><b><color=0xffffffff>${actorBlock(other)}<color=0xFFFFFFFF><b> -</b><color=0x77ffffff><font size=10> - ${capWeapon}</font>`;
  }
  if (mode === 'logiOut') {
    return `[ ${ts} ] (combat) <color=0xffccff66><b>${amount}</b><color=0x77ffffff><font size=10> remote armor repaired to </font><b><color=0xffffffff>${actorBlock(other)}<color=0xFFFFFFFF><b> -</b><color=0x77ffffff><font size=10> - ${armorWeapon}</font>`;
  }
  if (mode === 'neutOut') {
    return `[ ${ts} ] (combat) <color=0xff7fffff><b>${amount}</b><color=0x77ffffff><font size=10>to</font> <color=0xffffffff><b>${actorBlock(other)}</b><color=0xFFFFFFFF><b> -</b> <color=0x77ffffff><font size=10> - Heavy Energy Neutralizer II</font>`;
  }
  if (mode === 'neutIn') {
    return `[ ${ts} ] (combat) <color=0xffe57f7f><b>${amount}</b><color=0x77ffffff><font size=10>from</font> <color=0xffffffff><b>${actorBlock(other)}</b><color=0xFFFFFFFF><b> -</b> <color=0x77ffffff><font size=10> - Heavy Energy Neutralizer II</font>`;
  }

  return `[ ${ts} ] (mining) <color=0xfff2cc0c><b>${amount}</b>`;
}

function flavorLine() {
  const ts = eventTimestamp();
  const roll = Math.random();
  if (roll < 0.65) {
    return `[ ${ts} ] (hint) ${rand(hints)}`;
  }
  return `[ ${ts} ] (notify) ${rand(notifications)}`;
}

function nextLine(characterName) {
  const roll = Math.random();
  // Prefer damage events heavily: 70% DPS (in/out), 20% utility combat, 10% flavor/mining.
  if (roll < 0.35) return combatLine(characterName, 'dpsIn');
  if (roll < 0.70) return combatLine(characterName, 'dpsOut');
  if (roll < 0.80) return combatLine(characterName, 'capIn');
  if (roll < 0.88) return combatLine(characterName, 'capOut');
  if (roll < 0.92) return combatLine(characterName, 'logiOut');
  if (roll < 0.95) return combatLine(characterName, 'neutIn');
  if (roll < 0.98) return combatLine(characterName, 'neutOut');
  if (roll < 0.995) return flavorLine();
  return combatLine(characterName, 'mining');
}

function ensureLogs() {
  mkdirSync(targetDir, { recursive: true });
  const fileName = `${fileStamp()}_${MOCK_CHARACTER_ID}.txt`;
  const filePath = resolve(targetDir, fileName);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, buildHeader(MOCK_CHARACTER_NAME), 'utf8');
  }
  return [{ characterName: MOCK_CHARACTER_NAME, filePath }];
}

const files = ensureLogs();
let written = 0;

function writeBatch() {
  for (const { characterName, filePath } of files) {
    appendFileSync(filePath, nextLine(characterName) + '\n', 'utf8');
    written++;
  }
  console.log(`[mockCombatLogs] wrote ${written} events to ${targetDir}`);
  if (count > 0 && written >= count) {
    process.exit(0);
  }
}

console.log(`[mockCombatLogs] target=${targetDir}`);
console.log(`[mockCombatLogs] character=${MOCK_CHARACTER_NAME} (${MOCK_CHARACTER_ID})`);
console.log(`[mockCombatLogs] intervalMs=${intervalMs} count=${count || 'infinite'}`);

writeBatch();

if (count === 0 || written < count) {
  setInterval(writeBatch, intervalMs);
}
