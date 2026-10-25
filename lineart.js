/*
 * Matita - estrazione dei contorni da un'immagine.
 * Tutto gira sul dispositivo: nessun server, nessuna AI esterna.
 *
 * Pipeline:
 *  1. scala di grigi su fondo bianco
 *  2. linee scure sottili (i contorni neri dei cartoni)
 *  3. macchie scure grandi -> solo il loro bordo (cosi' non diventano scarabocchi)
 *  4. bordi tra colori diversi (Sobel)
 *  5. pulizia del rumore, assottigliamento a 1 pixel (Zhang-Suen)
 *  6. tracciamento in tratti ordinati, pronti per essere "disegnati" piano piano
 */
(function (root) {
  'use strict';

  // Livelli di dettaglio: 1 = poche linee, 2 = normale, 3 = tante linee
  const DETAIL = {
    1: { dark: 80, edge: 240, blur: 2, minArea: 70, minLen: 20 },
    2: { dark: 100, edge: 160, blur: 1, minArea: 40, minLen: 12 },
    3: { dark: 120, edge: 105, blur: 1, minArea: 22, minLen: 8 }
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function grayOnWhite(rgba, n) {
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      const a = rgba[p + 3] / 255;
      const lum = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
      g[i] = lum * a + 255 * (1 - a);
    }
    return g;
  }

  function boxBlur(src, w, h, r) {
    if (r <= 0) return src;
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    const d = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[row + clamp(k, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = s / d;
        s += src[row + clamp(x + r + 1, 0, w - 1)] - src[row + clamp(x - r, 0, w - 1)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[clamp(k, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / d;
        s += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x];
      }
    }
    return out;
  }

  function sobel(g, w, h) {
    const m = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = -g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1] + g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1];
        const gy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1];
        m[i] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    return m;
  }

  // Passata morfologica separabile. all=true -> erosione, all=false -> dilatazione
  function passH(src, w, h, r, all) {
    const out = new Uint8Array(w * h);
    const d = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let c = 0;
      for (let k = 0; k <= r && k < w; k++) c += src[row + k];
      for (let x = 0; x < w; x++) {
        out[row + x] = all ? (c === d ? 1 : 0) : (c > 0 ? 1 : 0);
        const add = x + r + 1, rem = x - r;
        if (add < w) c += src[row + add];
        if (rem >= 0) c -= src[row + rem];
      }
    }
    return out;
  }

  function passV(src, w, h, r, all) {
    const out = new Uint8Array(w * h);
    const d = 2 * r + 1;
    for (let x = 0; x < w; x++) {
      let c = 0;
      for (let k = 0; k <= r && k < h; k++) c += src[k * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = all ? (c === d ? 1 : 0) : (c > 0 ? 1 : 0);
        const add = y + r + 1, rem = y - r;
        if (add < h) c += src[add * w + x];
        if (rem >= 0) c -= src[rem * w + x];
      }
    }
    return out;
  }

  function erode(m, w, h, r) { return passV(passH(m, w, h, r, true), w, h, r, true); }
  function dilate(m, w, h, r) { return passV(passH(m, w, h, r, false), w, h, r, false); }

  function removeSmall(m, w, h, minArea) {
    const seen = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    const comp = [];
    for (let s = 0; s < w * h; s++) {
      if (!m[s] || seen[s]) continue;
      let top = 0;
      stack[top++] = s;
      seen[s] = 1;
      comp.length = 0;
      while (top) {
        const i = stack[--top];
        comp.push(i);
        const x = i % w, y = (i / w) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (m[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
          }
        }
      }
      if (comp.length < minArea) for (const i of comp) m[i] = 0;
    }
  }

  // Assottigliamento Zhang-Suen: ogni linea diventa larga 1 pixel
  function thin(m, w, h) {
    for (let x = 0; x < w; x++) { m[x] = 0; m[(h - 1) * w + x] = 0; }
    for (let y = 0; y < h; y++) { m[y * w] = 0; m[y * w + w - 1] = 0; }
    let pts = [];
    for (let i = 0; i < w * h; i++) if (m[i]) pts.push(i);
    const del = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        del.length = 0;
        for (const i of pts) {
          if (!m[i]) continue;
          const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1];
          const p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A = (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) +
                    (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0);
          if (A !== 1) continue;
          if (step === 0) { if (p2 && p4 && p6) continue; if (p4 && p6 && p8) continue; }
          else { if (p2 && p4 && p8) continue; if (p2 && p6 && p8) continue; }
          del.push(i);
        }
        for (const i of del) m[i] = 0;
        if (del.length) changed = true;
      }
      pts = pts.filter(i => m[i]);
    }
  }

  // Trasforma lo scheletro in tratti (liste di punti)
  function trace(sk, w, h, minLen) {
    const OFF = [1, w, -1, -w, w + 1, w - 1, -w - 1, -w + 1];
    const vis = new Uint8Array(w * h);
    const walkId = new Int32Array(w * h).fill(-1);
    const walkPos = new Int32Array(w * h);
    const strokes = [];
    let wid = 0;

    function deg(i) {
      let c = 0;
      for (const o of OFF) if (sk[i + o]) c++;
      return c;
    }

    function walk(start) {
      const id = wid++;
      const pts = [];
      for (const o of OFF) {
        const q = start + o;
        if (sk[q] && vis[q]) { pts.push(q); break; }
      }
      let p = start;
      for (;;) {
        vis[p] = 1; walkId[p] = id; walkPos[p] = pts.length; pts.push(p);
        let nx = -1;
        for (const o of OFF) {
          const q = p + o;
          if (sk[q] && !vis[q]) { nx = q; break; }
        }
        if (nx < 0) break;
        p = nx;
      }
      // chiude il tratto se tocca un altro tratto o il proprio inizio
      for (const o of OFF) {
        const q = p + o;
        if (!sk[q] || !vis[q] || q === p) continue;
        if (walkId[q] !== id || (pts.length - 1 - walkPos[q]) > 6) { pts.push(q); break; }
      }
      return pts;
    }

    const n = w * h;
    for (let i = 0; i < n; i++) if (sk[i] && !vis[i] && deg(i) === 1) push(walk(i));
    for (let i = 0; i < n; i++) if (sk[i] && !vis[i]) push(walk(i));

    function push(pts) {
      if (pts.length < minLen) return;
      const flat = new Array(pts.length * 2);
      for (let k = 0; k < pts.length; k++) {
        flat[2 * k] = pts[k] % w;
        flat[2 * k + 1] = (pts[k] / w) | 0;
      }
      strokes.push(flat);
    }
    return strokes;
  }

  // Semplificazione Ramer-Douglas-Peucker
  function simplify(flat, eps) {
    const n = flat.length / 2;
    if (n < 3) return flat;
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const ax = flat[2 * a], ay = flat[2 * a + 1], bx = flat[2 * b], by = flat[2 * b + 1];
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy);
      let best = -1, bi = -1;
      for (let i = a + 1; i < b; i++) {
        // tratti chiusi (inizio = fine): si misura la distanza dal punto iniziale
        const d = len < 1e-6
          ? Math.hypot(flat[2 * i] - ax, flat[2 * i + 1] - ay)
          : Math.abs(dy * flat[2 * i] - dx * flat[2 * i + 1] + bx * ay - by * ax) / len;
        if (d > best) { best = d; bi = i; }
      }
      if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(flat[2 * i], flat[2 * i + 1]);
    return out;
  }

  function strokeLen(f) {
    let L = 0;
    for (let i = 2; i < f.length; i += 2) L += Math.hypot(f[i] - f[i - 2], f[i + 1] - f[i - 1]);
    return L;
  }

  function reverse(f) {
    const out = new Array(f.length);
    for (let i = 0, j = f.length - 2; j >= 0; i += 2, j -= 2) { out[i] = f[j]; out[i + 1] = f[j + 1]; }
    return out;
  }

  // Ordine "umano": prima il contorno piu' lungo, poi il tratto piu' vicino
  function order(strokes) {
    if (!strokes.length) return strokes;
    const rest = strokes.slice().sort((a, b) => strokeLen(b) - strokeLen(a));
    const out = [rest.shift()];
    while (rest.length) {
      const last = out[out.length - 1];
      const ex = last[last.length - 2], ey = last[last.length - 1];
      let best = Infinity, bi = 0, rev = false;
      for (let i = 0; i < rest.length; i++) {
        const s = rest[i];
        const d0 = (s[0] - ex) ** 2 + (s[1] - ey) ** 2;
        const d1 = (s[s.length - 2] - ex) ** 2 + (s[s.length - 1] - ey) ** 2;
        if (d0 < best) { best = d0; bi = i; rev = false; }
        if (d1 < best) { best = d1; bi = i; rev = true; }
      }
      const s = rest.splice(bi, 1)[0];
      out.push(rev ? reverse(s) : s);
    }
    return out;
  }

  /**
   * imageData: { width, height, data (RGBA) }
   * level: 1 | 2 | 3
   * Ritorna { width, height, strokes: [[x0,y0,x1,y1,...], ...], lineWidth }
   */
  function extract(imageData, level) {
    const cfg = DETAIL[level] || DETAIL[2];
    const w = imageData.width, h = imageData.height, n = w * h;
    const dim = Math.max(w, h);

    const g = grayOnWhite(imageData.data, n);
    const g1 = boxBlur(g, w, h, 1);
    let gb = g1;
    for (let k = 1; k < cfg.blur; k++) gb = boxBlur(gb, w, h, 1);

    // 1. zone scure
    const dark = new Uint8Array(n);
    for (let i = 0; i < n; i++) dark[i] = g1[i] < cfg.dark ? 1 : 0;

    // 2. macchie spesse (pupille, capelli neri...) -> teniamo solo il bordo
    const r = Math.max(3, Math.round(dim * 0.0065));
    const thick = dilate(erode(dark, w, h, r), w, h, r);
    const thickIn = erode(thick, w, h, 1);

    // 3. bordi tra colori
    const mag = sobel(gb, w, h);

    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const thinDark = dark[i] && !thick[i];
      const blobEdge = thick[i] && !thickIn[i];
      const colorEdge = mag[i] > cfg.edge && !thickIn[i];
      mask[i] = thinDark || blobEdge || colorEdge ? 1 : 0;
    }

    // via la cornice dell'immagine
    const b = 3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x < b || y < b || x >= w - b || y >= h - b) mask[y * w + x] = 0;
    }

    // unisce linee doppie vicine, poi pulisce
    let closed = erode(dilate(mask, w, h, 1), w, h, 1);
    removeSmall(closed, w, h, cfg.minArea);
    thin(closed, w, h);

    let strokes = trace(closed, w, h, cfg.minLen).map(s => simplify(s, 0.8));
    strokes = order(strokes);

    return { width: w, height: h, strokes, lineWidth: Math.max(2.5, dim / 190) };
  }

  const api = { extract, DETAIL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LineArt = api;
})(typeof self !== 'undefined' ? self : this);
