# Territorio e appuntamenti — incremento 0.4

La voce unica «Vie e territorio» sostituisce le tre schermate separate. L'albero navigabile collega via, civico e appartamento; la scheda conserva il contesto selezionato. Si possono creare i tre livelli direttamente e cercare indirizzi, interni, persone, telefoni e recapiti collegati. Piano e scala restano attributi dell'appartamento.

Ogni civico comprende i recapiti condominiali e le foto del citofono. Ogni appartamento comprende piano, scala, superficie, locali, tipologia, condizioni e foto disponibili. Occupazione, stato commerciale e acquisizione restano distinti.

Le persone sono uniche nel CRM e possono essere collegate a più appartamenti come proprietari, comproprietari, inquilini, occupanti o delegati. Si può creare una persona e collegarla in un unico salvataggio oppure scegliere un contatto esistente. Telefono ed email principali si affiancano a recapiti aggiuntivi, WhatsApp e social. Canale, giorni e fascia oraria preferiti, professione, stato civile, presenza di figli, fonte e data di verifica sono facoltativi e inseriti manualmente. Nessuna informazione personale viene dedotta automaticamente.

Lo storico registra telemarketing, chiamate e altri contatti con autore, data, esito, note, prossima azione e data del richiamo. Se l'esito riguarda vendita o locazione, una scelta esplicita può aggiornare anche lo stato commerciale dell'appartamento nella stessa transazione. Il richiamo registrato non genera automaticamente un blocco WPS. Non sono attive telefonia o sincronizzazioni esterne.

Le foto sono accessibili solo agli utenti autorizzati dell'agenzia. Il browser ridimensiona e ricodifica i file a JPEG fino a 1600 pixel, eliminando i metadati originali; il server convalida formato e contenuto (JPEG/PNG/WebP, massimo 8 MB) e memorizza i file fuori dalle risorse pubbliche. Ogni foto appartiene a un civico oppure a un appartamento. I dati e i file caricati sono esclusi da Git. Nessuna foto immobiliare dimostrativa viene spacciata per un'immagine reale.

L'Agenda appuntamenti propone quattro scelte rapide: 1ª visita immobile, 2ª visita immobile, servizio fotografico immobile e appuntamento con proprietario. Il nome/titolo è facoltativo: quando vuoto viene ricavato dal tipo. Resta disponibile «altro» per casi personalizzati. Gli appuntamenti precedenti vengono conservati dalla migrazione, senza attribuire un nuovo tipo arbitrario.

## Verifiche

31 test automatici complessivi: includono titolo facoltativo, creazione atomica persona/relazione, riuso CRM, isolamento tra agenzie, validazione orari e recapiti, storico con aggiornamento commerciale e conflitti di versione, upload, autorizzazione e rimozione foto. Le prove browser su database demo separato comprendono censimento gerarchico, proprietario con preferenze, telemarketing, caricamento foto e appuntamento senza titolo. Il file fotografico usato per la prova è stato rimosso.

Restano aperti i limiti generali elencati in STATO.md: identità e team di produzione, censimento offline, mappe, ricorrenze, matching e moduli commerciali avanzati.
