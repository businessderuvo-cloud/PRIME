# PRIME — ISTRUZIONI UFFICIALI PER CODEX

## 1. OBIETTIVO DEL PROGETTO

Devi sviluppare **PRIME**, un gestionale immobiliare professionale, completo, moderno e funzionante, destinato principalmente ad agenzie immobiliari indipendenti.

Non devi creare una semplice dashboard dimostrativa o un sito vetrina. Devi realizzare un'applicazione SaaS multiutente e multi-agenzia, dotata di database persistente, autenticazione, permessi, interfaccia responsive e moduli operativi realmente collegati.

**Regola fondamentale:** non inventare il funzionamento delle funzioni di settore quando le specifiche sono già definite. Non eliminare moduli per semplificare arbitrariamente il lavoro.

Lavora per fasi verificabili, mantenendo il progetto sempre avviabile.

## 2. IDENTITÀ VISIVA E GRAFICA

PRIME deve avere un design **Luxury Minimalist**: estremamente elegante, raffinato, professionale, intuitivo e veloce.

Sono obbligatori due temi:

**Tema scuro**
- Sfondo nero/carbonio.
- Testi bianchi.
- Accenti argento e grigio.
- Utilizzare il logo ufficiale PRIME bianco/argento su sfondo nero.

**Tema chiaro**
- Sfondo bianco.
- Testi neri.
- Accenti grigio perla e antracite.
- Utilizzare il logo ufficiale PRIME nero su sfondo bianco.

Usa i due file immagine ufficiali già allegati. Non ricreare il logo usando una normale lettera M: **la M è composta da due case stilizzate**.

Caratteristiche dell'interfaccia:

- Menu laterale richiudibile su desktop.
- Navigazione ottimizzata per smartphone e tablet.
- Barra di ricerca universale sempre accessibile.
- **Barra di ricerca dedicata in OGNI sezione**.
- Pulsante rapido per creare nuovi record.
- Tipografia moderna, preferibilmente Inter o Manrope.
- Spaziature ordinate, animazioni discrete, ottima leggibilità.
- Salvataggio sicuro e gestione esplicita degli errori.
- Scelta tema persistente per ogni utente.
- Tutta l'interfaccia in italiano.

Niente pulsanti decorativi che non funzionano. Nessuna schermata fittizia presentata come completa.

## 3. ARCHITETTURA

Progetta PRIME come piattaforma SaaS multi-tenant.

Ogni agenzia dispone di un proprio ambiente, con dati rigorosamente isolati dalle altre agenzie.

Ruoli:

- Super Admin Phoenix.
- Titolare dell'agenzia.
- Responsabile di filiale, ove previsto.
- Agente immobiliare.
- Eventuali utenti esterni con accesso limitato, come proprietari e acquirenti.

Il titolare può invitare agenti, assegnare ruoli, territori e permessi.

Registrazione agenzie con integrazione **Didit per la verifica KYB**, da predisporre correttamente. Non utilizzare Persona al suo posto.

Prevedi autenticazione sicura, recupero password, verifica email, 2FA, audit log, protezioni GDPR, backup e gestione delle autorizzazioni lato server.

Non implementare credenziali o verifiche false: le integrazioni esterne prive di chiavi devono risultare non configurate.

Per il primo sviluppo web puoi utilizzare uno stack coerente e mantenibile, ad esempio Next.js, TypeScript, PostgreSQL, Prisma e un sistema di autenticazione affidabile. Documenta le scelte prima di procedere. Mantieni l'architettura adatta a future applicazioni Android e iOS che condividano lo stesso backend.

## 4. MODULO WPS — ATTENZIONE, LEGGERE

**WPS NON è un semplice elenco di attività.**

Il WPS è il sistema di pianificazione e organizzazione operativa della giornata lavorativa di ogni agente.

Deve funzionare come un'agenda operativa strutturata per il lavoro immobiliare.

Comprende:

- Programmazione giornaliera e settimanale.
- Chiamate da effettuare.
- Richiami programmati.
- Porta a porta.
- Censimento territoriale.
- Acquisizione di immobili.
- Appuntamenti con proprietari.
- Visite con acquirenti.
- Trattative e attività successive.
- Attività ricorrenti.
- Priorità e scadenze.
- Obiettivi e avanzamento del lavoro.
- Attività assegnate dal titolare o dal responsabile.
- Registrazione dell'esito di ogni attività.
- Note e azioni successive.

