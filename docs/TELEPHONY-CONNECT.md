# Telefonia in PRIME Connect

Zadarma e CloudTalk sono disponibili da VIP, compresi Elite e Secret (che usa l’edizione Elite). Standard e Pro non possono configurare queste integrazioni: il controllo è applicato anche alle API. Le impostazioni sono dell’agenzia; solo titolare e responsabile possono salvarle o scollegarle.

## Configurazione

In PRIME Connect, aprire Telefonia, indicare il numero e inserire API Key e API Secret. Zadarma richiede anche il SIP supervisore nel formato 123456-101. La verifica è una richiesta in sola lettura al provider, senza chiamate o addebiti avviati da PRIME. Il numero indicato va attivato e verificato nell’account del provider.

- Zadarma: GET /v1/info/balance/ con firma HMAC secondo https://zadarma.com/en/support/api/.
- CloudTalk: GET https://my.cloudtalk.io/api/agents/index.json con Basic Auth e Accept: application/json, secondo https://help.cloudtalk.io/api-reference/agents/list-agents e https://help.cloudtalk.io/guides/authentication.

L’endpoint CloudTalk usa l’host dell’API standard `my.cloudtalk.io/api/`; `api.cloudtalk.io/v1/` è invece l’host per VoiceAgent, Conversation Intelligence e Dialer. Non sono intercambiabili. La verifica accetta soltanto una risposta riuscita con `responseData.data` di tipo array; non avvia chiamate e non controlla che il numero digitato appartenga all’account. L’accesso API richiede un piano CloudTalk Essential o superiore e credenziali create da un amministratore. Riferimenti: [host API](https://help.cloudtalk.io/api-reference/overview#base-urls), [chiavi API](https://help.cloudtalk.io/en/articles/15272380-how-to-access-and-generate-your-cloudtalk-api-keys).

Le chiavi sono cifrate con il vault di PRIME e associate a tenant e provider. Non vengono restituite dalle API di stato né inserite nell’audit. La migrazione 032_telephony_connect.sql crea la tabella dedicata. Scollegare in PRIME elimina le credenziali salvate, ma non revoca la chiave nel provider.

## Uso con Vanessa

Il telefono Zadarma usa prima le credenziali verificate dell’agenzia; per le installazioni personali già configurate rimangono disponibili le variabili PRIME_ZADARMA_* come fallback. Servono comunque i permessi PBX per l’interno supervisore.

Per CloudTalk, la verifica salva l’accesso API. Il copilot PRIME può ricevere l’audio della scheda CloudTalk Phone tramite la modalità Audio di scheda o finestra esterna, con consenso dell’operatore. È necessario condividere anche l’audio della scheda; la chiamata resta gestita da CloudTalk e il copilot assiste l’operatore in PRIME. Questa acquisizione audio non instrada la chiamata telefonica verso Vanessa.

### Limite SIP CloudTalk e alternativa telefonica

CloudTalk dichiara di non essere un provider SIP trunking: i suoi numeri non possono essere usati come endpoint SIP per piattaforme AI esterne e non esiste un’integrazione SIP a livello numero o trunk per tali piattaforme. Le credenziali SIP per utenti CloudTalk sono destinate a telefoni e softphone registrati. La guida CloudTalk aggiornata specifica che, per usare Voice AI sul numero, l’opzione diretta supportata è CloudTalk VoiceAgents: è un agente nativo CloudTalk e non equivale ad assegnare a CloudTalk un agente ElevenLabs esistente. Non vanno inserite le credenziali SIP CloudTalk in ElevenLabs come se fossero un trunk; sostituire API Key e Secret Zadarma con quelle CloudTalk non trasferisce il numero o il flusso audio. Fonti: [Using SIP devices with CloudTalk](https://help.cloudtalk.io/en/articles/5361606-using-sip-devices-with-cloudtalk), [Call Flow Designer](https://help.cloudtalk.io/en/articles/3669429-call-flow-designer-guide), [SIP trunking ElevenLabs](https://elevenlabs.io/docs/eleven-agents/phone-numbers/sip-trunking).

Per mantenere il numero pubblico CloudTalk e far rispondere Vanessa, l’alternativa documentata è un inoltro telefonico verso un diverso numero già collegato all’agente in ElevenLabs:

1. Verificare che il numero di destinazione riceva già chiamate su Vanessa e che non rinvii a CloudTalk, evitando un ciclo di inoltri.
2. In CloudTalk aprire Numbers → numero → Call Flow Designer e configurare Redirect verso la destinazione, con tempo di attesa e fallback appropriati. La guida indica il passo Redirect per i piani Essential ed Expert; verificarne la disponibilità nell’account.
3. Verificare tariffa e credito prima dell’attivazione: l’inoltro è una chiamata uscente separata, addebitata a tariffa destinazione e fuori dai pacchetti minuti. CloudTalk tenta di trasmettere il numero originale del chiamante, soggetto alle restrizioni del paese e del gestore.
4. Eseguire un test in entrata e verificare risposta di Vanessa, audio bidirezionale, riaggancio e fallback prima di rimuovere la configurazione precedente.

Fonti: [Redirect nel Call Flow Designer](https://help.cloudtalk.io/en/articles/3669429-call-flow-designer-guide), [addebiti CloudTalk](https://help.cloudtalk.io/en/articles/14634073-what-uses-credit), [integrazione SIP ElevenLabs](https://elevenlabs.io/docs/eleven-agents/phone-numbers/sip-trunking).

L’inoltro richiede quindi una destinazione telefonica aggiuntiva. Se si vuole un solo numero su un unico provider compatibile con ElevenLabs, occorre valutare la portabilità verso quel provider. Nessuno di questi passaggi viene eseguito dal modulo PRIME Connect. Non eliminare credenziali Zadarma, numeri o agenti prima di aver verificato il percorso sostitutivo e le dipendenze esistenti.

## Demo pubblica

La demo usa soltanto demo-key e demo-secret, senza richieste al provider. I dati sono conservati nel database effimero del visitatore. Le credenziali reali sono rifiutate. L’interfaccia distingue la prova dimostrativa dall’accesso API verificato. La voce e il copilot della demo pubblica restano disattivati.

## Affiliazione

Il link Zadarma autorizzato è https://zadarma.com/it/?ref=880d9879e576f890c9488173d439235e ed è usato nelle FAQ e nella scheda Connect con indicazione di affiliazione. CloudTalk punta al sito ufficiale fino alla disponibilità di un link affiliato personale.

## Verifica

node --test telephony-connect.test.mjs customer-demo.test.mjs
