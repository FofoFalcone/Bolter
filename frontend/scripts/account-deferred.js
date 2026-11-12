/**
 * <shopify-account> montato all'intenzione, per i clienti non connessi (sections/header.liquid, data-account-template).
 *
 * Perché: appena è nella pagina, il componente prepara il login con Shop nel suo foglio chiuso (login-form, shop-login,
 * iframe di shop.app con ~30 script e un font da 65 KB). Nel Lighthouse mobile del 2026-11-12 erano 4 task da ~60 ms
 * all'avvio e quasi tutto il TBT (740 ms). Shopify non documenta un'opzione per rimandarlo né un metodo per aprire il
 * foglio (shopify.dev, componente shopify-account: solo gli attributi menu e sign-in-url, gli eventi open/close, lo slot
 * e il part signed-out-avatar), quindi:
 * - mouse sopra il link: il componente prende il suo posto prima del clic, che arriva al componente vero;
 * - clic senza montaggio (tocco, tastiera): si monta, si attende la definizione e si preme il pulsante del part
 *   signed-out-avatar. Se il foglio non si apre (evento open) entro il limite, si va alla pagina di accesso, la stessa
 *   destinazione del link senza JS.
 * Il link e il pulsante del componente hanno lo stesso aspetto (stesse misure e icona): lo scambio non si vede.
 */

// Pacchetto del componente: URL documentato da Shopify (guida "Hydrogen with account component"). Nei temi lo carica già
// content_for_header; si aggiunge solo se non c'è, perché non è documentato se Shopify lo inserisce anche quando il
// componente è dentro un <template>.
const ACCOUNT_SCRIPT = 'https://cdn.shopify.com/storefront/web-components/account.js';
const READY_TIMEOUT = 5000; // ms: definizione del componente e primo disegno del pulsante, anche su rete lenta
const OPEN_TIMEOUT = 1500; // ms: dal clic sul pulsante all'evento open

function loadAccountScript() {
  if (customElements.get('shopify-account')) return;
  if (document.querySelector(`script[src^="${ACCOUNT_SCRIPT}"]`)) return;
  const script = document.createElement('script');
  script.type = 'module';
  script.src = ACCOUNT_SCRIPT;
  document.head.append(script);
}

/** Pulsante del componente (part documentato), atteso fotogramma per fotogramma: il componente disegna dopo l'upgrade. */
function waitForButton(account, deadline) {
  return new Promise((resolve, reject) => {
    const check = () => {
      const button = account.shadowRoot?.querySelector('[part~="signed-out-avatar"]');
      if (button) resolve(button);
      else if (performance.now() > deadline || !account.isConnected) reject(new Error('account button not ready'));
      else requestAnimationFrame(check);
    };
    check();
  });
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

async function openAccount(account, fallbackUrl) {
  account.setAttribute('aria-busy', 'true');
  try {
    const deadline = performance.now() + READY_TIMEOUT;
    await withTimeout(customElements.whenDefined('shopify-account'), READY_TIMEOUT);
    const button = await waitForButton(account, deadline);
    const opened = new Promise((resolve) => account.addEventListener('open', resolve, { once: true }));
    // Focus prima del clic: chiudendo il foglio il focus torna qui, non su <body> (il link cliccato non c'è più)
    button.focus({ preventScroll: true });
    button.click();
    await withTimeout(opened, OPEN_TIMEOUT);
  } catch {
    window.location.href = fallbackUrl;
  } finally {
    account.removeAttribute('aria-busy');
  }
}

/**
 * @param {HTMLElement} root header
 * @param {AbortSignal} signal
 * @param {() => void} [onMount] chiamato dopo l'inserimento del componente
 */
export function setupDeferredAccount(root, signal, onMount) {
  const template = root.querySelector('template[data-account-template]');
  const link = root.querySelector('a[data-account-fallback]');
  if (!template || !link) return;

  link.setAttribute('aria-haspopup', 'dialog');
  let account = null;

  const mount = () => {
    if (account) return account;
    account = template.content.querySelector('shopify-account')?.cloneNode(true) ?? null;
    if (!account) return null;
    link.replaceWith(account);
    template.remove();
    loadAccountScript();
    onMount?.();
    return account;
  };

  // Il pacchetto si può scaricare già alla pressione: da solo non avvia il login con Shop (serve il componente)
  link.addEventListener('pointerdown', loadAccountScript, { signal, once: true });
  link.addEventListener(
    'pointerenter',
    (event) => {
      if (event.pointerType === 'mouse') mount();
    },
    { signal },
  );
  link.addEventListener(
    'click',
    (event) => {
      // Tasti modificatori (nuova scheda/finestra): resta un link normale
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      const mounted = mount();
      if (mounted) openAccount(mounted, link.href);
      else window.location.href = link.href;
    },
    { signal },
  );
}
