# Matita - come metterla sul tablet

Matita è una web app installabile: va messa online una volta sola (gratis), poi si installa sul tablet come un'app normale e funziona anche senza internet.

## 1. Metterla online con GitHub Pages (10 minuti, una volta sola)

1. Vai su github.com e crea un account se non ce l'hai.
2. Crea un nuovo repository pubblico, per esempio `matita`.
3. Tocca **Add file > Upload files** e carica TUTTI i file di questa cartella (non la cartella, i file).
4. Vai in **Settings > Pages**, in "Branch" scegli `main` e `/ (root)`, poi **Save**.
5. Dopo un paio di minuti l'indirizzo sarà `https://TUONOME.github.io/matita/`.

Serve per forza un indirizzo `https://`: senza, il menu Condividi e il funzionamento offline non partono.

## 2. Installarla sul tablet

1. Apri l'indirizzo in **Chrome** sul tablet.
2. Menu con i tre puntini > **Installa app** (o "Aggiungi a schermata Home").
3. Compare l'icona della matita gialla. Da ora si apre da lì.

Dopo l'installazione Matita compare anche nel menu **Condividi** di Android.

## 3. Prima di usarla

- Tieni premuto **Adulti** in alto a destra > **Chi disegna**: Mamma e Zia sono già create, manca solo la foto. Aggiungi le altre persone con nome e foto.
- **Disegni**: togli i tre esempi (zucca, pesce, casa) se non servono e aggiungi i disegni preferiti.
- **Copia di sicurezza**: salvane una quando hai finito. Disegni e foto vivono solo nel tablet.

## Aggiornamenti

Se modifichi i file, ricaricali su GitHub: il tablet prende la versione nuova la volta dopo che apre l'app con internet attivo.

## File

- `index.html` - l'app
- `lineart.js` - il motore che trova i contorni (gira sul tablet, niente server)
- `sw.js` - funzionamento offline e ricezione dal menu Condividi
- `manifest.webmanifest`, `icon-*.png` - nome e icona dell'app

## Licenza

Uso personale e familiare, non commerciale. Vedi il file `LICENSE`.
