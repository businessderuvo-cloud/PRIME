# PRIME VIP

Avvio locale separato: `npm run start:vip`, porta predefinita 4342, archivio `data/vip/prime.sqlite` (sostituibile con `PRIME_VIP_DB`). Il comando non copia archivi, account o credenziali di altre edizioni e non attiva pagamenti o abbonamenti AI.

VIP comprende gli strumenti Pro, Vanessa, chat operativa, copilot testuale/vocale e chiamate AI, con gli stessi permessi sui dati dell'agenzia. Team umano illimitato. Un agente AI incluso; ulteriori agenti richiedono attivazione a 100 €/mese ciascuno. La creazione gratuita del secondo agente, gli agenti personalizzati Elite e la gestione delle voci sono bloccati dal server per VIP.

Quote condivise per ciclo mensile: 1.238 minuti, 225 operazioni semplici, 50 indagini medie, 20 complesse. Le quote si rinnovano mensilmente anche con annuale. Oltre quota si applicano le tariffe in `public/pricing.js`: non è un blocco rigido. Il registro consumi richiede un abbonamento AI attivo; lo starter non ne inventa uno. Canone: 522 €/mese o 5.220 €/anno.

Nell'app condivisa in produzione occorrono piano VIP pagato attivo e abbonamento AI VIP attivo. Standard e Pro non ottengono accesso agli endpoint Vanessa. La distribuzione dedicata usa `PRIME_EDITION=vip`; la configurazione LIVE richiede almeno `PRIME_ELEVEN_API_KEY` e `PRIME_ELEVEN_LIVE_AGENT_ID`, con eventuale branch. Il provider e l'agente devono avere il tool `prime_workspace` correttamente configurato.

## Primo test copilot

Nell'app LIVE aprire Vanessa e scegliere **Copilot testuale · ascolto live**. Selezionare microfono e audio della scheda della chiamata, confermare il consenso e premere **Avvia ascolto · suggerimenti live**. Nel selettore del browser condividere la scheda della chiamata attivando l'audio. Vanessa riceve le sorgenti scelte e scrive suggerimenti live, senza riprodurre la propria voce.

Durante una simulazione chiedere al cliente zona, budget e caratteristiche; confrontare i suggerimenti con le schede reali. La modalità **Copilot vocale · chiamata** usa le stesse sorgenti e permette risposte anche vocali; usare auricolari per tenere private le risposte.

Entrambi i copilot possono consultare i dati e proporre creazioni, aggiornamenti o eliminazioni autorizzate. Le modifiche compaiono nel pannello **Modifiche proposte da Vanessa**: premere **Conferma e salva** per applicarle. L'agenzia, il ruolo, le versioni dei dati e i controlli sulle relazioni vengono verificati dal server.

Una chiamata sul solo telefono non viene catturata automaticamente dal PC: occorre una sorgente audio condivisibile nel browser. Il codice e i test locali non sostituiscono il collaudo con una chiamata reale per verificare microfono, audio remoto e latenza.
