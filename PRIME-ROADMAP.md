# PRIME — attività da completare

Aggiornato il 26 ottobre 2026. Requisiti concordati con il titolare del progetto.
Le attività sotto sono da realizzare o collegare: questa checklist non indica che siano già operative.

## 1. Vanessa nella pagina di presentazione

- [x] Collegare un agente dimostrativo di Vanessa alla pagina Sorelle Assistenti tramite richiamata SIP su richiesta.
- [ ] Sostituire lo stato “Chiamata in arrivo” con una conversazione vocale funzionante, mantenendo la foto di Vanessa durante la chiamata.
- [ ] Far presentare a Vanessa le proprie funzioni e le differenze rispetto a Veronica e tra i piani.
- [ ] Tenere la demo pubblica separata dagli agenti e dai dati delle agenzie.

Stato attuale: pagina, foto e video presenti; video di Vanessa tagliato per iniziare da “Sono Vanessa”. La chiamata demo non è collegata. La chat pubblica di Veronica è una demo guidata locale, non una chat generativa collegata a un agente reale.

## 2. Collegamento degli agenti reali ElevenLabs

- [ ] Collegare l’API già pronta fornita dal titolare per utilizzare i veri agenti ElevenLabs.
- [ ] Gestire avvio, conclusione e stato delle conversazioni degli agenti reali.
- [ ] Associare agenti, conversazioni e configurazioni alla rispettiva agenzia e al piano.
- [ ] Collegare minuti, operazioni, ricerche e agenti AI extra alle quote e al registro consumi; fatturare soltanto le eccedenze, con rinnovo mensile anche per gli abbonamenti annuali.
- [ ] Configurare il modello previsto dal titolare: GPT 6.1 nell’integrazione con ElevenLabs.

L’API è indicata come già pronta; il collegamento completo a questa versione di PRIME resta da fare. Non inserire chiavi o segreti nei file pubblici del sito.

## 3. Vanessa nel gestionale VIP ed Elite

- [ ] Integrare Vanessa nel gestionale reale VIP ed Elite; eventuale Secret Plan secondo la configurazione concordata su preventivo.
- [ ] Aggiungere la configurazione delle chiamate: istruzioni, obiettivo, presentazione, frasi da utilizzare e registro di cortesia, per esempio Lei o tu.
- [ ] Mantenere la personalità distinta di Vanessa: le istruzioni guidano cosa dire e come rivolgersi al cliente, senza sostituire la sua personalità.
- [ ] Per Elite, collegare anche la voce personalizzata, inclusa la voce autorizzata del titolare o di un agente.
- [ ] Permettere di fornire numeri di telefono da chiamare seguendo le istruzioni ricevute.
- [ ] Permettere a Vanessa di chiamare autonomamente i numeri trovati tramite Detective soltanto se preautorizzata dall’utente.
- [ ] Aggiungere la modalità copilot di chiamata: Vanessa affianca l’utente durante la conversazione con informazioni del gestionale e suggerimenti pertinenti.
- [ ] Aggiungere la risposta automatica alle telefonate in ingresso generiche, secondo le istruzioni e la configurazione dell’agenzia.
- [ ] Aggiungere la risposta automatica specifica per i numeri forniti dall’utente: riconoscere il chiamante e applicare le istruzioni dedicate a quel numero o contatto.
- [ ] Distinguere nella configurazione la modalità copilot, le chiamate autonome in uscita e la risposta automatica in ingresso.
- [ ] Registrare nel CRM chiamate, esiti, informazioni raccolte, riassunti e trascrizioni TXT.
- [ ] Permettere risposte alle domande usando le informazioni del gestionale accessibili all’account dell’agenzia.
- [ ] Collegare ricerche sul web e ricerche Detective agli strumenti dell’agente.
- [ ] Permettere l’acquisizione di informazioni e file e la loro integrazione nelle schede del gestionale.
- [ ] Estendere le operazioni dell’assistente sulle attività del gestionale: il requisito è un’assistente operativa, oltre alle sole risposte in chat.

## 4. Dominio, email e PEC di assistenza

- [ ] Scegliere e acquistare il dominio definitivo PRIME.
- [ ] Collegare dominio, DNS e HTTPS al sito e al gestionale pubblicati.
- [ ] Creare o collegare l’email ordinaria di assistenza.
- [ ] Creare o collegare la PEC di assistenza.
- [ ] Inserire i recapiti definitivi in sito, gestionale, contatti e informativa privacy.

Nessun dominio o indirizzo definitivo è stato ancora indicato in questa richiesta. Nessun acquisto è stato eseguito.

## 5. Collegamenti già in sospeso per l’attivazione commerciale

- [ ] Completare il collegamento reale della verifica aziendale KYB e del relativo esito approvato.
- [ ] Collegare il pagamento Stripe e gli eventi di pagamento/abbonamento ai piani effettivi.
- [ ] Collegare il registro consumi agli eventi reali degli agenti e alla fatturazione.
- [ ] Applicare il flusso registrazione → KYB approvato → scelta piano → pagamento; nessun acquisto prima dell’approvazione.
- [ ] Gestire l’attivazione di VIP, Elite e Secret entro un massimo di 24 ore conteggiate nei giorni lavorativi, escludendo sabati, domeniche e festivi, dopo verifica approvata e pagamento confermato.

## Ambienti da usare

- Gestionale dimostrativo originale: http://127.0.0.1:4319/
- Sorgenti della demo originale: C:/Users/deruv/Documents/Codex/2026-10-23/referenced-chatgpt-conversation-this-is-an/outputs/prime
- Landing e pagina Sorelle Assistenti: http://127.0.0.1:4328/
- Sorgenti della landing: C:/Users/deruv/Documents/Codex/prime-fly-release-39-01M5QSM2

Aggiornare il gestionale sulla demo originale 4319, non confonderlo con la copia del gestionale servita dalla landing sulla 4328.

Contatto di assistenza pubblicato: phoenix@primegestionale.it. Richiamata Vanessa: cellulare italiano, ramo dedicato, limiti giornalieri e consenso; prima telefonata reale da richiedere nel modulo dal proprietario del numero.
