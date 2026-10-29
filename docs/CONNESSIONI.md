# PRIME Connect

## Pagina Email

Ogni utente trova **Email** nel menu e collega personalmente Gmail, Outlook o Yahoo tramite OAuth. Vede soltanto le proprie notifiche e apre i messaggi sul provider. Sono conservati solo mittente, oggetto, data, ID e link; le notifiche scadono dopo 23 ore. Nascondere una notifica non modifica la casella. Il controllo avviene ogni 5 minuti, con aggiornamento dell’elenco aperto ogni 30 secondi.

Gmail riutilizza Client ID e secret Google già configurati per i calendari, ma richiede un consenso separato alla posta con `gmail.metadata`. Abilitare Gmail API nello stesso progetto e registrare anche il ritorno `/api/connect/callback/gmail`. Nella demo corrente il ritorno è `http://127.0.0.1:4319/api/connect/callback/gmail`. Le autorizzazioni Calendar non abilitano automaticamente Gmail.

Outlook richiede un’app Microsoft configurata per account organizzativi e personali, una piattaforma Web e il ritorno locale `http://127.0.0.1:4319/api/connect/callback/outlook`. In Microsoft Graph aggiungere soltanto il permesso delegato `Mail.ReadBasic`; il flusso OAuth usa inoltre gli ambiti `openid`, `profile`, `email` e `offline_access`. Yahoo richiede l’approvazione commerciale per IMAP OAuth `mail-r`; il codice predisposto non equivale all’approvazione Yahoo.

Configurazione server: `PRIME_GMAIL_CLIENT_ID`, `PRIME_GMAIL_CLIENT_SECRET` opzionali per credenziali Gmail dedicate; `PRIME_OUTLOOK_CLIENT_ID`, `PRIME_OUTLOOK_CLIENT_SECRET`; `PRIME_YAHOO_CLIENT_ID`, `PRIME_YAHOO_CLIENT_SECRET`. Per prove locali ogni provider accetta `PRIME_GMAIL_BASE_URL`, `PRIME_OUTLOOK_BASE_URL`, `PRIME_YAHOO_BASE_URL`; in produzione usare il dominio HTTPS registrato nelle console.

La pagina **PRIME Connect** prepara account personali Google Calendar, iCloud Calendar e Calendly, un numero aziendale WhatsApp Business Cloud API e notifiche email Gmail, Yahoo Mail e Outlook. Le credenziali e i token OAuth sono cifrati sul server; non si inseriscono segreti nella chat. Stato, account e ultime sincronizzazioni sono visibili in Connect.

## Calendari e videocall

Ogni agente collega il proprio account e sceglie il calendario scrivibile. PRIME esporta gli appuntamenti assegnati all’agente e importa gli altri eventi come blocchi **Occupato**, senza titolo o note personali. Una modifica concorrente crea un conflitto da risolvere nella pagina Connect. Google Calendar usa token incrementali, con un nuovo caricamento completo quando Google invalida il token. Google Meet può comparire dopo la conferma del servizio.

Per Apple occorre una password specifica per l’app creata dall’account Apple con autenticazione a due fattori. Le chiavi d’accesso iCloud sono cifrate. PRIME supporta i calendari iCloud scrivibili via CalDAV. Le connessioni Google Calendar e iCloud già attive nella demo sono state trasferite nell’istanza Fly; gli altri agenti collegano i propri account direttamente da Connect su Fly.

Calendly usa una singola app OAuth di PRIME condivisa da tutte le agenzie e un’autorizzazione indipendente per ogni agente: ciascuno collega il proprio account, i cui token sono conservati cifrati e associati al suo profilo. In produzione imposta una volta `PRIME_CALENDLY_CLIENT_ID`, `PRIME_CALENDLY_CLIENT_SECRET` e `PRIME_PUBLIC_URL` sul server PRIME; `PRIME_PUBLIC_URL` deve essere l’origine HTTPS esatta registrata come callback nell’app Calendly. L’app richiede solo `users:read`, `event_types:read`, `scheduled_events:read` e `scheduling_links:write`. Ogni agente può collegarsi con un clic da PRIME Connect; la sincronizzazione delle prenotazioni si attiva automaticamente. I link di prenotazione sono monouso e collegati a un immobile e, facoltativamente, al proprietario. La prenotazione diventa un appuntamento dopo la conferma Calendly; la videocall usa il link del luogo restituito da Calendly. Per ricevere webhook Calendly serve un server pubblico HTTPS.

## Richieste altri provider email

