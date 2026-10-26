# Didit KYB per PRIME

La configurazione appartiene alla piattaforma. Nessuna agenzia può impostare API key,
workflow o approvazioni. Solo il titolare avvia una sessione; titolare e responsabile
possono consultare e aggiornare l'esito. Le query sono sempre limitate al tenant.

## Configurazione server

In locale viene letto `.env.didit-sandbox`, escluso da Git e dall'immagine Docker.
In produzione si usano esclusivamente variabili/secret del server:

- `DIDIT_API_KEY`
- `DIDIT_KYB_WORKFLOW_ID`
- `DIDIT_APPLICATION_ID`
- `DIDIT_ENVIRONMENT=sandbox`
- `DIDIT_WEBHOOK_SECRET` (secret della destinazione webhook)

La chiave server necessita di sessioni in scrittura e decisioni in lettura, limitate
al workflow KYB PRIME. Non occorrono media o permessi amministrativi. I secret non
vengono restituiti dalle API o inviati al frontend. Il file locale va mantenuto
accessibile solo all'utente che esegue PRIME.

## Flusso

PRIME Connect → Didit · KYB → Avvia verifica agenzia. Il server crea la sessione su
`POST https://verification.didit.me/v3/session/` con `workflow_id` fisso e
`vendor_data` casuale associato alla singola agenzia. Ripetere il comando riusa la
sessione attiva. Dopo un timeout in creazione occorre riconciliare la sessione
nella console Didit prima di riprovare: non viene duplicata alla cieca.

L'utente completa il collegamento ospitato da Didit. “Aggiorna esito” interroga
`GET /v3/session/{id}/decision/`. Il backend verifica sessione, workflow e vendor.
Memorizza soltanto stato, identificativi e date, senza documenti né dati UBO.

Webhook pubblico: `POST /api/webhooks/didit`, eventi `status.updated` e
`data.updated`, formato V3. Verifica HMAC-SHA256 `X-Signature-V2` sull'intero JSON
canonico, con fallback alla firma dei byte originali, confronti a tempo costante e
timestamp entro 300 secondi. La firma Simple non viene accettata. Supporta gli
header Previous durante la rotazione, deduplica `event_id` e rilegge la decisione
autoritativa per evitare aggiornamenti fuori ordine. Controlla applicazione,
ambiente, sessione e vendor prima di aggiornare l'agenzia. I webhook del tester
non modificano lo stato delle agenzie.

Gli esiti sandbox sono marcati separatamente e non verificano un'agenzia live.
La modalità live richiede sia credenziali live sia `DIDIT_ALLOW_LIVE=1` impostato
esplicitamente dal gestore della piattaforma; non è attivabile dal client.

## Verifica

`node --test didit.test.mjs` copre firme, Unicode, isolamento tenant, ruoli/CSRF,
richieste concorrenti, retry incerti, separazione sandbox/live, replay e tester.

Documentazione consultata: [KYB quickstart](https://docs.didit.me/business-verification/quickstart),
[webhook](https://docs.didit.me/integration/webhooks). Il quickstart contiene un
esempio di envelope diverso dal riferimento webhook V3: il ricevitore usa il
contratto V3 `webhook_type`, `session_kind` e `decision` del riferimento webhook.

## Attivazione verificata il 25 ottobre 2026

- Workflow: `287d3313-99a0-47a2-a181-2b9eaeb4c2cb`, applicazione sandbox Prime.
- Demo pubblica aggiornata: `https://prime-gestionale-deruvo.fly.dev`.
- Destinazione Didit: “PRIME · KYB sandbox”, V3, eventi `status.updated` e `data.updated`.
- Secret della chiave e della firma conservati nei secret Fly; copia locale ignorata da Git.
- Creazione sessione e recupero decisione verificati dal pannello PRIME locale con API sandbox reali.
- Test ufficiale Didit “KYB Approved” consegnato al webhook pubblico con risposta HTTP 200.
- 75 test superati; 38 controlli di sintassi superati. Nessun documento inviato e nessun controllo live avviato.