Ogni attività può collegarsi a:

- Un agente.
- Una via o un civico.
- Uno specifico appartamento.
- Un proprietario o acquirente.
- Un immobile in gestione.
- Una trattativa.

Il WPS deve integrarsi con agenda, CRM, censimento e dashboard.

**Differenza fondamentale:**

Il WPS organizza COSA deve fare l'agente e ne registra i risultati.

L'agenda organizza QUANDO avvengono appuntamenti, visite e incontri.

Non creare duplicazioni di appuntamenti fra i due moduli: devono condividere i dati sottostanti.

Il significato esteso dell'acronimo WPS non è ancora stato stabilito; non inventarlo.

## 5. CENSIMENTO TERRITORIALE — MODULO CENTRALE

Questo è uno degli elementi più importanti di PRIME.

Deve permettere la gestione gerarchica:

**Città → Zona/Quartiere → Via → Numero civico/Stabile → Scala → Piano → Appartamento/Interno.**

Per ogni via:

- Ricerca immediata.
- Elenco civici.
- Stato del censimento.
- Agenti assegnati.
- Ultima attività effettuata.
- Filtri e ordinamenti.

Per ogni stabile:

- Indirizzo e posizione sulla mappa.
- Fotografia dei citofoni, quando legittimamente acquisita.
- Numero scale e piani.
- Numero appartamenti conosciuti.
- Ascensore.
- Riscaldamento.
- Accessibilità.
- Caratteristiche dello stabile.
- Informazioni e lavori condominiali.
- Spese condominiali conosciute.
- **Numero telefonico del custode/portineria.**
- Nome e orari del custode, se disponibili.
- **Numero telefonico dell'amministratore condominiale.**
- Nome dello studio, referente ed email.
- Cronologia dei contatti con custode e amministratore.
- Fonte e data di verifica dei recapiti.

I recapiti condominiali sono informazioni dello **stabile**, non vanno duplicati in ogni appartamento.

Per ogni appartamento:

- Piano, interno e scala.
- Tipologia e caratteristiche.
- Superficie, locali, stato e altri attributi.
- Fotografie e documenti consentiti.
- Proprietari e comproprietari.
- Eventuali inquilini.
- Stato di occupazione.
- Stato commerciale.
- Eventuali altre agenzie che lo gestiscono.
- Opportunità di acquisizione.
- Storico del censimento.
- Chiamate e attività di porta a porta.
- Note degli agenti.
- Data e autore di ogni aggiornamento.

Gli stati di occupazione, commercializzazione e acquisizione devono essere **campi distinti**, non un unico stato ambiguo.

### Ricerca nella sezione Vie

È obbligatoria una barra di ricerca dedicata, particolarmente veloce.

Deve supportare:

- Nome della via, anche parziale.
- Via e civico insieme.
- Città, CAP e quartiere.
- Piano e interno.
- Ricerca progressiva durante la digitazione.
- Suggerimenti e risultati pertinenti.
- Filtri per strade censite, parzialmente censite e da censire.
- Accesso diretto al civico.
- Ultima posizione di lavoro dell'agente.
- Ricerche e filtri salvati.

### Censimento Rapido

Realizza una modalità mobile per il porta a porta.

L'agente deve poter aprire una via, selezionare civico, piano e appartamento, annotare l'esito, registrare una richiamata e passare immediatamente all'appartamento successivo.

Prevedi note vocali con trascrizione quando il servizio è disponibile.

Supporta lavoro offline sulle informazioni autorizzate, sincronizzazione e gestione dei conflitti.

## 6. IMMOBILI IN GESTIONE

La sezione degli immobili affidati all'agenzia deve essere **separata dal censimento territoriale**, pur condividendo gli stessi dati immobiliari quando pertinente.

Funzioni:

- Anagrafica immobile.
- Proprietari, comproprietari e delegati.
- Incarichi, mandato, esclusiva e scadenze.
- Foto, planimetrie e documenti.
- Descrizione commerciale.
- Prezzo e cronologia variazioni.
- Superficie e tipologia.
- Piano, locali, garage, balcone, terrazzo e altre caratteristiche.
- Disponibilità per le visite.
- Annunci e pubblicazioni.
- Agente responsabile.
- Provvigioni.
- Stato della commercializzazione.
- Checklist di vendita.
- Controllo dei dati mancanti e delle schede incomplete.

Filtri avanzati combinabili, ad esempio trilocali in una determinata zona sotto una determinata cifra e con garage.

