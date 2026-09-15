/* Fandre research worklist — fandre.com/research/
   Same gate and passphrase as the tree; the document body ships encrypted. */
'use strict';

const $ = sel => document.querySelector(sel);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STORE_KEY = 'fandre.tree.pass';   // shared with /tree/ so one unlock covers both

/* ── starfield, matching the rest of the site ── */
(function starfield() {
  const canvas = document.createElement('canvas');
  canvas.id = 'starfield';
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  let W, H, CX, CY;
  const fit = () => { W = canvas.width = innerWidth; H = canvas.height = innerHeight; CX = W / 2; CY = H / 2; };
  fit(); addEventListener('resize', fit);
  const stars = Array.from({ length: 160 }, () => ({
    x: (Math.random() - .5) * 2, y: (Math.random() - .5) * 2,
    z: Math.random(), gold: Math.random() < .18,
  }));
  let mx = 0, my = 0, pmx = 0, pmy = 0;
  addEventListener('mousemove', e => { mx = (e.clientX / W - .5) * 30; my = (e.clientY / H - .5) * 30; });
  (function frame() {
    ctx.clearRect(0, 0, W, H);
    pmx += (mx - pmx) * .04; pmy += (my - pmy) * .04;
    for (const s of stars) {
      if (!reduced) s.z -= 0.0011;
      if (s.z <= .02) { s.x = (Math.random() - .5) * 2; s.y = (Math.random() - .5) * 2; s.z = 1; }
      const k = .9 / s.z;
      const px = CX + s.x * k * CX * .8 + pmx * (1 - s.z);
      const py = CY + s.y * k * CY * .8 + pmy * (1 - s.z);
      if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue;
      const size = Math.max(.3, (1 - s.z) * 1.9);
      const a = Math.min(1, (1 - s.z) * 1.4) * .6;
      ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fillStyle = s.gold ? `rgba(232,201,122,${a})` : `rgba(255,255,255,${a * .65})`;
      ctx.fill();
    }
    requestAnimationFrame(frame);
  })();
})();

/* ── decryption ── */
const gate = $('#gate'), gateMsg = $('#gate-msg'), passInput = $('#pass');

async function decrypt(passphrase) {
  const res = await fetch('content.enc.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`could not load the worklist (${res.status})`);
  const blob = await res.json();
  const raw = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: raw(blob.salt), iterations: blob.iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  // AES-GCM is authenticated: a wrong passphrase throws rather than yielding junk.
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: raw(blob.iv) }, key, raw(blob.ct));
  return new TextDecoder().decode(plain);
}

passInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $('#gate-form').requestSubmit(); }
});

$('#gate-form').addEventListener('submit', async e => {
  e.preventDefault();
  const pass = passInput.value.trim();
  if (!pass) return;
  gateMsg.className = 'gate-msg busy';
  gateMsg.textContent = 'decrypting…';
  try {
    const html = await decrypt(pass);
    if ($('#remember').checked) { try { localStorage.setItem(STORE_KEY, pass); } catch {} }
    reveal(html);
  } catch (err) {
    gateMsg.className = 'gate-msg err';
    gateMsg.textContent = /load/.test(err.message) ? err.message : 'that passphrase does not open this file';
    gate.classList.add('shake');
    setTimeout(() => gate.classList.remove('shake'), 420);
    passInput.select();
  }
});

function reveal(html) {
  gate.classList.add('leaving');
  setTimeout(() => {
    gate.hidden = true;
    // Authored here and shipped encrypted — not user input.
    $('#doc').innerHTML = html;
    $('#app').hidden = false;
    $('#btn-print').onclick = () => print();
  }, reduced ? 0 : 480);
}

/* A passphrase remembered from either page opens this one straight away. */
(async function auto() {
  let saved = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch {}
  if (!saved) return;
  try { reveal(await decrypt(saved)); }
  catch { try { localStorage.removeItem(STORE_KEY); } catch {} }
})();
