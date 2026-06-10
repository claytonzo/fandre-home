// ── 3D starfield: flying through space ──
const canvas = document.createElement('canvas');
canvas.id = 'starfield';
canvas.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;';
document.body.prepend(canvas);
const ctx = canvas.getContext('2d');

let W, H, CX, CY;
function resize() {
  W = canvas.width = innerWidth;
  H = canvas.height = innerHeight;
  CX = W / 2; CY = H / 2;
}
resize();
addEventListener('resize', resize);

const STAR_COUNT = 220;
const stars = Array.from({ length: STAR_COUNT }, () => ({
  x: (Math.random() - 0.5) * 2,
  y: (Math.random() - 0.5) * 2,
  z: Math.random(),
  gold: Math.random() < 0.18,
}));

let mx = 0, my = 0;          // mouse parallax target
let pmx = 0, pmy = 0;        // smoothed
addEventListener('mousemove', e => {
  mx = (e.clientX / W - 0.5) * 40;
  my = (e.clientY / H - 0.5) * 40;
});

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function frame() {
  ctx.clearRect(0, 0, W, H);
  pmx += (mx - pmx) * 0.04;
  pmy += (my - pmy) * 0.04;

  for (const s of stars) {
    if (!reduced) s.z -= 0.0018;
    if (s.z <= 0.02) { s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; s.z = 1; }

    const k = 0.9 / s.z;
    const px = CX + s.x * k * CX * 0.8 + pmx * (1 - s.z);
    const py = CY + s.y * k * CY * 0.8 + pmy * (1 - s.z);
    if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue;

    const size = Math.max(0.3, (1 - s.z) * 2.2);
    const alpha = Math.min(1, (1 - s.z) * 1.4) * 0.85;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fillStyle = s.gold
      ? `rgba(232, 201, 122, ${alpha})`
      : `rgba(255, 255, 255, ${alpha * 0.7})`;
    ctx.fill();
  }
  requestAnimationFrame(frame);
}
frame();

// ── Holographic shine + tilt on cards ──
document.querySelectorAll('.card:not(.card--soon)').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    card.style.setProperty('--shine-x', `${x * 100}%`);
    card.style.setProperty('--shine-y', `${y * 100}%`);
    card.style.transform =
      `translateY(-10px) scale(1.03) rotateY(${(x - 0.5) * 14}deg) rotateX(${-(y - 0.5) * 14}deg)`;
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});

// (letter-stagger removed: transformed child spans break background-clip:text)
