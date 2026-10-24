# Demo PRIME su Fly.io

Indirizzo pubblico: https://prime-gestionale-deruvo.fly.dev/ . Prima distribuzione eseguita e verificata il 24 ottobre 2026: health check positivo, login demo riuscito, 11 appartamenti e 14 foto persistenti. Foto autenticate HTTP 200 e richiesta senza sessione HTTP 401. Verificato da browser il salvataggio di due numeri e due social aggiuntivi sulla stessa persona. 39 test automatici superati.

Applicazione separata: `prime-gestionale-deruvo`, regione Parigi `cdg`, organizzazione personale autorizzata dall'utente. I progetti Phoenix esistenti non sono modificati.

Configurazione in fly.toml: una macchina shared CPU, 512 MB RAM, volume `prime_data` da 1 GB montato in /data, HTTPS obbligatorio, arresto automatico quando inattiva e riavvio alla prima richiesta. Distribuire con `fly deploy --remote-only --ha=false` per mantenere una sola macchina SQLite.

Il contenitore usa Node 24. Il processo prende in carico i permessi del volume e poi lavora come utente non privilegiato. `/healthz` controlla il database senza esporre dati dell'agenzia. L'arresto SIGTERM chiude server e SQLite prima dell'uscita.

Database e foto persistono rispettivamente in /data/prime.sqlite e /data/uploads. Docker copia soltanto sorgenti, migrazioni e risorse pubbliche; database, upload, sessioni, chiavi e credenziali non sono inclusi nell'immagine o nel repository.

Lo strumento import-demo.mjs importa uno snapshot soltanto in un database demo completamente vuoto, con migrazioni identiche, senza sovrascrivere dati presenti. Le sessioni locali vengono escluse. È una procedura CLI di inizializzazione, non un endpoint pubblico. Le foto vengono trasferite separatamente dal codice.

Questa è una demo di sviluppo con dati fittizi e immagini contrassegnate «IMMAGINE DEMO · AI». SQLite a macchina singola non offre alta disponibilità; la configurazione non dichiara completato l'hardening di produzione o i moduli ancora indicati in STATO.md. Prima di dati reali: backup esterno e prova di ripristino, identità/team e privacy di produzione.

L'utente ha autorizzato l'avvio della demo con budget indicativo di 10 USD/mese per macchina e volume, oltre traffico/imposte. Il budget non è un tetto automatico imposto da Fly. Fonte prezzi: https://docs.fly.io/about/pricing . Gli aggiornamenti si applicano soltanto all'app PRIME identificata in fly.toml.
