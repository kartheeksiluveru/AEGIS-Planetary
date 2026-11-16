const DEMO_SEED = 0xAE615;
const REFERENCE_TIME = Date.UTC(2026, 10, 15, 18, 0, 0);
export const HIGH_RADIANCE_THRESHOLD = 75;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeSubmissionStatus({ cloudFractionPct, viirsRadiance }) {
  if (cloudFractionPct > 35) return 'Rejected: cloud';
  if (viirsRadiance > HIGH_RADIANCE_THRESHOLD) return 'Rejected: glare';
  return 'Accepted';
}

export function calculateScore({ clarityScore, streakDays, blindSpotsFilled }) {
  return Number((0.5 * clarityScore
    + 0.3 * Math.min(streakDays, 30) / 30 * 100
    + 0.2 * Math.min(blindSpotsFilled, 10) / 10 * 100).toFixed(1));
}

export const sectors = [
  { name:'South India', lat:13.08, lng:77.58, typicalBortle:6, utcOffsetMinutes:330 },
  { name:'Atacama', lat:-23.86, lng:-69.13, typicalBortle:1, utcOffsetMinutes:-240 },
  { name:'Central Alps', lat:46.55, lng:10.8, typicalBortle:3, utcOffsetMinutes:60 },
  { name:'Canary Islands', lat:28.3, lng:-16.6, typicalBortle:2, utcOffsetMinutes:0 },
  { name:'Namibia', lat:-23.0, lng:17.0, typicalBortle:1, utcOffsetMinutes:120 },
  { name:'Australian Outback', lat:-25.0, lng:134.0, typicalBortle:1, utcOffsetMinutes:600 },
  { name:'Hawaii', lat:19.8, lng:-155.5, typicalBortle:2, utcOffsetMinutes:-600 }
];

const random = seededRandom(DEMO_SEED);
const equipment = [
  '135 mm lens · cooled CMOS',
  'Newtonian 200 mm · mono CMOS',
  'Refractor 80 mm · OSC camera',
  'RASA 8 · cooled CMOS',
  'Telephoto 300 mm · DSLR'
];
const callsignPart = ['LYRA','VEGA','ORION','SIRIUS','NOVA','ALTAIR','DENEB'];

export const nodes = sectors.flatMap((sector, sectorIndex) => Array.from({ length:4 }, (_, localIndex) => {
  const index = sectorIndex * 4 + localIndex;
  const streakDays = Math.floor(random() * 43) + 1;
  const blindSpotsFilled = Math.floor(random() * 16);
  const node = {
    callsign:`${callsignPart[(index + sectorIndex) % callsignPart.length]}-${String(index + 1).padStart(2, '0')}`,
    sector:sector.name,
    lat:Number((sector.lat + (random() - .5) * .7).toFixed(4)),
    lng:Number((sector.lng + (random() - .5) * .9).toFixed(4)),
    equipment:equipment[Math.floor(random() * equipment.length)],
    streakDays,
    clarityScore:Math.floor(random() * 36) + 64,
    blindSpotsFilled,
    joinedDate:new Date(REFERENCE_TIME - (25 + Math.floor(random() * 550)) * 86400000).toISOString().slice(0,10),
    status:random() > .17 ? 'online' : 'standby'
  };
  return { ...node, totalScore:calculateScore(node) };
}));

export const submissions = Array.from({ length:48 }, (_, index) => {
  const node = nodes[Math.floor(random() * nodes.length)];
  const record = {
    id:`AEG-${String(index + 1).padStart(4, '0')}`,
    nodeCallsign:node.callsign,
    sector:node.sector,
    timestamp:new Date(REFERENCE_TIME - Math.floor(random() * 4 * 86400000)).toISOString(),
    exposureSeconds:Math.round((30 + random() * 270) / 5) * 5,
    cloudFractionPct:Number((random() * 72).toFixed(1)),
    viirsRadiance:Number((2 + random() * 130).toFixed(1))
  };
  return { ...record, status:computeSubmissionStatus(record) };
});

export const timeSlots = [
  { id:'twilight-end', label:'Evening twilight end', minuteOfDay:20 * 60 + 30 },
  { id:'late-evening', label:'Late evening', minuteOfDay:22 * 60 + 30 },
  { id:'midnight', label:'Midnight', minuteOfDay:0 * 60 + 30 },
  { id:'pre-dawn', label:'Pre-dawn', minuteOfDay:4 * 60 + 30 }
];

export const archiveConfiguration = Object.freeze({ days:30, nightsPerSector:30, framesPerNight:4, seed:0xAE615, simulationLabel:'SIMULATED DEMO DATA' });
const ARCHIVE_END_DATE = new Date().toISOString().slice(0, 10);

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function moonIlluminationAt(timestamp) {
  const synodicMonth = 29.530588853 * 86400000;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const phase = ((timestamp - knownNewMoon) / synodicMonth % 1 + 1) % 1;
  return Number(((1 - Math.cos(phase * Math.PI * 2)) * 50).toFixed(1));
}

