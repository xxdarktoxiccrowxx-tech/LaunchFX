// Canvas 2D preserves the same focal forms and three-stage timing without WebGL.
const TAU = Math.PI * 2;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = n => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };

export function renderFallback(ctx, width, height, time, progress, options, desktopImage) {
  const p = clamp(progress), s = Math.min(width, height), cx = width / 2, cy = height / 2;
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
  if (p <= 0 || p >= .999) return;
  const intensity = clamp(Number.isFinite(options.intensity) ? options.intensity : .75);
  const t = time * (.28 + intensity * .54), enter = smooth(0, .2, p), leave = smooth(.64, .96, p);
  const opacity = smooth(0, .055, p) * (1 - smooth(.88, 1, p));
  const accent = /^#[0-9a-f]{6}$/i.test(options.accent) ? options.accent : '#86a8ff';
  const seed = Number.isFinite(options.seed) ? options.seed : 42, random = n => hash(n + seed);
  const effect = options.effectId;
  ctx.save(); ctx.translate(cx, cy); ctx.globalAlpha = opacity;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const dot = (x, y, radius, color) => {
    if (radius <= 0) return;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
  };
  const ring = (radius, sy, rotation, color, lineWidth = 1) => {
    ctx.save(); ctx.rotate(rotation); ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * sy, 0, 0, TAU); ctx.stroke(); ctx.restore();
  };
  const glow = (x, y, radius, color) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color); gradient.addColorStop(1, '#00000000');
    ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  const stroke = (points, color, lineWidth = 1) => {
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  };
  const converge = amount => ctx.scale(1 / (1 + leave * amount), 1 / (1 + leave * amount));

  if (effect === 'singularity') {
    if (desktopImage) {
      const gravity = smooth(.16, .88, p), scale = 1 - Math.pow(gravity, 2.6) * .955;
      ctx.save(); ctx.rotate(gravity * gravity * .9); ctx.scale(scale, scale);
      ctx.globalAlpha *= .62; ctx.drawImage(desktopImage, -cx, -cy, width, height); ctx.restore();
    }
    glow(0, 0, s * .42, '#5a83c522');
    const disk = s * (.37 + leave * .39);
    for (let i = 0; i < 9; i++) {
      const offset = (i - 4) * s * .005;
      ctx.globalAlpha = opacity * (.13 + (1 - Math.abs(i - 4) / 5) * .30);
      ring(disk + offset, .238, .18, i === 4 ? '#dae8fc' : '#8ba7cc', i === 4 ? 1.3 : 1);
    }
    const radius = s * ((.230 + enter * .033) / 2 + Math.pow(leave, 2.5) * 1.7);
    ctx.globalAlpha = opacity; dot(0, 0, radius, '#000');
    ctx.shadowColor = '#739bd8'; ctx.shadowBlur = s * .018;
    ring(radius, 1, 0, '#d4e2f4', Math.max(1, s * .002)); ctx.shadowBlur = 0;
    ctx.save(); ctx.beginPath(); ctx.rect(-s, -s, s * 2, s); ctx.clip();
    ring(radius * 1.13, 1.2, 0, '#81a8df80', 1); ctx.restore();
  } else if (effect === 'quantum') {
    converge(4); ctx.scale(1 / (1.12 - enter * .12), 1 / (1.12 - enter * .12));
    glow(0, 0, s * .31, '#335bd131');
    ring(s * .225, 1, 0, '#6788cf45', 1);
    ring(s * .235, .37, -.45, '#7595db40', 1);
    for (let i = 0; i < 86; i++) {
      const a = random(i) * TAU + t * .035, radius = s * (.17 + random(i + 500) * .075);
      const x = Math.cos(a) * radius + Math.sin(t * .2 + i) * s * .006;
      const y = Math.sin(a) * radius + Math.cos(t * .18 + i) * s * .006;
      ctx.globalAlpha = opacity * (.35 + random(i + 200) * .55);
      dot(x, y, .55 + random(i + 90) * .75, i % 4 ? '#97b5f2' : '#dce8ff');
    }
    ctx.globalAlpha = opacity; glow(0, 0, s * .09, '#7a9ee265'); dot(0, 0, s * .008, '#e1edff');
  } else if (effect === 'aurora') {
    ctx.translate(0, -leave * s * .9);
    for (let layer = 2; layer >= 0; layer--) {
      const points = [];
      for (let x = -s * .68; x <= s * .68; x += s / 100) {
        const q = x / s * 2;
        const y = (Math.sin(q * 2 + t * .18 + layer * .22) * .19 + Math.sin(q * 4.3 - t * .12) * .055 + layer * .062 - .065) * s / 2;
        points.push([x, -y]);
      }
      const gradient = ctx.createLinearGradient(-s * .7, 0, s * .7, 0);
      gradient.addColorStop(0, '#00000000'); gradient.addColorStop(.3, ['#4dc29c', '#53adbd', '#748bdf'][layer]);
      gradient.addColorStop(.7, ['#75d7b3', '#7ecbd4', '#9ba9ef'][layer]); gradient.addColorStop(1, '#00000000');
      ctx.globalAlpha = opacity * .11; stroke(points, gradient, s * .045);
      ctx.globalAlpha = opacity * .6; stroke(points, gradient, Math.max(1, s * .0024));
    }
  } else if (effect === 'warp') {
    glow(0, 0, s * .3, '#395ab52a');
    for (let i = 0; i < 68; i++) {
      const a = random(i) * TAU, z = (random(i + 500) + t * .075 + leave * .6) % 1;
      const radius = s * (.09 + z * z * .85), length = s * (.012 + z * .06);
      ctx.globalAlpha = opacity * Math.pow(z, 1.3) * .65;
      stroke([[Math.cos(a) * radius, Math.sin(a) * radius], [Math.cos(a) * (radius + length), Math.sin(a) * (radius + length)]], i % 4 ? '#7496da' : '#c5e0ff', .7 + z * .5);
    }
    ctx.globalAlpha = opacity; ctx.shadowColor = '#6b8ad9'; ctx.shadowBlur = s * .015;
    ring(s * (.0625 + leave * .18), 1, 0, '#c1d7f9', Math.max(1.3, s * .003)); ctx.shadowBlur = 0;
  } else if (effect === 'matrix') {
    const cell = Math.max(13, s * .045);
    ctx.font = `${Math.max(10, s * .021)}px monospace`; ctx.textAlign = 'center';
    for (let col = -8; col <= 8; col++) {
      if (random(col) < .48) continue;
      for (let row = 0; row < 9; row++) {
        const head = ((t * (.055 + random(col) * .04) + random(col + 3)) % 1) * s;
        const x = col * cell, y = (head - row * cell + s) % s - s * .5 - leave * s;
        const distance = Math.hypot(x, y);
        ctx.globalAlpha = opacity * (1 - row / 9) * .25 * smooth(s * .14, s * .30, distance);
        ctx.fillStyle = '#6ab68a'; ctx.fillText('01{}<>/='[Math.floor(random(col * 90 + row + Math.floor(t * .7)) * 8)], x, y);
      }
    }
    ctx.globalAlpha = opacity; ctx.save(); ctx.scale(1 / (1 + leave * 5), 1);
    ctx.shadowColor = '#64d69d'; ctx.shadowBlur = s * .016;
    stroke([[-s * .145, -s * .095], [-s * .04, 0], [-s * .145, s * .095]], '#b1e9c4', Math.max(2, s * .007));
    stroke([[s * .03, s * .085], [s * .15, s * .085]], '#b1e9c4', Math.max(2, s * .007));
    ctx.restore();
  } else if (effect === 'portal') {
    const zoom = .88 + enter * .12 + leave * 2.4; ctx.scale(zoom, zoom); ctx.rotate(Math.sin(t * .16) * .055);
    for (let i = 3; i >= 0; i--) {
      const scale = 1 - i * .19, x = s * .215 * scale, y = s * .29 * scale;
      ctx.save(); ctx.rotate(i * .055); ctx.globalAlpha = opacity * (1 - i * .23);
      ctx.strokeStyle = ['#b59ae7', '#879de3', '#7e99d8', '#6384bb'][i]; ctx.lineWidth = Math.max(1, s * .0024);
      ctx.shadowColor = '#8b65ce'; ctx.shadowBlur = i ? 0 : s * .017;
      ctx.beginPath(); ctx.roundRect(-x, -y, x * 2, y * 2, s * .06 * scale); ctx.stroke(); ctx.restore();
    }
  } else if (effect === 'eclipse') {
    converge(3.6); const radius = s * .195;
    const corona = ctx.createRadialGradient(0, 0, radius * .98, 0, 0, radius * 1.55);
    corona.addColorStop(0, '#dda76660'); corona.addColorStop(.17, '#b5762929'); corona.addColorStop(1, '#00000000');
    ctx.fillStyle = corona; ctx.fillRect(-s * .5, -s * .5, s, s);
    ring(radius, 1, 0, '#f4d3a0', Math.max(1, s * .0023));
    dot(s * (-.11 + smooth(.02, .64, p) * .114) / 2, -s * .0015, s * .19, '#000');
    const diamond = 1 - smooth(.49, .76, p); ctx.globalAlpha = opacity * diamond;
    glow(radius, -s * .014, s * .035, '#ffe5ac80'); dot(radius, -s * .014, s * .0035, '#fff1cf');
  } else if (effect === 'nebula' || effect === 'ink') {
    const ink = effect === 'ink'; converge(ink ? 3.4 : 3); ctx.rotate(ink ? -.24 : .38);
    const outline = (offset = 0) => {
      const points = [];
      for (let i = 0; i <= 150; i++) {
        const a = i / 150 * TAU;
        const radius = s * (.215 + .04 * Math.sin(a * 3 + t * .12) + .018 * Math.cos(a * 5 - t * .09) + offset);
        points.push([Math.cos(a) * radius, Math.sin(a) * radius / (ink ? 1.16 : 1.05)]);
      }
      return points;
    };
    const shade = ctx.createLinearGradient(-s * .3, -s * .25, s * .3, s * .3);
    if (ink) { shade.addColorStop(0, '#69727e'); shade.addColorStop(.25, '#d2d8df'); shade.addColorStop(.55, '#444d5c'); shade.addColorStop(.8, '#b1bbc6'); shade.addColorStop(1, '#586374'); }
    else { shade.addColorStop(0, '#b26b9a'); shade.addColorStop(.45, '#9562bd'); shade.addColorStop(1, '#667bc5'); }
    for (let layer = 10; layer >= 0; layer--) {
      ctx.globalAlpha = opacity * (ink ? .055 : .045);
      stroke(outline((layer - 5) * .003), shade, s * (ink ? .03 : .06));
    }
    ctx.globalAlpha = opacity * (ink ? .45 : .3); stroke(outline(-.018), shade, Math.max(1, s * .0025));
    if (!ink) { ctx.globalAlpha = opacity; glow(s * .05, -s * .013, s * .04, '#e7adc954'); dot(s * .05, -s * .013, s * .003, '#f3c6d9'); }
  } else if (effect === 'ripple') {
    if (desktopImage) { ctx.globalAlpha = opacity * .18; ctx.drawImage(desktopImage, -cx, -cy, width, height); ctx.globalAlpha = opacity; }
    for (let i = 0; i < 4; i++) {
      const radius = s * (.13 + i * .155 + (t * .025 % .155) + leave * .45);
      ctx.globalAlpha = opacity * Math.exp(-radius / s * 3.6) * .6;
      ring(radius, .769, 0, i % 2 ? '#80b7cc' : '#b4dce5', Math.max(1, s * .002));
    }
    ctx.globalAlpha = opacity;
    const radius = s * .0525 * (1 - leave * .92);
    dot(0, 0, radius, '#173c4c'); ring(radius, .769, 0, '#8fbfcd', 1);
    glow(-radius * .3, -radius * .3, radius * .8, '#d9f5fbd1');
  } else if (effect === 'orbit') {
    converge(3.2);
    for (let i = 0; i < 3; i++) {
      const radius = s * (.25 + i * .0375), angle = i * .86 + .22 + t * .025, phase = t * (.31 + i * .035) + i * 2.1;
      ring(radius, .4, angle, ['#809dccb0', '#929ccbb0', '#b98dbdb0'][i], Math.max(1.1, s * .0023));
      ctx.save(); ctx.rotate(angle);
      dot(Math.cos(phase) * radius, Math.sin(phase) * radius * .4, Math.max(1.5, s * .004), '#d9e7f9');
      ctx.restore();
    }
    dot(0, 0, s * .062, '#101d35'); glow(-s * .022, -s * .025, s * .05, '#829fc666');
    ring(s * .062, 1, 0, '#b4d0e6aa', Math.max(1.1, s * .0022));
  } else if (effect === 'constellation') {
    converge(4); ctx.rotate(Math.sin(t * .1) * .03);
    const points = [[-.52, .08], [-.29, .45], [.14, .55], [.52, .16], [.37, -.35], [-.08, -.45], [-.45, -.25]]
      .map(([x, y], i) => [(x + Math.sin(i * 1.7 + t * .15) * .012) * s / 2, -(y + Math.cos(i * 2.3 + t * .13) * .012) * s / 2]);
    const center = [s * .0075, -s * .02];
    stroke([...points, points[0]], '#84a5d48a', Math.max(1.1, s * .0022));
    [0, 2, 4].forEach(i => stroke([points[i], center], '#7d9ac065', Math.max(1, s * .002)));
    for (const [x, y] of points) { glow(x, y, s * .017, '#89b5f02c'); dot(x, y, Math.max(1.3, s * .0032), '#d8e9ff'); }
    glow(...center, s * .045, accent + '35'); dot(...center, Math.max(1.7, s * .004), '#eff6ff');
  }
  ctx.restore(); ctx.globalAlpha = 1;
}
