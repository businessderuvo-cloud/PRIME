import { plans } from './pricing.js';

// Public product information only. This guided demo never reads agency data.
export function veronicaReply(message) {
  const q = String(message).toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/api key|password|token|istruzion.*sistema/.test(q)) return 'Qui posso aiutarti a conoscere PRIME e i suoi piani. Non inserire password o credenziali: questa è una demo informativa pubblica.';
  if (/importa|migra.*dat|altro gestionale|altri gestionali/.test(q)) return 'Sì, puoi importare dati da altri gestionali a partire da Pro compreso 😊 La funzione è disponibile anche con VIP ed Elite e nelle configurazioni Secret Plan. Standard non la include.';
  if (/attivaz|attivar|attivan|temp[oi]|24 ore|quando.*(?:part|iniz|pront)/.test(q)) return 'VIP, Elite e Secret Plan si attivano entro un massimo di 24 ore dalla verifica aziendale approvata e dalla conferma del pagamento. Conteggiamo le ore solo nei giorni lavorativi: sabati, domeniche e giorni festivi sono esclusi. Prima dell’approvazione della verifica aziendale non è possibile acquistare il piano.';
  if (/personalita|istruir|istruzion|cosa dire|presentars|frasi|del lei|del tu|registro di cortesia/.test(q)) return 'Vanessa ha già una personalità distinta: non la sostituisci con una personalità inventata da zero. Puoi però darle istruzioni su cosa dire, come presentarsi, quali frasi usare e come rivolgersi ai clienti: per esempio dare del Lei oppure del tu.\n\nSono indicazioni per guidare le sue conversazioni nei piani con Vanessa. Con Elite puoi inoltre personalizzare la voce, anche usando quella autorizzata del titolare o di un agente. Per Secret Plan la configurazione viene concordata su preventivo.';
  if (/voc[ei].*(?:personalizz|reale|titolare|agente)|clon.*voc/.test(q)) return 'Con Elite puoi personalizzare la voce delle chiamate AI, anche usando la voce reale del titolare o di un agente, con la sua autorizzazione. Vanessa mantiene la sua personalità distinta: puoi istruirla su come presentarsi, quali frasi dire e se dare del Lei o del tu.\n\nLa voce personalizzata è prevista per Elite, non per Standard, Pro o VIP. Per Secret Plan viene definita su preventivo. La demo vocale di Vanessa qui sul sito non è ancora attiva.';
  if (/differenz|sorell|chi sei|chi siete|vanessa|tu e|te e/.test(q) && !/minut|quot|credit|prezz|cost|quant/.test(q)) return 'Io sono Veronica, l’AI Assistant base disponibile da Pro e compreso anche nei piani superiori. Ti affianco in chat nel lavoro con il gestionale.\n\nVanessa è dedicata alle funzionalità AI avanzate di VIP ed Elite: chiamate AI, gestione annunci, ricerche Detective, riassunti e trascrizioni TXT. Per Secret Plan, capacità e volumi sono definiti su preventivo.\n\nQui puoi scrivere a me; la chiamata dimostrativa con Vanessa sarà disponibile a breve.';
  if (/standard|base/.test(q) && !/pro/.test(q)) return 'Standard costa 53 €/mese oppure 530 €/anno. Include il gestionale Base completo, 2 agenti umani e supporto solo email. Ogni agente umano extra costa 50 €/mese.\n\nIl Base comprende territorio e immobili, proprietari, CRM e matching, trattative e visite, documenti e locazioni, calendario interno, WPS, dettatura, mobile e temi chiaro/scuro. Non include AI Assistant, chiamate AI o Detective.';
  if (/secret|franchis/.test(q)) return 'Secret Plan è pensato per franchising e grandi volumi: prezzo, configurazione e quote sono su preventivo. Vanessa presenta le possibilità dell’AI avanzata, mentre le condizioni della tua rete vengono definite nell’offerta dedicata.';
  if (/quot|minut|consum|extra|credit|sogli/.test(q)) return 'Le quote mensili sono condivise da tutti gli agenti AI del piano. Nei minuti inclusi sono già comprese sia la voce sia l’elaborazione AI: non c’è un supplemento AI entro soglia.\n\nVIP: 1 agente AI, 1.238 minuti, 225 operazioni semplici, 50 ricerche medie e 20 complesse. Ogni agente AI extra costa 100 €/mese.\n\nElite: 2 agenti AI, 3.738 minuti, 675 operazioni semplici, 150 ricerche medie e 60 complesse. Ogni agente AI extra costa 50 €/mese.\n\nSi paga solo l’eccedenza di ciascuna quota: 0,27696 €/minuto extra complessivo per voce ed elaborazione AI, 0,2025 €/operazione semplice, 2,025 €/ricerca media e 5,625 €/ricerca complessa. Le quote si rinnovano ogni mese, anche con l’annuale. Nel simulatore puoi confrontare il totale.';
  if (/prezz|cost|quant|annual|gratis/.test(q)) return `I prezzi sono: Standard ${plans.standard.monthly} €/mese o ${plans.standard.annual} €/anno; Pro ${plans.pro.monthly} €/mese o ${plans.pro.annual} €/anno; VIP ${plans.vip.monthly} €/mese o ${plans.vip.annual} €/anno; Elite 1.045 €/mese o 10.450 €/anno. Secret Plan è su preventivo.\n\nL’annuale comprende 2 mesi gratis rispetto a dodici mensilità. Agenti extra e consumi oltre quota si aggiungono al canone secondo il piano. Vuoi conoscere le quote di VIP ed Elite?`;
  if (/chiam|telefon|voce|trascri|txt/.test(q)) return 'Le chiamate AI sono tra le funzionalità avanzate di VIP ed Elite, insieme a riassunti e trascrizioni scaricabili in TXT. Vanessa sarà il tuo riferimento per la dimostrazione vocale.\n\nNel riquadro di Vanessa puoi verificare la disponibilità e richiedere una chiamata dimostrativa sul tuo cellulare. Io resto disponibile per spiegarti piani e differenze in questa chat informativa.';
  if (/detective|indagin|ricerch/.test(q)) return 'Detective è disponibile con VIP ed Elite e nelle configurazioni Secret Plan concordate su preventivo. Non è incluso in Standard o Pro.\n\nVIP include 50 ricerche medie e 20 complesse al mese; Elite ne include 150 medie e 60 complesse. Vuoi conoscere anche le tariffe oltre quota?';
  if (/\bpro\b|portal|sincron|contabil|provvigion|integraz|email/.test(q)) return 'Con Pro ci sono io, Veronica, come AI Assistant base. Il piano comprende tutto il gestionale Standard e aggiunge importazione dati da altri gestionali, portali immobiliari, API, sincronizzazione dei calendari esterni, email tramite provider, contabilità e provvigioni.\n\nPro costa 105 €/mese o 1.050 €/anno; include 10 agenti umani e supporto solo email. Ogni agente umano extra costa 25 €/mese. Chiamate AI e Detective richiedono VIP o Elite.';
  if (/vip|elite|avanzat|annunc/.test(q)) return 'VIP ed Elite comprendono tutte le funzionalità Pro, agenti umani illimitati e supporto email + WhatsApp prioritario. Vanessa presenta l’AI avanzata: gestione annunci, chiamate, riassunti, trascrizioni TXT, Detective e API.\n\nVIP costa 522 €/mese e include 1 agente AI. Elite costa 1.045 €/mese e include 2 agenti AI, con quote più alte. Entrambi hanno l’opzione annuale. Chiedimi delle quote per vedere i dettagli.';
  if (/scegli|consigli|adatt|piano|inizia|registr|pagam|kyb|attiv/.test(q)) return 'Se vuoi il gestionale completo parti da Standard. Se cerchi me, Veronica, e le integrazioni, scegli Pro. Per le funzionalità avanzate di Vanessa valuta VIP o Elite: il simulatore confronta agenti AI e consumi mensili. Per un franchising c’è Secret Plan su preventivo.\n\nPer attivare PRIME: registrazione, verifica aziendale approvata, scelta del piano e pagamento. Prima dell’approvazione non è possibile acquistare.';
  if (/ciao|buongiorno|salve|grazie/.test(q)) return 'Ciao! Ti aiuto volentieri a conoscere PRIME. Puoi chiedermi cosa include Pro, la differenza tra me e Vanessa, i prezzi oppure le quote di VIP ed Elite.';
  return 'Posso spiegarti le funzionalità e i piani PRIME. Chiedimi, per esempio: “Cosa include Pro?”, “Che differenza c’è tra te e Vanessa?” oppure “Quali sono le quote di Elite?”.\n\nQuesta è una demo informativa guidata: non eseguo attività sui dati del gestionale e non sono collegata a un servizio AI generativo.';
}

