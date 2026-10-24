# Agenda appuntamenti e WPS orario — incremento 0.3

Questa estensione recepisce la richiesta dell'utente: agenda su griglia visiva e WPS per suddividere i compiti della giornata ora per ora, con timer ed esito obbligatorio. Integra la specifica ufficiale, senza sostituirla.

## Agenda appuntamenti

La navigazione e il titolo usano “Agenda appuntamenti”. Gli eventi sono posizionati su una griglia di giorni e ore: la loro altezza dipende dalla durata. Sono disponibili giorno/settimana, avanti/indietro, oggi, selezione data, ricerca e filtro agente. Gli stati hanno indicatori distinti, il giorno attuale è evidenziato e una linea mostra l'ora corrente. Più eventi sovrapposti di agenti differenti si affiancano. Una fascia vuota apre una scheda con orario precompilato; un evento esistente apre la modifica. Il server continua a bloccare sovrapposizioni dello stesso agente o dello stesso immobile.

## WPS

Ogni compito ha inizio e fine espliciti, oltre a tipo, agente, priorità, obiettivi, avanzamento, note e riferimenti operativi. La vista iniziale è la giornata dell'utente autenticato; si può passare alla settimana e filtrare gli altri agenti autorizzati. Le fasce dello stesso agente non possono sovrapporsi; due blocchi adiacenti sono ammessi.

Il timer principale mostra il tempo residuo del blocco in corso. Durante un blocco è visibile anche la prossima attività con il conto alla rovescia al suo inizio. Se non c'è un blocco corrente, il timer principale indica quanto manca alla prossima attività. Il timer segue l'utente autenticato: selezionare un altro agente nella griglia non cambia la persona cui si riferisce il timer.

Alla fine di un blocco ancora aperto compare una richiesta di esito. Per registrarlo l'utente sceglie **completata** oppure **non completata**, scrive il risultato/motivo ed eventualmente aggiorna la prossima azione. La X e il tasto Escape chiudono il pannello senza modificare l'attività; dopo la chiusura non viene riproposto automaticamente durante questa apertura dell'applicazione. Il banner e il WPS permettono di registrare l'esito più tardi. Se un'altra scheda è già aperta, il banner segnala la scadenza e la richiesta viene proposta alla sua chiusura, evitando di perdere dati non salvati. Non esiste completamento automatico. I blocchi non completati sono conservati come tali, con autore, versione ed esito. Una futura ripianificazione va registrata come nuovo blocco, preservando quello precedente.

Le attività scadute sono ricavate dalle date e dallo stato nel database: riaprire o aggiornare l'app non le fa sparire. Il browser controlla il tempo ogni secondo e aggiorna i dati dell'utente dal server ogni 30 secondi. Le sospensioni della scheda non rallentano artificialmente il conto alla rovescia: il valore viene ricalcolato dall'ora assoluta, compensata con l'ora del server al login. Con l'app chiusa non viene eseguito un timer in background e non vengono inviate notifiche esterne: al ritorno sono riproposti gli esiti ancora da registrare.

## Appuntamenti collegati

Rimane un solo record di appuntamento, referenziato dall'attività WPS. Quando un incontro è collegato, gli orari del blocco sono sincronizzati in transazione con quelli dell'appuntamento. Le modifiche orarie passano dall'Agenda appuntamenti e incrementano anche la versione del WPS e il suo storico. Il WPS mostra gli orari collegati come non modificabili e permette di aprire l'appuntamento. Le altre informazioni di lavoro restano modificabili. I controlli impediscono una riprogrammazione che invada un altro blocco WPS.

Lo stato del compito WPS rimane distinto dallo stato e dall'esito commerciale dell'appuntamento: dichiarare un compito non completato non inventa un esito dell'incontro.

## Migrazione e dati precedenti

La migrazione 003 conserva identificativi e collegamenti. I vecchi compiti senza inizio ricevono un blocco iniziale proposto di 60 minuti che termina alla scadenza esistente. Per i compiti collegati a un appuntamento vengono usati invece gli orari reali dell'appuntamento. Questa durata iniziale è un valore di migrazione modificabile, non una regola commerciale. Le sovrapposizioni pregresse non vengono eliminate silenziosamente: possono essere corrette dall'utente e non impediscono di registrare l'esito se la fascia rimane invariata.

## Verifiche

26 test automatici: i 19 precedenti più conservazione dei collegamenti nella migrazione, stati del timer e ripresa dopo scadenza, ordine della coda, griglia con eventi affiancati e passaggio a mezzanotte, validazione fasce e adiacenze, esito non completato persistente, riprogrammazione atomica agenda/WPS e conflitti. Verifiche browser su creazione da fascia, conto alla rovescia, richiesta effettiva alla scadenza, conferma “non completata” e timer dell'attività successiva.

Restano fuori da questo incremento ricorrenze, vista mese, trascinamento degli eventi, disponibilità visite avanzate, promemoria esterni e calendari di terze parti.