### Disponibilità visite

**Le chiavi degli immobili rimangono sempre presso l'agenzia.**

NON sviluppare sistemi per registrare chi possiede le chiavi, consegne, ritiri o restituzioni.

Bisogna registrare soltanto:

- Giorni disponibili per le visite.
- Fasce orarie.
- Restrizioni concordate.
- Prenotazioni esistenti.
- Eccezioni e disponibilità ricorrenti.

Il tutto sincronizzato con l'agenda.

## 7. CRM COMPLETO

Anagrafiche per:

- Proprietari.
- Comproprietari.
- Inquilini.
- Acquirenti.
- Potenziali clienti.
- Altri interlocutori professionali.

Registrare recapiti, provenienza del contatto, assegnazione agente, preferenze, note, consensi ove necessari, storico e follow-up.

Prevenire i duplicati tra persone, recapiti e immobili.

### CRM degli acquirenti

Ogni acquirente deve avere:

- Budget.
- Zone preferite.
- Superficie desiderata.
- Numero locali.
- Piano preferito.
- Garage e altre caratteristiche richieste.
- Immobili richiesti.
- Immobili proposti.
- Immobili visitati.
- Impressioni e preferenze aggiornate.
- Obiezioni e motivi di rifiuto.
- Appuntamenti.
- Richiami e prossime azioni.

**Regola fondamentale: dopo ogni visita effettuata, l'agente deve poter registrare il feedback dell'acquirente.**

PRIME deve conservare:

- Quale immobile è stato visitato.
- Quando e con quale agente.
- Esito della visita.
- Cosa è piaciuto.
- Cosa non è piaciuto.
- Motivi specifici di rifiuto.
- Interesse a una seconda visita.
- Necessità di richiamare.

La cronologia serve a evitare che il software riproponga erroneamente immobili già visitati e rifiutati o incompatibili.

Le nuove preferenze suggerite dal feedback devono essere confermate dall'agente prima di diventare vincoli rigidi.

## 8. AGENDA CONDIVISA E APPUNTAMENTI

Calendario per agenti, filiali e agenzia.

- Appuntamenti e visite.
- Vista giorno/settimana/mese.
- Filtri per agente.
- Promemoria.
- Verifica disponibilità.
- Prevenzione sovrapposizioni.
- Riprogrammazione.
- Collegamento ai clienti e agli immobili.
- Integrazione con Google Calendar e calendari Apple, mediante meccanismi supportati.

Distinguere **stato dell'appuntamento** ed **esito commerciale**.

Stati previsti: da confermare, confermato, effettuato, riprogrammato, saltato, annullato.

Esiti previsti per appuntamenti effettuati: positivo, negativo, da valutare.

Un appuntamento effettuato con esito negativo rimane effettuato.

Gli appuntamenti saltati non devono risultare effettuati.

Preservare la cronologia anche in caso di riprogrammazione.

## 9. MAPPA IMMOBILIARE

Mappa interattiva con immobili e territori.

Deve mostrare, tramite indicatori distinti:

- Immobili in gestione.
- Immobili in trattativa.
- Opportunità di acquisizione.
- Immobili censiti.
- Immobili segnalati presso altre agenzie.
- Zone di competenza degli agenti.

Filtri per tipologia, zona, stato, prezzo e agente.

Collegamento diretto tra mappa, civici e schede.

## 10. TRATTATIVE, OFFERTE E VENDITE

Pipeline commerciale completa:

Contatto → Valutazione → Acquisizione → Incarico → Visite → Proposta → Controproposta → Preliminare → Rogito.

Gestire:

- Più proposte sullo stesso immobile.
- Prezzi offerti.
- Condizioni.
- Caparre.
- Scadenze.
- Accettazioni e rifiuti.
- Controproposte.
- Documentazione.
- Provvigioni.
- Responsabili.
- Storico della trattativa.

Prevedere anche workflow per la locazione.

## 11. VALUTAZIONI E PROVVIGIONI

Strumenti di stima con prezzi al metro quadrato, immobili comparabili e intervalli di valore, specificando fonti e limiti dei dati.

Gestione provvigioni con percentuali configurabili, quote dell'agenzia e degli agenti.

Distinguere provvigioni previste, maturate, fatturate e incassate.

Statistiche economiche filtrabili per periodo, agente e agenzia.

## 12. LOCAZIONI

Modulo per:

