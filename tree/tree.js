/* Fandre family tree — fandre.com/tree/
   Data ships encrypted; everything below runs only after it decrypts. */
'use strict';

const $ = sel => document.querySelector(sel);
const SVGNS = 'http://www.w3.org/2000/svg';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STORE_KEY = 'fandre.tree.pass';

/* ─────────────────────────  starfield  ───────────────────────── */
(function starfield() {
  const canvas = document.createElement('canvas');
  canvas.id = 'starfield';
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  let W, H, CX, CY;
  const fit = () => { W = canvas.width = innerWidth; H = canvas.height = innerHeight; CX = W / 2; CY = H / 2; };
  fit(); addEventListener('resize', fit);

  const stars = Array.from({ length: 200 }, () => ({
    x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2,
    z: Math.random(), gold: Math.random() < 0.18,
  }));
  let mx = 0, my = 0, pmx = 0, pmy = 0;
  addEventListener('mousemove', e => { mx = (e.clientX / W - .5) * 34; my = (e.clientY / H - .5) * 34; });

  (function frame() {
    ctx.clearRect(0, 0, W, H);
    pmx += (mx - pmx) * .04; pmy += (my - pmy) * .04;
    for (const s of stars) {
      if (!reduced) s.z -= 0.0013;
      if (s.z <= .02) { s.x = (Math.random() - .5) * 2; s.y = (Math.random() - .5) * 2; s.z = 1; }
      const k = 0.9 / s.z;
      const px = CX + s.x * k * CX * .8 + pmx * (1 - s.z);
      const py = CY + s.y * k * CY * .8 + pmy * (1 - s.z);
      if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue;
      const size = Math.max(.3, (1 - s.z) * 2);
      const a = Math.min(1, (1 - s.z) * 1.4) * .7;
      ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fillStyle = s.gold ? `rgba(232,201,122,${a})` : `rgba(255,255,255,${a * .65})`;
      ctx.fill();
    }
    requestAnimationFrame(frame);
  })();
})();

/* ─────────────────────────  decryption gate  ───────────────────────── */
const gate = $('#gate'), gateMsg = $('#gate-msg'), passInput = $('#pass');

async function decrypt(passphrase) {
  const res = await fetch('data.enc.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`could not load the tree data (${res.status})`);
  const blob = await res.json();
  const raw = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: raw(blob.salt), iterations: blob.iter, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  // AES-GCM authenticates: a wrong passphrase throws rather than returning junk.
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: raw(blob.iv) }, key, raw(blob.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

// Implicit form submission can be swallowed in some embedded browsers.
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
    const data = await decrypt(pass);
    if ($('#remember').checked) { try { localStorage.setItem(STORE_KEY, pass); } catch {} }
    open(data);
  } catch (err) {
    gateMsg.className = 'gate-msg err';
    gateMsg.textContent = /load/.test(err.message) ? err.message : 'that passphrase does not open this file';
    gate.classList.add('shake');
    setTimeout(() => gate.classList.remove('shake'), 420);
    passInput.select();
  }
});

function open(data) {
  gate.classList.add('leaving');
  setTimeout(() => {
    gate.hidden = true;
    const app = $('#app');
    app.hidden = false;
    app.classList.add('entering');
    boot(data);
  }, reduced ? 0 : 560);
}

// A remembered passphrase opens the page without a prompt.
(async function auto() {
  let saved = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch {}
  if (!saved) return;
  try { open(await decrypt(saved)); }
  catch { try { localStorage.removeItem(STORE_KEY); } catch {} }
})();

