/** Quiet night sky. Slow earth-like drift, rare falling trails. Pauses when hidden. */

const COUNT = 90;
const DRIFTERS = 16;

let canvas;
let ctx;
let stars = [];
let falling = [];
let raf = 0;
let last = 0;
let reduced = false;
let dpr = 1;

function color() {
  const s = getComputedStyle(document.documentElement);
  return {
    ink: (s.getPropertyValue("--ink") || "#fff6fb").trim(),
    rose: (s.getPropertyValue("--rose-2") || "#ff7ab8").trim(),
  };
}

function resize() {
  if (!canvas) return;
  dpr = Math.min(window.innerWidth < 800 ? 1.25 : 2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = "100%";
  canvas.style.height = "100%";
}

function spawn(i) {
  const w = canvas.width;
  const h = canvas.height;
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    r: (Math.random() * 1.1 + 0.35) * dpr,
    a: 0.12 + Math.random() * 0.18,
    tw: Math.random() * Math.PI * 2,
    vx: (i < DRIFTERS ? (Math.random() - 0.5) * 0.01 * dpr : 0),
    vy: (i < DRIFTERS ? (Math.random() * 0.006 + 0.002) * dpr : 0),
    rose: Math.random() < 0.16,
  };
}

function seed() {
  stars = [];
  for (let i = 0; i < COUNT; i++) stars.push(spawn(i));
  falling = [];
}

function drawDot(s, a, c) {
  ctx.beginPath();
  ctx.fillStyle = s.rose ? c.rose : c.ink;
  ctx.globalAlpha = Math.max(0.08, Math.min(0.55, a));
  ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
  ctx.fill();
}

function spawnFall() {
  const w = canvas.width;
  const speed = (0.22 + Math.random() * 0.16) * dpr;
  const ang = 0.48 + Math.random() * 0.28;
  return {
    x: Math.random() * w * 0.92,
    y: -8 * dpr,
    r: (0.7 + Math.random() * 0.5) * dpr,
    vx: Math.cos(ang) * speed * 0.55,
    vy: Math.sin(ang) * speed + 0.1 * dpr,
    rose: Math.random() < 0.45,
    life: 0,
  };
}

function drawFall(f, c) {
  const col = f.rose ? c.rose : c.ink;
  ctx.lineCap = "round";
  ctx.strokeStyle = col;
  ctx.beginPath();
  ctx.globalAlpha = 0.12;
  ctx.lineWidth = Math.max(1.2, f.r * 1.8);
  ctx.moveTo(f.x - f.vx * 52, f.y - f.vy * 52);
  ctx.lineTo(f.x, f.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(0.8, f.r);
  ctx.moveTo(f.x - f.vx * 22, f.y - f.vy * 22);
  ctx.lineTo(f.x, f.y);
  ctx.stroke();
  drawDot(f, 0.7, c);
}

function paint(staticOnly) {
  if (!ctx) return;
  const c = color();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
  for (const s of stars) {
    const tw = staticOnly ? 0 : Math.sin(s.tw) * 0.04;
    drawDot(s, s.a + tw, c);
  }
  if (!staticOnly) {
    for (const f of falling) drawFall(f, c);
  }
  ctx.globalAlpha = 1;
}

function tick(now) {
  if (document.hidden || reduced) {
    raf = 0;
    return;
  }
  const dt = Math.min(48, now - last || 16);
  last = now;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w * 0.5;
  const cy = h * 0.55;
  const rot = dt * 0.000012;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  for (const s of stars) {
    s.tw += dt * 0.001;
    const dx = s.x - cx;
    const dy = s.y - cy;
    s.x = cx + dx * cos - dy * sin + s.vx * dt;
    s.y = cy + dx * sin + dy * cos + s.vy * dt;
    if (s.x < 0) s.x += w;
    if (s.x > w) s.x -= w;
    if (s.y > h) s.y = 0;
    if (s.y < 0) s.y = h;
  }

  if (falling.length < 5 && Math.random() < 0.028) falling.push(spawnFall());
  falling = falling.filter((f) => {
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.life += dt;
    return f.y < h + 12 * dpr && f.x < w + 12 * dpr && f.x > -12 * dpr;
  });

  paint(false);
  raf = requestAnimationFrame(tick);
}

export function refreshSky() {
  if (!ctx) return;
  paint(reduced);
}

export function startSky(el) {
  canvas = el;
  if (!canvas) return;
  ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  resize();
  seed();
  paint(true);
  if (!reduced) falling.push(spawnFall());
  window.addEventListener("resize", () => {
    resize();
    seed();
    paint(reduced);
  });
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onMotion = () => {
    reduced = mq.matches;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (reduced) paint(true);
    else {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };
  mq.addEventListener?.("change", onMotion);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else if (!reduced) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  });
  if (!reduced) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
}
