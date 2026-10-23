# Architettura e piano di lavoro

## Analisi del punto di partenza

Il commit bf1bc9f conteneva un server Node.js 24 senza dipendenze, SQLite, autenticazione locale e un archivio JSON generico. Mancavano JavaScript/CSS del client e test. Il comando test puntava a un file inesistente. Le API non avevano modifica, concorrenza ottimistica o un modello di dominio normalizzato. I loghi ufficiali erano già presenti e vengono conservati.

## Scelta proposta per questo incremento

Conservare Node.js 24 e SQLite per il primo sviluppo locale, separando HTTP, database, validazione e interfaccia. Non introdurre un cambio di framework prima di rendere la base verificabile. Questa è una scelta implementativa locale, non un requisito commerciale approvato. Non è una configurazione SaaS di produzione: PostgreSQL, distribuzione, backup gestiti, posta transazionale e controlli operativi richiedono una fase dedicata.

API JSON riutilizzabili da futuri client mobile. Migrazioni SQL versionate. Tabelle relazionali per territorio, persone, immobili, WPS e appuntamenti. Ogni relazione di dominio comprende tenant_id: anche una chiave esterna non può collegare agenzie diverse. I dati legacy restano in records e non sono convertiti silenziosamente in entità di significato incerto.

Sessioni opache, hash dei token nel database, password scrypt asincrone con salt, cookie HttpOnly/SameSite e Secure in modalità produzione, verifica CSRF sulle mutazioni autenticate, controlli server dei ruoli e versionamento per prevenire sovrascritture concorrenti. Il titolare è owner, il responsabile manager, l'agente agent, l'esterno external. I vecchi admin/viewer sono migrati a manager/external. Il Super Admin Phoenix non è assegnato tramite registrazione: console e provisioning globale sono futuri.

WPS: attività operative con tipo, assegnatario, priorità, scadenza, obiettivo, avanzamento, esito, note e prossima azione. Un appuntamento può riferirsi a una sola attività WPS e viceversa. L'agenda legge gli appuntamenti esistenti: nessuna copia degli appuntamenti. Stato temporale dell'appuntamento separato dall'esito commerciale. Ricorrenze, assegnazione territoriale e disponibilità visite avanzate restano da implementare.

## Sequenza e criteri di verifica

1. Fondamenta: migrazioni idempotenti, accesso, isolamento tra tenant, ruoli, tema per utente, navigazione, ricerca universale/contestuale, audit e test negativi di accesso.
2. Territorio: completare città/zone/scale/piani, censimento rapido, storico dettagliato, rubrica stabile, mappe e offline con conflitti. Il primo incremento fornisce CRUD relazionali di vie, civici e interni; i livelli città/zona/scala/piano sono inizialmente attributi da normalizzare nella fase territoriale.
3. Operatività: ampliare CRM e immobili, completare WPS e agenda condivisa, disponibilità, feedback e matching. Il primo incremento offre attività WPS e appuntamenti collegati, senza dichiarare i moduli completi.
4. Commerciale: pipeline, offerte, contratti, locazioni, provvigioni e report con dati reali.
5. Ecosistema: Didit (mai Persona), Stripe, calendari, portali, altri connettori, aree esterne, AI e mobile. Tutti risultano non configurati finché non esiste un'integrazione verificata.

La specifica integrale in SPECIFICA-UFFICIALE.md resta il riferimento. Nessuna fase elimina requisiti futuri. Non è previsto un sistema di consegna o custodia delle chiavi degli immobili.
