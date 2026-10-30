# Listino Stripe — 30 ottobre 2026

Basi nette ripristinate dalla specifica originale: Standard 50, Pro 100, VIP 500, Elite 1.000 EUR/mese. Annuale: dieci basi mensili. L'utente ha chiesto di coprire il costo massimo.

Scenario prudenziale dei metodi abilitati: Klarna USA/Canada 5,99% + 0,30 EUR; maggiorazione internazionale 1,5%; eventuale cambio 2%; Billing 0,7%. Totale 9,49% + 0,30 EUR. Non rappresenta la commissione effettiva di ogni vendita né una tariffa negoziata verificata sull'account.

Fonti: https://stripe.com/it/pricing/local-payment-methods e https://stripe.com/it/pricing . Non sono inclusi eventi straordinari quali contestazioni, sanzioni o rimborsi, né IVA sui servizi Stripe.

Prezzo = arrotondamento al centesimo superiore di (base netta + 0,30) / 0,9051. Extra umani e AI sulla stessa transazione: base / 0,9051, senza duplicare la quota fissa. Annuale calcolato come singolo pagamento. Prezzi finali condivisi tra browser, simulatori e server in public/pricing.js; politica privata in src/plan-price-policy.mjs.

Crypto mantiene la regola attualmente implementata: nessuno sconto mensile; annuale a nove mensilità del listino aggiornato. Gli extra crypto restano su offerta dedicata. Le tariffe di consumo AI conservano la politica separata dei costi provider per tre.

Il collegamento plugin Prime test è acct_1UVxIXIyyuOuJYcz. La chiave sul server è una chiave claimable sandbox: non consente la lettura dell'account; la sua appartenenza a Prime non è verificata. Manca inoltre PRIME_STRIPE_TEST_BILLING_WEBHOOK_SECRET. Le pagine esistenti restano invariate nel flusso e nel layout. I test applicativi simulati non costituiscono pagamenti Stripe completati.
