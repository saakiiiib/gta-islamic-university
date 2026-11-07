import { searchPlaces } from '../map/placeNames.js';

let searchSequence = 0;

/** Accessible local place search. Selecting a result delegates navigation to the caller. */
export function mountPlaceSearch({ places, onSelect, parent = globalThis.document?.body } = {}) {
  if (!Array.isArray(places) || typeof onSelect !== 'function') throw new TypeError('Place search needs places and an onSelect callback');
  const doc = parent?.ownerDocument;
  if (!doc) throw new TypeError('Place search needs a parent DOM element');
  const prefix = `campus-place-search-${++searchSequence}`, listeners = [];
  const create = (tag, className) => {
    const element = doc.createElement(tag); if (className) element.className = className; return element;
  };
  const root = create('section', 'place-search'); root.setAttribute('role', 'search');
  root.setAttribute('aria-label', 'Campus places / ক্যাম্পাসের স্থান');
  const label = create('label', 'place-search-label'); label.htmlFor = `${prefix}-input`;
  label.textContent = 'Find a place / স্থান খুঁজুন';
  const input = create('input', 'place-search-input'); input.id = `${prefix}-input`; input.type = 'search';
  input.placeholder = 'English or বাংলা'; input.autocomplete = 'off'; input.spellcheck = false;
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', `${prefix}-results`); input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-describedby', `${prefix}-status`);
  const list = create('ul', 'place-search-results'); list.id = `${prefix}-results`; list.setAttribute('role', 'listbox'); list.hidden = true;
  list.setAttribute('aria-label', 'Matching places / মিলে যাওয়া স্থান');
  const status = create('p', 'place-search-status'); status.id = `${prefix}-status`; status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  root.append(label, input, list, status); parent.append(root);
  let source = places, results = [], active = -1, open = false, destroyed = false;
  const listen = (target, name, callback, options) => {
    target.addEventListener(name, callback, options); listeners.push(() => target.removeEventListener(name, callback, options));
  };
  function syncActive() {
    for (const [index, option] of [...list.children].entries()) option.setAttribute('aria-selected', String(index === active));
    if (open && active >= 0) input.setAttribute('aria-activedescendant', `${prefix}-option-${active}`);
    else input.removeAttribute('aria-activedescendant');
  }
  function close() {
    open = false; active = -1; list.hidden = true; input.setAttribute('aria-expanded', 'false'); syncActive();
  }
  function choose(index) {
    const place = results[index]; if (!place || destroyed) return;
    input.value = place.displayName ?? place.name; close(); onSelect(place);
  }
  function render(show = open) {
    results = searchPlaces(source, input.value, 8); active = -1; list.replaceChildren();
    for (const [index, place] of results.entries()) {
      const option = create('li', 'place-search-option'); option.id = `${prefix}-option-${index}`;
      option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
      const primary = create('span', 'place-search-name'); primary.textContent = place.names?.en ?? place.displayName ?? place.name;
      option.append(primary);
      if (place.names?.bn && place.names.bn !== primary.textContent) {
        const bangla = create('span', 'place-search-name-bn'); bangla.lang = 'bn'; bangla.textContent = place.names.bn; option.append(bangla);
      } else if (!place.names?.en && place.names?.bn) primary.lang = 'bn';
      // Individual options are replaced as a unit; their short-lived handlers
      // disappear with them. Keep the input focused for combobox keyboard use.
      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => choose(index)); list.append(option);
    }
    status.textContent = results.length ? `${results.length} places / ${results.length}টি স্থান` : 'No places found / কোনো স্থান পাওয়া যায়নি';
    open = show && results.length > 0; list.hidden = !open; input.setAttribute('aria-expanded', String(open)); syncActive();
  }
  listen(input, 'input', () => render(true));
  listen(input, 'focus', () => render(true));
  listen(input, 'blur', close);
  listen(input, 'keydown', event => {
    event.stopPropagation();
    // Enter while composing বাংলা text belongs to the input method, not selection.
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); if (!open) render(true); if (!results.length) return;
      active = event.key === 'ArrowDown' ? (active + 1) % results.length : (active <= 0 ? results.length - 1 : active - 1);
      syncActive(); list.children[active]?.scrollIntoView?.({ block: 'nearest' }); return;
    }
    if (event.key === 'Enter' && open) { event.preventDefault(); choose(active >= 0 ? active : 0); }
    if (event.key === 'Tab') close();
  });
  // Key releases must reach the game's window listeners, including keys held
  // before focus entered this control; keydown remains isolated for typing.
  listen(doc, 'pointerdown', event => { if (!root.contains(event.target)) close(); });
  render(false);
  return { element: root, input, close, focus() { if (!destroyed && !root.hidden) input.focus(); },
    setPlaces(next) { if (!Array.isArray(next)) throw new TypeError('Place search needs a place array'); source = next; if (!destroyed) render(); },
    setVisible(visible) { root.hidden = !visible; if (!visible) { close(); if (doc.activeElement === input) input.blur(); } },
    destroy() { if (destroyed) return; destroyed = true; listeners.forEach(remove => remove()); list.replaceChildren(); root.remove(); } };
}
