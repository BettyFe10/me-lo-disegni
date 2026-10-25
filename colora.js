// SPDX-License-Identifier: AGPL-3.0-only
// Me lo disegni? - Copyright (C) 2026 Gli autori di Me lo disegni?
/* Colorare sullo schermo il foglio appena disegnato.
 * Tre tele una sopra l'altra: i colori (sotto), il tratto in corso, le linee (sopra, così i colori
 * non le coprono mai). In modalità "Dentro i bordi" ogni tratto resta nella zona dove è cominciato.
 * Usa le funzioni dell'app: state, sheetLayout, drawSheetFrame, drawBadge, go, toast, $...
 */
(function () {
  'use strict';
  const paint = $('#cPaint'), live = $('#cLive'), lines = $('#cLines');
  const px = paint.getContext('2d'), lx = live.getContext('2d'), nx = lines.getContext('2d');
  const seg = document.createElement('canvas'), sx = seg.getContext('2d');

  // alpha: trasparenza del tratto; w: larghezza rispetto alla grandezza scelta
  const TOOLS = {
    pennello: { alpha: 0.92, w: 1 },
    pennarello: { alpha: 0.72, w: 0.75 },
    matita: { alpha: 0.95, w: 0.45 },
    cera: { alpha: 0.97, w: 1.1 },
    spray: { alpha: 1, w: 1.8 },
    secchiello: { alpha: 1, w: 1 },
    gomma: { alpha: 1, w: 1.3 }
  };
  const PALETTE = [
    ['rosso', '#E53935'], ['arancione', '#FB8C00'], ['giallo', '#FDD835'], ['verde chiaro', '#7CB342'], ['verde', '#2E7D32'],
    ['azzurro', '#29B6F6'], ['blu', '#1E40AF'], ['viola', '#7E57C2'], ['rosa', '#F06292'], ['marrone', '#8D5524'],
    ['rosa pelle', '#F1C27D'], ['grigio', '#9E9E9E'], ['nero', '#222222'], ['bianco', '#FFFFFF'], ['oro', '#D4A82A']
  ];
  const SIZES = [10, 22, 40];

  const cs = {
    tool: 'pennello', color: '#E53935', base: '#E53935', size: 1, guided: true,
    undo: [], forLines: null, nums: null, L: null, regions: null, masks: new Map(), drawing: null, sprayTimer: 0
  };
  try {
    const saved = JSON.parse(localStorage.getItem('colora.prefs') || '{}');
    Object.assign(cs, { tool: saved.tool || cs.tool, color: saved.color || cs.color, base: saved.base || cs.base, size: saved.size ?? cs.size, guided: saved.guided ?? cs.guided });
  } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem('colora.prefs', JSON.stringify({ tool: cs.tool, color: cs.color, base: cs.base, size: cs.size, guided: cs.guided })); } catch (e) {} };

  /* ----- apertura: prepara il foglio (una volta per disegno) ----- */
  function open() {
    const res = state.lines;
    if (!res) return;
    if (cs.forLines !== res || cs.nums !== colorNumsOn()) {
      const probe = sheetLayout(res, 1);
      const L = sheetLayout(res, 1200 / Math.max(probe.W, probe.H));
      cs.L = L; cs.forLines = res; cs.nums = colorNumsOn();
      for (const c of [paint, live, lines, seg]) { c.width = L.W; c.height = L.H; }
      drawLines(res, L);
      cs.regions = findRegions(L);
      cs.masks.forEach(freeCanvas); cs.masks.clear();
      cs.undo.forEach(freeCanvas); cs.undo = [];
      px.clearRect(0, 0, L.W, L.H);
    }
    renderTools();
    go('color');
  }

  function drawLines(res, L) {
    nx.clearRect(0, 0, L.W, L.H);
    drawSheetFrame(nx, L, false);
    const { k, ox, oy } = L;
    nx.save();
    nx.strokeStyle = '#15151A'; nx.lineCap = 'round'; nx.lineJoin = 'round';
    nx.lineWidth = Math.max(2.5, res.lineWidth * k * 1.1);
    for (const s of res.strokes) {
      if (s.length < 4) continue;
      nx.beginPath(); nx.moveTo(ox + s[0] * k, oy + s[1] * k);
      for (let i = 2; i < s.length; i += 2) nx.lineTo(ox + s[i] * k, oy + s[i + 1] * k);
      nx.stroke();
    }
    nx.restore();
    L.spots.forEach((sp, i) => drawBadge(nx, ox + sp.x * k, oy + sp.y * k, L.badgeR, i + 1));
  }

  /* ----- zone chiuse tra le linee (a metà risoluzione) ----- */
  function findRegions(L) {
    const s = 0.5, w = Math.round(L.W * s), h = Math.round(L.H * s), n = w * h;
    const t = document.createElement('canvas'); t.width = w; t.height = h;
    const tx = t.getContext('2d', { willReadFrequently: true });
    tx.drawImage(lines, 0, 0, w, h);
    // muri invisibili: chiudono i varchi rimasti tra le linee e fanno da bordo al disegno,
    // così il secchiello e la modalità "Dentro i bordi" non scappano nel resto del foglio
    const res = cs.forLines, k = L.k * s;
    tx.save();
    tx.strokeStyle = '#000'; tx.lineCap = 'round';
    tx.setTransform(k, 0, 0, k, L.ox * s, L.oy * s);
    tx.lineWidth = Math.max(2 / k, res.lineWidth);
    tx.beginPath();
    for (const [x0, y0, x1, y1] of LineArt.gapLinks(res.strokes, res.width, res.height, Math.max(res.width, res.height) * 0.06, true, Math.max(res.width, res.height) * 0.12)) {
      tx.moveTo(x0, y0); tx.lineTo(x1, y1);
    }
    tx.rect(0, 0, res.width, res.height);
    tx.stroke();
    tx.restore();
    const a = tx.getImageData(0, 0, w, h).data;
    freeCanvas(t);
    // le linee, un po' ingrossate per chiudere i piccoli varchi
    const wall0 = new Uint8Array(n);
    for (let i = 0; i < n; i++) wall0[i] = a[i * 4 + 3] > 60 ? 1 : 0;
    const wall = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -1; dy <= 1 && !v; dy++) for (let dx = -1; dx <= 1 && !v; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy >= 0 && xx >= 0 && yy < h && xx < w && wall0[yy * w + xx]) v = 1;
      }
      wall[y * w + x] = v;
    }
    const lab = new Int32Array(n).fill(-1), stack = new Int32Array(n);
    let id = 0;
    for (let s0 = 0; s0 < n; s0++) {
      if (wall[s0] || lab[s0] >= 0) continue;
      let top = 0;
      stack[top++] = s0; lab[s0] = id;
      while (top) {
        const i = stack[--top], x = i % w, y = (i / w) | 0;
        if (x > 0 && !wall[i - 1] && lab[i - 1] < 0) { lab[i - 1] = id; stack[top++] = i - 1; }
        if (x < w - 1 && !wall[i + 1] && lab[i + 1] < 0) { lab[i + 1] = id; stack[top++] = i + 1; }
        if (y > 0 && !wall[i - w] && lab[i - w] < 0) { lab[i - w] = id; stack[top++] = i - w; }
        if (y < h - 1 && !wall[i + w] && lab[i + w] < 0) { lab[i + w] = id; stack[top++] = i + w; }
      }
      id++;
    }
    // per le maschere ogni zona si allarga sotto le linee: il colore arriva fino al tratto nero
    const grow = Int32Array.from(lab);
    for (let it = 0; it < 4; it++) {
      const prev = Int32Array.from(grow);
      for (let i = 0; i < n; i++) {
        if (prev[i] >= 0) continue;
        const x = i % w, y = (i / w) | 0;
        const v = (x > 0 && prev[i - 1] >= 0) ? prev[i - 1] : (x < w - 1 && prev[i + 1] >= 0) ? prev[i + 1]
          : (y > 0 && prev[i - w] >= 0) ? prev[i - w] : (y < h - 1 && prev[i + w] >= 0) ? prev[i + w] : -1;
        grow[i] = v;
      }
    }
    return { w, h, s, lab, grow };
  }

  function regionAt(p) {
    const R = cs.regions;
    const cx = Math.floor(p.x * R.s), cy = Math.floor(p.y * R.s);
    // se si tocca proprio una linea, vale la zona più vicina
    for (let r = 0; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= R.w || y >= R.h) continue;
        const v = R.lab[y * R.w + x];
        if (v >= 0) return v;
      }
    }
    return -1;
  }

  // maschera a piena risoluzione di una zona (tenute in memoria solo le ultime usate)
  function maskFor(id) {
    if (cs.masks.has(id)) { const m = cs.masks.get(id); cs.masks.delete(id); cs.masks.set(id, m); return m; }
    const R = cs.regions, small = document.createElement('canvas');
    small.width = R.w; small.height = R.h;
    const sxx = small.getContext('2d'), img = sxx.createImageData(R.w, R.h);
    for (let i = 0; i < R.grow.length; i++) if (R.grow[i] === id) img.data[i * 4 + 3] = 255;
    sxx.putImageData(img, 0, 0);
    const big = document.createElement('canvas');
    big.width = cs.L.W; big.height = cs.L.H;
    const bx = big.getContext('2d');
    bx.imageSmoothingEnabled = true;
    bx.drawImage(small, 0, 0, big.width, big.height);
    freeCanvas(small);
    cs.masks.set(id, big);
    if (cs.masks.size > 3) { const old = cs.masks.keys().next().value; freeCanvas(cs.masks.get(old)); cs.masks.delete(old); }
    return big;
  }

  /* ----- strumenti ----- */
  const textures = new Map();
  function rgbOf(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  // grana della matita colorata e della cera: il colore con dei "buchi" da cui si vede la carta
  function texture(kind) {
    const key = kind + cs.color;
    if (textures.has(key)) return textures.get(key);
    const S = 128, t = document.createElement('canvas'); t.width = t.height = S;
    const tx = t.getContext('2d'), img = tx.createImageData(S, S), [r, g, b] = rgbOf(cs.color);
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    if (kind === 'matita') {
      for (let i = 0; i < S * S; i++) {
        const v = rand();
        img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = v < 0.55 ? 170 + v * 150 : v * 90;
      }
    } else {
      // cera: macchie morbide (rumore a celle interpolato) più la grana fine del foglio
      const G = 9, cells = Math.ceil(S / G) + 1, grid = [];
      for (let c = 0; c < cells * cells; c++) grid.push(rand());
      const at = (cx, cy) => grid[(cy % (cells - 1)) * cells + (cx % (cells - 1))];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const gx = x / G, gy = y / G, x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0;
        const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx, bot = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
        const v = 0.55 * (top * (1 - fy) + bot * fy) + 0.45 * rand();
        const i = y * S + x;
        img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = v > 0.3 ? 225 + rand() * 30 : v * 160;
      }
    }
    tx.putImageData(img, 0, 0);
    const pat = lx.createPattern(t, 'repeat');
    textures.set(key, pat);
    if (textures.size > 24) textures.delete(textures.keys().next().value);
    return pat;
  }

  const width = () => SIZES[cs.size] * (TOOLS[cs.tool].w || 1);

  function spray(x, cx, cy) {
    const R = width(), dots = Math.round(R * 1.4);
    x.fillStyle = cs.color;
    for (let i = 0; i < dots; i++) {
      const a = Math.random() * Math.PI * 2, d = R * Math.sqrt(Math.random());
      x.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.6, 1.6);
    }
  }

  function strokeOn(x, a, b) {
    x.save();
    x.lineCap = 'round'; x.lineJoin = 'round';
    if (cs.tool === 'spray') {
      const dist = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(dist / 6));
      for (let i = 1; i <= steps; i++) spray(x, a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps);
    } else {
      x.strokeStyle = cs.tool === 'gomma' ? '#FFFFFF' : cs.tool === 'matita' || cs.tool === 'cera' ? texture(cs.tool) : cs.color;
      x.lineWidth = width();
      x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x + 0.01, b.y); x.stroke();
    }
    x.restore();
  }

  // un pezzetto di tratto: si disegna a parte, si ritaglia sulla zona e si aggiunge al tratto in corso
  function segment(a, b) {
    const d = cs.drawing, r = width() + 4;
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - r)), y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - r));
    const x1 = Math.min(cs.L.W, Math.ceil(Math.max(a.x, b.x) + r)), y1 = Math.min(cs.L.H, Math.ceil(Math.max(a.y, b.y) + r));
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    if (!d.clip) { strokeOn(lx, a, b); return; }
    strokeOn(sx, a, b);
    sx.globalCompositeOperation = 'destination-in';
    sx.drawImage(d.clip, x0, y0, w, h, x0, y0, w, h);
    sx.globalCompositeOperation = 'source-over';
    lx.drawImage(seg, x0, y0, w, h, x0, y0, w, h);
    sx.clearRect(x0, y0, w, h);
  }

  function pos(e) {
    const r = lines.getBoundingClientRect();
    return { x: (e.clientX - r.left) * lines.width / r.width, y: (e.clientY - r.top) * lines.height / r.height };
  }

  function pushUndo() {
    const c = document.createElement('canvas');
    c.width = paint.width; c.height = paint.height;
    c.getContext('2d').drawImage(paint, 0, 0);
    cs.undo.push(c);
    if (cs.undo.length > 8) freeCanvas(cs.undo.shift());
    $('#cUndo').disabled = false;
  }

  function fill(p) {
    const id = regionAt(p);
    if (id < 0) return;
    pushUndo();
    const t = document.createElement('canvas');
    t.width = paint.width; t.height = paint.height;
    const tx = t.getContext('2d');
    tx.drawImage(maskFor(id), 0, 0);
    tx.globalCompositeOperation = 'source-in';
    tx.fillStyle = cs.color; tx.fillRect(0, 0, t.width, t.height);
    px.drawImage(t, 0, 0);
    freeCanvas(t);
  }

  lines.addEventListener('pointerdown', e => {
    if (!cs.L || e.button > 0) return;
    e.preventDefault();
    const p = pos(e);
    if (cs.tool === 'secchiello') { fill(p); return; }
    let clip = null;
    if (cs.guided) {
      const id = regionAt(p);
      if (id < 0) return;
      clip = maskFor(id);
    }
    try { lines.setPointerCapture(e.pointerId); } catch (err) {}
    pushUndo();
    cs.drawing = { last: p, clip, id: e.pointerId };
    live.style.opacity = TOOLS[cs.tool].alpha;
    lx.clearRect(0, 0, live.width, live.height);
    segment(p, p);
    // la bomboletta spruzza anche se il dito sta fermo
    if (cs.tool === 'spray') cs.sprayTimer = setInterval(() => cs.drawing && segment(cs.drawing.last, cs.drawing.last), 45);
  });
  lines.addEventListener('pointermove', e => {
    const d = cs.drawing;
    if (!d || e.pointerId !== d.id) return;
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (list.length ? list : [e])) { const p = pos(ev); segment(d.last, p); d.last = p; }
  });
  function endStroke(e) {
    const d = cs.drawing;
    if (!d || (e && e.pointerId !== d.id)) return;
    clearInterval(cs.sprayTimer);
    cs.drawing = null;
    px.save();
    if (cs.tool === 'gomma') px.globalCompositeOperation = 'destination-out';
    else px.globalAlpha = TOOLS[cs.tool].alpha;
    px.drawImage(live, 0, 0);
    px.restore();
    lx.clearRect(0, 0, live.width, live.height);
  }
  lines.addEventListener('pointerup', endStroke);
  lines.addEventListener('pointercancel', endStroke);

  /* ----- salvare il foglio colorato ----- */
  function composed() {
    const c = document.createElement('canvas');
    c.width = cs.L.W; c.height = cs.L.H;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(paint, 0, 0); x.drawImage(lines, 0, 0);
    return c;
  }
  $('#cSave').addEventListener('click', async () => {
    if (!cs.L) return;
    const c = composed();
    const blob = await canvasToBlob(c, 'image/jpeg', 0.9);
    freeCanvas(c);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'colorato-' + norm(firstName(state.img)).replace(/ /g, '-') + '.jpg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast('Disegno colorato salvato');
  });

  $('#cUndo').addEventListener('click', () => {
    const c = cs.undo.pop();
    if (!c) return;
    px.clearRect(0, 0, paint.width, paint.height);
    px.drawImage(c, 0, 0);
    freeCanvas(c);
    $('#cUndo').disabled = !cs.undo.length;
  });
  $('#cClear').addEventListener('click', () => { $('#cConfirm').hidden = false; });
  $('#cClearNo').addEventListener('click', () => { $('#cConfirm').hidden = true; });
  $('#cClearYes').addEventListener('click', () => {
    pushUndo();
    px.clearRect(0, 0, paint.width, paint.height);
    $('#cConfirm').hidden = true;
  });

  /* ----- pannello: strumenti, colori, sfumature, grandezza ----- */
  function hexToHsl(hex) {
    let [r, g, b] = rgbOf(hex).map(v => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const f = n => {
      const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
    };
    return '#' + f(0) + f(8) + f(4);
  }
  // dal più chiaro al più scuro, con il colore scelto nel mezzo
  function shadesOf(hex) {
    const [h, s, l] = hexToHsl(hex);
    const out = [];
    for (const t of [0.78, 0.55, 0.3]) out.push(hslToHex(h, s, l + (96 - l) * t));
    out.push(hex.toUpperCase());
    for (const t of [0.25, 0.48, 0.68]) out.push(hslToHex(h, s, l * (1 - t)));
    return [...new Set(out)];
  }

  function swatch(hex, label, onPick, selected) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.style.background = hex;
    b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', String(selected));
    b.addEventListener('click', onPick);
    return b;
  }

  function renderTools() {
    $$('#tools button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === cs.tool)));
    const pal = $('#palette'); pal.innerHTML = '';
    for (const [name, hex] of PALETTE) {
      pal.appendChild(swatch(hex, name, () => { cs.base = hex; cs.color = hex; savePrefs(); renderTools(); }, cs.base.toUpperCase() === hex.toUpperCase()));
    }
    const sh = $('#shades'); sh.innerHTML = '';
    shadesOf(cs.base).forEach((hex, i) => {
      sh.appendChild(swatch(hex, 'sfumatura ' + (i + 1), () => { cs.color = hex; savePrefs(); renderTools(); }, cs.color.toUpperCase() === hex.toUpperCase()));
    });
    $('#cCustom').value = cs.color.length === 7 ? cs.color : '#E53935';
    $('#cNow').style.background = cs.color;
    $$('#sizes button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.s) === cs.size)));
    $('#guided').checked = cs.guided;
    $('#cUndo').disabled = !cs.undo.length;
  }
  $('#tools').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    cs.tool = b.dataset.tool; savePrefs(); renderTools();
  });
  $('#sizes').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    cs.size = Number(b.dataset.s); savePrefs(); renderTools();
  });
  $('#guided').addEventListener('change', e => { cs.guided = e.target.checked; savePrefs(); });
  $('#cCustom').addEventListener('input', e => { cs.base = e.target.value; cs.color = e.target.value; savePrefs(); renderTools(); });

  $('#colorBtn').addEventListener('click', open);
})();
