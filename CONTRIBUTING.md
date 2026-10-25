# Contribuire a Me lo disegni?

Grazie per l'interesse. Me lo disegni? è un progetto piccolo e curato nel tempo libero: le risposte possono richiedere qualche giorno.

## Per chi la usa

L'app è pensata anche per bambini con autismo e per adulti poco pratici di tecnologia. Ogni proposta viene valutata con queste domande:

- **Resta prevedibile?** Stesse schermate, stesso ordine, niente sorprese.
- **Resta semplice?** Una funzione in più è una cosa in più da capire. Meglio poche cose fatte bene.
- **Resta privata?** Niente server, niente tracciamento, niente servizi esterni che ricevono immagini o foto.
- **Resta su carta?** Il cuore è il foglio stampato da colorare a mano.

## Segnalare un problema

Apri una **issue** con:

1. cosa stavi facendo;
2. cosa ti aspettavi e cosa è successo invece;
3. dispositivo e browser (per esempio: tablet Samsung, Android 14, Chrome 130);
4. se possibile uno screenshot. Se il problema riguarda un disegno, allega l'immagine che lo causa, purché tu abbia il diritto di condividerla.

Non pubblicare foto di persone reali nelle issue.

## Proporre una funzione

Apri prima una **issue** che spieghi il bisogno, non solo la soluzione: chi la userebbe e in quale momento. Così si evita di lavorare su una pull request che poi non può essere accettata.

## Inviare una pull request

1. Fai un fork e crea un branch con un nome chiaro (`fix-stampa-orizzontale`, `velocita-predefinita`).
2. Mantieni le modifiche piccole e su un solo argomento.
3. Niente dipendenze nuove e niente passaggi di build: il progetto deve restare un insieme di file statici.
4. Prova su un tablet o telefono Android reale, oltre che sul computer.
5. Se cambi un comportamento visibile, aggiorna anche la guida dentro l'app e il README.
6. Se cambi i file in cache, aumenta il numero di versione in `sw.js` (`matita-v3` > `matita-v4`).

### Stile

- Testi dell'interfaccia in italiano, frasi brevi, parole di tutti i giorni.
- Pulsanti grandi (almeno 48 px) e con testo, non solo icone.
- JavaScript senza framework, commenti in italiano dove la logica non è ovvia.

## Licenza dei contributi

Inviando una pull request accetti che il tuo contributo sia distribuito con la licenza del progetto, la [GNU AGPL-3.0](LICENSE).
