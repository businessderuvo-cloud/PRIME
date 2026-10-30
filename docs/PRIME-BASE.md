# PRIME Base (piano Standard)

Edizione distinta del gestionale: `npm run start:base` (oppure `node scripts/base-start.mjs`).
Indirizzo locale predefinito: http://127.0.0.1:4340. Archivio separato: `data/base/prime.sqlite`.
Nessun dato del gestionale completo viene copiato o modificato. La registrazione mantiene verifica email e sicurezza account; nessun accesso demo viene abilitato in produzione.

Comprende dashboard, ricerca contestuale e universale, censimento vie/civici/piani/appartamenti, foto, proprietari e contatti, CRM, matching, trattative, proposte, visite e feedback, documenti e locazioni, calendario interno, WPS con timer/esiti, dettatura, mobile e temi chiaro/scuro.

Esclude AI Assistant, Detective e arricchimento esterno, chiamate, importazioni da altri gestionali, posta e calendari esterni, portali, integrazioni esterne, firme elettroniche e contabilità/provvigioni. Le API interne necessarie al gestionale rimangono disponibili; quelle dei servizi esclusi restituiscono 403. I connettori non eseguono sincronizzazioni in background. I backup restano disponibili al titolare.

Due agenti umani inclusi, titolare compreso. Gli inviti pendenti occupano un posto. Il limite è controllato sul server, anche per inviti simultanei. Solo l'operatore può attivare posti aggiuntivi con `PRIME_BASE_EXTRA_SEATS`, dopo l'accordo commerciale: 50 €/mese per posto. Il browser non può cambiare edizione o limite.

Prezzo Standard: 53 €/mese oppure 530 €/anno; supporto via email a phoenix@primegestionale.it. Questa preparazione non crea automaticamente abbonamenti, pagamenti o un nuovo servizio Fly.

Per un'installazione dedicata usare il launcher Base e un volume/archivio dedicato; configurare normalmente URL pubblico, provider email e segreti di autenticazione. `PRIME_BASE_DB` cambia esclusivamente il percorso Base, `PORT` e `HOST` l'ascolto. Il servizio completo continua a usare il proprio avvio e archivio.

In un container dedicato si può usare l’avvio hosted esistente con `PRIME_EDITION=base` e `PRIME_DB` impostato sul volume dedicato. Il servizio principale deve mantenere la propria edizione completa.

## Upgrade

Il titolare trova **Piano e upgrade** nel menu. Pro, VIP ed Elite vengono confrontati con il ciclo mensile/annuale già pagato; Secret richiede preventivo. La differenza è il nuovo canone proporzionato al tempo residuo meno il credito del canone effettivamente pagato non utilizzato, arrotondati ai centesimi. Scadenza e periodicità non cambiano. Il preventivo riguarda il canone: consumi e servizi extra restano separati.

La migrazione 027 conserva il ciclo confermato in plan_subscriptions e i preventivi separati per agenzia in plan_upgrade_quotes. Le date e gli importi correnti devono provenire da una conferma di pagamento verificata, mai dal browser. Un preventivo dura al massimo 5 minuti; una revisione dell'abbonamento lo invalida. Solo il titolare con KYB approvato può procedere.

La richiesta è persistente e ripetibile senza creare un secondo upgrade. Il checkout deve essere una offerta Stripe emessa per lo specifico preventivo: configurazione server PRIME_STRIPE_UPGRADE_<ID_PREVENTIVO_MAIUSCOLO_CON_UNDERSCORE>_URL. Un normale link per il prezzo pieno non è utilizzato per il conguaglio. Senza tale configurazione la richiesta viene registrata, il cliente vede che l'assistenza deve predisporre il pagamento e nessun addebito o cambio di funzioni viene simulato.

Da completare con il collegamento Stripe: creazione automatica del conguaglio, verifica della notifica di pagamento, aggiornamento atomico dell'abbonamento e attivazione/accesso alla versione di destinazione Pro/VIP/Elite. Questa parte richiede le reali specifiche/credenziali merchant; nessun endpoint pubblico può auto-approvare pagamenti o cambiare edizione.


### Offerta crypto approvata — 27 ottobre 2026
Con crypto, un mese gratuito in più: sui piani mensili lo sconto equivalente a una mensilità ogni anno è distribuito sulle 12 mensilità e già incluso nel prezzo finale. Sui piani annuali si aggiunge ai 2 mesi gratuiti di base: 3 mesi gratuiti totali, già scontati nel prezzo finale.
La comunicazione commerciale è aggiornata; offerte merchant e importi effettivi nel checkout Stripe devono ancora essere configurati e verificati.
