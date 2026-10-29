# Pagamenti crypto CPAY

La creazione server di ogni ordine genera un checkout Sale esclusivo dell'agenzia, con prezzo EUR calcolato dal listino. Il rinnovo è manuale alla scadenza. Il KYB cliente resta obbligatorio. Le offerte statiche del catalogo non attivano automaticamente un'agenzia. Gli extra e i conguagli restano soggetti a offerta dedicata.

Segreti server: PRIME_CPAY_PUBLIC_KEY, PRIME_CPAY_PRIVATE_KEY, PRIME_CPAY_MERCHANT_ID. PRIME_PUBLIC_URL definisce il ritorno dal checkout. Nessuna chiave nel client.

Il processo verifica ogni 30 secondi fino a dieci ordini pendenti tramite API autenticata: controlla merchant, checkout, prezzo EUR, appartenenza della charge e stato Done su mainnet. Un callback o un ritorno nel browser non conferma un pagamento. Nessun endpoint accetta importi o stati dichiarati dal cliente. L'attivazione in plan_subscriptions e ai_subscriptions e la ricevuta cpay_orders sono atomiche e idempotenti. Il cliente può richiedere la verifica da account tramite GET /api/billing/payments (solo titolare).

La migrazione 030 è additiva. In caso di indisponibilità CPAY l'ordine resta pendente. Gli ordini creating senza risposta richiedono riconciliazione prima di ritentare, per evitare checkout duplicati.

Non vengono eseguiti swap, prelievi, payout automatici né importate chiavi wallet.

Fonti: https://docs.cpay.world/for-developers/api/using-api-for-checkout/


## Checkout PRIME dedicato

Dal pagamento del piano si apre `/checkout?order=<ordine>`, interamente nel tema PRIME. I dati sono riservati al titolare della stessa agenzia e richiedono KYB approvato. `POST /api/billing/crypto-order/<ordine>/prepare` genera o riusa la fattura CPAY e il wallet della rete scelta. Importi e indirizzi sono letti dal provider e verificati rispetto a merchant, ordine, mainnet, prezzo EUR e valuta. QR generato sul server; nessun servizio QR esterno. QR USDC contiene solo l’indirizzo: rete e importo vanno impostati nel wallet. Scadenza e stato sono verificati sul server; conferma e attivazione restano idempotenti.

`/checkout?preview=1` mostra una anteprima grafica pubblica con pagamento disabilitato. Nessuna transazione effettuata durante la verifica dell’integrazione. Migrazione aggiuntiva: `031_cpay_charge.sql`.
