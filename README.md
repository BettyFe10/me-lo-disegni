# Me lo disegni?

Scrivi cosa vuoi disegnare, scegli chi lo disegna, guarda la matita tracciare i contorni piano piano e stampa il foglio da colorare.

Me lo disegni? è nata per una persona autistica adulta che ama i cartoni animati, guardare qualcuno che disegna e poi colorare su carta. Funziona su tablet e telefoni Android come un'app normale, anche senza internet, e anche su computer, iPhone e iPad.

## Cosa fa

- **Ricerca a parole**: si scrive CANE e compaiono i disegni con quel nome. Capisce anche le parole scritte con errori (GATO, CONIO, KANE) e suggerisce quella giusta.
- **91 esempi pronti**: 15 disegni originali, 60 foto di animali e 16 personaggi classici dei fumetti in pubblico dominio (Braccio di Ferro, Pinocchio, Peter Coniglio, il Mago di Oz, Raggedy Ann, Cappuccetto Rosso…), che l'app trasforma in contorni da colorare.
- **Chi disegna**: si sceglie una persona; se ha la foto la sua faccia accompagna la matita mentre disegna, altrimenti si vede una mano.
- **Disegno lento**: la matita traccia i contorni un tratto alla volta, con 9 livelli di velocità regolabili anche durante il disegno.
- **Colorare sullo schermo**: pennello, pennarello, matita colorata, pastello a cera, bomboletta spray, secchiello e gomma; colori con sfumature; modalità "Dentro i bordi" che tiene il colore nella zona; si salva l'immagine colorata.
- **Foto vere trasformate bene**: un piccolo modello (U²-Net, in `ml/`) trova l'animale e lo separa dallo sfondo, tutto sul dispositivo.
- **Foglio pronto da stampare**: A4 leggero, linee nere spesse, due righe in alto per scrivere titolo e nome.
- **Menu Condividi di Android**: da Google Immagini si tiene premuta un'immagine, *Condividi immagine* > Me lo disegni?, e finisce nella raccolta.
- **Area adulti**: si apre tenendo premuto un secondo; qui si aggiungono disegni e persone.
- **Guida integrata** con frasi semplici, pensata anche per chi non è pratico di tecnologia.

## Privacy

Tutto resta sul dispositivo: immagini, foto e nomi sono salvati nel browser del tablet. Non c'è nessun server, nessun account, nessuna AI esterna. I contorni vengono calcolati sul tablet da `lineart.js`.

## Dove funziona

| Dispositivo | Disegno e stampa | Si installa come app | Menu Condividi |
|---|---|---|---|
| Tablet e telefoni Android (Chrome) | sì | sì | sì |
| PC Windows e Linux (Chrome, Edge) | sì | sì | no, si usa "Scegli dalla galleria" |
| Mac (Chrome, Edge) | sì | sì | no, si usa "Scegli dalla galleria" |
| Mac, iPhone, iPad (Safari) | sì | iPhone e iPad: "Aggiungi alla schermata Home" | no |
| Firefox | sì | no, resta una pagina web | no |

Ogni dispositivo ha il suo archivio: disegni e persone non si sincronizzano da soli. Per spostarli si usa la **copia di sicurezza** dall'area Adulti.

## Usarla: la tua versione in 10 minuti

1. Fai un **fork** di questo repository (pulsante *Fork* in alto a destra).
2. Nel tuo fork vai in **Settings > Pages**, in "Branch" scegli `main` e `/ (root)`, poi **Save**.
3. Dopo un paio di minuti l'app sarà su `https://TUONOME.github.io/me-lo-disegni/`.
4. Apri l'indirizzo in **Chrome** sul tablet > menu con i tre puntini > **Installa app**.
5. Al primo avvio l'app chiede il nome dell'**adulto supervisore** e di **chi disegna**. Poi tieni premuto **Adulti** > **Chi disegna** per aggiungere le foto.

Serve un indirizzo `https://`: senza, il menu Condividi e il funzionamento offline non partono. Va bene qualsiasi hosting statico (GitHub Pages, Netlify, Cloudflare Pages).

Per provarla al volo sul computer basta aprire `index.html` in Chrome: funziona quasi tutto tranne installazione e menu Condividi.

### Consigli

- L'app riconosce da sola se l'immagine è un disegno o una foto. Dai disegni ricalca le linee; le foto le semplifica in zone grandi e ne disegna i contorni. Le immagini già in bianco e nero restano quelle che vengono meglio: cerca "*nome* disegno da colorare".
- Ogni tanto salva una **copia di sicurezza** dall'area Adulti: se cancelli i dati di Chrome, disegni e foto spariscono.
- Se un disegno ha troppe o troppo poche linee: *Altre regolazioni* > Poche / Normali / Tante.

## Struttura

| File | Cosa fa |
|---|---|
| `index.html` | l'app: interfaccia, archivio locale (IndexedDB), animazione, stampa |
| `elabora.js` | lavoratore in secondo piano: trova il soggetto delle foto e calcola le linee senza bloccare lo schermo |
| `colora.js` | la colorazione sullo schermo |
| `ml/` | il modello U²-Net e ONNX Runtime (vedi `ml/LEGGIMI.md`) |
| `lineart.js` | estrae i contorni da un'immagine e li ordina in tratti da disegnare |
| `sw.js` | funzionamento offline e ricezione dal menu Condividi |
| `manifest.webmanifest`, `icon-*.png` | nome, icona e integrazione con Android |

Nessuna dipendenza e nessun passaggio di build: sono file statici.

## Contribuire

Le proposte sono benvenute. Leggi [CONTRIBUTING.md](CONTRIBUTING.md) prima di aprire una issue o una pull request.

## Licenza

[GNU AGPL-3.0](LICENSE). In breve: puoi usarla, studiarla, modificarla e ridistribuirla. Se pubblichi una versione modificata, anche come sito web, devi renderne disponibile il codice con la stessa licenza.

I disegni di esempio nella cartella `esempi/` (zucca, pesce, casa e 12 animali) sono originali e coperti dalla stessa licenza. Le foto di animali in `esempi/foto/` vengono da Pexels e seguono la licenza Pexels: autori e link sono in [esempi/foto/CREDITI.md](esempi/foto/CREDITI.md). I personaggi in `esempi/cartoni/` sono in pubblico dominio e vengono da Wikimedia Commons: elenco in [esempi/cartoni/CREDITI.md](esempi/cartoni/CREDITI.md). Per aggiungere un esempio basta mettere il file (SVG o WebP) nella cartella e una riga in `esempi/elenco.json`: arriva anche a chi ha già l'app. Le immagini che carichi tu restano tue e non fanno parte del progetto.
