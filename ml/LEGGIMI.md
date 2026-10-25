# Riconoscimento del soggetto

Per trasformare le foto in disegni l'app deve capire dov'è l'animale (o la persona, o l'oggetto) e separarlo dallo sfondo. Lo fa con un piccolo modello che gira **sul dispositivo**: nessuna immagine viene inviata altrove.

| File | Cos'è | Licenza |
|---|---|---|
| `u2netp.onnx` | U²-Net, versione leggera (Qin et al., 2020), dal progetto rembg | Apache-2.0 |
| `ort.wasm.min.js`, `ort-wasm-simd.wasm` | ONNX Runtime Web 1.17.3, il motore che esegue il modello | MIT |

Fonti: https://github.com/xuebinqin/U-2-Net, https://github.com/danielgatis/rembg, https://github.com/microsoft/onnxruntime

Il modello viene scaricato solo la prima volta che si disegna una foto, poi resta nella cache dell'app. Se non si carica (browser vecchio, niente internet al primo uso) l'app usa un metodo più semplice, senza modello.
