# Agenda Ufficio — display Google Calendar per monitor/TV

App locale in HTML/CSS/JS puro (nessun framework, nessuna build) da mostrare
a schermo intero su un monitor/TV in ufficio: agenda di oggi in grande a
sinistra, anteprima della settimana compatta a destra, orologio sempre
visibile, auto-refresh ogni 5 minuti. Apri `index.html` tramite un piccolo
server locale (serve un server, non `file://`, perché Google Identity
Services richiede un'origine http/https).

## 1. Crea le credenziali su Google Cloud Console

1. Vai su https://console.cloud.google.com/ e crea un nuovo progetto (o usane
   uno esistente).
2. **API e servizi → Libreria** → cerca "Google Calendar API" → **Abilita**.
3. **API e servizi → Schermata consenso OAuth**:
   - Tipo utente: **Esterno** (va bene anche in modalità "Testing").
   - Compila nome app, email di supporto.
   - In **Utenti di test**, aggiungi l'indirizzo Gmail/Workspace che userai
     per collegare il calendario (es. il tuo account aziendale).
4. **API e servizi → Credenziali → Crea credenziali → ID client OAuth**:
   - Tipo applicazione: **Applicazione web**.
   - **Origini JavaScript autorizzate**: aggiungi l'indirizzo da cui servirai
     la pagina, es. `http://localhost:8080` (vedi punto 3 sotto).
   - Crea, poi copia il **Client ID** generato (finisce con
     `.apps.googleusercontent.com`).
5. Incolla il Client ID in [`config.js`](config.js), al posto di
   `INSERISCI_QUI_IL_TUO_CLIENT_ID...`.

Se vuoi mostrare un calendario condiviso (es. "Sala riunioni") invece del tuo
personale, imposta `CALENDAR_ID` in `config.js` con l'email di quel
calendario, e assicurati che l'account che farà login abbia accesso in
lettura a quel calendario.

## 2. Avvia un server locale

Da questa cartella:

```bash
python3 -m http.server 8080
```

