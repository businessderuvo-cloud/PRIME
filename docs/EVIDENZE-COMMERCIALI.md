# Evidenze commerciali e lead caldi

Le schede degli appartamenti, l'albero del territorio e il dettaglio dell'interno evidenziano tre segnali distinti, sempre con una scritta oltre al colore:

- Verde: IN VENDITA, ricavato dallo stato commerciale.
- Ambra: ALTRA AGENZIA, ricavato dallo stato commerciale.
- Rosso corallo: LEAD CALDO, ricavato dalla temperatura assegnata all'appartamento o a una persona collegata.

Nella scheda del civico, quattro contatori cliccabili mostrano tutti gli appartamenti, quelli in vendita, quelli di altre agenzie e i lead caldi. Il filtro mantiene la suddivisione per piano. Gli immobili possono appartenere contemporaneamente alla categoria commerciale e ai lead caldi; i conteggi quindi non sono categorie disgiunte e non vanno sommati.

«Modifica scheda → Temperatura lead → caldo» consente di qualificare l'appartamento. Lo stesso campo è disponibile nel CRM per le persone; la tabella CRM, la rubrica del territorio e le persone nella scheda dell'immobile mostrano l'indicazione. La temperatura non è dedotta da informazioni personali, stato di vendita o stato di acquisizione. Un'opportunità non diventa automaticamente un lead caldo.

La migrazione 005 aggiunge la temperatura con valore iniziale «non indicata», preservando gli stati precedenti. Valori disponibili: non indicata, freddo, tiepido e caldo. Validazione, autorizzazioni e isolamento tra agenzie si applicano come negli altri aggiornamenti.

Nel database demo separato, gli interni 3, 5 e 8 di Via della Quercia 12 sono stati esplicitamente qualificati come caldi per illustrare i casi: solo caldo, vendita + caldo, altra agenzia + caldo. Nessun record dell'agenzia reale viene qualificato automaticamente.

Verifiche: 35 test complessivi, inclusi migrazione, temperatura persistente e validata, isolamento tra agenzie e coesistenza delle evidenze. Browser: contatori 10 totali / 4 in vendita / 1 altra agenzia / 3 caldi, filtri con 3 e 1 schede rispettivamente e contrasto verificato in entrambi i temi.
