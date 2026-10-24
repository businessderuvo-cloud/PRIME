# Più campi telefono e social per persona

I pulsanti «+ Aggiungi numero» e «+ Aggiungi social» creano immediatamente nuove righe nella stessa scheda. Non aprono una scheda separata per ogni recapito. I numeri possono avere un'etichetta e il tipo telefono/WhatsApp; ogni profilo ha piattaforma, indirizzo e un'etichetta facoltativa.

Disponibile nel CRM, nell'aggiunta rapida di una persona all'appartamento e nella sezione delle persone della scheda immobile. Nel CRM e nel censimento si salva tutto insieme alla persona; dalla scheda immobile il pulsante dedicato salva telefoni e social della singola persona senza chiudere l'immobile.

Le righe nuove lasciate vuote vengono ignorate. Si possono rimuovere i campi appena aggiunti prima del salvataggio. I recapiti già esistenti sono mostrati come campi modificabili e rimangono collegati alla stessa persona nel CRM e negli appartamenti. La rimozione definitiva dei recapiti esistenti continua a essere gestita separatamente dai permessi CRUD.

Il backend salva persona e recapiti nella stessa transazione: errori di validazione, riferimenti ad altri tenant o versioni obsolete annullano l'intero salvataggio. Non rimane una persona salvata a metà con alcuni recapiti mancanti. Massimo 50 recapiti aggiuntivi per richiesta.

Verifiche: creazione con due numeri e due social, modifica di recapiti esistenti, rollback in presenza di URL non consentito, tentativo di riferirsi al recapito di un'altra agenzia e inserimento atomico dal censimento. I nuovi campi ricevono anche i pulsanti di dettatura.
