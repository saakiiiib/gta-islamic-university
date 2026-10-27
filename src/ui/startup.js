/** Menu state exists before importing Three.js; loading cannot overwrite a choice. */
export function createCharacterSelection() {
  let value = 'hujur';
  const listeners = new Set();
  return {
    get value() { return value; },
    select(type) {
      if (!['hujur', 'niqab'].includes(type) || type === value) return false;
      value = type;
      for (const listener of listeners) listener(value);
      return true;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export function createLanding(doc, { reload = () => doc.defaultView.location.reload() } = {}) {
  const $ = id => doc.getElementById(id);
  const selection = createCharacterSelection();
  let ready = false;
  const refreshSelection = () => {
    for (const pill of doc.querySelectorAll('.char-pill')) {
      const selected = !pill.hidden && pill.dataset.char === selection.value;
      pill.classList.toggle('active', selected);
      pill.setAttribute('aria-pressed', String(selected));
    }
  };
  for (const pill of doc.querySelectorAll('.char-pill:not([hidden])')) {
    pill.addEventListener('click', () => selection.select(pill.dataset.char));
  }
  selection.subscribe(refreshSelection);
  refreshSelection();
  $('retry-loading')?.addEventListener('click', reload);
  const dialog = $('controlsDialog');
  $('controlsButton')?.addEventListener('click', () => dialog?.showModal());
  for (const button of doc.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  $('motionToggle')?.addEventListener('click', () => {
    const paused = $('landing').classList.toggle('motion-paused');
    $('motionToggle').setAttribute('aria-pressed', String(paused));
    $('motionToggle').setAttribute('aria-label', `${paused ? 'Resume' : 'Pause'} background animation`);
  });
  return {
    selection,
    get ready() { return ready; },
    setReady(value) {
      ready = Boolean(value);
      $('enterButton').disabled = !ready;
      $('loadingPanel').hidden = ready;
      $('enterButtonLabel').textContent = 'ENTER CAMPUS';
    },
    progress(message, { completed, total, loadedBytes, totalBytes, detail } = {}) {
      const byteProgress = Number.isFinite(totalBytes) && totalBytes > 0;
      const countProgress = Number.isFinite(total) && total > 0;
      const fraction = byteProgress ? loadedBytes / totalBytes : countProgress ? completed / total : null;
      const percent = fraction === null ? null : Math.min(100, Math.max(0, Math.floor(fraction * 100)));
      $('loadingMessage').textContent = message;
      $('loadingPercent').textContent = detail ?? (byteProgress
        ? `${Math.round((loadedBytes ?? 0) / 1024)} / ${Math.round(totalBytes / 1024)} KB`
        : countProgress ? `${completed} / ${total}` : '');
      $('loadingBar').style.width = `${percent ?? 0}%`;
      $('loadingProgress').dataset.indeterminate = String(percent === null);
      if (percent === null) $('loadingProgress').removeAttribute('aria-valuenow');
      else $('loadingProgress').setAttribute('aria-valuenow', String(percent));
      $('loadingProgress').setAttribute('aria-valuetext', `${message} ${$('loadingPercent').textContent}`);
    },
    fail(error) {
      this.setReady(false);
      doc.body.dataset.gameState = 'error';
      $('error-message').textContent = error?.message || String(error);
      $('error-message').hidden = false;
      $('retry-loading').hidden = false;
      this.progress('Loading stopped. Retry when your connection is ready.');
    },
  };
}
