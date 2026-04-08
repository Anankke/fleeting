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
const count = Number.parseInt(getArg('count', positionalArg(1, '0')), 10);
const intervalMs = Number.parseInt(getArg('interval', positionalArg(2, '1000')), 10);
const characters = getArg('characters', 'Astra Velen,Brin Tors,Kyra Neth')
  .split(',')
  .map(name => name.trim())
  .filter(Boolean);

const opponents = [
  { pilot: 'Guristas Raider', ship: 'Merlin' },
  { pilot: 'Angel Scout', ship: 'Rifter' },
  { pilot: 'Sansha Loyalist', ship: 'Punisher' },
  { pilot: 'Blood Disciple', ship: 'Tristan' },
  { pilot: 'Logi Wingmate', ship: 'Scythe' },
];

const weapons = [
  '200mm AutoCannon I',
  'Heavy Missile Launcher II',
  'Focused Medium Pulse Laser II',
  'Large Shield Transporter II',
  'Medium Capacitor Transmitter II',
  'Heavy Energy Neutralizer II',
  'Miner II',
];

const hitQualities = ['Hits', 'Penetrates', 'Smashes', 'Glances Off', 'Grazes', 'Wrecks'];

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

function buildHeader(characterName) {
  return [
    '------------------------------------------------------------',
    `Session started: ${eveTimestamp()}`,
    `Listener: ${characterName}`,
    '------------------------------------------------------------',
    '',
  ].join('\n');
}

function combatLine(characterName) {
  const ts = eveTimestamp();
  const other = rand(opponents);
  const amount = 50 + Math.floor(Math.random() * 1800);
  const quality = rand(hitQualities);
  const roll = Math.random();

  if (roll < 0.35) {
    return `[ ${ts} ] (combat) <color=0xff00ffff><b>${amount}</b><color=0x77ffffff> to </color><b><color=0xffffffff>${other.pilot}[NPC (${other.ship})]</color></b><font size=10><color=0x77ffffff> - ${rand(weapons.slice(0, 3))} - ${quality}`;
  }
  if (roll < 0.6) {
    return `[ ${ts} ] (combat) <color=0xff00ffff><b>${amount}</b><color=0x77ffffff> from </color><b><color=0xffffffff>${other.pilot}[NPC (${other.ship})]</color></b><font size=10><color=0x77ffffff> - ${rand(weapons.slice(0, 3))} - ${quality}`;
  }
  if (roll < 0.75) {
    return `[ ${ts} ] (combat) <color=0xff00ff00><b>${amount}</b><color=0x77ffffff> remote shield boosted to </color><b><color=0xffffffff>${other.pilot}[ALLY (${other.ship})]</color></b><font size=10><color=0x77ffffff> - Large Shield Transporter II`;
  }
  if (roll < 0.85) {
    return `[ ${ts} ] (combat) <color=0xff00ff00><b>${amount}</b><color=0x77ffffff> remote capacitor transmitted to </color><b><color=0xffffffff>${other.pilot}[ALLY (${other.ship})]</color></b><font size=10><color=0x77ffffff> - Medium Capacitor Transmitter II`;
  }
  if (roll < 0.95) {
    return `[ ${ts} ] (combat) <color=0xff7fffff><b>${amount}</b><color=0x77ffffff> to </color><b><color=0xffffffff>${other.pilot}[NPC (${other.ship})]</color></b><font size=10><color=0x77ffffff> - Heavy Energy Neutralizer II`;
  }
  return `[ ${ts} ] (mining) <color=0xfff2cc0c><b>${amount}</b>`;
}

function ensureLogs() {
  mkdirSync(targetDir, { recursive: true });
  return characters.map((characterName, index) => {
    const fileName = `${fileStamp()}_${process.pid + index}.txt`;
    const filePath = resolve(targetDir, fileName);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, buildHeader(characterName), 'utf8');
    }
    return { characterName, filePath };
  });
}

const files = ensureLogs();
let written = 0;

function writeBatch() {
  for (const { characterName, filePath } of files) {
    appendFileSync(filePath, combatLine(characterName) + '\n', 'utf8');
    written++;
  }
  console.log(`[mockCombatLogs] wrote ${written} events to ${targetDir}`);
  if (count > 0 && written >= count) {
    process.exit(0);
  }
}

console.log(`[mockCombatLogs] target=${targetDir}`);
console.log(`[mockCombatLogs] characters=${characters.join(', ')}`);
console.log(`[mockCombatLogs] intervalMs=${intervalMs} count=${count || 'infinite'}`);

writeBatch();

if (count === 0 || written < count) {
  setInterval(writeBatch, intervalMs);
}
