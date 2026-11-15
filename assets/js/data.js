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
  { name:'South India', lat:13.08, lng:77.58, typicalBortle:6 },
  { name:'Atacama', lat:-23.86, lng:-69.13, typicalBortle:1 },
  { name:'Central Alps', lat:46.55, lng:10.8, typicalBortle:3 },
  { name:'Canary Islands', lat:28.3, lng:-16.6, typicalBortle:2 },
  { name:'Namibia', lat:-23.0, lng:17.0, typicalBortle:1 },
  { name:'Australian Outback', lat:-25.0, lng:134.0, typicalBortle:1 },
  { name:'Hawaii', lat:19.8, lng:-155.5, typicalBortle:2 }
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