- Immobili in affitto.
- Canoni.
- Cauzioni.
- Conduttori.
- Contratti.
- Date di decorrenza e scadenza.
- Rinnovi.
- Disdette.
- Promemoria.
- Provvigioni relative alle locazioni.

## 13. DASHBOARD E REPORT

Dashboard differenti secondo il ruolo.

Indicatori principali:

- Immobili gestiti.
- Immobili venduti.
- Immobili in trattativa.
- Opportunità di acquisizione.
- Immobili censiti.
- Attività del WPS.
- Appuntamenti effettuati e saltati.
- Visite positive e negative.
- Nuovi contatti.
- Conversioni.
- Fatturato lordo.
- Provvigioni previste e incassate.
- Risultati per agente e territorio.

Filtri giornalieri, settimanali, mensili, annuali e personalizzati.

Non usare statistiche finte: utilizzare esclusivamente dati realmente presenti nel database, tranne nei dati demo chiaramente identificati.

## 14. DOCUMENTI E CONTROLLI

Gestione:

- Incarichi.
- Proposte.
- Controproposte.
- Contratti.
- Planimetrie.
- APE.
- Documenti catastali.
- Scadenze.
- Documentazione necessaria alle operazioni.
- Integrazioni per firma elettronica.

File protetti da autorizzazioni.

Audit log delle modifiche.

Predisposizione ai processi di identificazione e antiriciclaggio applicabili. La verifica KYB tramite Didit non sostituisce automaticamente gli obblighi AML.

## 15. COMUNICAZIONI E INTEGRAZIONI

Creare un modulo PRIME Connect.

Prevedere integrazioni configurabili con:

- Portali immobiliari, tramite API o feed effettivamente disponibili.
- Google Calendar.
- Calendari Apple.
- Email.
- WhatsApp Business API.
- Telefonia/VoIP.
- Datagma per servizi compatibili con licenze e normativa.
- Mappe.
- Firma elettronica.
- Stripe.
- Didit.
- Zapier, Make e n8n.

Casella comunicazioni unificata quando i fornitori consentono l'accesso ai messaggi.

Non supporre che ogni portale supporti pubblicazione, statistiche in tempo reale o risposta automatica tramite API.

Gestire errori di sincronizzazione, disconnessioni, permessi e limiti API.

## 16. FUNZIONALITÀ COMMERCIALI AGGIUNTIVE

Implementare progressivamente:

- Ricerca universale e ricerche dedicate in tutti i moduli.
- Ricerche e filtri salvati.
- Esportazione e importazione CSV/Excel.
- Verifica e prevenzione duplicati.
- Timeline cronologica unificata.
- Gestione contatti inattivi e da non ricontattare.
- Coordinamento e assegnazione zone agli agenti.
- Collaborazione controllata tra agenzie.
- Vetrina immobiliare integrabile nel sito dell'agenzia.
- Area riservata proprietari.
- Area riservata acquirenti.
- Notifiche e promemoria.
- Centro assistenza e onboarding.

Ogni sezione deve avere una propria ricerca pertinente al contesto.

## 17. ABBONAMENTI E FATTURAZIONE

Piani approvati:

**PRIME Start — €50/mese**
- Fino a 2 utenti totali, titolare incluso.
- Funzionalità gestionali standard complete.
- Nessun AI Assistant Pro.

**PRIME Pro — €100/mese**
- Fino a 10 utenti totali, titolare incluso.
- Funzionalità gestionali complete.
- AI Assistant incluso.

**Utenti aggiuntivi oltre i 10:** €25/mese ciascuno.

Il prezzo annuale e l'eventuale sconto annuale non sono ancora stati approvati.

Predisporre l'integrazione Stripe per fatturazione e gestione degli abbonamenti, con verifica delle regole applicabili a Google Play e App Store.

I limiti utenti devono essere applicati dal backend, non soltanto dall'interfaccia.

## 18. INTELLIGENZA ARTIFICIALE

Distinguere due prodotti differenti.

**AI Assistant — PRIME Pro**

Assistente contestuale capace, nei limiti delle autorizzazioni dell'utente, di:

- Cercare immobili tramite linguaggio naturale.
- Suggerire immobili compatibili.
- Consultare il CRM.
- Riassumere visite e attività.
- Aiutare a organizzare il WPS.
- Preparare descrizioni degli annunci.
- Analizzare i dati dell'agenzia.

**PRIME AI Agents — prodotto premium futuro**