Nella pagina Connect si possono richiedere Virgilio Mail o PEC dalla sezione “Altri provider, su richiesta”. Per PEC si seleziona anche il gestore (Aruba PEC, Legalmail, Register.it PEC, InfoCert PEC o altro). La richiesta viene salvata come feedback sull’app e arriva solo alla inbox riservata allo sviluppatore. Questi provider non sono collegati finché non viene implementata e verificata la relativa integrazione; la schermata non raccoglie password o credenziali email.

L’autorizzazione Yahoo richiede la lettura dell’informativa pubblica `/privacy` e il consenso esplicito prima di avviare OAuth. PRIME registra la scelta nel registro di audit.

## Email

La scheda mostra le email non lette con mittente, oggetto, data e un collegamento al provider. Non importa corpi, anteprime o allegati. Gmail usa Gmail API `format=metadata`; Outlook legge i campi essenziali tramite Microsoft Graph. Yahoo usa IMAP via OAuth e richiede l’accesso commerciale Yahoo alle autorizzazioni `mail-r`: l’accesso non è disponibile con la sola registrazione autonoma a Developer Console. Le notifiche Yahoo vengono eliminate entro 23 ore, in rispetto alle condizioni di conservazione pubblicate da Yahoo; per Gmail e Outlook PRIME conserva l’elenco fino a 30 giorni. Archiviare una notifica la nasconde da PRIME, senza modificare la casella originale.

Per Gmail abilita Gmail API, configura la schermata OAuth e autorizza l’ambito `https://www.googleapis.com/auth/gmail.metadata` insieme agli ambiti OpenID. L’approvazione e la verifica OAuth di Google dipendono dallo stato e dalla distribuzione della tua app. Per Google Calendar in Fly registra il callback `https://prime-gestionale-deruvo.fly.dev/api/connect/callback/google`; i Client ID e Client secret condivisi si impostano come Fly secrets `PRIME_GOOGLE_CLIENT_ID` e `PRIME_GOOGLE_CLIENT_SECRET`. Per Outlook crea un’app Web in Microsoft Entra per account organizzativi e personali, aggiungi il permesso delegato Microsoft Graph `Mail.ReadBasic` e registra il callback; il flusso OAuth richiede inoltre `openid`, `profile`, `email` e `offline_access`.

## WhatsApp Business

PRIME usa l’app Meta condivisa per tutte le agenzie e apre Embedded Signup dall’area Connect per collegare il numero WhatsApp Business aziendale. L’amministratore Meta dell’agenzia sceglie il proprio Business Portfolio e approva l’accesso agli asset; il token viene scambiato sul server e conservato cifrato e isolato per agenzia. Per i numeri idonei, la configurazione Coexistence di Meta può mantenere attiva l’app WhatsApp Business e completare l’abbinamento con QR.

Per attivare l’onboarding, configura come segreti Fly `PRIME_META_APP_ID`, `PRIME_META_APP_SECRET`, `PRIME_META_WHATSAPP_CONFIG_ID`, `PRIME_META_VERIFY_TOKEN` e `PRIME_META_GRAPH_VERSION` (per esempio una versione Graph ancora supportata). `PRIME_PUBLIC_URL` deve puntare al dominio HTTPS pubblico. Il callback Webhooks Meta condiviso è `https://prime-gestionale-deruvo.fly.dev/api/connect/webhook/whatsapp`; verifica la richiesta con lo stesso token impostato in `PRIME_META_VERIFY_TOKEN`. In Meta configura le notifiche WhatsApp e completa il passaggio a modalità Live, l’abilitazione dei permessi richiesti e l’App Review/Advanced Access previsti per la distribuzione. Il flusso richiede Meta JS SDK e non funziona su localhost HTTP.

Il collegamento salva WABA ID e Phone Number ID restituiti da Meta, scambia il codice OAuth, controlla che il numero appartenga al WABA e sottoscrive l’app agli eventi del WABA. I webhook condivisi instradano i messaggi all’agenzia tramite questi ID. Non vengono inviati messaggi di prova automaticamente. L’invio AI richiede consenso registrato, blocca i contatti da non ricontattare, usa testi nella finestra di risposta Meta di 24 ore e modelli approvati fuori dalla finestra. L’accesso Embedded Signup richiede una app Meta ammessa come Solution Partner, Tech Provider o Tech Partner e i permessi Business richiesti da Meta.

## AI Assistant

La chat contestuale di Veronica risponde su immobili, CRM, WPS e appuntamenti. L’opzione **Feedback sull’app** registra il messaggio e lo recapita nella inbox privata dello sviluppatore PRIME, accessibile solo agli indirizzi configurati in `PRIME_DEVELOPER_EMAILS`. I feedback possono provenire da qualunque workspace; titolari e responsabili non vedono questa inbox. Le normali conversazioni non vengono salvate sul server.

