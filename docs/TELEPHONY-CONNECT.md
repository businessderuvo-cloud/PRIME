# Telefonia in PRIME Connect

Zadarma e CloudTalk sono disponibili da VIP, compresi Elite e Secret (che usa l’edizione Elite). Standard e Pro non possono configurare queste integrazioni: il controllo è applicato anche alle API. Le impostazioni sono dell’agenzia; solo titolare e responsabile possono salvarle o scollegarle.

## Configurazione

In PRIME Connect, aprire Telefonia, indicare il numero e inserire API Key e API Secret. Zadarma richiede anche il SIP supervisore nel formato 123456-101. La verifica è una richiesta in sola lettura al provider, senza chiamate o addebiti avviati da PRIME. Il numero indicato va attivato e verificato nell’account del provider.

- Zadarma: GET /v1/info/balance/ con firma HMAC secondo https://zadarma.com/en/support/api/.
- CloudTalk: GET https://my.cloudtalk.io/api/agents/index.json con Basic Auth e Accept: application/json, secondo https://help.cloudtalk.io/api-reference/agents/list-agents e https://help.cloudtalk.io/guides/authentication.

Le chiavi sono cifrate con il vault di PRIME e associate a tenant e provider. Non vengono restituite dalle API di stato né inserite nell’audit. La migrazione 032_telephony_connect.sql crea la tabella dedicata. Scollegare in PRIME elimina le credenziali salvate, ma non revoca la chiave nel provider.

## Uso con Vanessa

Il telefono Zadarma usa prima le credenziali verificate dell’agenzia; per le installazioni personali già configurate rimangono disponibili le variabili PRIME_ZADARMA_* come fallback. Servono comunque i permessi PBX per l’interno supervisore.

Per CloudTalk, la verifica abilita l’accesso API salvato, non un trunk SIP automatico. Il copilot PRIME può ricevere l’audio della scheda CloudTalk Phone tramite la modalità Audio di scheda o finestra esterna, con consenso dell’operatore. Un bridge telefonico diretto CloudTalk–ElevenLabs e l’AI Agent CloudTalk richiedono la loro configurazione dedicata.

## Demo pubblica

La demo usa soltanto demo-key e demo-secret, senza richieste al provider. I dati sono conservati nel database effimero del visitatore. Le credenziali reali sono rifiutate. L’interfaccia distingue la prova dimostrativa dall’accesso API verificato. La voce e il copilot della demo pubblica restano disattivati.

## Affiliazione

Il link Zadarma autorizzato è https://zadarma.com/it/?ref=880d9879e576f890c9488173d439235e ed è usato nelle FAQ e nella scheda Connect con indicazione di affiliazione. CloudTalk punta al sito ufficiale fino alla disponibilità di un link affiliato personale.

## Verifica

node --test telephony-connect.test.mjs customer-demo.test.mjs
