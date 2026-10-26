# Distribuzione PRIME su Fly.io

Aggiornamento del 26 ottobre 2026: landing e gestionale riuniti nello stesso servizio.

- Landing: https://prime-gestionale-deruvo.fly.dev/
- Gestionale: https://prime-gestionale-deruvo.fly.dev/app
- Sorelle Assistenti: https://prime-gestionale-deruvo.fly.dev/sorelle-assistenti
- Repository: https://github.com/businessderuvo-cloud/PRIME

La distribuzione conserva il volume esistente prime_data e il database /data/prime.sqlite. Una sola macchina shared CPU da 512 MB nella regione cdg; nessun nuovo servizio database. Prima dell'aggiornamento è stato creato uno snapshot del volume. Le migrazioni sono additive e mantengono le migrazioni storiche presenti sul server.

Comando di distribuzione: fly deploy --remote-only --ha=false.

Il contenitore usa Node 24 e un utente non privilegiato. Database, upload, backup e chiavi restano nel volume, esclusi da immagine e GitHub. Il repository è pubblico: non inserire credenziali o dati delle agenzie. I segreti dei provider vanno configurati in Fly secrets o tramite il flusso protetto dell'app.

Verifiche prima della distribuzione: 87 test automatici superati e controllo sintattico dei moduli. Sono coperti autenticazione, separazione agenzie, importazioni, backup, documenti scaduti, simulatore, pagamenti bloccati prima del KYB e streaming dei video.

Restano da collegare i servizi indicati in PRIME-ROADMAP.md: agente vocale Vanessa, effettivi eventi di consumo e offerte di pagamento, dominio e posta. La verifica email in produzione richiede PRIME_RESEND_API_KEY e PRIME_EMAIL_FROM su dominio verificato; finché non configurati l'invio rimane indisponibile. La demo pubblica di Veronica usa risposte guidate e la chiamata Vanessa resta in arrivo.

PRIME_PUBLIC_URL deve corrispondere all'origine HTTPS. Dopo il collegamento del dominio aggiornare anche i callback OAuth presso i provider configurati, senza rimuovere quelli attuali finché il passaggio non è completato.

Dominio configurato il 26 ottobre 2026: https://primegestionale.it e https://www.primegestionale.it. A e AAAA puntano agli indirizzi pubblici Fly; www segue il dominio principale tramite CNAME. Record email e PEC conservati. PRIME_PUBLIC_URL usa il dominio; PRIME_CONNECT_PUBLIC_URL conserva i callback OAuth già registrati su Fly finché i relativi provider non vengono aggiornati.
