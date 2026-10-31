# Console amministrativa PRIME

La console `/admin` è separata dall’area agenzie. L’accesso usa un’identità Super Admin configurata fuori dal database applicativo. In produzione richiede password e codice TOTP; le sessioni sono brevi, protette da cookie HttpOnly/SameSite, e le modifiche verificano CSRF.

## Prima di abilitarla

Generare i valori sul computer dell’operatore con `node scripts/create-admin-secrets.mjs`, conservarli in un password manager e inserirli nei secrets dell’ambiente di produzione:

- `PRIME_SUPER_ADMIN_EMAIL`
- `PRIME_SUPER_ADMIN_PASSWORD_HASH`
- `PRIME_SUPER_ADMIN_TOTP_SECRET`

La password viene acquisita senza mostrarla mentre si digita; il modulo restituisce soltanto l’hash scrypt. Il seed TOTP va importato in un’app Authenticator e conservato come segreto. Non inserirli nel repository né in chat.

## Funzioni attuali

- Panoramica di agenzie, abbonamenti, pagamenti in attesa, scadenze e account sospesi.
- Coda di approvazione VIP/Elite. Approvare la verifica aziendale non modifica il pagamento né crea un abbonamento.
- Sospensione, riattivazione, chiusura logica e revoca delle sessioni. Chiusura e sospensione invalidano sessioni e link di recupero; i dati applicativi restano conservati.
- Reimpostazione password del titolare via link monouso, senza rivelare o impostare la password in chiaro.
- Registro delle azioni Super Admin.

## Da completare

Il replay video e la mappa con coordinate non sono collegati. Il pannello mostra lo stato e i requisiti privacy, senza raccogliere IP, coordinate o registrazioni. L’accesso assistito non è ancora disponibile: la futura funzione dovrà usare un token temporaneo, limitare le azioni, mostrare un banner di assistenza e registrare ogni operazione, senza leggere le password degli utenti. Le chiusure sono logiche: la cancellazione definitiva richiede un flusso separato con controllo dei termini di conservazione e dei dati collegati.
