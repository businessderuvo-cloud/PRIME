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
