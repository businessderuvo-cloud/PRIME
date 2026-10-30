# Stripe Connect per PRIME

La sezione Incassi è riservata a Elite e Secret. Ogni agenzia crea un account Stripe Standard collegato a PRIME e completa la verifica e il conto bancario sul flusso ospitato da Stripe. I pagamenti e le fatture sono creati nel contesto dell'account collegato; PRIME non raccoglie i dati completi delle carte.

## Configurazione della piattaforma

1. Attivare Stripe Connect sul profilo Stripe di PRIME e abilitare gli account Standard.
2. Impostare nel server le chiavi segrete della piattaforma, separate per Test e Live:
   - `PRIME_STRIPE_TEST_SECRET_KEY`
   - `PRIME_STRIPE_LIVE_SECRET_KEY`
3. Creare un unico endpoint webhook Connect puntato a `https://primegestionale.it/api/stripe/connect/webhook`, selezionando gli eventi sugli account collegati. Salvare i segreti firmati nei rispettivi valori `PRIME_STRIPE_TEST_WEBHOOK_SECRET` e `PRIME_STRIPE_LIVE_WEBHOOK_SECRET`.
4. Avviare e verificare prima l'onboarding Test. Solo dopo la verifica della piattaforma Stripe, configurare Live.

Le chiavi non vanno inserite dalle agenzie: PRIME le usa esclusivamente lato server. Gli account collegati completano i dati aziendali e registrano l'IBAN direttamente con Stripe. I bonifici mostrati nell'app sono accrediti del saldo Stripe sul conto associato; l'app non invia bonifici a beneficiari arbitrari e non legge le spese del conto esterno.

## Financial Connections

Financial Connections riguarda conti bancari statunitensi e dati condivisi dall'utente con consenso. Non è una funzione per collegare conti italiani. Per gli account Stripe Standard, l'onboarding gestisce il conto di accredito ma la piattaforma non ottiene automaticamente accesso ai dati bancari aggiuntivi. L'eventuale accesso ai dati USA richiede l'idoneità, la registrazione e l'approvazione Stripe prima di esporre un flusso agli utenti.

## Checkout piani: solo Stripe test

/checkout?test=1&lang=en apre il checkout test. Richiede PRIME_STRIPE_TEST_SECRET_KEY e PRIME_STRIPE_TEST_BILLING_WEBHOOK_SECRET; endpoint firmato /api/billing/stripe-test/webhook. Attivare Klarna nei metodi di pagamento dell’account di test Stripe. Le sessioni usano solo chiavi test, non attivano piani reali e non modificano le quote reali.

## Anteprima locale bilingue

Avvio: node --env-file=.env.test scripts/site-test-start.mjs. Il server di prova usa solo un database temporaneo, ascolta 127.0.0.1:4356 e crea un’agenzia fittizia con verifica simulata approvata. Accesso esclusivamente locale: test-owner@prime.local / PrimeTestOnly2026!. Il database viene eliminato alla chiusura. Le chiavi restano fuori dal repository.

La lingua italiana o inglese viene conservata nella navigazione. Le pagine pubbliche con lang=en sono tradotte anche sul server; il catalogo locale aggiorna moduli e messaggi dinamici. Vanessa riceve la scelta sia nelle chiamate browser sia nelle richiamate, e Veronica dispone di una conversazione guidata in inglese.
