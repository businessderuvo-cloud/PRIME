# Accesso personale alla demo Elite

L’accesso persistente è disponibile solo sull’istanza con PRIME_EDITION=elite e se esiste il file private-demo-access.json nel volume dati. La demo pubblica clienti non accetta questo ingresso.

Lo script node scripts/setup-private-demo.mjs crea un’agenzia dimostrativa separata, un titolare demo.elite@prime.example e una password casuale. Non cambia le password degli account esistenti. La password usa scrypt con sale casuale; il file sul server conserva solo l’hash SHA-256 del token personale. La procedura si ferma se un accesso è già configurato.

Il link personale trasporta il token nel frammento URL. La pagina elimina subito il frammento dalla barra e invia il token con POST al proprio server. La sessione è HttpOnly, SameSite=Strict e Secure su Fly, con durata di un anno. Il volume conserva il file e le sessioni tra i deploy. Uscire manualmente o cancellare i cookie richiede un nuovo ingresso dal link o dalla password. Non condividere il link con i visitatori della demo pubblica.

Per revocare l’ingresso, rimuovere il file dal volume e cancellare le sessioni del solo userId indicato nel file. Il login con password continua a funzionare; per revocare anche quello cambiare o disabilitare l’account dedicato. Se l’account attiva la verifica a due fattori, il link automatico smette di essere accettato.

## Copilot live

Il copilot vocale attende i metadati ElevenLabs prima di inviare audio, usa i formati PCM o mu-law negoziati e interrompe la riproduzione quando l’utente interviene. La condivisione della scheda mantiene attiva la traccia video fino alla fine della sessione; il monitor Zadarma viene clonato per non fermare la chiamata originale. Le sorgenti vengono acquisite solo dopo clic e consenso dell’operatore.

La demo pubblica clienti rimane solo chat con controlli voce/copilot disabilitati. Le demo live private usano l’agente ElevenLabs LIVE, compresa la configurazione sul ramo LIVE quando presente.

Verifica: node --test private-demo-access.test.mjs copilot-audio.test.mjs customer-demo.test.mjs elite.test.mjs
