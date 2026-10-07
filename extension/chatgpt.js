// Dans l'onglet ChatGPT ouvert par l'extension : insère le prompt, puis l'envoie si demandé.
(async () => {
  const job = await chrome.runtime.sendMessage({ type: "ytsum:pending" }).catch(() => null);
  if (!job) return;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(150); }
    return null;
  };
  const hint = text => {
    const d = document.createElement("div");
    d.textContent = text;
    d.style.cssText = "position:fixed;z-index:2147483647;top:20px;right:20px;max-width:360px;padding:11px 14px;border-radius:10px;background:#1b1e23;color:#f1f3f5;border:1px solid #2f343b;font:500 13.5px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.28)";
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 6000);
  };

  // L'éditeur est monté après le chargement et peut remplacer un champ provisoire :
  // on réessaie jusqu'à ce que le texte tienne réellement dans le champ.
  const findBox = () =>
    document.querySelector("#prompt-textarea[contenteditable='true'], div.ProseMirror[contenteditable='true']") ||
    document.querySelector("textarea#prompt-textarea, main textarea");
  const content = el => (el.tagName === "TEXTAREA" ? el.value : el.innerText || "").trim();
  // Un long collage peut être converti par ChatGPT en pièce jointe : le champ reste alors vide, c'est normal.
  const attached = () => document.querySelector("[data-testid*='attachment'], [class*='attachment']");
  const filled = () => { const el = findBox(); return (el && content(el).length > 20) || !!attached(); };

  const insert = async box => {
    box.focus();
    if (box.tagName === "TEXTAREA") {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(box, job.prompt);
      box.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const dt = new DataTransfer();
    dt.setData("text/plain", job.prompt);
    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(250);
    if (!filled()) document.execCommand("insertText", false, job.prompt);
  };

  let ok = false;
  for (const end = Date.now() + 30000; Date.now() < end && !ok; ) {
    const box = findBox();
    if (box) {
      if (!filled()) await insert(box);
      await sleep(600); // le texte doit survivre à l'hydratation de la page
      ok = filled();
    } else await sleep(200);
  }
  chrome.runtime.sendMessage({ type: "ytsum:done" }).catch(() => {});
  if (!ok) return hint("ytsum : insertion impossible, colle le prompt avec Ctrl+V.");
  if (!job.autoSend) return;

  const send = await waitFor(() => {
    const b = document.querySelector("button[data-testid='send-button'], #composer-submit-button, button[aria-label*='Send' i], button[aria-label*='Envoyer' i]");
    return b && !b.disabled ? b : null;
  }, 8000);
  if (send) send.click();
  else hint("ytsum : prompt inséré, appuie sur Entrée pour l'envoyer.");
})();
