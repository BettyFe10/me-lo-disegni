// SPDX-License-Identifier: AGPL-3.0-only
// Me lo disegni? - Copyright (C) 2026 Gli autori di Me lo disegni?
/*
 * Me lo disegni? - estrazione dei contorni da un'immagine.
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

  /* ===================== Modalità FOTO =====================
   * Le foto (pelo, erba, cielo sfumato) non hanno contorni netti.
   * Qui l'immagine viene divisa in poche zone di colore, le zone piccole
   * vengono assorbite dalle vicine, e si disegnano i confini tra le zone:
   * come chi ricalca una foto per farne un disegno da colorare.
   */
  const PHOTO = {
    1: { k: 3, minArea: 0.03, minDark: 0.004, minLen: 16, edge: 60, edgeTop: 0.97 },
    2: { k: 4, minArea: 0.015, minDark: 0.002, minLen: 12, edge: 50, edgeTop: 0.95 },
    3: { k: 6, minArea: 0.007, minDark: 0.001, minLen: 9, edge: 38, edgeTop: 0.9 }
  };

  // È una foto o un disegno? I disegni hanno molto bianco e inchiostro scuro.
  function looksLikePhoto(rgba, n) {
    let white = 0, dark = 0, step = Math.max(1, Math.floor(n / 40000)), tot = 0;
    for (let i = 0; i < n; i += step) {
      const p = i * 4;
      const a = rgba[p + 3] / 255;
      const lum = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) * a + 255 * (1 - a);
      if (lum > 232) white++;
      else if (lum < 70) dark++;
      tot++;
    }
    return white / tot < 0.35;
  }

  function toLab(r, g, b) {
    const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const R = f(r), G = f(g), B = f(b);
    let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    let Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
    let Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const g3 = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    X = g3(X); Y = g3(Y); Z = g3(Z);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
  }

  // generatore pseudo-casuale fisso: stessa immagine, stesso disegno
  function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }

  // Foto piccola (lato lungo 420) in Lab, ammorbidita senza perdere i confini
  function labImage(imageData) {
    const W0 = imageData.width, H0 = imageData.height;
    const s = Math.min(1, 420 / Math.max(W0, H0));
    const w = Math.max(8, Math.round(W0 * s)), h = Math.max(8, Math.round(H0 * s)), n = w * h;
    const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
    const src = imageData.data;
    for (let y = 0; y < h; y++) {
      const y0 = Math.floor(y / s), y1 = Math.max(y0 + 1, Math.floor((y + 1) / s));
      for (let x = 0; x < w; x++) {
        const x0 = Math.floor(x / s), x1 = Math.max(x0 + 1, Math.floor((x + 1) / s));
        let r = 0, g = 0, b = 0, c = 0;
        for (let yy = y0; yy < y1 && yy < H0; yy++) for (let xx = x0; xx < x1 && xx < W0; xx++) {
          const p = (yy * W0 + xx) * 4, a = src[p + 3] / 255;
          r += src[p] * a + 255 * (1 - a); g += src[p + 1] * a + 255 * (1 - a); b += src[p + 2] * a + 255 * (1 - a); c++;
        }
        const lab = toLab(r / c, g / c, b / c);
        const i = y * w + x;
        L[i] = lab[0]; A[i] = lab[1]; B[i] = lab[2];
      }
    }
    // filtro bilaterale ripetuto: appiattisce pelo, erba e foglie ma tiene netti i bordi
    let cur = [L, A, B];
    for (let it = 0; it < 3; it++) cur = bilateral(cur[0], cur[1], cur[2], w, h, 2, 9);
    return { w, h, n, s, L: cur[0], A: cur[1], B: cur[2] };
  }

  function bilateral(L, A, B, w, h, r, sc) {
    const n = w * h;
    const oL = new Float32Array(n), oA = new Float32Array(n), oB = new Float32Array(n);
    const span = 18 * sc * sc, TAB = 1024, tab = new Float32Array(TAB);
    for (let t = 0; t < TAB; t++) tab[t] = Math.exp(-(t / (TAB - 1)) * span / (2 * sc * sc));
    const sw = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) sw.push(dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * r * r)));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, l0 = L[i], a0 = A[i], b0 = B[i];
      let sl = 0, sa = 0, sb = 0, st = 0;
      for (let q = 0; q < sw.length; q += 3) {
        const j = clamp(y + sw[q + 1], 0, h - 1) * w + clamp(x + sw[q], 0, w - 1);
        const d = (L[j] - l0) ** 2 + (A[j] - a0) ** 2 + (B[j] - b0) ** 2;
        if (d >= span) continue;
        const wt = sw[q + 2] * tab[(d / span * (TAB - 1)) | 0];
        sl += L[j] * wt; sa += A[j] * wt; sb += B[j] * wt; st += wt;
      }
      oL[i] = sl / st; oA[i] = sa / st; oB[i] = sb / st;
    }
    return [oL, oA, oB];
  }

  // k-means (k-means++ con seme fisso) sui pixel indicati
  function kmeans(P, pool, k) {
    const { L, A, B } = P, rand = rng(12345);
    const sample = [];
    for (let j = 0; j < pool.length; j += 3) sample.push(pool[j]);
    const cl = [], ca = [], cb = [];
    const first = sample[Math.floor(rand() * sample.length)];
    cl.push(L[first]); ca.push(A[first]); cb.push(B[first]);
    const d2 = new Float32Array(sample.length).fill(Infinity);
    while (cl.length < k) {
      let sum = 0;
      for (let j = 0; j < sample.length; j++) {
        const i = sample[j], c = cl.length - 1;
        const d = (L[i] - cl[c]) ** 2 + (A[i] - ca[c]) ** 2 + (B[i] - cb[c]) ** 2;
        if (d < d2[j]) d2[j] = d;
        sum += d2[j];
      }
      let t = rand() * sum, pick = sample[sample.length - 1];
      for (let j = 0; j < sample.length; j++) { t -= d2[j]; if (t <= 0) { pick = sample[j]; break; } }
      cl.push(L[pick]); ca.push(A[pick]); cb.push(B[pick]);
    }
    for (let it = 0; it < 10; it++) {
      const sl = new Float64Array(k), sa = new Float64Array(k), sb = new Float64Array(k), sc = new Float64Array(k);
      for (const i of sample) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < k; c++) {
          const d = (L[i] - cl[c]) ** 2 + (A[i] - ca[c]) ** 2 + (B[i] - cb[c]) ** 2;
          if (d < bd) { bd = d; best = c; }
        }
        sl[best] += L[i]; sa[best] += A[i]; sb[best] += B[i]; sc[best]++;
      }
      for (let c = 0; c < k; c++) if (sc[c]) { cl[c] = sl[c] / sc[c]; ca[c] = sa[c] / sc[c]; cb[c] = sb[c] / sc[c]; }
    }
    return { cl, ca, cb, k };
  }

  function assign(P, C) {
    const { L, A, B, n } = P, lab = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < C.k; c++) {
        const d = (L[i] - C.cl[c]) ** 2 + (A[i] - C.ca[c]) ** 2 + (B[i] - C.cb[c]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      lab[i] = best;
    }
    return lab;
  }

  // filtro di maggioranza e zone piccole assorbite dalla vicina più presente
  // (quelle scure, come occhi e narici, sono protette da una soglia più bassa).
  // La zona "fixed" (lo sfondo) non cambia e non assorbe niente.
  function cleanLabels(cur, w, h, k, cl, minArea, minDark, fixed) {
    const n = w * h, cnt = new Int32Array(k);
    for (let pass = 0; pass < 4; pass++) {
      const nx = new Uint8Array(cur);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (cur[i] === fixed) continue;
        cnt.fill(0);
        for (let dy = -2; dy <= 2; dy++) {
          const yy = clamp(y + dy, 0, h - 1);
          for (let dx = -2; dx <= 2; dx++) cnt[cur[yy * w + clamp(x + dx, 0, w - 1)]]++;
        }
        let best = cur[i], bc = cnt[best];
        for (let c = 0; c < k; c++) if (c !== fixed && cnt[c] > bc) { bc = cnt[c]; best = c; }
        nx[i] = best;
      }
      cur.set(nx);
    }
    const comp = new Int32Array(n), stack = new Int32Array(n);
    for (let round = 0; round < 3; round++) {
      comp.fill(-1);
      let id = 0, changed = false;
      for (let s0 = 0; s0 < n; s0++) {
        if (comp[s0] >= 0) continue;
        const c0 = cur[s0], pix = [];
        let top = 0;
        stack[top++] = s0; comp[s0] = id;
        while (top) {
          const i = stack[--top];
          pix.push(i);
          const x = i % w, y = (i / w) | 0;
          if (x > 0 && comp[i - 1] < 0 && cur[i - 1] === c0) { comp[i - 1] = id; stack[top++] = i - 1; }
          if (x < w - 1 && comp[i + 1] < 0 && cur[i + 1] === c0) { comp[i + 1] = id; stack[top++] = i + 1; }
          if (y > 0 && comp[i - w] < 0 && cur[i - w] === c0) { comp[i - w] = id; stack[top++] = i - w; }
          if (y < h - 1 && comp[i + w] < 0 && cur[i + w] === c0) { comp[i + w] = id; stack[top++] = i + w; }
        }
        id++;
        if (c0 === fixed) continue;
        const limit = cl[c0] < 30 ? minDark : minArea;
        if (pix.length >= limit) continue;
        cnt.fill(0);
        for (const i of pix) {
          const x = i % w, y = (i / w) | 0;
          if (x > 0 && cur[i - 1] !== c0) cnt[cur[i - 1]]++;
          if (x < w - 1 && cur[i + 1] !== c0) cnt[cur[i + 1]]++;
          if (y > 0 && cur[i - w] !== c0) cnt[cur[i - w]]++;
          if (y < h - 1 && cur[i + w] !== c0) cnt[cur[i + w]]++;
        }
        let best = -1, bc = 0;
        for (let c = 0; c < k; c++) if (c !== fixed && cnt[c] > bc) { bc = cnt[c]; best = c; }
        if (best >= 0) { for (const i of pix) cur[i] = best; changed = true; }
      }
      if (!changed) break;
    }
  }

  /* ----- Dov'è l'animale? -----
   * Lo sfondo tocca i bordi della foto e ci si arriva senza attraversare
   * salti di colore (distanza "minimum barrier"); in più ha i colori dei bordi.
   * Il soggetto è quello che resta, preferibilmente verso il centro.
   */
  function barrierDistance(I, w, h) {
    const n = w * h, D = new Float32Array(n).fill(1e9), U = new Float32Array(I), Lo = new Float32Array(I);
    for (let x = 0; x < w; x++) { D[x] = 0; D[(h - 1) * w + x] = 0; }
    for (let y = 0; y < h; y++) { D[y * w] = 0; D[y * w + w - 1] = 0; }
    const relax = (i, j) => {
      const u = U[j] > I[i] ? U[j] : I[i], l = Lo[j] < I[i] ? Lo[j] : I[i];
      if (u - l < D[i]) { D[i] = u - l; U[i] = u; Lo[i] = l; }
    };
    for (let it = 0; it < 3; it++) {
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; relax(i, i - 1); relax(i, i - w); }
      for (let y = h - 2; y > 0; y--) for (let x = w - 2; x > 0; x--) { const i = y * w + x; relax(i, i + 1); relax(i, i + w); }
    }
    return D;
  }

  function normalize(v) {
    const sorted = Float32Array.from(v).sort();
    const hi = sorted[Math.floor(sorted.length * 0.98)] || 1;
    for (let i = 0; i < v.length; i++) v[i] = Math.min(1, v[i] / hi);
    return v;
  }

  function otsu(v) {
    const H = new Float64Array(64);
    for (const x of v) H[Math.min(63, (x * 64) | 0)]++;
    let tot = 0, sum = 0;
    for (let t = 0; t < 64; t++) { tot += H[t]; sum += t * H[t]; }
    let wB = 0, sB = 0, best = 0, bt = 32;
    for (let t = 0; t < 64; t++) {
      wB += H[t]; if (!wB) continue;
      const wF = tot - wB; if (!wF) break;
      sB += t * H[t];
      const mB = sB / wB, mF = (sum - sB) / wF, between = wB * wF * (mB - mF) ** 2;
      if (between > best) { best = between; bt = t; }
    }
    return (bt + 0.5) / 64;
  }

  function components(m, w, h) {
    const n = w * h, id = new Int32Array(n).fill(-1), stack = new Int32Array(n), sizes = [];
    for (let s0 = 0; s0 < n; s0++) {
      if (!m[s0] || id[s0] >= 0) continue;
      const c = sizes.length;
      let top = 0, size = 0;
      stack[top++] = s0; id[s0] = c;
      while (top) {
        const i = stack[--top]; size++;
        const x = i % w, y = (i / w) | 0;
        if (x > 0 && m[i - 1] && id[i - 1] < 0) { id[i - 1] = c; stack[top++] = i - 1; }
        if (x < w - 1 && m[i + 1] && id[i + 1] < 0) { id[i + 1] = c; stack[top++] = i + 1; }
        if (y > 0 && m[i - w] && id[i - w] < 0) { id[i - w] = c; stack[top++] = i - w; }
        if (y < h - 1 && m[i + w] && id[i + w] < 0) { id[i + w] = c; stack[top++] = i + w; }
      }
      sizes.push(size);
    }
    return { id, sizes };
  }

  function subjectMask(P) {
    const { w, h, n, L, A, B } = P;
    // 1. barriera di colore dal bordo, su luminosità e colore
    const S = new Float32Array(n);
    for (const ch of [L, A, B]) {
      const D = barrierDistance(ch, w, h);
      for (let i = 0; i < n; i++) S[i] += D[i];
    }
    normalize(S);
    // 2. quanto il colore è diverso da quelli dei bordi
    const band = Math.max(2, Math.round(Math.min(w, h) * 0.04)), pool = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x < band || y < band || x >= w - band || y >= h - band) pool.push(y * w + x);
    }
    const C = kmeans(P, pool, 6);
    const BC = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let bd = Infinity;
      for (let c = 0; c < 6; c++) bd = Math.min(bd, (L[i] - C.cl[c]) ** 2 + (A[i] - C.ca[c]) ** 2 + (B[i] - C.cb[c]) ** 2);
      BC[i] = Math.sqrt(bd);
    }
    normalize(BC);
    // 3. insieme, con una leggera preferenza per il centro
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, dx = (x / w - 0.5) * 2, dy = (y / h - 0.5) * 2;
      S[i] = (0.55 * S[i] + 0.45 * BC[i]) * (1 - 0.3 * Math.min(1, (dx * dx + dy * dy) / 2));
    }
    // 4. doppia soglia: le parti sicure fanno da seme, quelle incerte vicine si aggiungono
    const t = otsu(S);
    let m = new Uint8Array(n);
    for (let i = 0; i < n; i++) m[i] = S[i] > t * 0.8 ? 1 : 0;
    m = dilate(erode(m, w, h, 2), w, h, 2);
    const { id, sizes } = components(m, w, h);
    if (!sizes.length) return null;
    const seeds = new Float64Array(sizes.length);
    for (let i = 0; i < n; i++) if (m[i] && S[i] > t) seeds[id[i]]++;
    const most = Math.max(...seeds);
    if (!most) return null;
    // 5. pulizia: tiene i pezzi con abbastanza semi, riempie i buchi, arrotonda
    for (let i = 0; i < n; i++) if (m[i] && seeds[id[i]] < most * 0.2) m[i] = 0;
    m = erode(dilate(m, w, h, 4), w, h, 4);
    const out = new Uint8Array(n);
    const bg = new Uint8Array(n); for (let i = 0; i < n; i++) bg[i] = m[i] ? 0 : 1;
    const reach = components(bg, w, h), touches = new Uint8Array(reach.sizes.length);
    for (let x = 0; x < w; x++) { touches[reach.id[x]] = 1; touches[reach.id[(h - 1) * w + x]] = 1; }
    for (let y = 0; y < h; y++) { touches[reach.id[y * w]] = 1; touches[reach.id[y * w + w - 1]] = 1; }
    for (let i = 0; i < n; i++) out[i] = m[i] || (reach.id[i] >= 0 && !touches[reach.id[i]]) ? 1 : 0;
    // bordo morbido: sfuma e ritaglia a metà
    const soft = boxBlur(boxBlur(Float32Array.from(out), w, h, 2), w, h, 2);
    let area = 0;
    for (let i = 0; i < n; i++) { out[i] = soft[i] > 0.5 ? 1 : 0; area += out[i]; }
    // se il "soggetto" è quasi tutto o quasi niente, la foto è un primo piano: niente maschera
    if (area < n * 0.06 || area > n * 0.82) return null;
    return out;
  }

  // Arrotonda gli spigoli (Chaikin): linee più morbide, da mano vera
  function smoothStroke(f, iters) {
    let pts = f;
    for (let t = 0; t < iters; t++) {
      const n = pts.length / 2;
      if (n < 3) return pts;
      const closed = Math.hypot(pts[0] - pts[2 * n - 2], pts[1] - pts[2 * n - 1]) < 2;
      const out = closed ? [] : [pts[0], pts[1]];
      for (let i = 0; i < n - 1; i++) {
        const x0 = pts[2 * i], y0 = pts[2 * i + 1], x1 = pts[2 * i + 2], y1 = pts[2 * i + 3];
        out.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1, 0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
      }
      if (closed) out.push(out[0], out[1]);
      else out.push(pts[2 * n - 2], pts[2 * n - 1]);
      pts = out;
    }
    return pts;
  }

  // maschera del soggetto calcolata dal modello (0..1), portata alla misura di lavoro
  function maskFromModel(M, w, h) {
    const n = w * h;
    let m = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const mx = Math.min(M.w - 1, ((x + 0.5) / w * M.w) | 0), my = Math.min(M.h - 1, ((y + 0.5) / h * M.h) | 0);
      m[y * w + x] = M.data[my * M.w + mx] > 0.5 ? 1 : 0;
    }
    const { id, sizes } = components(m, w, h);
    if (!sizes.length) return null;
    const big = Math.max(...sizes);
    for (let i = 0; i < n; i++) if (m[i] && sizes[id[i]] < big * 0.15) m[i] = 0;
    // buchi piccoli riempiti, bordo morbido
    m = erode(dilate(m, w, h, 2), w, h, 2);
    const soft = boxBlur(Float32Array.from(m), w, h, 2);
    let area = 0;
    for (let i = 0; i < n; i++) { m[i] = soft[i] > 0.5 ? 1 : 0; area += m[i]; }
    if (area < n * 0.02) return null;
    if (area > n * 0.92) return 'tutto';
    return m;
  }

  function extractPhoto(imageData, level, opts) {
    const cfg = PHOTO[level] || PHOTO[2];
    const W0 = imageData.width, H0 = imageData.height;
    const P = labImage(imageData);
    const { w, h, n, s: scale } = P;
    let fg = opts && opts.mask ? maskFromModel(opts.mask, w, h) : null;
    if (fg === 'tutto') fg = null;
    else if (!fg && !(opts && opts.mask)) fg = subjectMask(P);
    const mask = new Uint8Array(n);
    if (fg) {
      // il contorno dell'animale, e dentro solo le sue zone di colore
      const pool = [];
      for (let i = 0; i < n; i++) if (fg[i]) pool.push(i);
      // la luce e l'ombra contano la metà: separano meno il pelo illuminato da quello in ombra
      const Pc = { L: P.L.map(v => v * 0.5), A: P.A, B: P.B, n };
      const C = kmeans(Pc, pool, cfg.k);
      const labels = assign(Pc, C);
      for (let i = 0; i < n; i++) if (!fg[i]) labels[i] = cfg.k;
      // solo le zone di colore grandi (muso bianco, macchie), non il pelo
      const area = pool.length * 3;
      cleanLabels(labels, w, h, cfg.k + 1, C.cl.map(v => v * 2).concat([100]), Math.round(cfg.minArea * area), Math.max(6, Math.round(cfg.minDark * area)), cfg.k);
      const inner = erode(fg, w, h, 3);
      // bordi netti dentro l'animale: occhi, naso, bocca, orecchie
      const mag = sobel(P.L, w, h), vals = [];
      for (let i = 0; i < n; i++) if (inner[i]) vals.push(mag[i]);
      vals.sort((p, q) => p - q);
      const thr = Math.max(cfg.edge, vals[Math.floor(vals.length * cfg.edgeTop)] || 0);
      const edges = new Uint8Array(n);
      for (let i = 0; i < n; i++) if (inner[i] && mag[i] > thr) edges[i] = 1;
      removeSmall(edges, w, h, cfg.minLen * 6);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!fg[i]) continue;
        if ((x > 0 && !fg[i - 1]) || (x < w - 1 && !fg[i + 1]) || (y > 0 && !fg[i - w]) || (y < h - 1 && !fg[i + w])) { mask[i] = 1; continue; }
        if (edges[i]) { mask[i] = 1; continue; }
        if (!inner[i] || x >= w - 1 || y >= h - 1) continue;
        if ((inner[i + 1] && labels[i] !== labels[i + 1]) || (inner[i + w] && labels[i] !== labels[i + w])) mask[i] = 1;
      }
    } else {
      // primo piano: zone di colore su tutta la foto
      const all = [];
      for (let i = 0; i < n; i++) all.push(i);
      const C = kmeans(P, all, cfg.k);
      const labels = assign(P, C);
      cleanLabels(labels, w, h, cfg.k, C.cl, Math.max(20, Math.round(cfg.minArea * n)), Math.max(8, Math.round(cfg.minDark * n)), -1);
      for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
        const i = y * w + x;
        if (labels[i] !== labels[i + 1] || labels[i] !== labels[i + w]) mask[i] = 1;
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) mask[y * w + x] = 0;
    }
    thin(mask, w, h);
    const inv = 1 / scale;
    let strokes = trace(mask, w, h, cfg.minLen)
      .map(st => smoothStroke(simplify(st, 1.3), 3))
      .map(st => st.map(v => v * inv));
    strokes = order(strokes);
    const dim = Math.max(W0, H0);
    return { width: W0, height: H0, strokes, lineWidth: Math.max(2.5, dim / 190), mode: 'foto', soggetto: !!fg };
  }

  /* ===================== Numeri dei colori =====================
   * Sceglie fino a 3 zone del disegno finito (spazi chiusi tra le linee)
   * da numerare sul foglio. Preferisce zone grandi e con colori diversi
   * nell'immagine originale, cosi' ogni numero corrisponde a un colore vero.
   */
  function pickColorSpots(imageData, res, howMany) {
    const W0 = imageData.width, H0 = imageData.height, src = imageData.data;
    const g = Math.min(1, 300 / Math.max(W0, H0));
    const w = Math.max(8, Math.round(W0 * g)), h = Math.max(8, Math.round(H0 * g)), n = w * h;

    // 1. linee rasterizzate su una griglia piccola (chiude i piccoli varchi)
    const wall = new Uint8Array(n);
    const rad = Math.max(1, (res.lineWidth / 2) * g);
    const stamp = (x, y) => {
      const r = Math.ceil(rad);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > rad * rad + 0.5) continue;
        const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) wall[yy * w + xx] = 1;
      }
    };
    for (const s of res.strokes) {
      for (let i = 2; i < s.length; i += 2) {
        const x0 = s[i - 2] * g, y0 = s[i - 1] * g, x1 = s[i] * g, y1 = s[i + 1] * g;
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
        for (let t = 0; t <= steps; t++) stamp(x0 + (x1 - x0) * t / steps, y0 + (y1 - y0) * t / steps);
      }
    }

    // 2. zone chiuse
    const reg = new Int32Array(n).fill(-1);
    const stack = new Int32Array(n);
    const regions = [];
    for (let s0 = 0; s0 < n; s0++) {
      if (wall[s0] || reg[s0] >= 0) continue;
      const id = regions.length;
      let top = 0, area = 0, border = false, r = 0, gg = 0, b = 0;
      stack[top++] = s0; reg[s0] = id;
      while (top) {
        const i = stack[--top];
        area++;
        const x = i % w, y = (i / w) | 0;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
        const sx = Math.min(W0 - 1, Math.floor((x + 0.5) / g)), sy = Math.min(H0 - 1, Math.floor((y + 0.5) / g));
        const p = (sy * W0 + sx) * 4, a = src[p + 3] / 255;
        r += src[p] * a + 255 * (1 - a); gg += src[p + 1] * a + 255 * (1 - a); b += src[p + 2] * a + 255 * (1 - a);
        if (x > 0 && !wall[i - 1] && reg[i - 1] < 0) { reg[i - 1] = id; stack[top++] = i - 1; }
        if (x < w - 1 && !wall[i + 1] && reg[i + 1] < 0) { reg[i + 1] = id; stack[top++] = i + 1; }
        if (y > 0 && !wall[i - w] && reg[i - w] < 0) { reg[i - w] = id; stack[top++] = i - w; }
        if (y < h - 1 && !wall[i + w] && reg[i + w] < 0) { reg[i + w] = id; stack[top++] = i + w; }
      }
      const rgb = [r / area, gg / area, b / area];
      regions.push({ id, area, border, rgb, lab: toLab(rgb[0], rgb[1], rgb[2]) });
    }
    if (!regions.length) return [];

    // 3. scarta lo sfondo dei disegni e le zone minuscole
    let cand = regions.filter(r => r.area >= n * 0.0015);
    // lo sfondo bianco attorno al soggetto non si numera
    if (res.mode === 'disegno' || res.soggetto) {
      const bg = regions.filter(r => r.border).sort((a, b) => b.area - a.area)[0];
      cand = cand.filter(r => r !== bg);
    }
    if (!cand.length) return [];
    const isBlank = r => r.lab[0] > 90 && Math.hypot(r.lab[1], r.lab[2]) < 8;
    const colored = cand.filter(r => !isBlank(r));
    const hasColors = colored.length > 0;
    const pool = hasColors ? colored : cand;

    // 4. punto più interno di ogni zona (lontano dalle linee)
    const dist = new Float32Array(n);
    for (let i = 0; i < n; i++) dist[i] = wall[i] ? 0 : 1e6;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!dist[i]) continue;
      let d = dist[i];
      if (x > 0) d = Math.min(d, dist[i - 1] + 1);
      if (y > 0) d = Math.min(d, dist[i - w] + 1);
      if (x > 0 && y > 0) d = Math.min(d, dist[i - w - 1] + 1.4);
      if (x < w - 1 && y > 0) d = Math.min(d, dist[i - w + 1] + 1.4);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) d = Math.min(d, 1);
      dist[i] = d;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; if (!dist[i]) continue;
      let d = dist[i];
      if (x < w - 1) d = Math.min(d, dist[i + 1] + 1);
      if (y < h - 1) d = Math.min(d, dist[i + w] + 1);
      if (x < w - 1 && y < h - 1) d = Math.min(d, dist[i + w + 1] + 1.4);
      if (x > 0 && y < h - 1) d = Math.min(d, dist[i + w - 1] + 1.4);
      dist[i] = d;
    }
    const best = new Map();
    for (let i = 0; i < n; i++) {
      const id = reg[i]; if (id < 0) continue;
      const cur = best.get(id);
      if (!cur || dist[i] > cur.d) best.set(id, { d: dist[i], i });
    }
    for (const r of pool) {
      const b = best.get(r.id);
      r.cx = ((b.i % w) + 0.5) / g; r.cy = (((b.i / w) | 0) + 0.5) / g; r.depth = b.d / g;
    }
    // due livelli: zone comode (grandi) e zone accettabili (piccole ma il numero ci sta)
    const dim = Math.max(W0, H0);
    const roomy = pool.filter(r => r.area >= n * 0.006 && r.depth >= dim * 0.018);
    const small = pool.filter(r => r.depth >= dim * 0.009);
    const first = (roomy.length ? roomy : small.length ? small : pool).slice().sort((a, b) => b.area - a.area)[0];

    // 5. scelta: la zona più grande, poi solo colori davvero diversi
    const chosen = [first];
    const far = dim * 0.1;
    const colorDist = r => Math.min(...chosen.map(c => Math.hypot(c.lab[0] - r.lab[0], c.lab[1] - r.lab[1], c.lab[2] - r.lab[2])));
    const DIFFERENT = 22; // sotto questa distanza due colori hanno lo stesso nome
    while (chosen.length < howMany) {
      let pick = null, score = -1;
      for (const list of hasColors ? [roomy, small] : [roomy.length ? roomy : small]) {
        for (const r of list) {
          if (chosen.includes(r)) continue;
          if (chosen.some(c => Math.hypot(c.cx - r.cx, c.cy - r.cy) < far)) continue;
          const cd = colorDist(r);
          if (hasColors && cd < DIFFERENT) continue;
          const sc = Math.min(cd, 60) * 1000 + Math.sqrt(r.area);
          if (sc > score) { score = sc; pick = r; }
        }
        if (pick) break; // si preferiscono le zone comode
      }
      if (!pick) break;
      chosen.push(pick);
    }
    // numerati dall'alto in basso, da sinistra a destra: più facile da seguire
    chosen.sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx));
    return chosen.map(r => ({ x: r.cx, y: r.cy, rgb: r.rgb.map(Math.round) }));
  }

  /**
   * imageData: { width, height, data (RGBA) }
   * level: 1 | 2 | 3
   * mode: 'auto' | 'disegno' | 'foto'
   * Ritorna { width, height, strokes: [[x0,y0,x1,y1,...], ...], lineWidth, mode }
   */
  function extract(imageData, level, mode, opts) {
    const m = mode === 'foto' || mode === 'disegno' ? mode
      : (looksLikePhoto(imageData.data, imageData.width * imageData.height) ? 'foto' : 'disegno');
    let r;
    if (m === 'foto') r = extractPhoto(imageData, level, opts);
    else { r = extractDrawing(imageData, level); r.mode = 'disegno'; }
    try { r.spots = pickColorSpots(imageData, r, 3); } catch (e) { r.spots = []; }
    return r;
  }

  function extractDrawing(imageData, level) {
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

  const isPhoto = imageData => looksLikePhoto(imageData.data, imageData.width * imageData.height);
  const api = { extract, isPhoto, pickColorSpots, DETAIL, PHOTO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LineArt = api;
})(typeof self !== 'undefined' ? self : this);