/* ─────────────────────────  the app  ───────────────────────── */
function boot(DATA) {
  const people = new Map(DATA.people.map(p => [p.i, p]));
  const fams = new Map(DATA.families.map(f => [f.i, f]));

  /* --- derived indexes --- */
  for (const p of people.values()) { p.parents = []; p.kids = []; p.spouses = []; }
  for (const f of fams.values()) {
    const par = [f.h, f.w].filter(v => v !== undefined);
    for (const c of f.c) {
      const kid = people.get(c);
      if (kid) kid.parents.push(...par.filter(x => people.has(x)));
    }
    for (const s of par) {
      const sp = people.get(s);
      if (!sp) continue;
      sp.kids.push(...f.c.filter(c => people.has(c)));
      sp.spouses.push(...par.filter(x => x !== s && people.has(x)));
    }
  }

  /* --- colour by family name --- */
  const BRANCH = [
    ['Fandre', '#E8C97A'], ['Cherek', '#7FB2C4'], ['Grassl', '#9BBE84'],
    ['Stiglbauer', '#C98FA8'], ['Stigelbauer', '#C98FA8'], ['Moser', '#D49A6A'],
    ['Meirose', '#8FA8D4'], ['Lange', '#B8A0D0'], ['Kostka', '#6FBFA8'],
    ['Rosemeyer', '#D4B483'], ['Bushman', '#A8BFD4'], ['Frank', '#C4A484'],
    ['Fandrey', '#E8C97A'], ['Fandry', '#E8C97A'],
  ];
  const branchColour = new Map(BRANCH);
  const colourOf = p => branchColour.get(p.s) || '#7d8894';

  const initials = p => {
    const parts = (p.n || '?').replace(/["'()]/g, '').split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || '?';
    const last = (p.s || parts[parts.length - 1] || '')[0] || '';
    return (first + last).toUpperCase();
  };
  const yearsOf = p => {
    const b = p.b?.y, d = p.d?.y;
    if (b && d) return `${b}–${d}`;
    if (b) return p.dead ? `b. ${b}` : `b. ${b}`;
    if (d) return `d. ${d}`;
    return p.dead ? '—' : '';
  };
  const shortName = p => {
    const clean = (p.n || 'Unknown').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/"[^"]*"/g, '').trim();
    const parts = clean.split(/\s+/);
    if (parts.length <= 2) return clean;
    return `${parts[0]} ${parts[parts.length - 1]}`;
  };

  /* --- layout constants --- */
  const NW = 170, NH = 54, ROW = 146, GAP_X = 16;
  // Three up and two down keeps every card readable without panning; click
  // anyone at the edge to walk further in that direction.
  const UP = 3, DOWN = 2;

  /* Width a subtree needs, so siblings never collide. */
  function upWidth(id, g, seen) {
    const p = people.get(id);
    if (!p || g >= UP || seen.has(id)) return NW + GAP_X;
    seen.add(id);
    const par = [...new Set(p.parents)].slice(0, 2);
    if (!par.length) return NW + GAP_X;
    return par.reduce((sum, x) => sum + upWidth(x, g + 1, seen), 0);
  }
  function downWidth(id, g, seen) {
    const p = people.get(id);
    if (!p || g >= DOWN || seen.has(id)) return NW + GAP_X;
    seen.add(id);
    const kids = [...new Set(p.kids)];
    if (!kids.length) return NW + GAP_X;
    return Math.max(NW + GAP_X, kids.reduce((sum, k) => sum + downWidth(k, g + 1, seen), 0));
  }

  /* Build the hourglass around one person. */
  function layout(rootId) {
    const nodes = new Map(), links = [];
    const root = people.get(rootId);
    if (!root) return { nodes, links };
    nodes.set(rootId, { p: root, x: 0, y: 0, gen: 0 });

    (function up(id, x, g, seen) {
      if (g >= UP) return;
      const p = people.get(id);
      const par = [...new Set(p.parents)].filter(v => !seen.has(v)).slice(0, 2);
      if (!par.length) return;
      const widths = par.map(v => upWidth(v, g + 1, new Set(seen)));
      const total = widths.reduce((a, b) => a + b, 0);
      let cursor = x - total / 2;
      par.forEach((v, i) => {
        const cx = cursor + widths[i] / 2;
        cursor += widths[i];
        if (!nodes.has(v)) nodes.set(v, { p: people.get(v), x: cx, y: -(g + 1) * ROW, gen: -(g + 1) });
        links.push({ from: id, to: v, kind: 'up' });
        up(v, cx, g + 1, new Set([...seen, v]));
      });
    })(rootId, 0, 0, new Set([rootId]));

    (function down(id, x, g, seen) {
      if (g >= DOWN) return;
      const p = people.get(id);
      const kids = [...new Set(p.kids)].filter(v => !seen.has(v));
      if (!kids.length) return;
      const widths = kids.map(v => downWidth(v, g + 1, new Set(seen)));
      const total = widths.reduce((a, b) => a + b, 0);
      let cursor = x - total / 2;
      kids.forEach((v, i) => {
        const cx = cursor + widths[i] / 2;
        cursor += widths[i];
        if (!nodes.has(v)) nodes.set(v, { p: people.get(v), x: cx, y: (g + 1) * ROW, gen: g + 1 });
        links.push({ from: id, to: v, kind: 'down' });
        down(v, cx, g + 1, new Set([...seen, v]));
      });
    })(rootId, 0, 0, new Set([rootId]));

    // Spouses sit beside the focus person.
    [...new Set(root.spouses)].slice(0, 3).forEach((s, i) => {
      if (nodes.has(s)) return;
      const side = i % 2 === 0 ? 1 : -1;
      const step = Math.floor(i / 2) + 1;
      nodes.set(s, { p: people.get(s), x: side * step * (NW + GAP_X), y: 0, gen: 0, spouse: true });
      links.push({ from: rootId, to: s, kind: 'spouse' });
    });
    return { nodes, links };
  }

  /* ───── rendering ───── */
  const svg = $('#tree'), gLinks = $('#links'), gNodes = $('#nodes'), viewport = $('#viewport');
  const panel = $('#panel'), panelBody = $('#panel-body');
  let focusId = DATA.root, view = { x: 0, y: 0, k: 1 }, current = new Map();

  const el = (tag, attrs = {}) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const applyView = () =>
    viewport.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);

  function curve(a, b) {
    const midY = (a.y + b.y) / 2;
    return `M${a.x},${a.y} C${a.x},${midY} ${b.x},${midY} ${b.x},${b.y}`;
  }

  function render(rootId, animate = true) {
    focusId = rootId;
    const { nodes, links } = layout(rootId);

    /* links */
    gLinks.textContent = '';
    for (const l of links) {
      const a = nodes.get(l.from), b = nodes.get(l.to);
      if (!a || !b) continue;
      const from = { x: a.x, y: a.y + (l.kind === 'up' ? -NH / 2 : l.kind === 'down' ? NH / 2 : 0) };
      const to = { x: b.x, y: b.y + (l.kind === 'up' ? NH / 2 : l.kind === 'down' ? -NH / 2 : 0) };
      const path = el('path', { class: `link ${l.kind}`, d: l.kind === 'spouse'
        ? `M${from.x},${from.y} L${to.x},${to.y}` : curve(from, to) });
      path.dataset.a = l.from; path.dataset.b = l.to;
      gLinks.append(path);
      if (animate && !reduced) {
        const len = path.getTotalLength();
        path.style.strokeDasharray = len;
        path.style.strokeDashoffset = len;
        path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
          { duration: 620, delay: 90, easing: 'cubic-bezier(.3,.8,.3,1)', fill: 'forwards' });
      }
    }

    /* generation labels */
    const gens = new Map();
    for (const n of nodes.values()) if (!gens.has(n.gen)) gens.set(n.gen, n.y);
    const minX = Math.min(...[...nodes.values()].map(n => n.x)) - NW;
    for (const [gen, y] of gens) {
      if (gen === 0) continue;
      const label = gen < 0
        ? `${-gen} GENERATION${gen === -1 ? '' : 'S'} BACK`
        : `${gen} DOWN`;
      const tag = el('text', { class: 'genlabel', x: minX - 40, y, 'text-anchor': 'end' });
      tag.textContent = label;
      gLinks.append(tag);
    }

    /* nodes */
    const previous = current;
    gNodes.textContent = '';
    current = nodes;

    for (const [id, n] of nodes) {
      const p = n.p, colour = colourOf(p);
      const g = el('g', {
        class: 'node' + (id === rootId ? ' focus' : ''),
        transform: `translate(${n.x} ${n.y})`,
        tabindex: '0', role: 'button',
      });
      g.dataset.id = id;

      if (id === rootId) g.append(el('rect', {
        class: 'halo', x: -NW / 2, y: -NH / 2, width: NW, height: NH, rx: 10,
        style: 'transform-origin:center', 
      }));
      g.append(el('rect', { class: 'plate', x: -NW / 2, y: -NH / 2, width: NW, height: NH, rx: 10 }));
      g.append(el('circle', { class: 'ring', cx: -NW / 2 + 24, cy: 0, r: 15, stroke: colour }));
      const mono = el('text', { class: 'mono', x: -NW / 2 + 24, y: 1, fill: colour });
      mono.textContent = initials(p);
      g.append(mono);

      const nm = el('text', { class: 'nm', x: -NW / 2 + 46, y: -7 });
      nm.textContent = shortName(p);
      g.append(nm);
      const yr = el('text', { class: 'yr', x: -NW / 2 + 46, y: 10 });
      yr.textContent = yearsOf(p) || (p.dead ? '' : 'living');
      g.append(yr);

      const title = el('title');
      title.textContent = `${p.n}${yearsOf(p) ? ' · ' + yearsOf(p) : ''}`;
      g.append(title);

      gNodes.append(g);

      /* entrance: slide from where the node used to be, else fade up */
      if (animate && !reduced) {
        const was = previous.get(id);
        const dx = was ? was.x - n.x : 0, dy = was ? was.y - n.y : 26;
        g.animate(
          [{ transform: `translate(${n.x + dx}px,${n.y + dy}px)`, opacity: was ? 1 : 0 },
           { transform: `translate(${n.x}px,${n.y}px)`, opacity: 1 }],
          { duration: 520, easing: 'cubic-bezier(.2,.8,.25,1)' });
      }
    }
    updateLegend(nodes);
  }

  /* highlight the chain between a hovered node and the focus */
  gNodes.addEventListener('mouseover', e => {
    const g = e.target.closest('.node'); if (!g) return;
    const id = +g.dataset.id;
    gLinks.querySelectorAll('.link').forEach(l => {
      l.classList.toggle('lit', +l.dataset.a === id || +l.dataset.b === id);
    });
  });
  gNodes.addEventListener('mouseout', () =>
    gLinks.querySelectorAll('.link').forEach(l => l.classList.remove('lit')));

  gNodes.addEventListener('click', e => {
    const g = e.target.closest('.node'); if (!g) return;
    goTo(+g.dataset.id);
  });
  gNodes.addEventListener('keydown', e => {
    const g = e.target.closest('.node');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); goTo(+g.dataset.id); }
  });

  function goTo(id, { panel = true } = {}) {
    if (!people.has(id)) return;
    render(id);
    centre();
    if (panel) showPanel(id);
    $('#hint')?.classList.add('gone');
  }

  /* ───── pan / zoom ───── */
  /* Fit the laid-out tree into whatever space the panel leaves free. */
  function fitView() {
    const r = svg.getBoundingClientRect();
    // Below 720px the panel is a bottom sheet, so it costs height, not width.
    const sheet = innerWidth <= 720;
    const box = panel.hidden ? null : panel.getBoundingClientRect();
    const panelW = box && !sheet ? box.width : 0;
    const panelH = box && sheet ? box.height : 0;
    const padX = sheet ? 20 : 60, padY = 48;
    const availW = Math.max(200, r.width - panelW - padX * 2);
    const availH = Math.max(180, r.height - panelH - padY * 2);

    const xs = [...current.values()].map(n => n.x);
    const ys = [...current.values()].map(n => n.y);
    if (!xs.length) return { x: r.width / 2, y: r.height / 2, k: 1 };
    const minX = Math.min(...xs) - NW / 2, maxX = Math.max(...xs) + NW / 2;
    const minY = Math.min(...ys) - NH / 2, maxY = Math.max(...ys) + NH / 2;

    // Never shrink below readable; the user can pan to reach the rest.
    const k = Math.min(1.05, Math.max(0.52, Math.min(availW / (maxX - minX), availH / (maxY - minY))));
    // Centre the focus person horizontally in the free area, not the whole box.
    // Centre the whole tree when it fits; once it is wider than the space,
    // keep the person in focus centred instead and let the edges run off.
    const fits = (maxX - minX) * k <= availW;
    const anchorX = fits ? (minX + maxX) / 2 : (current.get(focusId)?.x ?? 0);
    return {
      k,
      x: padX + availW / 2 - anchorX * k,
      y: padY + availH / 2 - ((minY + maxY) / 2) * k,
    };
  }

  function centre(instant = false) {
    const target = fitView();
    if (instant || reduced) { view = target; applyView(); return; }
    const from = { ...view }, t0 = performance.now();
    (function step(now) {
      const t = Math.min(1, (now - t0) / 520);
      const e = 1 - Math.pow(1 - t, 3);
      view = {
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        k: from.k + (target.k - from.k) * e,
      };
      applyView();
      if (t < 1) requestAnimationFrame(step);
    })(t0);
  }

  let drag = null;
  svg.addEventListener('pointerdown', e => {
    if (e.target.closest('.node')) return;
    drag = { x: e.clientX - view.x, y: e.clientY - view.y };
    svg.classList.add('dragging'); svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    view.x = e.clientX - drag.x; view.y = e.clientY - drag.y; applyView();
  });
  const endDrag = () => { drag = null; svg.classList.remove('dragging'); };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.min(2.2, Math.max(0.28, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
    view.x = mx - (mx - view.x) * (k / view.k);
    view.y = my - (my - view.y) * (k / view.k);
    view.k = k; applyView();
  }, { passive: false });

  const zoomBy = f => {
    const r = svg.getBoundingClientRect(), mx = r.width / 2, my = r.height / 2;
    const k = Math.min(2.2, Math.max(0.28, view.k * f));
    view.x = mx - (mx - view.x) * (k / view.k);
    view.y = my - (my - view.y) * (k / view.k);
    view.k = k; applyView();
  };
  $('#zoom-in').onclick = () => zoomBy(1.2);
  $('#zoom-out').onclick = () => zoomBy(0.83);
  $('#zoom-fit').onclick = () => centre();

  /* ───── detail panel ───── */
  $('#panel-close').onclick = () => { panel.hidden = true; centre(); };

  const esc = s => String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function chipRow(ids) {
    const seen = new Set();
    return [...ids].filter(i => people.has(i) && !seen.has(i) && seen.add(i))
      .map(i => {
        const q = people.get(i);
        return `<button class="chip" data-go="${i}">${esc(shortName(q))}` +
               (q.b?.y ? `<span class="cy">${q.b.y}</span>` : '') + `</button>`;
      }).join('');
  }

  function showPanel(id) {
    const p = people.get(id); if (!p) return;
    const colour = colourOf(p);
    const ev = (label, e) => e ? `<div class="p-row"><span class="k">${label}</span><span>` +
      `${esc(e.d || e.y || '')}${e.p ? `<br><span style="color:var(--dimmer)">${esc(e.p)}</span>` : ''}</span></div>` : '';

    const parts = [];
    parts.push(`<div class="p-mono" style="border-color:${colour};color:${colour}">${esc(initials(p))}</div>`);
    parts.push(`<div class="p-name">${esc(p.n)}</div>`);
    const life = yearsOf(p);
    parts.push(`<div class="p-life">${esc(life || (p.dead ? 'dates unknown' : 'living'))}` +
      (p.b?.y && p.d?.y ? ` &middot; ${p.d.y - p.b.y} years` : '') + `</div>`);

    const events = ev('Born', p.b) + ev('Died', p.d) + ev('Buried', p.u) +
      (p.o ? `<div class="p-row"><span class="k">Work</span><span>${esc(p.o)}</span></div>` : '');
    if (events) parts.push(`<div class="p-sec"><h3>Life</h3>${events}</div>`);

    if (p.alt?.length) parts.push(`<div class="p-sec"><h3>Records disagree</h3>` +
      p.alt.map(a => `<div class="p-alt">${esc(a)}</div>`).join('') + `</div>`);

    const par = [...new Set(p.parents)], sp = [...new Set(p.spouses)], kd = [...new Set(p.kids)];
    if (par.length) parts.push(`<div class="p-sec"><h3>Parents</h3><div class="p-people">${chipRow(par)}</div></div>`);
    if (sp.length)  parts.push(`<div class="p-sec"><h3>Married</h3><div class="p-people">${chipRow(sp)}</div></div>`);
    if (kd.length)  parts.push(`<div class="p-sec"><h3>Children · ${kd.length}</h3><div class="p-people">${chipRow(kd)}</div></div>`);

    const sibs = new Set();
    for (const parent of par) for (const s of people.get(parent)?.kids || []) if (s !== id) sibs.add(s);
    if (sibs.size) parts.push(`<div class="p-sec"><h3>Siblings · ${sibs.size}</h3><div class="p-people">${chipRow(sibs)}</div></div>`);

    if (p.no?.length) parts.push(`<div class="p-sec"><h3>Notes</h3>` +
      p.no.map(n => `<p class="p-note">${esc(n)}</p>`).join('') + `</div>`);

    panelBody.innerHTML = parts.join('');
    const wasHidden = panel.hidden;
    panel.hidden = false;
    panel.scrollTop = 0;
    if (wasHidden) centre();
  }
  panelBody.addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if (b) goTo(+b.dataset.go);
  });

  /* ───── search ───── */
  const search = $('#search'), results = $('#results');
  const index = DATA.people.map(p => ({ i: p.i, t: (p.n + ' ' + (p.b?.y || '')).toLowerCase(), p }));
  let cursor = -1;

  function runSearch() {
    const q = search.value.trim().toLowerCase();
    if (q.length < 2) { results.hidden = true; return; }
    const hits = index.filter(r => r.t.includes(q)).slice(0, 40);
    cursor = -1;
    if (!hits.length) {
      results.innerHTML = `<div class="results-empty">nobody by that name</div>`;
    } else {
      results.innerHTML = hits.map(h => {
        const name = h.p.n;
        const at = name.toLowerCase().indexOf(q);
        const marked = at < 0 ? esc(name)
          : esc(name.slice(0, at)) + '<mark>' + esc(name.slice(at, at + q.length)) + '</mark>' + esc(name.slice(at + q.length));
        return `<button class="result" data-go="${h.i}" role="option">` +
               `<span class="rn">${marked}</span><span class="ry">${esc(yearsOf(h.p))}</span></button>`;
      }).join('');
    }
    results.hidden = false;
  }
  search.addEventListener('input', runSearch);
  search.addEventListener('focus', runSearch);
  results.addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    goTo(+b.dataset.go);
    results.hidden = true; search.value = ''; search.blur();
  });
  search.addEventListener('keydown', e => {
    const items = [...results.querySelectorAll('.result')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      cursor = (cursor + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((it, n) => it.setAttribute('aria-selected', n === cursor));
      items[cursor].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && cursor >= 0) {
      e.preventDefault(); items[cursor].click();
    } else if (e.key === 'Escape') { results.hidden = true; search.blur(); }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) results.hidden = true;
  });

  /* ───── legend ───── */
  function updateLegend(nodes) {
    const seen = new Map();
    for (const n of nodes.values()) {
      const s = n.p.s;
      if (s && branchColour.has(s)) seen.set(s, branchColour.get(s));
    }
    $('#legend').innerHTML = [...seen].slice(0, 8)
      .map(([s, c]) => `<span><i style="background:${c}"></i>${esc(s)}</span>`).join('');
  }

  /* ───── walk the line ───── */
  const journeyBtn = $('#btn-journey');
  let walking = false;
  journeyBtn.onclick = async () => {
    if (walking) return;
    walking = true; journeyBtn.disabled = true;
    panel.hidden = true;

    // Follow whichever parent reaches furthest back.
    const depth = new Map();
    const deepest = (id, seen = new Set()) => {
      if (depth.has(id)) return depth.get(id);
      if (seen.has(id)) return 0;
      seen.add(id);
      const d = 1 + Math.max(0, ...[...new Set(people.get(id).parents)].map(v => deepest(v, new Set(seen))));
      depth.set(id, d);
      return d;
    };
    const path = [focusId];
    let node = focusId;
    for (let step = 0; step < 12; step++) {
      const par = [...new Set(people.get(node).parents)];
      if (!par.length) break;
      node = par.reduce((best, v) => deepest(v) > deepest(best) ? v : best, par[0]);
      path.push(node);
    }
    // End on the last real person; the line above them is placeholders.
    const isPlaceholder = id => /<private>|^unknown|^(mother|father) of/i.test(people.get(id).n);
    while (path.length > 1 && isPlaceholder(path[path.length - 1])) path.pop();

    for (const id of path) {
      goTo(id, { panel: false });
      await new Promise(r => setTimeout(r, reduced ? 0 : 1150));
    }
    showPanel(path[path.length - 1]);
    walking = false; journeyBtn.disabled = false;
  };

  /* ───── chrome ───── */
  $('#btn-home').onclick = () => goTo(DATA.root);
  $('#btn-help').onclick = () => { $('#help').hidden = false; };
  $('#help-close').onclick = () => { $('#help').hidden = true; };
  $('#help').addEventListener('click', e => { if (e.target.id === 'help') $('#help').hidden = true; });

  addEventListener('keydown', e => {
    if (e.target.matches('input')) return;
    if (e.key === '/') { e.preventDefault(); search.focus(); }
    else if (e.key === 'Escape') { panel.hidden = true; $('#help').hidden = true; }
    else if (e.key === 'ArrowUp') {
      const par = [...new Set(people.get(focusId).parents)];
      if (par.length) { e.preventDefault(); goTo(par[0]); }
    } else if (e.key === 'ArrowDown') {
      const kd = [...new Set(people.get(focusId).kids)];
      if (kd.length) { e.preventDefault(); goTo(kd[0]); }
    }
  });
  addEventListener('resize', () => centre(true));

  /* ───── go ───── */
  search.placeholder = `Search ${DATA.counts.people.toLocaleString()} people…`;
  render(DATA.root, false);
  if (innerWidth > 720) showPanel(DATA.root);
  centre(true);
  setTimeout(() => { render(DATA.root, true); centre(); }, 120);
  setTimeout(() => $('#hint')?.classList.add('gone'), 9000);
}
