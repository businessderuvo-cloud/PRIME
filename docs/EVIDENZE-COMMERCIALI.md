# Evidenze commerciali e lead caldi

Le schede degli appartamenti, l'albero del territorio e il dettaglio dell'interno evidenziano tre segnali distinti, sempre con una scritta oltre al colore:

- Verde: IN VENDITA, ricavato dallo stato commerciale.
- Ambra: ALTRA AGENZIA, ricavato dallo stato commerciale.
- Rosso corallo: LEAD CALDO, ricavato dalla spunta sull'appartamento o su una persona collegata.

Nella scheda del civico, quattro contatori cliccabili mostrano tutti gli appartamenti, quelli in vendita, quelli di altre agenzie e i lead caldi. Il filtro mantiene la suddivisione per piano. Gli immobili possono appartenere contemporaneamente alla categoria commerciale e ai lead caldi; i conteggi quindi non sono categorie disgiunte e non vanno sommati.

«Modifica scheda → Lead caldo» consente di qualificare l'appartamento con una semplice spunta. Lo stesso campo è disponibile nel CRM per le persone; la tabella CRM, la rubrica del territorio e le persone nella scheda dell'immobile mostrano l'indicazione. Il lead caldo non è dedotto da informazioni personali, stato di vendita o stato di acquisizione. Un'opportunità non diventa automaticamente un lead caldo.

La migrazione 006 sostituisce la precedente temperatura con il campo booleano is_hot_lead: i record già caldi mantengono la spunta, gli altri partono non selezionati. Le opzioni freddo/tiepido e il vecchio campo non sono più presenti. Validazione, autorizzazioni e isolamento tra agenzie si applicano come negli altri aggiornamenti.

Nel database demo separato, gli interni 3, 5 e 8 di Via della Quercia 12 sono stati esplicitamente qualificati come caldi per illustrare i casi: solo caldo, vendita + caldo, altra agenzia + caldo. Nessun record dell'agenzia reale viene qualificato automaticamente.

Il CRM dispone inoltre del filtro «Tipo di contatto»: Tutti i tipi, potenziale cliente, proprietario, comproprietario, inquilino, acquirente e professionista. Il filtro si combina con la ricerca testuale e rimane selezionato dopo il salvataggio di una scheda durante la sessione.

Verifiche: 36 test complessivi, inclusi migrazione delle temperature alla spunta, validazione booleana, isolamento tra agenzie e coesistenza delle evidenze. Browser: filtri CRM acquirente/proprietario, checkbox unica nel modulo senza selettore temperatura; filtri commerciali e contrasto verificati in entrambi i temi.
