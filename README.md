# PRIME

Repository indipendente per il gestionale immobiliare PRIME. Nessuna dipendenza dal progetto Phoenix: sorgenti, database e configurazioni appartengono esclusivamente a PRIME.

## Stato attuale

Base iniziale Node.js 24 con SQLite persistente, registrazione agenzia, sessioni e separazione dei dati per tenant. Loghi originali inclusi per tema chiaro e scuro.

L'interfaccia è ancora da completare: index.html richiama app.js e style.css, non ancora presenti. Il progetto non è pronto per l'uso o la pubblicazione. Il WPS richiede il recupero delle specifiche originali e non è implementato.

## Avvio del server

Con Node.js 24 o successivo, eseguire `node server.mjs` da questa cartella. Il server ascolta solo su http://127.0.0.1:4317. Il database viene creato in data/ ed è escluso dal versionamento. PORT e PRIME_DB consentono di personalizzare porta e percorso del database.

## Perimetro da preservare

SaaS multi-tenant, ruoli, censimento vie/civici/piani/interni, rubrica condominiale con custode e amministratore, CRM, immobili, agenda e disponibilità visite, WPS, ricerca universale e contestuale, matching, pipeline, visite e feedback acquirenti, contratti, locazioni, dashboard, integrazioni esplicitamente non attive, doppio tema e interfaccia mobile-first.

Questa lista deriva dalla richiesta disponibile. Non sostituisce le specifiche complete della conversazione originale, ancora da recuperare.
