import test from "node:test";
import assert from "node:assert/strict";
import { startVoiceInput } from "./public/voice-input.js";

test("dettatura: inserimento, selezione, ricerca reattiva, conflitti, numeri e permessi", () => {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    MutationObserver: globalThis.MutationObserver,
  };
  let fields = [],
    observer,
    last;
  class Element {
    constructor(type = "text", value = "") {
      Object.assign(this, {
        type,
        value,
        children: [],
        attrs: {},
        isConnected: true,
        visible: true,
        selectionStart: value.length,
        selectionEnd: value.length,
        events: [],
      });
      this.classList = { add() {}, remove() {} };
    }
    before(wrap) {
      this.wrap = wrap;
    }
    append(...children) {
      this.children.push(...children);
    }
    setAttribute(k, v) {
      this.attrs[k] = v;
    }
    dispatchEvent(event) {
      this.events.push(event.type);
    }
    checkVisibility() {
      return this.visible;
    }
  }
  class Recognition {
    constructor() {
      last = this;
    }
    start() {
      this.onstart();
    }
    stop() {
      this.onend();
    }
    abort() {
      this.onend();
    }
    result(text) {
      this.onresult({
        results: [Object.assign([{ transcript: text }], { isFinal: true })],
      });
    }
  }
  const text = new Element("text", "Via "),
    password = new Element("password");
  fields = [text, password];
  globalThis.document = {
    body: {},
    querySelectorAll(selector) {
      assert.ok(!selector.includes('input[type="password"]'));
      return fields.filter((f) => f.type !== "password");
    },
    createElement() {
      return new Element();
    },
  };
  globalThis.window = { SpeechRecognition: Recognition, addEventListener() {} };
  globalThis.MutationObserver = class {
    constructor(cb) {
      observer = cb;
    }
    observe() {}
  };
  const button = (f) => f.wrap.children[1],
    status = (f) => f.wrap.children[2];
  try {
    startVoiceInput();
    assert.equal(password.wrap, undefined);
    button(text).onclick();
    last.result("Roma");
    last.stop();
    assert.equal(text.value, "Via Roma");
    assert.deepEqual(text.events, ["input", "change"]);
    text.selectionStart = 4;
    text.selectionEnd = 8;
    button(text).onclick();
    last.result("Milano");
    last.stop();
    assert.equal(text.value, "Via Milano");
    button(text).onclick();
    text.value = "Modifica manuale";
    last.result("Test");
    last.stop();
    assert.equal(text.value, "Modifica manuale");
    assert.match(status(text).textContent, /modificato/);
    const number = new Element("number", "100");
    fields.push(number);
    observer();
    button(number).onclick();
    last.result("450.000 euro");
    last.stop();
    assert.equal(number.value, "450000");
    button(number).onclick();
    last.result("non è un numero");
    last.stop();
    assert.equal(number.value, "450000");
    assert.match(status(number).textContent, /non riconosciuto/);
    button(text).onclick();
    last.onerror({ error: "not-allowed" });
    last.stop();
    assert.match(status(text).textContent, /negato/);
    button(text).onclick();
    text.visible = false;
    observer();
    assert.equal(button(text).attrs["aria-pressed"], "false");
    globalThis.window.SpeechRecognition = undefined;
    button(number).onclick();
    assert.match(status(number).textContent, /non supportata/);
    const before = number.wrap;
    observer();
    assert.equal(number.wrap, before);
  } finally {
    Object.assign(globalThis, previous);
  }
});
