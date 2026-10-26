# PRIME

Demo online: [PRIME su Fly.io](https://prime-gestionale-deruvo.fly.dev/). Ambiente dimostrativo separato, con foto di esempio generate e contrassegnate. [Configurazione di distribuzione e persistenza](docs/FLY.md).

Repository indipendente per il gestionale immobiliare PRIME. Nessuna dipendenza dal progetto Phoenix: sorgenti, database e configurazioni appartengono esclusivamente a PRIME.

## Stato attuale

Incremento 0.4: applicazione web locale avviabile con database persistente e migrazioni, registrazione/login/logout, isolamento tra agenzie, ruoli lato server, audit e doppio tema con loghi ufficiali. CRUD collegati per vie, stabili, interni, persone e immobili. Primo flusso operativo WPS con obiettivi/esiti/prossime azioni e appuntamenti condivisi con l'agenda, senza duplicazioni. Ricerche globali e dedicate, prevenzione duplicati e controllo delle modifiche concorrenti.

La specifica ufficiale completa è in [docs/SPECIFICA-UFFICIALE.md](docs/SPECIFICA-UFFICIALE.md). Il piano e le scelte sono in [docs/ARCHITETTURA.md](docs/ARCHITETTURA.md). Consultare [docs/STATO.md](docs/STATO.md) per funzionalità operative, parziali, mancanti e risultati delle verifiche. La fase 1 è ancora in corso; non è un SaaS pronto per la produzione.

L’Agenda appuntamenti ora presenta una griglia giorno/settimana; il WPS suddivide la giornata in blocchi orari e richiede l’esito alla scadenza del timer. Dettagli e limiti in [docs/AGENDA-WPS.md](docs/AGENDA-WPS.md).

Il territorio è raccolto in una scheda unica via → civico → appartamento, con persone collegate, recapiti aggiuntivi e social, preferenze di contatto, storico telemarketing e foto private. L’agenda offre quattro tipi rapidi e titolo facoltativo. Dettagli in [docs/TERRITORIO.md](docs/TERRITORIO.md).

## Avvio del server

Con Node.js 24 o successivo, eseguire `node --run start` (oppure `node server.mjs`) da questa cartella. Non è richiesta installazione di dipendenze. Il server ascolta solo su http://127.0.0.1:4317. Il database viene creato in data/ ed è escluso dal versionamento. PORT e PRIME_DB consentono di personalizzare porta e percorso del database. Le migrazioni si applicano all'avvio in transazione; conservare una copia offline del database prima di aggiornarlo. La prima migrazione dal vecchio scaffold revoca le sessioni esistenti e richiede un nuovo login; utenti e record legacy sono conservati.

Aprire il sito e scegliere “Crea il tuo spazio” per registrare la propria agenzia con una password personale. Nessun account o record demo viene creato automaticamente. Le chiavi esterne impediscono collegamenti tra agenzie; gli utenti esterni non possono accedere alle API operative. La UI degli inviti e l'assegnazione dei ruoli sono ancora da sviluppare.

## Verifica

Eseguire `node --run check` e `node --run test` (oppure `node --test tests.mjs voice-input.test.mjs`). I test creano database temporanei separati, non modificano data/ e rimuovono solo i propri file temporanei. L'ultima verifica comprende 43 test superati, incluso AI Assistant con provider simulato, isolamento tenant e minimizzazione del contesto; controlli browser desktop/mobile. Per un ambiente di esempio separato impostare PRIME_DEMO=1 e PRIME_DB su un percorso dedicato: PRIME_DEMO mostra l'avviso demo, non inserisce dati e non abilita accessi speciali.

## Limiti attuali

Email verificata, recupero password, 2FA, inviti, disponibilità visite avanzate, matching, mappe, ricorrenze WPS e moduli commerciali sono da completare. Didit, Stripe e tutti i servizi esterni risultano non configurati. La schermata PRIME Connect descrive questo stato, senza azioni fittizie. La ricerca attuale è adatta al primo sviluppo locale; indicizzazione e paginazione per grandi volumi sono future.

NODE_ENV=production aggiunge cookie Secure e HSTS ma non sostituisce un'infrastruttura HTTPS corretta, né rende questa versione pronta per la produzione. Non esporre il server di sviluppo direttamente a Internet. Il repository pubblico contiene sorgenti, loghi e specifica; dati dell'agenzia e credenziali restano fuori da Git.

## Perimetro da preservare

SaaS multi-tenant, ruoli, censimento vie/civici/piani/interni, rubrica condominiale con custode e amministratore, CRM, immobili, agenda e disponibilità visite, WPS, ricerca universale e contestuale, matching, pipeline, visite e feedback acquirenti, contratti, locazioni, dashboard, integrazioni esplicitamente non attive, doppio tema e interfaccia mobile-first.

Il riferimento completo è ora la specifica ufficiale allegata dall'utente e conservata integralmente in docs/. Il WPS non è un semplice elenco di attività e non viene attribuita un'espansione inventata all'acronimo. Non è prevista gestione di custodia, consegna o restituzione chiavi.


Dettatura vocale nei campi e nelle ricerche, recapiti multipli per persona direttamente dalla scheda immobile: [dettagli e compatibilità browser](docs/DETTATURA.md).


Appartamenti suddivisi per piano e esempio demo: [dettagli](docs/APPARTAMENTI-PER-PIANO.md).


Evidenze commerciali, lead caldi e filtri per stabile: [dettagli](docs/EVIDENZE-COMMERCIALI.md).


CRM: filtro per tipo di contatto combinato con ricerca; Lead caldo gestito con una sola spunta, con migrazione dei lead già caldi.


Campi telefono/social ripetibili direttamente nella scheda persona: [dettagli](docs/RECAPITI-MULTIPLI.md). Demo Fly.io e persistenza: [configurazione](docs/FLY.md).


Categorie telefono Ufficio/Casa/Cell personale/Cell di lavoro, assegnazione e filtri per agente, immagini intere senza fasce: [dettagli](docs/AGENTI-FOTO.md).
