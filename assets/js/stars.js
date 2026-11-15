const canvas = document.createElement('canvas');
canvas.className = 'aegis-stars';
canvas.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas);
const context = canvas.getContext('2d', { alpha:true });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let width = 0, height = 0, frame = 0, lastPaint = 0;
let stars = [];

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  let state = 41017;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  stars = Array.from({ length:Math.min(210, Math.round(width * height / 7500)) }, () => ({
    x:random() * width,
    y:random() * height,
    radius:.35 + random() * .85,
    opacity:.18 + random() * .48,
    drift:.06 + random() * .2,
    tint:random() > .84
  }));
  draw(0);
}
function draw(time) {
  context.clearRect(0, 0, width, height);
  for (const star of stars) {
    const drift = reducedMotion ? 0 : Math.sin(time * .00012 + star.x) * star.drift;
    context.beginPath();
    context.arc(star.x + drift, star.y, star.radius, 0, Math.PI * 2);
    context.fillStyle = star.tint ? `rgba(113, 211, 255, ${star.opacity})` : `rgba(232, 240, 255, ${star.opacity})`;
    context.fill();
  }
}
function animate(time) {
  frame = requestAnimationFrame(animate);
  if (time - lastPaint < 66) return;
  lastPaint = time;
  draw(time);
}
function handleVisibility() {
  cancelAnimationFrame(frame);
  if (!document.hidden && !reducedMotion) frame = requestAnimationFrame(animate);
  if (!document.hidden && reducedMotion) draw(0);
}
window.addEventListener('resize', resize, { passive:true });
document.addEventListener('visibilitychange', handleVisibility);
resize();
if (!reducedMotion) frame = requestAnimationFrame(animate);