Poi apri `http://localhost:8080` nel browser (deve corrispondere
esattamente all'origine autorizzata inserita al punto 4 sopra).

## 3. Verifica

1. Clicca **Connetti a Google Calendar**, effettua il login e accetta il
   consenso (scope di sola lettura sul calendario).
2. Dovresti vedere la lista degli eventi di oggi e il conteggio eventi per i
   prossimi 7 giorni, con un log in basso che conferma ogni fetch.
3. Lascia la pagina aperta: ogni 5 minuti rilegge gli eventi automaticamente,
   e il token OAuth viene rinnovato in automatico prima della scadenza
   (silenziosamente, senza richiedere login) — pensato per restare acceso
   su uno schermo/TV in ufficio senza interazione manuale.

Se il rinnovo silenzioso fallisce (es. cookie di sessione Google scaduti sul
browser del monitor), il pannello di connessione ricompare e basta ricliccare
"Connetti".

## Personalizzazione

- **Logo aziendale**: metti un file immagine chiamato `logo.png` (o `.svg`
  rinominato in `logo.png`) in questa cartella. Compare automaticamente in
  alto a sinistra al posto del riquadro tratteggiato "LOGO". Dimensioni
  consigliate: altezza attorno ai 150-200px, sfondo trasparente.
- **Colore accento**: apri [`style.css`](style.css) e modifica la variabile
  `--accent` in cima al file (riga con `:root { ... }`) con il colore
  aziendale, es. `--accent: #c8102e;`.
- **Calendario mostrato**: `CALENDAR_ID` in [`config.js`](config.js) —
  `"primary"` per il calendario di chi fa login, oppure l'email di un
  calendario condiviso (es. sala riunioni).

## Modalità debug

Il log tecnico (autenticazione, esiti dei fetch, errori) non è visibile
nella modalità normale, pensata per essere pulita su una TV. Per vederlo,
apri la pagina con `?debug` in fondo all'URL, es.
`http://localhost:8080/?debug` — compare una barra scura in fondo con i
log in tempo reale, utile per diagnosticare problemi sul posto.

## Installarla come applicazione (consigliato)

L'app è una PWA installabile: si comporta come un programma vero, con la
sua icona, senza barra indirizzi né tab del browser — non "un sito aperto
in una tab".

1. Apri `http://localhost:8080` in Chrome (**senza** `?debug` nell'URL).
2. Nella barra degli indirizzi compare un'icona di installazione (un
   monitor con una freccia, o "Installa Agenda Ufficio" nel menu ⋮).
   Cliccala e conferma.
3. Si apre una finestra a parte, senza tab né barra indirizzi, con l'icona
   del logo. Da questo momento puoi lanciarla come qualsiasi altra app:
   - **macOS**: resta nel Launchpad / Applications come app a sé stante.
   - **Windows**: compare nel menu Start e può essere fissata alla barra
     delle applicazioni.
4. Fai login la prima volta che si apre.
5. Per lo schermo intero vero e proprio sul monitor/TV, premi F11 (o
   l'equivalente del sistema) dentro la finestra dell'app installata.

Se in futuro pubblichi la pagina su un indirizzo diverso da
`localhost:8080` (es. un dominio interno), disinstalla e reinstalla l'app
puntando al nuovo indirizzo.

### Alternativa: modalità kiosk del browser (senza installare nulla)

Se preferisci non installarla, puoi comunque ottenere uno schermo intero
senza barre lanciando Chrome così:

```bash
# macOS
open -na "Google Chrome" --args --kiosk --app=http://localhost:8080

# Windows (prompt dei comandi)
chrome.exe --kiosk http://localhost:8080

# Linux
google-chrome --kiosk http://localhost:8080
```

### Permetti i popup per questo sito (passaggio fondamentale)

Chrome → menu ⋮ → Impostazioni → Privacy e sicurezza → Impostazioni sito →
Popup e reindirizzamenti → aggiungi l'indirizzo che usi (es.
`http://localhost:8080`) tra i siti consentiti. Il rinnovo automatico del
token apre una popup invisibile; se Chrome la blocca, il rinnovo silenzioso
fallisce e la pagina torna a chiedere il login manualmente. Con i popup
consentiti invece il rinnovo avviene da solo, senza che nessuno se ne
accorga.

In alternativa, dall'icona a forma di popup bloccata che compare nella
barra degli indirizzi al primo tentativo fallito, scegli "Consenti sempre
popup e reindirizzamenti da questo sito".

## Pubblicarla online (hosting gratuito, raggiungibile da qualsiasi rete)

Finché usi `localhost:8080`, l'app è raggiungibile solo dal computer che fa
girare il server (o dalla stessa rete locale, vedi sopra). Per un indirizzo
fisso raggiungibile da qualunque rete — utile se il PC del monitor è diverso
da quello su cui sviluppi, o se vuoi poterla aprire anche da remoto — la
soluzione più semplice e gratuita è **GitHub Pages**. Nessun comando da
terminale richiesto, solo il browser.

1. **Crea un account GitHub** (se non ce l'hai già): vai su
   https://github.com/signup, bastano email e password, gratuito. Questo
   passaggio deve farlo chi userà l'account — non posso farlo io al posto
   tuo.
2. **Crea un nuovo repository**: dalla tua pagina GitHub, clicca "New" →
   dai un nome (es. `agenda-ufficio`) → lascialo **Public** → "Create
   repository" (non aggiungere README/licenza, resta tutto vuoto).
3. **Carica i file**: nella pagina del repository appena creato, clicca
   "uploading an existing file", poi trascina dentro **tutti i file**
   della cartella `office-calendar-display` (index.html, style.css,
   app.js, config.js, manifest.json, sw.js, logo.png, le icon-*.png,
   README.md) — non la cartella stessa, il suo contenuto. Poi "Commit
   changes".
4. **Attiva GitHub Pages**: nel repository, vai su Settings → Pages (nel
   menu a sinistra) → in "Build and deployment" → Source: "Deploy from a
   branch" → Branch: `main`, cartella `/ (root)` → Save. Dopo circa un
   minuto compare l'indirizzo pubblico, del tipo:
   `https://<tuo-username>.github.io/agenda-ufficio/`
5. **Aggiorna le origini autorizzate su Google Cloud**: torna su
   [Google Cloud Console](https://console.cloud.google.com/) → API e
   servizi → Credenziali → il tuo ID client OAuth → aggiungi il nuovo
   indirizzo (es. `https://<tuo-username>.github.io`) tra le **Origini
   JavaScript autorizzate**. Senza questo passaggio il login non funziona
   sul nuovo indirizzo.
6. Apri il link pubblico, fai login, e — se vuoi — installala come app
   (vedi sopra) anche lì.

**Per aggiornamenti futuri**: ogni volta che modifichiamo qualcosa insieme
(es. layout, colori), dovrai ricaricare i file modificati nel repository
GitHub (stesso pulsante "uploading an existing file", sovrascrive quelli
esistenti) — dimmelo quando vuoi farlo e ti dico esattamente quali file sono
cambiati.

### Cosa succede se il rinnovo fallisce comunque

La pagina ora ritenta automaticamente 3 volte (dopo 5, 15 e 40 secondi)
prima di mostrare il pannello "Connetti" — copre la maggior parte dei casi
transitori (piccoli intoppi di rete, popup bloccata un attimo). Se anche
dopo i tentativi il pannello ricompare, è probabile che manchi il permesso
sui popup (vedi sopra "Permetti i popup per questo sito") o che il PC abbia perso la sessione Google nel
browser (es. dopo un riavvio prolungato) — in quel caso serve un click
manuale su "Connetti", una tantum.

Questa app usa l'autenticazione OAuth "lato client" (senza un server): è la
scelta più semplice per un'app statica HTML/CSS/JS, ma il token dura solo
~1 ora e va rinnovato periodicamente. Con popup consentiti e un browser che
resta sempre aperto e loggato, in pratica non richiede più interazione. Se
in futuro capita ancora spesso, esiste una soluzione più robusta (token di
refresh via un piccolo componente server) che elimina la dipendenza dai
popup — dimmelo e la implemento.
