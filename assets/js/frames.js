function randomFrom(seed) {
  let state = Number(seed) >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function drawFrame(canvas, { seed = 1, cloud = 0, glow = 0.35, size = 640, starCount, transparency = 100, moonIllumination = 0, haze = 0, lightPollution = 0 } = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('drawFrame expects a canvas element');
  const dimensions = typeof size === 'number' ? { width:size, height:size } : size;
  const width = Math.max(1, Math.round(dimensions.width || 640));
  const height = Math.max(1, Math.round(dimensions.height || width));
  const context = canvas.getContext('2d');
  if (!context) return;
  canvas.width = width;
  canvas.height = height;

  const random = randomFrom(seed);
  const cover = Math.max(0, Math.min(100, Number(cloud) || 0)) / 100;
  context.fillStyle = '#050817';
  context.fillRect(0, 0, width, height);

  const spaceGlow = context.createRadialGradient(width * .52, height * .36, 0, width * .52, height * .36, width * .72);
  spaceGlow.addColorStop(0, `rgba(36, 89, 148, ${Math.max(0, Math.min(.65, Number(glow) || 0))})`);
  spaceGlow.addColorStop(1, 'rgba(5, 8, 23, 0)');
  context.fillStyle = spaceGlow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.translate(width * .51, height * .44);
  context.rotate(-.34);
  const milkyWay = context.createLinearGradient(0, -height * .35, 0, height * .35);
  milkyWay.addColorStop(0, 'rgba(90, 133, 190, 0)');
  milkyWay.addColorStop(.35, 'rgba(126, 164, 210, .045)');
  milkyWay.addColorStop(.52, 'rgba(185, 207, 237, .11)');
  milkyWay.addColorStop(.68, 'rgba(82, 129, 185, .055)');
  milkyWay.addColorStop(1, 'rgba(70, 116, 170, 0)');
  context.fillStyle = milkyWay;
  context.fillRect(-width * .8, -height * .35, width * 1.6, height * .7);
  context.restore();

  const drawnStarCount = Number.isFinite(Number(starCount)) ? Math.max(0, Math.min(800, Math.round(Number(starCount)))) : Math.floor(width * height / 850);
  const visibility = Math.max(0.08, Math.min(1, Number(transparency) / 100)) * (1 - Math.max(0, Math.min(100, Number(moonIllumination))) / 260);
  for (let index = 0; index < drawnStarCount; index += 1) {
    const x = random() * width;
    const y = random() * height * .82;
    const radius = .6 + random() * 1.05;
    const alpha = (.35 + random() * .65) * visibility;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = `rgba(${random() > .84 ? '135, 207, 245' : '232, 240, 255'}, ${alpha})`;
    context.fill();
  }

  const horizon = context.createLinearGradient(0, height * .66, 0, height);
  horizon.addColorStop(0, 'rgba(245, 165, 36, 0)');
  horizon.addColorStop(.7, `rgba(245, 165, 36, ${.04 + (1 - cover) * .09})`);
  horizon.addColorStop(1, 'rgba(245, 165, 36, .2)');
  context.fillStyle = horizon;
  context.fillRect(0, height * .62, width, height * .38);

  const cloudCount = Math.round(cover * 24);
  for (let index = 0; index < cloudCount; index += 1) {
    const x = random() * width;
    const y = random() * height * .82;
    const radiusX = width * (.025 + random() * .075);
    const radiusY = height * (.008 + random() * .025);
    const patch = context.createRadialGradient(x, y, 0, x, y, radiusX);
    patch.addColorStop(0, `rgba(174, 199, 226, ${.035 + cover * .13})`);
    patch.addColorStop(.7, `rgba(126, 153, 188, ${.025 + cover * .08})`);
    patch.addColorStop(1, 'rgba(126, 153, 188, 0)');
    context.beginPath();
    context.ellipse(x, y, radiusX, radiusY, (random() - .5) * .5, 0, Math.PI * 2);
    context.fillStyle = patch;
    context.fill();
  }

  const light = Math.max(0, Math.min(100, Number(lightPollution)));
  if (light > 0) {
    const horizonGlow = context.createRadialGradient(width * .5, height, 0, width * .5, height, width * .75);
    horizonGlow.addColorStop(0, `rgba(245, 165, 36, ${light / 190})`);
    horizonGlow.addColorStop(1, 'rgba(245, 165, 36, 0)');
    context.fillStyle = horizonGlow;
    context.fillRect(0, height * .58, width, height * .42);
  }

  const hazeOpacity = Math.max(0, Math.min(100, Number(haze))) / 100;
  if (hazeOpacity > 0) {
    context.fillStyle = `rgba(175, 187, 207, ${hazeOpacity * .32})`;
    context.fillRect(0, 0, width, height * .84);
  }

  const moon = Math.max(0, Math.min(100, Number(moonIllumination)));
  if (moon > 0) {
    const moonX = width * .82;
    const moonY = height * .2;
    const moonRadius = Math.max(4, Math.min(14, width * .045));
    const moonGlow = context.createRadialGradient(moonX, moonY, moonRadius * .5, moonX, moonY, moonRadius * 2.3);
    moonGlow.addColorStop(0, `rgba(222, 232, 250, ${moon / 120})`);
    moonGlow.addColorStop(1, 'rgba(222, 232, 250, 0)');
    context.fillStyle = moonGlow;
    context.fillRect(moonX - moonRadius * 2.3, moonY - moonRadius * 2.3, moonRadius * 4.6, moonRadius * 4.6);
    context.beginPath();
    context.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
    context.fillStyle = `rgba(222, 232, 250, ${moon / 115})`;
    context.fill();
  }
}