Prezzo di partenza previsto: €500/mese, gestionale incluso.

Fasce superiori da €1.000/mese e oltre.

Il futuro prodotto potrà comprendere agenti vocali, chiamate assistite, ricerche autorizzate, aggiornamenti CRM e follow-up automatizzati.

La progettazione dettagliata di consumi, crediti, chiamate e limiti è rinviata.

Non realizzare adesso infrastrutture costose per gli agenti vocali. Limitati a predisporre un'architettura estensibile.

Qualsiasi funzionalità di contatto automatico dovrà rispettare consenso, privacy e regole applicabili alle comunicazioni commerciali.

## 19. ORDINE DI SVILUPPO

Procedi in questo ordine:

**Fase 1 — Fondamenta**
- Analisi del repository esistente.
- Architettura.
- Database e migrazioni.
- Autenticazione.
- Multi-tenancy.
- Ruoli e permessi.
- Design system e doppio tema.
- Navigazione principale.
- Ricerca universale e componenti di ricerca contestuale.

**Fase 2 — Gestione territoriale**
- Vie.
- Civici e stabili.
- Scale, piani e appartamenti.
- Contatti condominiali.
- Censimento e storico.
- Censimento Rapido.
- Mappa.

**Fase 3 — Operatività**
- CRM.
- Immobili in gestione.
- WPS.
- Agenda.
- Disponibilità visite.
- Storico attività.
- Feedback acquirenti.
- Matching.

**Fase 4 — Gestione commerciale**
- Trattative.
- Offerte.
- Contratti.
- Locazioni.
- Provvigioni.
- Report.
- Dashboard approfondita.

**Fase 5 — Ecosistema**
- Integrazioni.
- Pubblicazione immobiliare.
- Aree proprietari/acquirenti.
- Abbonamenti.
- AI Assistant.
- Versioni mobile.
- Personalizzazioni per clienti.

Queste fasi sono una sequenza di implementazione, non un'autorizzazione a eliminare funzionalità.

## 20. REGOLE DI LAVORO OBBLIGATORIE

1. Prima di modificare il codice, controlla la struttura del progetto esistente.
2. Non cancellare altri progetti Phoenix.
3. Mantieni PRIME in un progetto/repository separato.
4. Non sovrascrivere lavoro esistente senza analizzarlo.
5. Progetta database normalizzato e relazioni coerenti.
6. Non duplicare persone, immobili o appuntamenti in moduli differenti.
7. Isola rigorosamente i dati di ciascuna agenzia.
8. Applica autorizzazioni e validazioni anche nel backend.
9. Non inserire password, token o chiavi API nel codice.
10. Non simulare funzionalità reali senza indicarlo chiaramente.
11. Usa dati demo soltanto in un ambiente demo distinto.
12. Scrivi migrazioni, validazioni, test e documentazione.
13. Verifica le operazioni CRUD, le ricerche e i collegamenti fra moduli.
14. Cura responsive design, accessibilità e tempi di risposta.
15. Mantieni una lista delle funzionalità completate, parziali e mancanti.
16. Se una decisione non è stata approvata, dichiarala come proposta e non come requisito definitivo.
17. Non limitarti a descrivere il codice: implementalo e verifica che funzioni.
18. Non dichiarare completato un modulo finché non sono operativi almeno i suoi flussi essenziali e i relativi controlli di accesso.
19. Alla fine di ogni fase, mostra cosa è stato effettivamente sviluppato, quali test sono stati eseguiti e quali problemi rimangono.
20. Privilegia sempre la qualità, la semplicità d'uso e la coerenza tra i moduli.

## 21. PRIMA AZIONE DA ESEGUIRE ADESSO

Non ricominciare il progetto da zero se esiste già del codice valido.

Prima:

1. Esamina i file e il repository di PRIME.
2. Identifica lo stack utilizzato e lo stato del lavoro.
3. Confronta ciò che esiste con questa specifica.
4. Individua le funzionalità mancanti e i problemi architetturali.
5. Prepara un piano di implementazione per fasi.
6. Inizia immediatamente a implementare la prima parte mancante delle fondamenta.
7. Esegui i test disponibili e indica il risultato.

**Il prodotto finale deve essere un gestionale immobiliare concreto, utilizzabile, completo, elegante e professionale. Il WPS e il censimento territoriale sono parti centrali del progetto, non funzioni secondarie.**

Questa specifica costituisce la base di riferimento per le successive sessioni di sviluppo PRIME.
