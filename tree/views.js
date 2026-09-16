/* ═══════════════════════════════════════════════════════════════════════════
   Fandre family tree — alternate views

   The pedigree view answers "who were this person's parents?". It is the right
   shape for that question and the wrong shape for every other one, because it
   can only ever hold a dozen people on screen at once. These three views each
   take the whole file — all 1,007 people — and answer a different question:

     FAN       every ancestor of one person, in one wheel
     TIMELINE  when everybody lived, against each other
     COSMOS    the entire family at once, arranged by time

   tree.js owns the data and the passphrase; it hands this module a context
   object and nothing else. Nothing here decrypts anything.
   ═══════════════════════════════════════════════════════════════════════════ */

window.FandreViews = (function () {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const TAU = Math.PI * 2;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = t => 1 - Math.pow(1 - t, 3);

  let ctx = null;             // handed over by tree.js
  let mode = 'tree';
  let raf = 0;                // the single animation frame owned by this module
  let canvas, cv, svg, hud, tip;
  let stage;

  /* ── colour helpers ───────────────────────────────────────────────────── */
  const hexToRgb = h => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [125, 136, 148];
  };
  const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
  const mix = (hex, a) => {  // lighten toward parchment
    const [r, g, b] = hexToRgb(hex);
    return `rgb(${Math.round(r + (243 - r) * a)},${Math.round(g + (239 - g) * a)},${Math.round(b + (230 - b) * a)})`;
  };

  /* ── the year each person belongs to ──────────────────────────────────────
     Birth year where there is one. Where there is not, estimate from the
     nearest relative rather than dropping the person: a tree with a third of
     its people missing is a misleading picture of a family. Estimates are
     never shown as dates, only used to place a dot. */
  function yearIndex(people) {
    const year = new Map();
    for (const [id, p] of people) if (p.b?.y) year.set(id, p.b.y);
    for (let pass = 0; pass < 6; pass++) {
      let filled = 0;
      for (const [id, p] of people) {
        if (year.has(id)) continue;
        const from = [];
        for (const q of p.parents) if (year.has(q)) from.push(year.get(q) + 28);
        for (const q of p.kids)    if (year.has(q)) from.push(year.get(q) - 28);
        for (const q of p.spouses) if (year.has(q)) from.push(year.get(q));
        if (p.d?.y) from.push(p.d.y - 68);
        if (from.length) { year.set(id, Math.round(from.reduce((a, b) => a + b) / from.length)); filled++; }
      }
      if (!filled) break;
    }
    return year;
  }

  /* ═══════════════════════════  FAN  ═══════════════════════════════════════
     A classic genealogical fan: the person at the centre, their two parents in
     the first ring, four grandparents in the next, and so on outward. Empty
     slots are left visibly empty — the gaps are the interesting part, because
     each one is a person nobody has found yet. */
  const Fan = {
    id: 'fan',
    label: 'Fan',
    rings: 7,
    maxRings: 9,
    slots: null,
    hoverKey: null,
    t0: 0,

    build(rootId) {
      const { people } = ctx;
      // slots[g] is a sparse array of 2^g entries; slot s at gen g has its
      // parents at gen g+1, slots 2s and 2s+1.
      const slots = [[rootId]];
      for (let g = 1; g <= this.maxRings; g++) {
        const row = new Array(1 << g).fill(undefined);
        const prev = slots[g - 1];
        for (let s = 0; s < prev.length; s++) {
          const id = prev[s];
          if (id === undefined) continue;
          const p = people.get(id);
          if (!p) continue;
          // Order parents father-first where sex is known, so the wheel is
          // stable between renders rather than following file order.
          const par = [...new Set(p.parents)].map(x => people.get(x)).filter(Boolean);
          const father = par.find(q => q.x === 'M');
          const mother = par.find(q => q.x === 'F' && q !== father);
          const rest = par.filter(q => q !== father && q !== mother);
          const a = father || rest.shift();
          const b = mother || rest.shift();
          if (a) row[2 * s] = a.i;
          if (b) row[2 * s + 1] = b.i;
        }
        slots.push(row);
      }
      // Trim to the data. A wheel padded out with four empty rings looks like
      // a failure; one empty ring reads as an invitation.
      let deepest = 0;
      for (let g = 1; g < slots.length; g++)
        if (slots[g].some(v => v !== undefined)) deepest = g;
      this.rings = clamp(deepest + 1, 3, this.maxRings);
      this.slots = slots.slice(0, this.rings + 1);

      // Rings are NOT equal width. A generation with four known people out of
      // sixty-four does not deserve the same band as one that is full: give
      // each ring a share of the radius based on how populated it is, with a
      // floor so a single deep ancestor still has somewhere to sit. This is
      // what lets the wheel show eight generations without eight empty rings.
      const share = [];
      for (let g = 1; g <= this.rings; g++) {
        const row = this.slots[g];
        const fill = row.filter(v => v !== undefined).length / row.length;
        share.push(0.34 + 0.66 * Math.sqrt(fill));
      }
      const sum = share.reduce((a, b) => a + b, 0);
      this.share = share.map(v => v / sum);
      // Cumulative fractions, so geometry() can turn a ring into two radii.
      this.edge = [0];
      for (const v of this.share) this.edge.push(this.edge[this.edge.length - 1] + v);

      this.t0 = performance.now();
    },

    geometry() {
      const w = canvas.width / devicePixelRatio, h = canvas.height / devicePixelRatio;
      const cx = w / 2, cy = h / 2;
      const outer = Math.min(w, h) * 0.46;
      const hub = Math.max(34, outer * 0.13);
      const span = outer - hub;
      const band = span / this.rings;          // the average, for text sizing
      return { cx, cy, hub, band, span, outer, w, h };
    },

    // Inner and outer radius of one ring, honouring the variable widths.
    radii(g, geo) {
      return [geo.hub + geo.span * this.edge[g - 1], geo.hub + geo.span * this.edge[g]];
    },

    // Which slot is under a point — used for hover and click.
    hit(mx, my) {
      const { cx, cy, hub, band } = this.geometry();
      const dx = mx - cx, dy = my - cy;
      const r = Math.hypot(dx, dy);
      if (r < hub) return { g: 0, s: 0, id: this.slots[0][0] };
      const geo = this.geometry();
      const frac = (r - hub) / geo.span;
      let g = -1;
      for (let i = 1; i <= this.rings; i++) if (frac >= this.edge[i - 1] && frac < this.edge[i]) { g = i; break; }
      if (g < 1) return null;
      let a = Math.atan2(dy, dx) + Math.PI / 2;        // 0 at twelve o'clock
      if (a < 0) a += TAU;
      const s = Math.floor(a / TAU * (1 << g));
      const id = this.slots[g]?.[s];
      return id === undefined ? null : { g, s, id };
    },

    draw(now) {
      const { people, colourOf, shortName } = ctx;
      const { cx, cy, hub, band, w, h } = this.geometry();
      const grow = reduced ? 1 : ease(clamp((now - this.t0) / 1100, 0, 1));
      cv.clearRect(0, 0, w, h);

      for (let g = this.rings; g >= 1; g--) {
        const row = this.slots[g];
        const count = 1 << g;
        const [r0, r1] = this.radii(g, this.geometry());
        const bandG = r1 - r0;
        // Rings bloom outward one after another.
        const local = clamp((grow - (g - 1) / (this.rings + 2)) * (this.rings + 2) / 2.2, 0, 1);
        if (local <= 0) continue;

        for (let s = 0; s < count; s++) {
          const id = row[s];
          const a0 = s / count * TAU - Math.PI / 2;
          const a1 = (s + 1) / count * TAU - Math.PI / 2;
          const pad = Math.min(0.012, (a1 - a0) * 0.12);
          const rr1 = r0 + (r1 - r0) * local;
          const hot = this.hoverKey === `${g}:${s}`;

          cv.beginPath();
          cv.arc(cx, cy, r0, a0 + pad, a1 - pad);
          cv.arc(cx, cy, rr1 - 1.5, a1 - pad, a0 + pad, true);
          cv.closePath();

          if (id === undefined) {
            // An unfound ancestor. Faint, but present — a gap worth seeing.
            cv.fillStyle = 'rgba(255,255,255,0.022)';
            cv.fill();
            continue;
          }
          const p = people.get(id);
          const col = colourOf(p);
          const grad = cv.createRadialGradient(cx, cy, r0, cx, cy, rr1);
          grad.addColorStop(0, rgba(col, hot ? 0.95 : 0.60));
          grad.addColorStop(1, rgba(col, hot ? 0.70 : 0.30));
          cv.fillStyle = grad;
          cv.fill();
          if (hot) {
            cv.strokeStyle = 'rgba(232,201,122,.95)';
            cv.lineWidth = 1.6; cv.stroke();
            cv.shadowColor = rgba(col, .9); cv.shadowBlur = 26; cv.fill(); cv.shadowBlur = 0;
          }

          // Names, where the wedge is wide enough to hold one.
          const arcLen = (a1 - a0) * (r0 + rr1) / 2;
          if (arcLen > 34 && local > 0.85) {
            const mid = (a0 + a1) / 2, rm = (r0 + rr1) / 2;
            cv.save();
            cv.translate(cx + Math.cos(mid) * rm, cy + Math.sin(mid) * rm);
            let rot = mid + Math.PI / 2;
            let flip = false;
            if (rot > Math.PI / 2 && rot < Math.PI * 1.5) { rot += Math.PI; flip = true; }
            cv.rotate(rot);
            cv.fillStyle = mix(col, .78);
            cv.font = `500 ${clamp(bandG * .20, 8, 12.5)}px Inter, system-ui, sans-serif`;
            cv.textAlign = 'center'; cv.textBaseline = 'middle';
            const label = shortName(p);
            const room = Math.min(bandG - 10, 96);
            cv.fillText(label.length > 15 ? label.slice(0, 14) + '…' : label, 0, flip ? 4 : -4,
                        Math.max(30, room));
            if (bandG > 34 && p.b?.y) {
              cv.fillStyle = 'rgba(255,255,255,.42)';
              cv.font = '400 9px Inter, system-ui, sans-serif';
              cv.fillText(`${p.b.y}${p.d?.y ? '–' + p.d.y : ''}`, 0, flip ? -7 : 8, room);
            }
            cv.restore();
          }
        }
      }

      // The hub: whoever the wheel is centred on.
      const root = people.get(this.slots[0][0]);
      if (root) {
        const col = colourOf(root);
        cv.beginPath(); cv.arc(cx, cy, hub - 4, 0, TAU);
        const g2 = cv.createRadialGradient(cx, cy - hub / 3, 2, cx, cy, hub);
        g2.addColorStop(0, rgba(col, .55)); g2.addColorStop(1, 'rgba(12,10,8,.95)');
        cv.fillStyle = g2; cv.fill();
        cv.strokeStyle = 'rgba(232,201,122,.55)'; cv.lineWidth = 1.4; cv.stroke();
        cv.fillStyle = '#f3efe6';
        cv.font = `600 ${clamp(hub * .21, 10, 15)}px Inter, system-ui, sans-serif`;
        cv.textAlign = 'center'; cv.textBaseline = 'middle';
        const nm = shortName(root);
        cv.fillText(nm.length > 16 ? nm.slice(0, 15) + '…' : nm, cx, cy - 6, hub * 1.7);
        cv.fillStyle = 'rgba(255,255,255,.5)';
        cv.font = '400 10px Inter, system-ui, sans-serif';
        cv.fillText(ctx.yearsOf(root) || '', cx, cy + 10, hub * 1.7);
      }

      // What the wheel is actually saying: how much of it has been found.
      const { found } = this.stats();
      cv.textAlign = 'left'; cv.textBaseline = 'top';
      cv.fillStyle = 'rgba(255,255,255,.5)';
      cv.font = '500 11px Inter, system-ui, sans-serif';
      cv.fillText(`${found} ancestors found · the deepest line reaches ${this.rings - 1} generations back`, 10, 14);
      cv.fillStyle = 'rgba(201,168,76,.55)';
      cv.fillText('each empty wedge is somebody nobody has found yet', 10, 30);
    },

    // How complete this wheel is — the number worth putting on screen.
    stats() {
      let found = 0, possible = 0;
      for (let g = 1; g <= this.rings; g++) {
        possible += 1 << g;
        for (const id of this.slots[g]) if (id !== undefined) found++;
      }
      return { found, possible };
    },

    enter(rootId) { this.build(rootId); },
    move(mx, my) {
      const h = this.hit(mx, my);
      const key = h && h.g > 0 ? `${h.g}:${h.s}` : null;
      if (key !== this.hoverKey) { this.hoverKey = key; }
      if (h && h.id !== undefined) showTip(h.id, mx, my); else hideTip();
      return !!(h && h.id !== undefined);
    },
    click(mx, my) {
      const h = this.hit(mx, my);
      if (h && h.id !== undefined) { this.build(h.id); ctx.showPanel(h.id); ctx.setFocus(h.id); }
    },
    leave() { this.hoverKey = null; hideTip(); },
  };

  /* ═══════════════════════════  TIMELINE  ══════════════════════════════════
     Every life in the file as a bar from birth to death, packed into rows so
     that nothing overlaps. Behind them, the number of people alive in each
     year — the shape of the family itself, growing. */
  const Timeline = {
    id: 'timeline',
    label: 'Timeline',
    rows: null, span: null, hoverId: null, t0: 0,
    scroll: 0,

    build() {
      const { people } = ctx;
      const lives = [];
      const thisYear = new Date().getFullYear();
      for (const [id, p] of people) {
        if (!p.b?.y) continue;
        const from = p.b.y;
        // Only a bar with a real death year is drawn solid. For the rest:
        // somebody born more than 105 years ago is dead whether or not the
        // file says so — without this, a man born in 1668 draws a bar running
        // to the present day and the whole chart is a lie.
        const certainlyGone = p.dead || (thisYear - from) > 105;
        const to = p.d?.y ? p.d.y
                 : certainlyGone ? Math.min(from + 72, thisYear)
                 : thisYear;
        if (to < from) continue;
        lives.push({ id, p, from, to, est: !p.d?.y, living: !certainlyGone && !p.d?.y });
      }
      lives.sort((a, b) => a.from - b.from || a.to - b.to);

      const min = Math.min(...lives.map(l => l.from));
      const max = Math.min(thisYear, Math.max(...lives.map(l => l.to)));
      this.span = { min: Math.floor(min / 10) * 10, max: Math.ceil(max / 10) * 10 };

      // Greedy row packing: first row whose last bar has ended.
      const rowEnd = [];
      this.rows = [];
      for (const l of lives) {
        let r = rowEnd.findIndex(end => end < l.from - 3);
        if (r === -1) { r = rowEnd.length; rowEnd.push(0); this.rows.push([]); }
        rowEnd[r] = l.to;
        l.row = r;
        this.rows[r].push(l);
      }

      // Population curve.
      this.alive = new Array(this.span.max - this.span.min + 1).fill(0);
      for (const l of lives)
        for (let y = l.from; y <= l.to; y++) this.alive[y - this.span.min]++;
      this.peak = Math.max(...this.alive);
      this.count = lives.length;
      this.first = min; this.last = max;
      this.t0 = performance.now();
    },

    geometry() {
      const w = canvas.width / devicePixelRatio, h = canvas.height / devicePixelRatio;
      const padL = 8, padR = 8, padT = 56, padB = 46;
      const plotW = w - padL - padR, plotH = h - padT - padB;
      // Peak overlap decides the row count — 242 people alive at once cannot be
      // drawn in fewer than 242 rows — so the row height has to follow the
      // space, not the other way round. Clamping it to a comfortable minimum
      // made the chart taller than its own canvas and silently cut off the
      // last hundred rows.
      const rowH = Math.min(14, plotH / Math.max(this.rows.length, 1));
      const x = y => padL + (y - this.span.min) / (this.span.max - this.span.min) * plotW;
      return { w, h, padL, padR, padT, padB, plotW, plotH, rowH, x };
    },

    hit(mx, my) {
      const { padT, rowH, x } = this.geometry();
      // Rows can be barely a pixel tall, so search a couple of rows either way
      // and take the nearest hit rather than demanding a direct one.
      const centre = Math.floor((my - padT) / rowH);
      const reach = rowH < 4 ? 2 : 0;
      let best = null, bestD = Infinity;
      for (let r = centre - reach; r <= centre + reach; r++) {
        const row = this.rows[r];
        if (!row) continue;
        for (const l of row) {
          if (mx < x(l.from) - 3 || mx > x(l.to) + 3) continue;
          const d = Math.abs(r - centre);
          if (d < bestD) { bestD = d; best = l; }
        }
      }
      return best;
    },

    draw(now) {
      const { colourOf } = ctx;
      const { w, h, padT, padB, plotW, plotH, rowH, x, padL } = this.geometry();
      const t = reduced ? 1 : ease(clamp((now - this.t0) / 1300, 0, 1));
      cv.clearRect(0, 0, w, h);

      /* population curve, behind everything */
      cv.beginPath();
      cv.moveTo(padL, h - padB);
      for (let i = 0; i < this.alive.length; i++) {
        const yy = this.span.min + i;
        cv.lineTo(x(yy), h - padB - (this.alive[i] / this.peak) * (plotH * .55) * t);
      }
      cv.lineTo(x(this.span.max), h - padB);
      cv.closePath();
      const pg = cv.createLinearGradient(0, padT, 0, h - padB);
      pg.addColorStop(0, 'rgba(201,168,76,.16)');
      pg.addColorStop(1, 'rgba(201,168,76,.015)');
      cv.fillStyle = pg; cv.fill();

      /* decade and century rules */
      for (let yy = this.span.min; yy <= this.span.max; yy += 10) {
        const century = yy % 100 === 0;
        cv.strokeStyle = century ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.045)';
        cv.lineWidth = 1;
        cv.beginPath(); cv.moveTo(x(yy), padT - 16); cv.lineTo(x(yy), h - padB + 6); cv.stroke();
        if (century || (this.span.max - this.span.min < 260 && yy % 50 === 0)) {
          cv.fillStyle = century ? 'rgba(232,201,122,.75)' : 'rgba(255,255,255,.3)';
          cv.font = `${century ? '600' : '400'} 10px Inter, system-ui, sans-serif`;
          cv.textAlign = 'center'; cv.textBaseline = 'alphabetic';
          cv.fillText(String(yy), x(yy), h - padB + 20);
        }
      }

      /* the lives */
      const barH = Math.max(1.1, rowH - Math.min(2, rowH * 0.28));
      for (const row of this.rows) {
        for (const l of row) {
          const x0 = x(l.from), x1 = x(l.to);
          // Bars draw left to right as the view comes in.
          const reveal = clamp((t * (this.span.max - this.span.min) + this.span.min - l.from) / 14, 0, 1);
          if (reveal <= 0) continue;
          const xe = x0 + (x1 - x0) * reveal;
          const yy = padT + l.row * rowH;
          const col = colourOf(l.p);
          const hot = this.hoverId === l.id;
          cv.fillStyle = hot ? mix(col, .5) : rgba(col, l.est ? .34 : .62);
          if (hot) { cv.shadowColor = rgba(col, 1); cv.shadowBlur = 14; }
          const r = Math.min(barH / 2, 3);
          cv.beginPath();
          if (cv.roundRect) cv.roundRect(x0, yy, Math.max(xe - x0, 1.5), barH, r);
          else cv.rect(x0, yy, Math.max(xe - x0, 1.5), barH);
          cv.fill();
          cv.shadowBlur = 0;
        }
      }

      /* heading */
      cv.fillStyle = 'rgba(255,255,255,.55)';
      cv.font = '500 11px Inter, system-ui, sans-serif';
      cv.textAlign = 'left'; cv.textBaseline = 'top';
      cv.fillText(`${this.count} lives with a known birth year · ${this.first}–${this.last}`, padL + 2, 14);
      cv.fillStyle = 'rgba(201,168,76,.6)';
      cv.fillText(`each line is one life · ${this.peak} of them overlap at the peak`, padL + 2, 30);
    },

    enter() { if (!this.rows) this.build(); this.t0 = performance.now(); },
    move(mx, my) {
      const l = this.hit(mx, my);
      this.hoverId = l ? l.id : null;
      if (l) showTip(l.id, mx, my); else hideTip();
      return !!l;
    },
    click(mx, my) { const l = this.hit(mx, my); if (l) { ctx.showPanel(l.id); ctx.setFocus(l.id); } },
    leave() { this.hoverId = null; hideTip(); },
  };

  /* ═══════════════════════════  COSMOS  ════════════════════════════════════
     All 1,007 people at once. Distance from the centre is the year a person
     was born, so the family literally expands outward through time; the angle
     is inherited from a parent with a small offset, which makes each branch
     fall into its own arm. Nobody placed it by hand — the shape is what the
     dates and the parent links do on their own. */
  const Cosmos = {
    id: 'cosmos',
    label: 'Cosmos',
    pts: null, links: null, hoverId: null, t0: 0, spin: 0, showCross: false,

    build() {
      const { people, DATA, colourOf } = ctx;
      const year = yearIndex(people);
      const years = [...year.values()];
      const minY = Math.min(...years), maxY = Math.max(...years);

      // Angle: a root ray per founding surname, then inherited downward.
      const angle = new Map();
      const roots = [...people.values()].filter(p => !p.parents.length);
      roots.sort((a, b) => (year.get(a.i) ?? 9e3) - (year.get(b.i) ?? 9e3));
      roots.forEach((p, i) => {
        // Golden-angle spacing keeps founders from clumping.
        angle.set(p.i, (i * 2.39996) % TAU);
      });
      // Breadth-first so a child always has its parent's angle to work from.
      const spine = new Map();
      const queue = roots.map(p => p.i);
      const seen = new Set(queue);
      while (queue.length) {
        const id = queue.shift();
        const base = angle.get(id) ?? 0;
        const kids = [...new Set(people.get(id).kids)];
        kids.forEach((k, i) => {
          if (!angle.has(k)) {
            const spread = 0.30 / Math.sqrt(1 + (year.get(k) ?? minY) - minY);
            angle.set(k, base + (i - (kids.length - 1) / 2) * spread + (Math.sin(k * 12.9898) * 0.05));
            spine.set(k, id);   // the parent this child's angle came from
          }
          if (!seen.has(k)) { seen.add(k); queue.push(k); }
        });
      }
      for (const [id] of people) if (!angle.has(id)) angle.set(id, (id * 2.39996) % TAU);

      this.pts = [];
      const index = new Map();
      for (const [id, p] of people) {
        const y = year.get(id) ?? minY;
        const rn = (y - minY) / Math.max(1, maxY - minY);
        const pt = {
          id, p, a: angle.get(id), rn,
          col: colourOf(p),
          mag: 1 + Math.min(3, (p.kids?.length || 0) * 0.42),
          twinkle: Math.random() * TAU,
          known: !!p.b?.y,
        };
        index.set(id, pt);
        this.pts.push(pt);
      }
      this.links = [];
      for (const [id, p] of people)
        for (const k of new Set(p.kids)) {
          const a = index.get(id), b = index.get(k);
          if (a && b) this.links.push([a, b, spine.get(k) === id]);
        }
      // Draw the branch-crossing links first so the arms sit on top of them.
      this.links.sort((l, m) => (l[2] ? 1 : 0) - (m[2] ? 1 : 0));
      this.index = index;
      this.minY = minY; this.maxY = maxY;
      this.t0 = performance.now();
    },

    geometry() {
      const w = canvas.width / devicePixelRatio, h = canvas.height / devicePixelRatio;
      return { w, h, cx: w / 2, cy: h / 2, R: Math.min(w, h) * 0.455 };
    },

    place(pt, g, spin) {
      const a = pt.a + spin;
      const r = g.R * (0.10 + 0.90 * pt.rn);
      return { x: g.cx + Math.cos(a) * r, y: g.cy + Math.sin(a) * r };
    },

    hit(mx, my) {
      const g = this.geometry();
      let best = null, bd = 13 * 13;
      for (const pt of this.pts) {
        const { x, y } = this.place(pt, g, this.spin);
        const d = (x - mx) ** 2 + (y - my) ** 2;
        if (d < bd) { bd = d; best = pt; }
      }
      return best;
    },

    // The chain from a person back to the file's root, for highlighting.
    lineage(id) {
      const { people } = ctx;
      const chain = new Set([id]);
      let cur = id, guard = 0;
      while (guard++ < 40) {
        const p = people.get(cur);
        if (!p || !p.parents.length) break;
        cur = p.parents[0];
        chain.add(cur);
      }
      return chain;
    },

    draw(now) {
      const g = this.geometry();
      const t = reduced ? 1 : ease(clamp((now - this.t0) / 1600, 0, 1));
      if (!reduced) this.spin = (now - this.t0) / 1000 * 0.0075;
      cv.clearRect(0, 0, g.w, g.h);

      const chain = this.hoverId ? this.lineage(this.hoverId) : null;

      /* century rings, so the radius means something */
      cv.textAlign = 'center'; cv.textBaseline = 'middle';
      for (let y = Math.ceil(this.minY / 50) * 50; y <= this.maxY; y += 50) {
        const rn = (y - this.minY) / Math.max(1, this.maxY - this.minY);
        const r = g.R * (0.10 + 0.90 * rn) * t;
        cv.beginPath(); cv.arc(g.cx, g.cy, r, 0, TAU);
        cv.strokeStyle = y % 100 === 0 ? 'rgba(255,255,255,.075)' : 'rgba(255,255,255,.032)';
        cv.lineWidth = 1; cv.stroke();
        if (y % 100 === 0) {
          cv.fillStyle = 'rgba(232,201,122,.30)';
          cv.font = '500 9px Inter, system-ui, sans-serif';
          cv.fillText(String(y), g.cx, g.cy - r);
        }
      }

      /* parent → child threads, interpolated in POLAR space -------------------
         A straight line between two points on a disc cuts across the middle,
         and a thousand of those is a hairball. Walking the angle and the
         radius separately — the short way round — makes every thread a spiral
         segment that stays inside its own arm. */
      const radiusOf = pt => g.R * (0.10 + 0.90 * pt.rn) * t;
      for (const [a, b, isSpine] of this.links) {
        const lit = chain && chain.has(a.id) && chain.has(b.id);
        if (!lit && !isSpine && !this.showCross) continue;
        const r0 = radiusOf(a), r1 = radiusOf(b);
        let a0 = a.a + this.spin, a1 = b.a + this.spin;
        let d = a1 - a0;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        cv.beginPath();
        const STEPS = 10;
        for (let i = 0; i <= STEPS; i++) {
          const u = i / STEPS;
          const aa = a0 + d * u, rr = r0 + (r1 - r0) * u;
          const x = g.cx + Math.cos(aa) * rr, y = g.cy + Math.sin(aa) * rr;
          i ? cv.lineTo(x, y) : cv.moveTo(x, y);
        }
        cv.strokeStyle = lit ? 'rgba(232,201,122,.9)'
                       : isSpine ? rgba(a.col, .22) : rgba(a.col, .07);
        cv.lineWidth = lit ? 1.8 : 1;
        cv.stroke();
      }

      /* the people */
      for (const pt of this.pts) {
        const { x, y } = this.place(pt, g, this.spin);
        const px = g.cx + (x - g.cx) * t, py = g.cy + (y - g.cy) * t;
        const lit = chain ? chain.has(pt.id) : false;
        const tw = reduced ? 1 : 0.78 + 0.22 * Math.sin(now / 900 + pt.twinkle);
        let r = pt.mag * (lit ? 2.1 : 1) * tw;
        if (!pt.known) r *= 0.72;
        cv.beginPath(); cv.arc(px, py, r, 0, TAU);
        cv.fillStyle = lit ? '#f6e6b4' : (pt.known ? mix(pt.col, .25) : rgba(pt.col, .5));
        if (lit || pt.mag > 2.2) { cv.shadowColor = lit ? 'rgba(232,201,122,.95)' : rgba(pt.col, .8); cv.shadowBlur = lit ? 18 : 9; }
        cv.fill(); cv.shadowBlur = 0;
        if (pt.id === this.hoverId) {
          cv.beginPath(); cv.arc(px, py, r + 6, 0, TAU);
          cv.strokeStyle = 'rgba(232,201,122,.9)'; cv.lineWidth = 1.4; cv.stroke();
        }
      }

      cv.fillStyle = 'rgba(255,255,255,.5)';
      cv.font = '500 11px Inter, system-ui, sans-serif';
      cv.textAlign = 'left'; cv.textBaseline = 'top';
      cv.fillText(`${this.pts.length} people · centre ${this.minY} · rim ${this.maxY}`, 10, 14);
      cv.fillStyle = 'rgba(201,168,76,.55)';
      cv.fillText('distance from centre is the year of birth', 10, 30);
    },

    enter() { if (!this.pts) this.build(); this.t0 = performance.now(); },
    move(mx, my) {
      const pt = this.hit(mx, my);
      this.hoverId = pt ? pt.id : null;
      if (pt) showTip(pt.id, mx, my); else hideTip();
      return !!pt;
    },
    click(mx, my) { const pt = this.hit(mx, my); if (pt) { ctx.showPanel(pt.id); ctx.setFocus(pt.id); } },
    leave() { this.hoverId = null; hideTip(); },
  };

  const VIEWS = { fan: Fan, timeline: Timeline, cosmos: Cosmos };

  /* ── shared chrome ────────────────────────────────────────────────────── */
  function showTip(id, mx, my) {
    const p = ctx.people.get(id);
    if (!p) return hideTip();
    const years = ctx.yearsOf(p);
    const age = ctx.ageOf ? ctx.ageOf(p) : null;
    tip.innerHTML =
      `<b>${escapeHtml(p.n)}</b>` +
      (years ? `<span>${escapeHtml(years)}${age !== null ? ` · ${age} yrs` : ''}</span>` : '') +
      (p.b?.p ? `<span class="tp">${escapeHtml(p.b.p)}</span>` : '');
    tip.hidden = false;
    const r = stage.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = clamp(mx + 16, 8, r.width - tw - 8) + 'px';
    tip.style.top  = clamp(my + 16, 8, r.height - th - 8) + 'px';
  }
  const hideTip = () => { if (tip) tip.hidden = true; };
  const escapeHtml = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function sizeCanvas() {
    if (!canvas) return;
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    cv.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function loop(now) {
    const v = VIEWS[mode];
    if (v) { v.draw(now); raf = requestAnimationFrame(loop); }
    else raf = 0;
  }

  function setMode(next) {
    if (next === mode) return;
    const prev = VIEWS[mode];
    if (prev) prev.leave();
    mode = next;
    hideTip();
    const isTree = mode === 'tree';
    $('#tree').style.visibility = isTree ? '' : 'hidden';
    canvas.hidden = isTree;
    document.body.classList.toggle('in-view', !isTree);
    $('#hint').textContent = isTree
      ? 'drag to pan · scroll to zoom · click anyone to re-centre'
      : 'hover to read · click to open a person';
    $('#hint').classList.remove('gone');
    for (const b of document.querySelectorAll('.vmode')) b.setAttribute('aria-pressed', b.dataset.mode === mode);
    if (!isTree) {
      sizeCanvas();
      VIEWS[mode].enter(ctx.focusId());
      if (!raf) raf = requestAnimationFrame(loop);
    } else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function buildChrome() {
    stage = $('#stage');

    canvas = document.createElement('canvas');
    canvas.id = 'vcanvas';
    canvas.className = 'vcanvas';
    canvas.hidden = true;
    stage.insertBefore(canvas, stage.firstChild.nextSibling);
    cv = canvas.getContext('2d');

    tip = document.createElement('div');
    tip.className = 'vtip'; tip.hidden = true;
    stage.append(tip);

    const bar = document.createElement('div');
    bar.className = 'vmodes';
    bar.innerHTML = [
      ['tree', 'Tree', 'One person, their ancestors and their children'],
      ['fan', 'Fan', 'Every ancestor of one person, in a single wheel'],
      ['timeline', 'Timeline', 'Every life in the file, against each other'],
      ['cosmos', 'Cosmos', 'The whole family at once, arranged by year of birth'],
    ].map(([m, label, title]) =>
      `<button class="vmode" data-mode="${m}" title="${title}" aria-pressed="${m === 'tree'}">${label}</button>`
    ).join('');
    stage.append(bar);
    bar.addEventListener('click', e => {
      const b = e.target.closest('.vmode');
      if (b) setMode(b.dataset.mode);
    });

    /* pointer plumbing for the canvas views */
    const local = e => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    canvas.addEventListener('mousemove', e => {
      const v = VIEWS[mode]; if (!v) return;
      canvas.style.cursor = v.move(...local(e)) ? 'pointer' : 'default';
    });
    canvas.addEventListener('mouseleave', () => VIEWS[mode]?.leave());
    canvas.addEventListener('click', e => VIEWS[mode]?.click(...local(e)));

    new ResizeObserver(() => { if (mode !== 'tree') sizeCanvas(); }).observe(stage);

    addEventListener('keydown', e => {
      if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
      const keys = { 1: 'tree', 2: 'fan', 3: 'timeline', 4: 'cosmos' };
      if (keys[e.key]) { e.preventDefault(); setMode(keys[e.key]); }
      else if (e.key === 'Escape' && mode !== 'tree') setMode('tree');
    });
  }

  function init(context) {
    ctx = context;
    buildChrome();
    // When tree.js re-centres on somebody, a visible fan should follow.
    ctx.onFocus(id => { if (mode === 'fan') Fan.build(id); });
  }

  return { init, setMode, get mode() { return mode; }, get views() { return VIEWS; } };
})();
