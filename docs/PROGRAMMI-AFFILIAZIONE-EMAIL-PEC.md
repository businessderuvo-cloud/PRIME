# Provider email, PEC e affiliazioni

Le quattro schede partner compaiono **solo nella scheda Email**. I pulsanti di collegamento aprono il modulo dell'account e verificano l'accesso IMAP prima di salvarlo. Le credenziali sono cifrate nel vault PRIME; la sincronizzazione legge solo mittente e oggetto e non scarica corpo o allegati.

Lo switch Personale / PEC classifica in PRIME il tipo dell'account collegato e resta aggiornabile anche dopo il collegamento. Non sostituisce l'attivazione di una casella PEC presso il gestore. Gmail, Yahoo e Outlook restano collegati con i rispettivi flussi OAuth già presenti nella scheda Email; le loro schede non vengono replicate tra i partner.

- Infomaniak: IMAP TLS su `mail.infomaniak.com:993`.
- Zoho Mail: IMAP TLS con selezione dell'area Europa/Globale e account personale/aziendale.
- InfoCert Legalmail: IMAP TLS su `mbox.cert.legalmail.it:993`; il pulsante apre la webmail ufficiale Legalmail.
- Proton Mail: il collegamento dal PRIME ospitato non è attivabile con IMAP diretto. Proton Mail Bridge espone IMAP sul computer dove è installato, mentre PRIME è remoto. La scheda indica questo limite senza salvare credenziali o simulare una connessione.

## URL affiliati

Quando gli URL reali saranno disponibili, inserirli in `partnerUrls` in `public/partner-mail.js` e pubblicare il frontend. Lasciare vuoti i campi non ancora forniti: in quel caso la scheda mostra solo il collegamento ufficiale del servizio. Non è attivo alcun tracciamento proprietario dei clic.

## Programmi verificati

- Infomaniak: programma affiliate ufficiale, commissioni dichiarate dal 25% fino al 50%; la copertura comprende Mail Service. https://www.infomaniak.com/en/membership
- Proton: programma ufficiale affiliate/partner. https://proton.me/partners/affiliates
- Zoho: programma affiliate generale e programma partner/rivenditore per Zoho Mail; candidatura soggetta a valutazione. https://www.zoho.com/affiliate/ e https://www.zoho.com/mail/email-partnership-program.html
- InfoCert: programma ufficiale rivenditori/partner con sconti e condizioni commerciali; non risulta un programma pubblico classico basato su referral affiliate. https://www.infocert.it/diventa-partner
- Google/Gmail: esiste un programma Google Workspace Partner con vantaggi e incentivi per operatori qualificati; non equivale a un programma pubblico referral affiliate per Gmail consumer. https://workspace.google.com/intl/it/partners/
- Microsoft/Outlook: esistono programmi Microsoft AI Cloud Partner e incentivi commerciali; non è emerso un programma pubblico affiliate dedicato a Outlook consumer. https://partner.microsoft.com/en-us/partnership/compare-programs/
- Yahoo Mail: non è emerso un programma affiliate ufficiale pubblico dedicato a Yahoo Mail.
