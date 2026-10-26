# Richiamata Vanessa demo

Il modulo della pagina Sorelle Assistenti invia una singola richiesta al trunk SIP ElevenLabs assegnato al ramo Vanessa DEMO. Configurazione server: PRIME_ELEVEN_API_KEY, PRIME_ELEVEN_AGENT_ID, PRIME_ELEVEN_BRANCH_ID, PRIME_ELEVEN_PHONE_NUMBER_ID, PRIME_DEMO_DAILY_CALL_LIMIT (10 per default). I segreti restano su Fly.

La demo è inizialmente limitata a cellulari italiani. Consenso esplicito, conferma del numero, controllo origine, cookie SameSite e challenge monouso proteggono il modulo. Una richiesta per numero e connessione ogni 24 ore; limite globale giornaliero persistente. Nessun retry automatico in caso di timeout per evitare chiamate duplicate. I log conservano hash del numero/IP per sette giorni, non numeri in chiaro. Il provider riceve necessariamente il numero per effettuare la chiamata.

Il trunk e il ramo vengono verificati tramite API in sola lettura. I test usano un provider simulato e non effettuano telefonate reali. La prima prova reale va richiesta dal proprietario del numero nel modulo pubblico.

La configurazione ElevenLabs preesistente registra e trascrive le conversazioni senza scadenza automatica; il modulo lo comunica e richiede consenso. Impostazioni di voce, primo messaggio e telefonia non sono modificate da questa integrazione.
