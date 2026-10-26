const editable =
  'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="tel"], input[type="email"], input[type="url"], input[type="number"]';
const attached = new WeakSet();
let active = null;

function errorMessage(error, isEdge) {
  const messages = {
    "not-allowed": "Accesso al microfono negato. Nelle impostazioni del sito in Edge, consenti Microfono e ricarica PRIME.",
    "service-not-allowed": "Edge ha bloccato il servizio di riconoscimento vocale. Controlla le autorizzazioni Microfono e i servizi vocali nelle impostazioni di Edge e riprova.",
    "audio-capture": "Microfono non disponibile. Seleziona un microfono in Edge e chiudi le altre app che lo stanno usando.",
    "no-speech": "Non ho sentito la voce. Controlla il microfono e riprova.",
    network: "Edge non riesce a raggiungere il proprio servizio di riconoscimento vocale. Verifica la connessione e riprova.",
    aborted: "Dettatura interrotta.",
  };
  return messages[error] || (isEdge
    ? `Edge non ha completato la dettatura (${error || "errore sconosciuto"}). Controlla le autorizzazioni del microfono e riprova.`
    : `Dettatura non disponibile (${error || "errore sconosciuto"}). Riprova.`);
}

export function startVoiceInput() {
  function attach() {
    document.querySelectorAll(editable).forEach((input) => {
      if (
        attached.has(input) ||
        input.readOnly ||
        input.disabled ||
        input.hasAttribute("data-no-voice")
      ) return;
      attached.add(input);
      const wrap = document.createElement("span");
      wrap.className = "voice-input-wrap";
      input.before(wrap);
      wrap.append(input);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "voice-input-button";
      button.title = "Dettatura vocale";
      button.setAttribute("aria-label", "Detta in questo campo");
      button.setAttribute("aria-pressed", "false");
      button.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3.25 3.25 0 0 0-3.25 3.25v5.5a3.25 3.25 0 0 0 6.5 0v-5.5A3.25 3.25 0 0 0 12 3Z"/><path d="M5.5 10.5v1.25a6.5 6.5 0 0 0 13 0V10.5M12 18.25V22m-4 0h8"/></svg>';
      const status = document.createElement("span");
      status.className = "voice-input-status";
      status.setAttribute("role", "status");
      status.hidden = true;
      wrap.append(button, status);
      function message(text) {
        status.textContent = text;
        status.hidden = false;
      }
      button.onclick = async () => {
        if (active?.button === button) {
          active.recognition.stop();
          return;
        }
        if (active) {
          message("Termina prima la dettatura nell’altro campo.");
          return;
        }
        const Recognition =
          window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) {
          message(
            "Dettatura non supportata da questo browser. Apri PRIME in un browser con riconoscimento vocale o usa la dettatura della tastiera del dispositivo.",
          );
          return;
        }
        if (window.isSecureContext === false) {
          message("Il microfono richiede una connessione HTTPS. Apri l’indirizzo sicuro di PRIME o usa localhost.");
          return;
        }
        const isEdge = /Edg\//.test(navigator.userAgent || "");
        if (!input.isConnected || !input.checkVisibility() || input.disabled || input.readOnly) return;
        const recognition = new Recognition();
        recognition.lang = "it-IT";
        recognition.continuous = false;
        recognition.interimResults = true;
        const original = input.value;
        const start = input.selectionStart ?? original.length;
        const end = input.selectionEnd ?? start;
        let preview = "";
        let receivedFinal = false;
        let recognitionError = false;
        active = { recognition, button, input };
        recognition.onstart = () => {
          button.classList.add("listening");
          button.setAttribute("aria-pressed", "true");
          button.setAttribute("aria-label", "Termina dettatura");
          button.title = "Termina dettatura";
          message("In ascolto… premi il microfono per terminare.");
        };
        recognition.onresult = (event) => {
          if (
            !input.isConnected ||
            !input.checkVisibility() ||
            input.disabled ||
            input.readOnly
          )
            return;
          const results = Array.from(event.results);
          const hasFinalResult = results.some((result) => result.isFinal);
          let text = results.map((r) => r[0].transcript).join(" ").trim();
          if (!text) return;
          if (input.type === "number" && !hasFinalResult) {
            message(`Ho sentito: «${text}»…`);
            return;
          }
          if (input.type === "number") {
            text = text
              .replace(/euro|metri quadrati|percento/gi, "")
              .replace(/\s/g, "")
              .replace(/\.(?=\d{3}(?:\D|$))/g, "")
              .replace(",", ".");
            if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
              recognitionError = true;
              message(
                "Numero non riconosciuto. Pronuncia le cifre o inseriscilo con la tastiera.",
              );
              return;
            }
          }
          if (input.value !== original && input.value !== preview) {
            message(
              "Il campo è stato modificato durante la dettatura: riprova per conservare le modifiche.",
            );
            recognitionError = true;
            return;
          }
          receivedFinal ||= hasFinalResult;
          const prefix =
              input.type === "number" ? "" : original.slice(0, start),
            suffix = input.type === "number" ? "" : original.slice(end);
          input.value =
            prefix +
            (prefix && !/\s$/.test(prefix) ? " " : "") +
            text +
            (suffix && !/^\s/.test(suffix) ? " " : "") +
            suffix;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          preview = input.value;
          message(
            receivedFinal
              ? "Testo trascritto. Puoi correggerlo prima di salvare."
              : `Ho sentito: «${text}»…`,
          );
        };
        recognition.onerror = (event) => {
          recognitionError = true;
          message(errorMessage(event.error, isEdge));
        };
        recognition.onend = () => {
          active = null;
          button.classList.remove("listening");
          button.setAttribute("aria-pressed", "false");
          button.setAttribute("aria-label", "Detta in questo campo");
          button.title = "Dettatura vocale";
          if (!recognitionError && !receivedFinal && !preview)
            message(
              isEdge
                ? "Edge ha attivato il microfono ma non ha restituito testo. Controlla il microfono predefinito di Windows e i servizi vocali online di Edge, poi riprova."
                : "Nessuna trascrizione ricevuta. Controlla il microfono e riprova.",
            );
          else if (!recognitionError && preview && !receivedFinal)
            message("Ho inserito le parole riconosciute. Verificale e completa il testo se serve.");
          else if (!recognitionError && receivedFinal)
            message("Testo trascritto. Puoi correggerlo prima di salvare.");
        };
        try {
          recognition.start();
        } catch (error) {
          active = null;
          message(errorMessage(error.name === "NotAllowedError" ? "not-allowed" : error.name, isEdge));
        }
      };
    });
    if (
      active &&
      (!active.input.isConnected || !active.input.checkVisibility())
    )
      active.recognition.abort();
  }
  new MutationObserver(attach).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open", "hidden"],
  });
  window.addEventListener("pagehide", () => active?.recognition.abort());
  attach();
}