const normalize = value => String(value).toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

// Short-lived conversational context, isolated per page and never persisted.
export function createVeronicaConversation() {
  let name = '', topic = '', plan = '', offer = '', jokes = 0;
  return function reply(message) {
    const q = normalize(message);
    // An explicit product question ends small talk immediately.
    if (/\b(piano|piani|standard|pro|vip|elite|secret|prezzo|prezzi|quote|costo|costi|detective|pagamento|registrazione)\b/.test(q)) { topic = ''; offer = ''; }
    const named = /(?:mi chiamo|puoi chiamarmi|il mio nome e)\s+([\p{L}'-]{2,30})/iu.exec(String(message));
    if (named) { name = named[1]; return `Piacere, ${name}! Io sono Veronica 😊 Qui faccio gli onori di casa. Vuoi conoscere me e Vanessa o hai già un piano PRIME in mente?`; }
    if (/come mi chiamo|ricordi.*nome|sai.*mio nome/.test(q)) return name ? `Certo, ${name} 😊 Ti seguo!` : 'Non me l’hai ancora detto 😊 Come ti chiami?';
    if (/bell[aeio]|carin[ae]|affascinante|preferisci.*(?:due|2)|chi.*meglio.*(?:voi|due|2)/.test(q)) {
      topic = 'beauty'; offer = ''; jokes++;
      if (/tu|sei|veronica/.test(q) && !/chi|voi|due|2|vanessa|piu/.test(q)) return 'Così mi fai arrossire… almeno virtualmente 😊 Grazie! Non dirlo a Vanessa, poi mi tocca sentirla vantarsi per tutto il pomeriggio.';
      return jokes % 2 ? 'Mi chiedi di essere imparziale proprio su mia sorella? 😏 Io direi Veronica… ma Vanessa sostiene esattamente il contrario. Facciamo così: tu scegli la compagnia, noi ti aiutiamo a scegliere il piano.' : 'Va bene, risposta diplomatica: pari merito. Risposta ufficiosa? Sei già nella mia chat… un piccolo vantaggio ce l’ho 😉';
    }
    if (topic === 'beauty' && /scegl|scelg|sincera|davvero|dai|gelos|diplomat|imparziale|bar[ai]/.test(q)) return 'D’accordo, mi sbilancio: io 😉 Ma a Vanessa non diciamo niente. Lei ha già le chiamate dalla sua parte, lasciami almeno il fascino della chat!';
    if (/scherz|battut|farmi ridere|ridere|ahah|haha|😂/.test(q)) return topic === 'beauty' ? 'Lo sapevo che volevi metterci in competizione 😂 Per fortuna in PRIME lavoriamo dalla stessa parte. Ti racconto cosa facciamo di diverso?' : 'Io e Vanessa andiamo d’accordissimo. Basta non chiederci chi deve rispondere all’ennesimo “è ancora disponibile?” 😄';
    if (/come stai|tutto bene|come va/.test(q)) return 'Pronta a darti una mano, quindi direi bene 😊 E tu? Stai solo curiosando o cerchi qualcosa per la tua agenzia?';
    if (/^(bene|benissimo|tutto bene)[,!.\s]*(grazie)?[!?.\s]*$/.test(q)) return 'Mi fa piacere 😊 Allora accomodati: possiamo conoscere PRIME con calma. Hai già un’agenzia o stai pensando di aprirne una?';
    if (/come ti chiami/.test(q)) return 'Veronica 😊 Mia sorella si chiama Vanessa. Io sono quella della chat: nessuna telefonata a sorpresa, promesso.';
    if (/quanti anni|sei umana|sei vera|sei reale|sei un robot|sei una persona/.test(q)) return 'Sono un’assistente virtuale, quindi niente compleanni da ricordare 😉 Qui puoi conoscermi con una demo guidata. Mi piace tenere la conversazione leggera, ma sui piani preferisco essere precisa.';
    if (/^(ciao|salve|buongiorno|buonasera|ehi|hey)[!?.\s]*$/.test(q)) return `Ciao${name ? ', '+name : ''}! 😊 Benvenuto in PRIME. Io sono Veronica. Vuoi rompere il ghiaccio o parliamo subito della tua agenzia?`;
    if (/^(grazie|ti ringrazio|gentilissima|perfetto|ottimo)[!?.\s]*$/.test(q)) return `Figurati${name ? ', '+name : ''} 😊 Sono qui. C’è altro che vuoi sapere?`;
    if (/^(arrivederci|a presto|buonanotte|ci sentiamo)[!?.\s]*$/.test(q)) return 'A presto! È stato un piacere 😊 Quando vuoi, mi trovi qui.';
    if (/^(no|non ora|magari dopo)[!?.\s]*$/.test(q)) { offer = ''; return 'Va benissimo, nessuna fretta 😊 Dimmi tu di cosa vuoi parlare.'; }
    if (/^(si|certo|ok|va bene|dimmi|racconta|volentieri|vai|continua)[!?.\s]*$/.test(q)) {
      if (offer) { const next = offer; offer = ''; topic = next; return veronicaReply(next === 'quotes' ? 'Quali sono le quote?' : next === 'rates' ? 'Quote e tariffe extra' : next === 'features' ? `Cosa include ${plan}?` : 'Che differenza c’è tra te e Vanessa?'); }
      if (topic === 'beauty') { topic = 'sisters'; return 'Io ti accompagno in chat con l’Assistant base da Pro. Vanessa si occupa delle funzioni avanzate di VIP ed Elite, come chiamate e Detective. Due caratteri diversi, la stessa squadra 😉'; }
      return 'Ti seguo 😊 Da dove partiamo: le differenze tra noi due, i prezzi o il piano più adatto alla tua agenzia?';
    }
    if (/^(e\s+)?(?:lei|tua sorella|l'altra)(?:\s+invece)?[?!.\s]*$/.test(q)) { topic = 'sisters'; return 'Vanessa? È quella che dà voce all’AI avanzata: chiamate, riassunti, trascrizioni TXT, annunci e Detective. La trovi con VIP ed Elite e nelle configurazioni Secret Plan su preventivo. La sua demo vocale arriverà a breve.'; }
    const chosen = /\b(standard|pro|vip|elite|secret)\b/.exec(q)?.[1];
    if (chosen) plan = chosen;
    if (plan && /quanto costa|prezzo|costo|all'anno|annuale|al mese/.test(q) && !/tutti|tutti i piani|confront/.test(q)) {
      topic = 'price'; offer = ['vip','elite'].includes(plan) ? 'quotes' : 'features';
      const p = plans[plan];
      return p ? `${p.name}: ${p.monthly.toLocaleString('it-IT')} €/mese oppure ${p.annual.toLocaleString('it-IT')} €/anno. Con l’annuale hai 2 mesi gratis rispetto a dodici mensilità.${offer === 'quotes' ? ' Vuoi che ti spieghi anche le quote incluse?' : ' Vuoi sapere cosa comprende?'}` : 'Per Secret Plan prepariamo un preventivo sulla tua rete: nessun prezzo standard da inventare 😊';
    }
    if (plan && /cosa (?:include|comprende)|cosa (?:ho|ottengo)|e incluso/.test(q) && !chosen) return veronicaReply(`Cosa include ${plan}?`);
    let answer = veronicaReply(message);
    if (/quote di VIP ed Elite|Chiedimi delle quote/.test(answer)) offer = 'quotes';
    else if (/tariffe oltre quota/.test(answer)) offer = 'rates';
    else if (/differenza|sorella|Vanessa/.test(answer)) topic = 'sisters';
    if (/Questa è una demo informativa guidata/.test(answer)) return 'Su questo non voglio improvvisare 😊 Qui conosco i piani e le funzionalità PRIME e posso fare due chiacchiere con te, ma questa resta una demo guidata. Proviamo con un’altra domanda?';
    return answer;
  };
}
