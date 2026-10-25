# Matita

Scrivi cosa vuoi disegnare, scegli chi lo disegna, guarda la matita tracciare i contorni piano piano e stampa il foglio da colorare.

Matita è nata per un bambino a cui piace guardare qualcuno che disegna, e poi colorare su carta. Funziona su tablet Android come un'app normale, anche senza internet.

## Cosa fa

- **Ricerca a parole**: si scrive CANE e compaiono i disegni con quel nome.
- **Chi disegna**: si sceglie una persona tra quelle con la foto; la sua faccia accompagna la matita mentre disegna.
- **Disegno lento**: la matita traccia i contorni un tratto alla volta, con 9 livelli di velocità regolabili anche durante il disegno.
- **Foglio pronto da stampare**: A4 leggero, linee nere spesse, due righe in alto per scrivere titolo e nome.
- **Menu Condividi di Android**: da Google Immagini si tiene premuta un'immagine, *Condividi immagine* > Matita, e finisce nella raccolta.
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
3. Dopo un paio di minuti l'app sarà su `https://TUONOME.github.io/matita/`.
4. Apri l'indirizzo in **Chrome** sul tablet > menu con i tre puntini > **Installa app**.
5. Al primo avvio Matita chiede il nome dell'**adulto supervisore** e di **chi disegna**. Poi tieni premuto **Adulti** > **Chi disegna** per aggiungere le foto.

Serve un indirizzo `https://`: senza, il menu Condividi e il funzionamento offline non partono. Va bene qualsiasi hosting statico (GitHub Pages, Netlify, Cloudflare Pages).

Per provarla al volo sul computer basta aprire `index.html` in Chrome: funziona quasi tutto tranne installazione e menu Condividi.

### Consigli

- Le immagini già in bianco e nero vengono meglio delle foto: cerca "*nome* disegno da colorare".
- Ogni tanto salva una **copia di sicurezza** dall'area Adulti: se cancelli i dati di Chrome, disegni e foto spariscono.
- Se un disegno ha troppe o troppo poche linee: *Altre regolazioni* > Poche / Normali / Tante.

## Struttura

| File | Cosa fa |
|---|---|
| `index.html` | l'app: interfaccia, archivio locale (IndexedDB), animazione, stampa |
| `lineart.js` | estrae i contorni da un'immagine e li ordina in tratti da disegnare |
| `sw.js` | funzionamento offline e ricezione dal menu Condividi |
| `manifest.webmanifest`, `icon-*.png` | nome, icona e integrazione con Android |

Nessuna dipendenza e nessun passaggio di build: sono file statici.

## Contribuire

Le proposte sono benvenute. Leggi [CONTRIBUTING.md](CONTRIBUTING.md) prima di aprire una issue o una pull request.

## Licenza

[GNU AGPL-3.0](LICENSE). In breve: puoi usarla, studiarla, modificarla e ridistribuirla. Se pubblichi una versione modificata, anche come sito web, devi renderne disponibile il codice con la stessa licenza.

Le immagini di esempio incluse (zucca, pesce, casa) sono originali e coperte dalla stessa licenza. Le immagini che carichi tu restano tue e non fanno parte del progetto.
