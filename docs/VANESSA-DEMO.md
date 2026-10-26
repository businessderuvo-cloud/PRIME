# Richiamata Vanessa demo

Il modulo della pagina Sorelle Assistenti invia una singola richiesta al trunk SIP ElevenLabs assegnato al ramo Vanessa DEMO. Configurazione server: PRIME_ELEVEN_API_KEY, PRIME_ELEVEN_AGENT_ID, PRIME_ELEVEN_BRANCH_ID, PRIME_ELEVEN_PHONE_NUMBER_ID, PRIME_DEMO_DAILY_CALL_LIMIT (10 per default). I segreti restano su Fly.

La demo è inizialmente limitata a cellulari italiani. Consenso esplicito, conferma del numero, controllo origine, cookie SameSite e challenge monouso proteggono il modulo. Una richiesta per numero e connessione ogni 24 ore; limite globale giornaliero persistente. Nessun retry automatico in caso di timeout per evitare chiamate duplicate. I log conservano hash del numero/IP per sette giorni, non numeri in chiaro. Il provider riceve necessariamente il numero per effettuare la chiamata.

Il trunk e il ramo vengono verificati tramite API in sola lettura. I test usano un provider simulato e non effettuano telefonate reali. La prima prova reale va richiesta dal proprietario del numero nel modulo pubblico.

La configurazione ElevenLabs preesistente registra e trascrive le conversazioni senza scadenza automatica; il modulo lo comunica e richiede consenso. Impostazioni di voce, primo messaggio e telefonia non sono modificate da questa integrazione.

# Browser voice

La pagina offre anche “Parla con Vanessa”, senza telefono, tramite SDK ElevenLabs self-hosted e URL WebSocket firmato monouso emesso dal server per lo stesso ramo. La chiave API non viene inviata al browser. Richiede consenso esplicito e permesso microfono; include chiusura, mute, stato ascolto/parlato e trascrizione temporanea. Il client chiude dopo 3 minuti; il limite massimo effettivo sul provider resta quello dell’agente. Tre emissioni di sessione al giorno per connessione e tetto globale condiviso con le richiamate. I worklet audio e il ricampionatore sono serviti localmente; build riproducibile con node scripts/build-voice-client.mjs.

## Relazione con Veronica

Il prompt del ramo Vanessa DEMO è stato aggiornato il 26 ottobre 2026 via API ElevenLabs: quando parla di Veronica, Vanessa la presenta come **mia sorella Veronica**, poi **mia sorella** o **lei**, con tono naturale, senza sminuirla. Il personaggio non afferma di essere umano. Una rilettura della configurazione ha confermato il mantenimento del messaggio iniziale, del modello e di tutti i parametri della voce. Backup precedente conservato sul volume privato del server in agent-backups.
