// SPDX-License-Identifier: AGPL-3.0-only
// Me lo disegni? - Copyright (C) 2026 Gli autori di Me lo disegni?
/* Trova il soggetto di una foto con U²-Net (modello piccolo, gira sul dispositivo).
 * Soggetto.trova(canvas) -> { data: Float32Array 0..1, w, h } oppure null se il modello non c'è. */
(function (root) {
  'use strict';
  const BASE = new URL('ml/', document.currentScript ? document.currentScript.src : location.href).href;
  const SIZE = 320;
  let session = null, failed = false, loading = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function load() {
    if (session || failed) return session;
    if (!loading) loading = (async () => {
      try {
        if (!root.ort) await loadScript(BASE + 'ort.wasm.min.js');
        root.ort.env.wasm.wasmPaths = BASE;
        root.ort.env.wasm.numThreads = 1;
        session = await root.ort.InferenceSession.create(BASE + 'u2netp.onnx', { executionProviders: ['wasm'] });
      } catch (e) {
        failed = true;
      }
      return session;
    })();
    return loading;
  }

  async function trova(src) {
    const sess = await load();
    if (!sess) return null;
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0, SIZE, SIZE);
    const d = x.getImageData(0, 0, SIZE, SIZE).data, n = SIZE * SIZE;
    c.width = c.height = 0; // libera subito la tela (Safari su iPhone)
    let mx = 1;
    for (let i = 0; i < d.length; i += 4) mx = Math.max(mx, d[i], d[i + 1], d[i + 2]);
    // stessa preparazione dell'addestramento: valori 0..1, poi media e deviazione di ImageNet
    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    const t = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) t[ch * n + i] = (d[i * 4 + ch] / mx - mean[ch]) / std[ch];
    const out = await sess.run({ [sess.inputNames[0]]: new root.ort.Tensor('float32', t, [1, 3, SIZE, SIZE]) });
    const o = out[sess.outputNames[0]].data;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { if (o[i] < lo) lo = o[i]; if (o[i] > hi) hi = o[i]; }
    const m = new Float32Array(n);
    for (let i = 0; i < n; i++) m[i] = (o[i] - lo) / (hi - lo || 1);
    return { data: m, w: SIZE, h: SIZE };
  }

  root.Soggetto = { trova, load };
})(window);
