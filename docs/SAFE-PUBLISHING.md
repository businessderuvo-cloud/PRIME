# Pubblicazioni coordinate PRIME

Tutte le pubblicazioni sull'app `prime-gestionale-deruvo` devono usare `scripts/deploy-safe.mjs`. La coda è condivisa tra checkout e chat dello stesso computer. Non usare direttamente `fly deploy` e non costruire hotfix da un'immagine salvata in una chat precedente.

## Preparare una modifica

Prima di modificare i file da pubblicare, acquisire la versione live:

```powershell
node scripts/deploy-safe.mjs snapshot --app prime-gestionale-deruvo --dir work/my-change --file public/landing.html --file public/landing.js --file public/landing-composition.css
```

Lo snapshot contiene la base immutabile in `snapshot.json` e le copie da modificare in `files/`. Per un file nuovo, indicarlo comunque con `--file` e crearlo in `files/`. Non copiare un intero checkout obsoleto sopra queste copie: applicare solo la modifica richiesta. Scegliere una cartella nuova per ogni intervento.

## Pubblicare

```powershell
node scripts/deploy-safe.mjs publish --dir work/my-change
```

Il comando attende che termini la pubblicazione precedente, legge l'immagine e i file live, unisce le modifiche alla base mediante confronto a tre versioni, costruisce sopra l'immagine attuale e ricontrolla la base prima del rilascio. Se nel frattempo un deploy esterno cambia l'immagine, ricompone il pacchetto. Dopo il rilascio verifica versione e contenuto dei file sul server.

File diversi si sommano; modifiche indipendenti allo stesso file si uniscono. Modifiche sovrapposte e collisioni binarie si fermano, lasciando un file `.conflict` nella cartella di lavoro. Risolvere il conflitto applicando le modifiche alla versione live in un nuovo snapshot. Non cancellare manualmente il blocco di un deploy attivo.

La coda e il registro sono in `Documents/Codex/.prime-deploy/`; il registro contiene percorsi, impronte e stato, senza credenziali. Un blocco abbandonato viene recuperato solo se sia il processo proprietario sia l'eventuale processo Fly sono terminati.

## Limiti

Tutte le chat di questo computer devono usare questo comando. Un `fly deploy` manuale o un rilascio da un altro computer non partecipa al blocco locale. Il controllo della versione rileva cambiamenti durante la preparazione, ma non può impedire a un altro client Fly di sostituire successivamente l'immagine. Per più computer occorre una sola pipeline CI con coda server. Non si pubblicano database, `.env`, segreti o rimozioni di file con questo comando.

Gli aggiornamenti dei pacchetti richiedono di includere entrambi i manifesti e vengono installati nel build. Le migrazioni restano soggette alle normali verifiche di compatibilità e reversibilità.
