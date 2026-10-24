const editable =
  'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="tel"], input[type="email"], input[type="url"], input[type="number"]';
const attached = new WeakSet();
let active = null;
export function startVoiceInput() {
  function attach() {
    document.querySelectorAll(editable).forEach((input) => {
      if (attached.has(input) || input.readOnly || input.disabled) return;
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
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';
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
        if (globalThis.navigator?.mediaDevices?.getUserMedia) {
          try {
            const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            permissionStream.getTracks().forEach((track) => track.stop());
          } catch (error) {
            message(
              error.name === "NotAllowedError" || error.name === "SecurityError"
                ? "Consenti il microfono nelle autorizzazioni del sito e riprova."
                : error.name === "NotFoundError" || error.name === "NotReadableError"
                  ? "Microfono non trovato o già in uso da un’altra applicazione."
                  : "Impossibile attivare il microfono. Controlla le autorizzazioni del browser.",
            );
            return;
          }
        }
        const recognition = new Recognition();
        recognition.lang = "it-IT";
        recognition.continuous = false;
        recognition.interimResults = true;
        const original = input.value;
        const start = input.selectionStart ?? original.length;
        const end = input.selectionEnd ?? start;
        active = { recognition, button, input };
        recognition.onstart = () => {
          button.classList.add("listening");
          button.setAttribute("aria-pressed", "true");
          button.setAttribute("aria-label", "Termina dettatura");
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
          let text = Array.from(event.results)
            .filter((r) => r.isFinal)
            .map((r) => r[0].transcript)
            .join(" ")
            .trim();
          if (!text) return;
          if (input.type === "number") {
            text = text
              .replace(/euro|metri quadrati|percento/gi, "")
              .replace(/\s/g, "")
              .replace(/\.(?=\d{3}(?:\D|$))/g, "")
              .replace(",", ".");
            if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
              message(
                "Numero non riconosciuto. Pronuncia le cifre o inseriscilo con la tastiera.",
              );
              return;
            }
          }
          if (input.value !== original) {
            message(
              "Il campo è stato modificato durante la dettatura: riprova per conservare le modifiche.",
            );
            return;
          }
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
          message("Testo trascritto. Puoi correggerlo prima di salvare.");
        };
        recognition.onerror = (event) =>
          message(
            {
              "not-allowed":
                "Accesso al microfono negato. Consenti il microfono nelle impostazioni del browser.",
              "audio-capture": "Microfono non disponibile.",
              "no-speech": "Nessuna voce rilevata. Riprova.",
              network: "Il servizio vocale del browser non è raggiungibile.",
              aborted: "Dettatura interrotta.",
            }[event.error] || "Dettatura non disponibile. Riprova.",
          );
        recognition.onend = () => {
          active = null;
          button.classList.remove("listening");
          button.setAttribute("aria-pressed", "false");
          button.setAttribute("aria-label", "Detta in questo campo");
          if (status.textContent.startsWith("In ascolto"))
            message("Dettatura terminata.");
        };
        try {
          recognition.start();
        } catch {
          active = null;
          message("Impossibile avviare la dettatura in questo browser.");
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