function localDateAtAge(ageDays) {
  const date = new Date(`${ARCHIVE_END_DATE}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ageDays);
  return date.toISOString().slice(0, 10);
}

function utcTimestampForSlot(localDate, minuteOfDay, offsetMinutes) {
  const [year, month, day] = localDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60) - offsetMinutes * 60000;
}

function makeArchiveFrame(sector, sectorIndex, ageDays, slot, slotIndex) {
  const localDate = localDateAtAge(ageDays);
  const timestampMs = utcTimestampForSlot(localDate, slot.minuteOfDay, sector.utcOffsetMinutes);
  const timestampUTC = new Date(timestampMs).toISOString();
  const seed = hashSeed(`${archiveConfiguration.seed}:${sector.name}:${localDate}:${slot.id}`);
  const random = seededRandom(seed);
  const nodesInSector = nodes.filter((node) => node.sector === sector.name);
  const nodeIndex = (slotIndex + ageDays) % nodesInSector.length;
  const node = nodesInSector[nodeIndex];
  const moonIllumination = moonIlluminationAt(timestampMs);
  const alpsFront = sector.name === 'Central Alps' && ageDays <= 5;
  const canaryHaze = sector.name === 'Canary Islands' && ageDays <= 5;
  const southIndiaGlow = sector.name === 'South India' && ageDays <= 10;
  const cloudFractionPct = Number(clamp(
    7 + random() * 23 + (sector.typicalBortle > 4 ? random() * 12 : 0) + (alpsFront ? 38 : 0),
    2,
    92
  ).toFixed(1));
  const transparency = Number(clamp(91 - cloudFractionPct * 0.24 - (canaryHaze ? 34 : 0) + (random() - 0.5) * 8, 18, 98).toFixed(1));
  const baselineRadiance = 7 + sector.typicalBortle * 8 + random() * 12;
  const viirsRadiance = Number((baselineRadiance * (southIndiaGlow ? 1.38 : 1) + (southIndiaGlow ? 11 : 0)).toFixed(1));
  const moonGlow = moonIllumination * 0.16;
  const skyBackground = Number(clamp(12 + sector.typicalBortle * 6 + moonGlow + (canaryHaze ? 11 : 0) + (southIndiaGlow ? 19 : 0) + random() * 7, 4, 96).toFixed(1));
  const starCount = Math.round(205 * (1 - cloudFractionPct / 100) * (transparency / 100) * (1 - moonIllumination / 235) * (1 - skyBackground / 260));
  const status = computeSubmissionStatus({ cloudFractionPct, viirsRadiance });
  const events = [
    ...(alpsFront ? ['Cloud front over the Central Alps'] : []),
    ...(canaryHaze ? ['Saharan dust haze episode over the Canary Islands'] : []),
    ...(moonIllumination >= 88 ? ['Naturally bright moon phase'] : []),
    ...(southIndiaGlow ? ['New urban light source in South India'] : [])
  ];
  return {
    id:`FRAME-${String(sectorIndex + 1).padStart(2, '0')}-${localDate.replaceAll('-', '')}-${slot.id}`,
    sector:sector.name,
    nodeCallsign:node.callsign,
    timestampUTC,
    localDate,
    localTime:`${String(Math.floor(slot.minuteOfDay / 60)).padStart(2, '0')}:${String(slot.minuteOfDay % 60).padStart(2, '0')}`,
    timeSlot:slot.id,
    timeSlotLabel:slot.label,
    utcOffsetMinutes:sector.utcOffsetMinutes,
    exposureSeconds:[30, 45, 60, 90][(slotIndex + ageDays) % 4],
    cameraProfile:node.equipment,
    seed,
    cloudFractionPct,
    viirsRadiance,
    moonIllumination,
    skyBackground,
    starCount,
    transparency,
    status,
    simulated:true,
    events
  };
}

export const frameArchive = sectors.flatMap((sector, sectorIndex) => Array.from({ length:archiveConfiguration.nightsPerSector }, (_, ageDays) =>
  timeSlots.map((slot, slotIndex) => makeArchiveFrame(sector, sectorIndex, ageDays, slot, slotIndex))
).flat());

function resolveSectorName(sector) {
  return typeof sector === 'string' ? sector : sector?.name;
}

function resolveSlotId(timeSlot) {
  return typeof timeSlot === 'string' ? timeSlot : timeSlot?.id;
}

function localMinuteDifference(frame, timeSlot) {
  const slot = timeSlots.find((item) => item.id === resolveSlotId(timeSlot));
  if (!slot) return Infinity;
  const [hours, minutes] = frame.localTime.split(':').map(Number);
  return Math.abs(hours * 60 + minutes - slot.minuteOfDay);
}

export function findBaseline(sector, date, timeSlot, toleranceMinutes = 90, options = {}) {
  return frameArchive
    .filter((frame) => frame.sector === resolveSectorName(sector)
      && frame.localDate === date
      && frame.timeSlot === resolveSlotId(timeSlot)
      && localMinuteDifference(frame, timeSlot) <= toleranceMinutes
      && (!options.nodeCallsign || frame.nodeCallsign === options.nodeCallsign))
    .sort((a, b) => localMinuteDifference(a, timeSlot) - localMinuteDifference(b, timeSlot))[0] || null;
}

export function findLatest(sector, timeSlot, toleranceMinutes = 90, options = {}) {
  return frameArchive
    .filter((frame) => frame.sector === resolveSectorName(sector)
      && frame.timeSlot === resolveSlotId(timeSlot)
      && localMinuteDifference(frame, timeSlot) <= toleranceMinutes
      && (!options.nodeCallsign || frame.nodeCallsign === options.nodeCallsign))
    .sort((a, b) => Date.parse(b.timestampUTC) - Date.parse(a.timestampUTC))[0] || null;
}

export function getHistory(sector, timeSlot, days = 7) {
  return frameArchive
    .filter((frame) => frame.sector === resolveSectorName(sector) && frame.timeSlot === resolveSlotId(timeSlot))
    .sort((a, b) => Date.parse(b.timestampUTC) - Date.parse(a.timestampUTC))
    .slice(0, Math.max(0, days))
    .reverse();
}
