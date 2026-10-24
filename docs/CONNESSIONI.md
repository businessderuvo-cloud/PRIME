# PRIME Connect

La pagina **PRIME Connect** prepara account personali Google Calendar, iCloud Calendar e Calendly, un numero aziendale WhatsApp Business Cloud API e notifiche email Gmail, Yahoo Mail e Outlook. Le credenziali e i token OAuth sono cifrati sul server; non si inseriscono segreti nella chat. Stato, account e ultime sincronizzazioni sono visibili in Connect.

## Calendari e videocall

Ogni agente collega il proprio account e sceglie il calendario scrivibile. PRIME esporta gli appuntamenti assegnati all’agente e importa gli altri eventi come blocchi **Occupato**, senza titolo o note personali. Una modifica concorrente crea un conflitto da risolvere nella pagina Connect. Google Calendar usa token incrementali, con un nuovo caricamento completo quando Google invalida il token. Google Meet può comparire dopo la conferma del servizio.

Per Apple occorre una password specifica per l’app creata dall’account Apple con autenticazione a due fattori. Le chiavi d’accesso iCloud sono cifrate. PRIME supporta i calendari iCloud scrivibili via CalDAV.

Calendly crea link di prenotazione monouso collegati a un immobile e, facoltativamente, al proprietario. La prenotazione diventa un appuntamento dopo la conferma Calendly. La videocall usa il link del luogo restituito dal provider. La configurazione dell’app OAuth Calendly richiede gli ambiti `users:read`, `event_types:read`, `scheduled_events:read` e `scheduling_links:write`; registra il callback mostrato a schermo. Per ricevere webhook Calendly serve un server pubblico HTTPS.

## Email

La scheda mostra le email non lette con mittente, oggetto, data e un collegamento al provider. Non importa corpi, anteprime o allegati. Gmail usa Gmail API `format=metadata`; Outlook legge i campi essenziali tramite Microsoft Graph. Yahoo usa IMAP via OAuth e richiede l’accesso commerciale Yahoo alle autorizzazioni `mail-r`: l’accesso non è disponibile con la sola registrazione autonoma a Developer Console. Le notifiche Yahoo vengono eliminate entro 23 ore, in rispetto alle condizioni di conservazione pubblicate da Yahoo; per Gmail e Outlook PRIME conserva l’elenco fino a 30 giorni. Archiviare una notifica la nasconde da PRIME, senza modificare la casella originale.

Per Gmail abilita Gmail API, configura la schermata OAuth e autorizza l’ambito `https://www.googleapis.com/auth/gmail.metadata` insieme agli ambiti OpenID. L’approvazione e la verifica OAuth di Google dipendono dallo stato e dalla distribuzione della tua app. Per Outlook crea un’app Web in Microsoft Entra, aggiungi permessi delegati `Mail.ReadBasic`, `User.Read` e il rinnovo offline, quindi registra il callback.

## WhatsApp Business

PRIME usa solo WhatsApp Business Cloud API. Verifica l’account Meta con WABA ID, Phone Number ID e token Cloud API. Registra il callback HTTPS indicato in Connect per ricevere risposte e aggiornamenti di consegna. La ricezione webhook non è raggiungibile in esecuzione locale senza un endpoint HTTPS pubblico. Non vengono inviati messaggi di prova automaticamente. L’invio richiede consenso registrato, blocca i contatti da non ricontattare, usa testi solo nella finestra di risposta Meta di 24 ore e modelli approvati al di fuori della finestra.

## Installazione e protezione

Il server usa `PRIME_CONNECT_KEY` (base64 di 32 byte) oppure crea un file `connect.key` protetto nella directory dati. In produzione imposta la chiave come segreto persistente e conserva una copia di backup: cambiarla rende illeggibili i token già memorizzati. Imposta `base_url` sul dominio HTTPS finale di PRIME, poi registra i callback identici nelle console provider. I callback localhost sono adatti soltanto alle modalità sandbox che li consentono.