Non è necessaria una chiave API esterna per la modalità base.

## Datagma · arricchimento CRM

PRIME Connect accetta le credenziali Datagma per agenzia e le cifra sul server. Nella scheda di un contatto esistente, l’agente può avviare manualmente una ricerca usando l’email professionale oppure un profilo LinkedIn già registrato. I risultati restano proposte: PRIME non sovrascrive i dati presenti e non salva nulla finché l’utente non sceglie i campi e salva la scheda. Le persone con “Non ricontattare” sono escluse. Datagma documenta l’endpoint `GET /api/ingress/v2/full`; una ricerca persona riuscita costa 2 crediti secondo la documentazione API, quindi la UI avvisa prima di inviare. [Guida API](https://datagmaapi.readme.io/reference/getting-started-with-your-api) · [Arricchimento persona/azienda](https://datagmaapi.readme.io/reference/ingressservice_fullapiv2) · [Credenziali Datagma](https://app.datagma.com/user-api).

L’endpoint Datagma riceve l’identificativo nel query string per requisito del provider. PRIME effettua la chiamata soltanto dal backend, non restituisce né registra le credenziali e non salva la risposta grezza. Prima dell’uso su contatti reali, il titolare deve verificare informativa, base giuridica, minimizzazione e condizioni Datagma applicabili ai dati professionali delle persone.

## ContactOut e servizi esterni

In PRIME Connect, titolare e responsabile inseriscono il token API ContactOut. Il backend verifica il token tramite `GET https://api.contactout.com/v1/stats`, lo cifra con AES-256-GCM usando il contesto dell’agenzia e restituisce soltanto stato e data della verifica. Un token già salvato può essere mantenuto lasciando vuoto il campo oppure rimosso. Migration 018 aggiunge `contactout_settings`.

Nella scheda di un contatto salvato, l’utente sceglie email, telefono o LinkedIn già presenti e conferma l’invio. PRIME chiama `POST https://api.contactout.com/v1/people/enrich` con header `token` e `include: [work_email, personal_email, phone]`. Nessuna ricerca automatica, invio multiplo o retry: ogni ricerca può consumare crediti ContactOut. I risultati restano temporanei; l’utente verifica l’identità, sceglie quali valori inserire e salva la scheda. I campi già compilati non vengono sovrascritti; i telefoni aggiuntivi usano i campi ripetibili e il loro tipo deve essere verificato dall’utente.

Le rotte `/api/contactout/settings` e `/api/contactout/enrich` applicano autenticazione, CSRF e isolamento per agenzia. Gli esterni sono esclusi; le ricerche sui contatti con “Non ricontattare” sono bloccate. L’audit conserva l’identificativo del contatto e l’esito, senza token o payload completi. Endpoint provider fissi, timeout e gestione di crediti esauriti, limiti, risultati vuoti e risposte non valide. I risultati non aggiornano il CRM finché l’utente non salva.

Documentazione: https://contactout.com/api_docs/ · Richiesta token/piano API: https://contactout.com/meeting?utm_source=api_docs. Il test con credenziali e crediti reali resta da eseguire dall’agenzia; i test automatici usano risposte simulate.

Telecontact (https://telecontact.it/) e WHUIS (https://app.whuis.com/login) sono soltanto collegamenti esterni in PRIME Connect, con loghi ufficiali locali. Si aprono in una nuova scheda senza invio di dati del CRM né importazione automatica.

## Firma elettronica

**Firma veloce con LetteraSenzaBusta:** PRIME apre [cheFIRMA!](https://www.letterasenzabusta.com/che_firma_digitale.html) in una nuova scheda e permette di copiare lo stesso link per il cliente. La firma avviene sul sito esterno con pagamento a consumo; il PDF firmato può essere caricato in Documenti. Non è una connessione API e non aggiorna automaticamente gli stati in PRIME; l’eventuale link affiliato personale va generato dal relativo account, non sostituito con un link generico. [Descrizione ufficiale](https://www.letterasenzabusta.com/chi_siamo.html).

**Namirial Sign Enterprise è configurabile da Firme elettroniche.** Titolare e responsabile hanno una guida in quattro passaggi per abilitazione API, creazione del Service Account, inserimento dei dati e invio della prima richiesta. La guida rimanda alla documentazione ufficiale. Il modulo include ambiente demo/produzione, ID organizzazione, Client ID, Client Secret e un pannello per endpoint API e OAuth. Il pulsante verifica il rilascio del token OAuth prima di salvare la configurazione cifrata. Le azioni di invio e aggiornamento sono disponibili solo quando la configurazione è completa. L’autenticazione server-to-server è OAuth 2.0 Client Credentials con Service Account; il flusso API include creazione pratica, caricamento PDF, fase, firmatario, campo firma, invio, aggiornamento stato e recupero del link destinatario. Per ogni richiesta l’utente sceglie PAdES (PDF) o CAdES (P7M); per QES PRIME seleziona il certificato usa e getta se abilitato nell’istanza Namirial. [Autenticazione e Service Account](https://docs.namirial.app/products/namirialsignenterprise/namirialsignenterprise-knowledge-center/03-developer-documentation/01-api-reference/authentication) · [API e workflow](https://docs.namirial.app/products/namirialsignenterprise/namirialsignenterprise-knowledge-center/03-developer-documentation/01-api-reference/api-reference) · [Swagger demo](https://demo-eu-ie1-api.namirialsign.com/api/swagger/index.html).

Alternative tecniche con API documentate:

- **InfoCert Sign**: API REST con workflow, link per utenti esterni e flussi qualificati, inclusi PDF e P7M nei casi documentati. [Portale sviluppatori e API](https://developers.infocert.digital/infocert-sign/api-reference/) · [Autenticazione OAuth2](https://developers.infocert.digital/infocert-sign/before-you-begin/authentication/).
- **Namirial Sign Enterprise**: REST API per buste, documenti, destinatari, invio e recupero degli artefatti/audit trail; autenticazione server-to-server OAuth 2.0. La modalità di firma dipende dal servizio e dalla configurazione acquistata. [API reference](https://docs.namirial.app/products/namirialsignenterprise/namirialsignenterprise-knowledge-center/03-developer-documentation/01-api-reference/api-reference).
- **DocuSign eSignature**: REST API per invio e gestione dei flussi e dei modelli. [Guida ufficiale](https://developers.docusign.com/docs/esign-rest-api/how-to/).
- **Dropbox Sign**: API per richieste, firma incorporata, notifiche e recupero dei documenti firmati. [API reference](https://developers.hellosign.com/api/signature-request).
- **Adobe Acrobat Sign**: REST API per accordi, stato e recupero dei documenti firmati. [Guida ufficiale](https://developer.adobe.com/acrobat-sign/docs/overview/developer_guide/apiusage).

La firma elettronica semplice, avanzata e qualificata sono livelli differenti. Nell’UE la firma qualificata (QES), con certificato qualificato e dispositivo qualificato, ha effetto giuridico equivalente alla firma autografa; la sufficienza richiesta varia comunque secondo atto e contesto. Prima di automatizzare contratti PRIME vanno verificati flusso di identificazione, livello, conservazione dell’audit trail e requisiti italiani applicabili. [Commissione europea: eSignature e quadro eIDAS](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467109069/What%2Bis%2BeSignature).

**Configurazione richiesta per collegare Namirial:** dalla schermata Firme elettroniche il titolare o responsabile inserisce Base URL API, Token URL OAuth, Organization ID, Client ID e Client Secret del Service Account. Gli endpoint demo sono precompilati; l’URL API di produzione dipende dall’istanza dell’agenzia. I segreti vengono cifrati nel database dell’agenzia. Gli invii sono manuali, dopo conferma per ogni richiesta. Nessun invio reale è stato eseguito. L’integrazione va verificata con credenziali sandbox Namirial dell’agenzia, perché il flusso QES e l’accesso al link destinatario dipendono dalle abilitazioni dell’istanza.

## Installazione e protezione

Il server usa `PRIME_CONNECT_KEY` (base64 di 32 byte) oppure crea un file `connect.key` protetto nella directory dati. In produzione imposta la chiave come segreto persistente e conserva una copia di backup: cambiarla rende illeggibili i token già memorizzati. Imposta `base_url` sul dominio HTTPS finale di PRIME, poi registra i callback identici nelle console provider. I callback localhost sono adatti soltanto alle modalità sandbox che li consentono.

### Veronica: gestione e memoria
Le proposte di modifica sono conservate nel database e scadono dopo 30 minuti; richiedono conferma dell'autore. Creazione, modifica, note ed eliminazione usano gli stessi controlli delle schede. La memoria personale persiste nel database, è separata per utente e agenzia ed è cancellabile dalla chat. Non vengono memorizzate password, PIN o chiavi API nella memoria. I messaggi ordinari della chat restano nel browser durante la sessione; proposte, memoria e audit sono invece conservati sul server. Credenziali, file, inviti e operazioni esterne si gestiscono nelle relative schermate.
