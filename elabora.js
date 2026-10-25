// SPDX-License-Identifier: AGPL-3.0-only
// Me lo disegni? - Copyright (C) 2026 Gli autori di Me lo disegni?
/* Lavoratore in secondo piano: trova il soggetto (U²-Net) e calcola le linee,
 * così lo schermo non si blocca mentre una foto diventa un disegno.
 * Messaggi: { id, img: ImageData, lvl, modo, key } -> { id, res } oppure { id, errore }
 * (modo: 'auto', 'disegno' o 'foto'; alcuni esempi lo fissano)
 */
'use strict';
importScripts('lineart.js');

const SIZE = 320;
let session = null, failed = false, loading = null;
const masks = new Map(); // stessa immagine, livello diverso: il soggetto non si ricalcola

function loadModel(base) {
  if (session || failed) return Promise.resolve(session);
  if (!loading) loading = (async () => {
    try {
      if (!self.ort) importScripts(base + 'ort.wasm.min.js');
      self.ort.env.wasm.wasmPaths = base;
      self.ort.env.wasm.numThreads = 1;
      session = await self.ort.InferenceSession.create(base + 'u2netp.onnx', { executionProviders: ['wasm'] });
    } catch (e) {
      failed = true;
    }
    return session;
  })();
  return loading;
}

// l'immagine portata a 320x320 (media dei pixel di ogni casella), come vuole il modello
function input(img) {
  const { width: W, height: H, data: d } = img, n = SIZE * SIZE;
  const rgb = new Float32Array(3 * n);
  let mx = 1;
  for (let y = 0; y < SIZE; y++) {
    const y0 = Math.floor(y * H / SIZE), y1 = Math.max(y0 + 1, Math.floor((y + 1) * H / SIZE));
    for (let x = 0; x < SIZE; x++) {
      const x0 = Math.floor(x * W / SIZE), x1 = Math.max(x0 + 1, Math.floor((x + 1) * W / SIZE));
      let r = 0, g = 0, b = 0, c = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const p = (yy * W + xx) * 4;
        r += d[p]; g += d[p + 1]; b += d[p + 2]; c++;
      }
      const i = y * SIZE + x;
      rgb[i] = r / c; rgb[n + i] = g / c; rgb[2 * n + i] = b / c;
      mx = Math.max(mx, rgb[i], rgb[n + i], rgb[2 * n + i]);
    }
  }
  // stessa preparazione dell'addestramento: valori 0..1, poi media e deviazione di ImageNet
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let ch = 0; ch < 3; ch++) for (let i = 0; i < n; i++) rgb[ch * n + i] = (rgb[ch * n + i] / mx - mean[ch]) / std[ch];
  return rgb;
}

async function findSubject(img, base) {
  const sess = await loadModel(base);
  if (!sess) return null;
  const out = await sess.run({ [sess.inputNames[0]]: new self.ort.Tensor('float32', input(img), [1, 3, SIZE, SIZE]) });
  const o = out[sess.outputNames[0]].data, n = SIZE * SIZE;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (o[i] < lo) lo = o[i]; if (o[i] > hi) hi = o[i]; }
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = (o[i] - lo) / (hi - lo || 1);
  return { data: m, w: SIZE, h: SIZE };
}

self.onmessage = async ({ data: m }) => {
  try {
    if (m.tipo === 'precarica') { await loadModel(m.base); return; }
    let mask = m.key ? masks.get(m.key) : null;
    const photo = m.modo ? m.modo === 'foto' : self.LineArt.isPhoto(m.img);
    if (!mask && photo) {
      mask = await findSubject(m.img, m.base);
      if (mask && m.key) { masks.set(m.key, mask); if (masks.size > 6) masks.delete(masks.keys().next().value); }
    }
    const res = self.LineArt.extract(m.img, m.lvl, m.modo || 'auto', mask ? { mask } : {});
    self.postMessage({ id: m.id, res });
  } catch (e) {
    self.postMessage({ id: m.id, errore: (e && e.name || 'Errore') + ': ' + (e && e.message || e) });
  }
};
