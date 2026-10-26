# Portali immobiliari e assistente base

Versione base, 24 ottobre 2026.

## Funzioni disponibili
L’assistente è un motore interno di ricerche guidate e riepiloghi: immobili attivi (fino a 50 recenti, massimo 20 risultati), CRM aggregato, WPS personale e appuntamenti. Supporta città presenti nei dati, vendita/affitto, “almeno N locali”, prezzo “entro N”. Gli altri criteri non vengono applicati e la risposta lo dichiara. Non usa un modello linguistico, non invia dati a OpenAI e non contatta persone. Dal 25 ottobre gestisce anche creazione, modifica, note ed eliminazione delle 19 tipologie di scheda, con proposta e conferma esplicita, controlli dei permessi e storico. Il pulsante Gestisci schede apre i moduli completi quando servono altri dati. La memoria è persistente, privata per utente e agenzia e cancellabile; le credenziali si configurano nelle schermate dedicate. L’isolamento tenant e il perimetro assegnato all’agente sono applicati dal backend.

WhatsApp è In arrivo: UI senza login Meta, collegamento e invio bloccati sul server. Il webhook già configurato è conservato.

## Predisposizione portali
Immobiliare.it, idealista e Casa.it sono predisposti nella sezione Connect, riservata a titolare e responsabile. Si salvano un riferimento non segreto dell’account e il canale previsto API/feed. Non vengono raccolte password o chiavi finché non è implementato il relativo connettore.

GET /api/portals restituisce portali, immobili dell’agenzia e bozze locali.
PUT /api/portals/{immobiliare|idealista|casa} salva account_reference e channel (api/feed).
POST /api/portals/drafts salva property_id, portals e operation (publish/update/withdraw).

Ogni immobile ha una bozza corrente per portale; modificarla sostituisce l’operazione precedente. Il salvataggio su più portali è atomico. Il payload versionato contiene un’istantanea dei campi disponibili; non espone dati di proprietari/CRM. Non è un feed conforme a un portale. Non viene eseguita nessuna richiesta ai portali e “Da inviare” non significa pubblicato.

## Attivazione successiva
Per ogni connettore serviranno accordo/accesso ufficiale, documentazione corrente, codice agenzia e credenziali conservate nel vault esistente. Implementare mapping e validazione dei campi obbligatori (descrizione pubblicitaria separata dalle note private, contratto, categoria, geografia, APE, foto autorizzate). Le immagini attualmente autenticate non sono scaricabili dai portali: occorre un canale media dedicato e autorizzato prima di attivare feed o API.

Il connettore dovrà trasformare la bozza canonica nel tracciato del portale, validarla, inviarla con idempotenza, memorizzare ID esterno e versione inviata, gestire retry e conferme di pubblicazione/ritiro. Il consenso all’operazione esterna e un esito separato per portale sono necessari nel flusso di invio. Non attivare pubblicazione dal semplice salvataggio della bozza o del riferimento account.

Fonti consultate: Immobiliare.it documenta importazioni automatiche previo accordo commerciale e con validazione XSD: https://feed.immobiliare.it/integration/ii/docs/import/payload-specifications . Per idealista e Casa.it non è stata verificata in questa sessione una specifica tecnica di scrittura pubblica: ottenere accesso e specifiche dal portale prima di implementare il trasporto. Il normale login web non equivale a un’autorizzazione API/feed.
