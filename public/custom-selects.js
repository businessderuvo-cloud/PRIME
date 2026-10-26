const enhanced = new WeakMap();
const openMenus = new Set();
let nextId = 0;

function enhance(select) {
  if (!(select instanceof HTMLSelectElement) || enhanced.has(select) || select.multiple) return;

  const wrapper = document.createElement("span");
  wrapper.className = "prime-select-wrap";
  select.before(wrapper);
  wrapper.append(select);
  select.classList.add("prime-select-source");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "prime-select-trigger";
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", select.getAttribute("aria-label") || select.labels?.[0]?.textContent?.trim() || "Seleziona un’opzione");
  const label = document.createElement("span");
  label.className = "prime-select-value";
  const arrow = document.createElement("span");
  arrow.className = "prime-select-arrow";
  arrow.setAttribute("aria-hidden", "true");
  trigger.append(label, arrow);

  const menu = document.createElement("div");
  menu.className = "prime-select-menu";
  menu.id = `prime-select-${++nextId}`;
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  trigger.setAttribute("aria-controls", menu.id);
  wrapper.append(trigger, menu);

  let activeIndex = Math.max(0, select.selectedIndex);
  let typeahead = "";
  let typeaheadTimer;

  function syncValue() {
    const option = select.options[select.selectedIndex];
    label.textContent = option?.textContent?.trim() || "Seleziona…";
    trigger.disabled = select.disabled;
    trigger.classList.toggle("is-placeholder", !select.value);
    if (select.required && !select.value) trigger.setAttribute("aria-invalid", "true");
    else trigger.removeAttribute("aria-invalid");
    for (const button of menu.querySelectorAll('[role="option"]')) {
      const selected = Number(button.dataset.index) === select.selectedIndex;
      button.setAttribute("aria-selected", String(selected));
      button.classList.toggle("is-selected", selected);
    }
  }

  function renderOptions() {
    menu.replaceChildren();
    [...select.options].forEach((option, index) => {
      if (option.hidden) return;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "prime-select-option";
      item.id = `${menu.id}-option-${index}`;
      item.setAttribute("role", "option");
      item.dataset.index = String(index);
      item.textContent = option.textContent.trim();
      item.disabled = option.disabled;
      item.addEventListener("pointermove", () => {
        if (!item.disabled) setActive(index);
      });
      item.addEventListener("click", () => choose(index));
      menu.append(item);
    });
    syncValue();
  }

  function setActive(index) {
    const options = [...menu.querySelectorAll('[role="option"]:not(:disabled)')];
    if (!options.length) return;
    const item = options.find(option => Number(option.dataset.index) === index) || options[0];
    activeIndex = Number(item.dataset.index);
    trigger.setAttribute("aria-activedescendant", item.id);
    for (const option of options) option.classList.toggle("is-active", option === item);
    item.scrollIntoView({ block: "nearest" });
  }

  function open(prefer = "selected") {
    if (trigger.disabled) return;
    renderOptions();
    for (const other of [...openMenus]) if (other !== close) other();
    menu.hidden = false;
    wrapper.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    openMenus.add(close);
    const preferred = prefer === "first"
      ? [...select.options].findIndex(option => !option.disabled && !option.hidden)
      : prefer === "last"
        ? [...select.options].map((option, index) => option.disabled || option.hidden ? -1 : index).filter(index => index >= 0).at(-1)
        : select.selectedIndex;
    setActive(preferred);
  }

  function close() {
    menu.hidden = true;
    wrapper.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
    openMenus.delete(close);
  }
  close.wrapper = wrapper;

  function choose(index) {
    const option = select.options[index];
    if (!option || option.disabled) return;
    const changed = select.value !== option.value;
    select.selectedIndex = index;
    syncValue();
    close();
    if (changed) {
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    trigger.focus();
  }

  trigger.addEventListener("click", () => menu.hidden ? open() : close());
  trigger.addEventListener("keydown", event => {
    const enabled = [...menu.querySelectorAll('[role="option"]:not(:disabled)')];
    const current = enabled.findIndex(item => Number(item.dataset.index) === activeIndex);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (menu.hidden) open(event.key === "ArrowDown" ? "selected" : "last");
      else {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const next = enabled[(current + direction + enabled.length) % enabled.length];
        if (next) setActive(Number(next.dataset.index));
      }
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (menu.hidden) open();
      else choose(activeIndex);
    } else if (event.key === "Escape") {
      close();
    } else if (event.key === "Home" || event.key === "End") {
      if (!menu.hidden && enabled.length) {
        event.preventDefault();
        setActive(Number((event.key === "Home" ? enabled[0] : enabled.at(-1)).dataset.index));
      }
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      typeahead += event.key.toLocaleLowerCase("it");
      clearTimeout(typeaheadTimer);
      typeaheadTimer = setTimeout(() => { typeahead = ""; }, 700);
      const match = [...select.options].findIndex((option, index) => !option.disabled && option.textContent.trim().toLocaleLowerCase("it").startsWith(typeahead) && index !== select.selectedIndex);
      if (match >= 0) {
        if (menu.hidden) open();
        setActive(match);
      }
    }
  });

  select.addEventListener("change", syncValue);
  select.addEventListener("invalid", event => {
    event.preventDefault();
    trigger.setAttribute("aria-invalid", "true");
    trigger.focus();
  });
  const optionsObserver = new MutationObserver(renderOptions);
  optionsObserver.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "hidden", "selected", "label"] });
  enhanced.set(select, { wrapper, refresh: renderOptions });
  syncValue();
}

export function startCustomSelects() {
  function scan(node) {
    if (node instanceof HTMLSelectElement) enhance(node);
    if (node instanceof Element || node instanceof DocumentFragment)
      node.querySelectorAll?.("select").forEach(enhance);
  }
  scan(document);
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) scan(node);
      if (record.target instanceof HTMLSelectElement) enhanced.get(record.target)?.refresh();
    }
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("pointerdown", event => {
    for (const close of [...openMenus]) if (!close.wrapper.contains(event.target)) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Tab") for (const close of [...openMenus]) close();
  });
}
