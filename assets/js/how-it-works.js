import { computeSubmissionStatus, HIGH_RADIANCE_THRESHOLD } from './data.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
document.documentElement.classList.add('has-js');

const revealSections = [...document.querySelectorAll('.how-section, .how-hero')];
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08 });
  revealSections.forEach((section) => {
    section.classList.add('reveal');
    revealObserver.observe(section);
  });
} else {
  revealSections.forEach((section) => section.classList.add('is-revealed'));
}

const sectionLinks = [...document.querySelectorAll('.step-nav a')];
if ('IntersectionObserver' in window) {
  const sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    sectionLinks.forEach((link) => {
      if (link.getAttribute('href') === `#${visible.target.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-18% 0px -68% 0px', threshold: [0, 0.15, 0.4] });
  document.querySelectorAll('.how-section').forEach((section) => sectionObserver.observe(section));
}

const DAY_MS = 86400000;
const baseDay = new Date();
baseDay.setHours(0, 0, 0, 0);
const dayLabels = ['Day −3', 'Day −2', 'Day −1', 'Today'];
const dayTiles = [...document.querySelectorAll('.day-tile')];
const scrubber = document.querySelector('#window-scrubber');
const scrubberOutput = document.querySelector('#scrubber-output');
const windowDate = document.querySelector('#window-date');
const shellCount = document.querySelector('#shell-count');
const windowStatus = document.querySelector('#window-status');
const playButton = document.querySelector('#window-play');
const previousButton = document.querySelector('#window-previous');
const nextButton = document.querySelector('#window-next');
const motionNote = document.querySelector('#motion-note');
let windowStep = 0;
let playTimer = null;

function formatDay(date) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}

function renderWindow(step) {
  const previousStep = windowStep;
  windowStep = Math.max(0, Math.min(Number(step), Number(scrubber.max)));
  if (windowStep > previousStep) {
    const newestSlice = dayTiles.at(-1);
    newestSlice.classList.remove('is-entering');
    void newestSlice.offsetWidth;
    newestSlice.classList.add('is-entering');
  }
  scrubber.value = String(windowStep);
  scrubberOutput.value = `${windowStep + 1} / ${Number(scrubber.max) + 1}`;
  windowDate.textContent = `Observation day ${windowStep + 1}`;
  let totalFrames = 0;
  dayTiles.forEach((tile, index) => {
    const date = new Date(baseDay.getTime() + (windowStep - 3 + index) * DAY_MS);
    const frameCount = 7 + ((windowStep * 3 + index * 5) % 10);
    totalFrames += frameCount;
    tile.querySelector('.tile-date').textContent = formatDay(date);
    tile.querySelector('.tile-count').textContent = `${frameCount} sample frames`;
    tile.setAttribute('aria-label', `${dayLabels[index]}, ${formatDay(date)}, ${frameCount} sample frames`);
  });
  shellCount.textContent = String(totalFrames);
  windowStatus.textContent = `Day ${windowStep + 1}: the oldest slice rolled out; a new Today slice joined the four-day window.`;
  previousButton.disabled = windowStep === 0;
  nextButton.disabled = windowStep === Number(scrubber.max);
}

function stopPlayback() {
  if (playTimer !== null) window.clearInterval(playTimer);
  playTimer = null;
  playButton.textContent = 'Play';
  playButton.setAttribute('aria-label', 'Play rolling window');
}

function startPlayback() {
  if (windowStep >= Number(scrubber.max)) renderWindow(0);
  playButton.textContent = 'Pause';
  playButton.setAttribute('aria-label', 'Pause rolling window');
  playTimer = window.setInterval(() => {
    if (windowStep >= Number(scrubber.max)) {
      stopPlayback();
      return;
    }
    renderWindow(windowStep + 1);
  }, 2100);
}

renderWindow(0);
scrubber.addEventListener('input', () => { stopPlayback(); renderWindow(scrubber.value); });
previousButton.addEventListener('click', () => { stopPlayback(); renderWindow(windowStep - 1); });
nextButton.addEventListener('click', () => { stopPlayback(); renderWindow(windowStep + 1); });
playButton.addEventListener('click', () => { if (playTimer === null) startPlayback(); else stopPlayback(); });
if (reducedMotion.matches) {
  playButton.hidden = true;
  motionNote.hidden = false;
}
reducedMotion.addEventListener?.('change', (event) => {
  if (event.matches) {
    stopPlayback();
    playButton.hidden = true;
    motionNote.hidden = false;
  } else {
    playButton.hidden = false;
    motionNote.hidden = true;
  }
});

const cloudSlider = document.querySelector('#cloud-slider');
const radianceSlider = document.querySelector('#radiance-slider');
const cloudValue = document.querySelector('#cloud-value');
const radianceValue = document.querySelector('#radiance-value');
const verdictCard = document.querySelector('#verdict-card');
const verdict = document.querySelector('#verdict');
const weight = document.querySelector('#weight');
const reason = document.querySelector('#reason');
const acceptedStep = document.querySelector('#accepted-step');
const rejectedStep = document.querySelector('#rejected-step');

function updateValidation() {
  const cloudFractionPct = Number(cloudSlider.value);
  const viirsRadiance = Number(radianceSlider.value);
  const status = computeSubmissionStatus({ cloudFractionPct, viirsRadiance });
  const normalizedWeight = Math.max(0, 1 - viirsRadiance / (HIGH_RADIANCE_THRESHOLD * 2));
  const formattedWeight = `${Math.round(normalizedWeight * 100)}%`;
  cloudValue.value = `${cloudFractionPct}%`;
  radianceValue.value = `${viirsRadiance} units`;
  verdict.textContent = status;
  weight.textContent = formattedWeight;
  const isAccepted = status === 'Accepted';
  verdictCard.classList.toggle('is-rejected', !isAccepted);
  acceptedStep.classList.toggle('is-active', isAccepted);
  rejectedStep.classList.toggle('is-active', !isAccepted);
  if (status === 'Rejected: cloud') reason.textContent = `Cloud fraction is above 35%, so this frame is rejected before its radiance weight is considered.`;
  else if (status === 'Rejected: glare') reason.textContent = `Radiance is above the demo limit of ${HIGH_RADIANCE_THRESHOLD}, so the frame is rejected for glare.`;
  else reason.textContent = `Within both demo thresholds; this simplified VIIRS mapping gives lower radiance a higher weight.`;
}

cloudSlider.addEventListener('input', updateValidation);
radianceSlider.addEventListener('input', updateValidation);
updateValidation();

const nodePositions = [
  { x: 92, y: 95 }, { x: 202, y: 66 }, { x: 322, y: 122 },
  { x: 448, y: 71 }, { x: 550, y: 177 }, { x: 436, y: 263 }, { x: 182, y: 242 },
];
const nodes = [...document.querySelectorAll('.network-node')];
const failoverCaption = document.querySelector('#failover-caption');
const failoverReset = document.querySelector('#failover-reset');

function resetFailover() {
  nodes.forEach((node, index) => {
    node.classList.remove('is-clouded', 'is-failover');
    node.setAttribute('aria-pressed', 'false');
    node.setAttribute('aria-label', `Node ${String(index + 1).padStart(2, '0')}, clear. Simulate cloud cover`);
    node.querySelector('.coverage-ring').setAttribute('r', '35');
  });
  failoverCaption.textContent = 'All seven nodes are clear in this schematic. Select a node to simulate cloud cover.';
}

function cloudNode(failedIndex) {
  resetFailover();
  const failedNode = nodes[failedIndex];
  failedNode.classList.add('is-clouded');
  failedNode.setAttribute('aria-pressed', 'true');
  failedNode.setAttribute('aria-label', `Node ${String(failedIndex + 1).padStart(2, '0')}, clouded out. Simulate cloud cover`);
  const origin = nodePositions[failedIndex];
  const neighbors = nodePositions.map((position, index) => ({ index, distance: Math.hypot(position.x - origin.x, position.y - origin.y) })).filter(({ index }) => index !== failedIndex).sort((a, b) => a.distance - b.distance);
  const nearest = nodes[neighbors[0].index];
  nearest.classList.add('is-failover');
  nearest.setAttribute('aria-label', `Node ${String(neighbors[0].index + 1).padStart(2, '0')}, clear and expanded failover coverage`);
  nearest.querySelector('.coverage-ring').setAttribute('r', '53');
  failoverCaption.textContent = `Node ${String(failedIndex + 1).padStart(2, '0')} is clouded out. Node ${String(neighbors[0].index + 1).padStart(2, '0')} is the nearest clear neighbor and expands its schematic coverage.`;
}

nodes.forEach((node, index) => {
  node.addEventListener('click', () => cloudNode(index));
  node.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    cloudNode(index);
  });
});
failoverReset.addEventListener('click', resetFailover);
