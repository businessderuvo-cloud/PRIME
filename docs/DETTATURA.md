# Dettatura e recapiti delle persone

Il pulsante microfono è disponibile nei campi di testo, note, ricerca globale e contestuale, telefono, email, URL e numeri, inclusi i campi creati dinamicamente nei dialoghi. Password, selettori, date e orari non vengono dettati. La dettatura è in italiano, si avvia solo su richiesta e si interrompe con un secondo clic. Il testo resta modificabile e non provoca il salvataggio automatico dei moduli. Nelle ricerche viene usato subito come il testo digitato.

Il riconoscimento usa SpeechRecognition/webkitSpeechRecognition del browser e richiede un browser compatibile e il permesso al microfono. Se assente o negato, la UI mostra il motivo. Il servizio del browser può richiedere rete ed elaborare l'audio tramite il proprio fornitore; PRIME non configura un fornitore di trascrizione esterno né conserva file audio. Non viene dichiarata compatibilità universale con il browser incorporato. La prova automatica simula il riconoscitore: non sostituisce una prova audio reale sul dispositivo dell'utente.

La dettatura sostituisce il testo selezionato oppure si inserisce al cursore. Se il campo cambia manualmente durante l'ascolto, la trascrizione non sovrascrive le modifiche. I numeri riconosciuti come cifre accettano virgola decimale e separatori delle migliaia; un numero non interpretabile viene rifiutato conservando il valore originale. La chiusura del dialogo interrompe l'ascolto.

Nella scheda dell'immobile, la sezione «Persone · Numeri e social» comprende il proprietario selezionato e le persone collegate all'appartamento. Si possono aggiungere e modificare più telefoni, email, WhatsApp, Facebook, Instagram, LinkedIn e altri profili con etichette facoltative. Ogni recapito viene salvato sulla persona, condiviso con CRM e territorio, senza duplicare il contatto e senza perdere modifiche ancora non salvate nell'immobile. La stessa gestione è disponibile nella scheda CRM della persona già salvata.

Il pulsante «Aggiungi appartamento» è disponibile anche nell'intestazione del civico o di un appartamento già selezionato, con civico precompilato.

Verifiche: 32 test complessivi, inclusi servizio statico dei nuovi moduli, permessi e validazione recapiti già esistenti, inserimento vocale al cursore/selezione, eventi ricerca, modifiche concorrenti al testo, numeri, campi dinamici, browser non supportato e permesso negato. Prova browser separata: aggiunta di un numero fittizio a una persona demo direttamente dalla scheda immobile, presenza dei microfoni anche nei campi aggiunti dinamicamente.
