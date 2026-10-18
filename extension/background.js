import { DEFAULT_TEMPLATE } from "./defaults.js";
import { extractVideoId, readTranscript } from "./transcript.js";

const DEFAULTS = { langs: "fr,en", autoSend: true, template: DEFAULT_TEMPLATE };
const CHATGPT = "https://chatgpt.com/";
const YT_LINKS = ["*://*.youtube.com/watch*", "*://*.youtube.com/shorts/*", "*://*.youtube.com/live/*", "*://youtu.be/*"];

// ---------------------------------------------------------------- déclencheurs
chrome.action.onClicked.addListener(tab => summarize(tab, tab.url));
chrome.commands.onCommand.addListener((cmd, tab) => { if (cmd === "summarize" && tab) summarize(tab, tab.url); });

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "link", title: "Résumer cette vidéo avec ChatGPT", contexts: ["link"], targetUrlPatterns: YT_LINKS });
    chrome.contextMenus.create({ id: "page", title: "Résumer cette vidéo avec ChatGPT", contexts: ["page", "video"], documentUrlPatterns: YT_LINKS });
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => summarize(tab, info.menuItemId === "link" ? info.linkUrl : tab.url));

// L'onglet ChatGPT vient chercher son prompt une fois chargé. Le prompt n'est effacé qu'après
// insertion réussie : si la page se recharge entre-temps (contrôle Cloudflare, connexion), il reste disponible.
const PENDING_TTL = 3 * 60 * 1000;
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!sender.tab || !msg?.type?.startsWith("ytsum:")) return;
  const key = `pending:${sender.tab.id}`;
  if (msg.type === "ytsum:done") { chrome.storage.session.remove(key); return; }
  if (msg.type !== "ytsum:pending") return;
  chrome.storage.session.get(key).then(got => {
    const job = got[key];
    if (job && Date.now() - job.at > PENDING_TTL) { chrome.storage.session.remove(key); return reply(null); }
    reply(job || null);
  });
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => chrome.storage.session.remove(`pending:${tabId}`));

// ---------------------------------------------------------------- flux principal
const running = new Set();

async function summarize(tab, url) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    return notify(tab, "error", "Ouvre une vidéo YouTube, puis clique à nouveau.");
  }
  if (running.has(videoId)) return;
  running.add(videoId);
  try {
    // Le transcript se lit dans une page de lecture : on en ouvre une si l'onglet n'en est pas
    // une (lien, Short, autre site) et la suite se passe alors dans ce nouvel onglet.
    const opened = !isWatchPage(tab?.url, videoId);
    if (opened) {
      tab = await chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${videoId}`, index: tab ? tab.index + 1 : undefined, openerTabId: tab?.id });
      // Muet le temps de la lecture du transcript : la vidéo peut démarrer toute seule.
      await chrome.tabs.update(tab.id, { muted: true });
      await loaded(tab.id);
    }
    setBadge(tab, "…", "#868e96");
    notify(tab, "loading", "Récupération du transcript…");
    const cfg = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
    const langs = cfg.langs.split(",").map(s => s.trim()).filter(Boolean);
    const video = await getTranscript(tab, videoId, langs, opened).finally(() => {
      if (opened) chrome.tabs.update(tab.id, { muted: false }).catch(() => {});
    });
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const prompt = render(cfg.template, { ...video, url: videoUrl });

    await copyToClipboard(prompt).catch(() => {});
    const gpt = await chrome.tabs.create({ url: "about:blank", index: tab ? tab.index + 1 : undefined, openerTabId: tab?.id });
    await chrome.storage.session.set({ [`pending:${gpt.id}`]: { prompt, autoSend: cfg.autoSend, at: Date.now() } });
    await chrome.tabs.update(gpt.id, { url: CHATGPT });

    const words = video.text.split(" ").length.toLocaleString("fr-FR");
    notify(tab, "ok", `Envoyé à ChatGPT · ${words} mots${video.auto ? " · sous-titres auto" : ""}`);
    setBadge(tab, "✓", "#2f9e44", 2500);
  } catch (e) {
    notify(tab, "error", e?.message || String(e));
    setBadge(tab, "!", "#e03131", 4000);
  } finally {
    running.delete(videoId);
  }
}

function isWatchPage(url, videoId) {
  return /^https:\/\/www\.youtube\.com\/(watch\?|live\/)/.test(url || "") && extractVideoId(url) === videoId;
}

function loaded(tabId) {
  return new Promise(resolve => {
    const done = (id, info) => {
      if (id !== tabId || info.status !== "complete") return;
      chrome.tabs.onUpdated.removeListener(done);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(done);
    chrome.tabs.get(tabId).then(t => t.status === "complete" && done(tabId, t)).catch(() => {});
  });
}

async function getTranscript(tab, videoId, langs, pauseVideo) {
  // Monde MAIN : la fonction a besoin du lecteur de la page (getPlayerResponse).
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: readTranscript, // autonome : sérialisée et exécutée dans la page
    args: [videoId, langs, pauseVideo],
  });
  if (!result) throw new Error("Lecture du transcript impossible dans cet onglet.");
  if (result.error) throw new Error(result.error);
  return result;
}

function render(template, v) {
  const vars = { title: v.title, channel: v.channel, url: v.url, transcript: v.text };
  return template.replace(/\{(title|channel|url|transcript)\}/g, (_, k) => vars[k]);
}

// ---------------------------------------------------------------- presse-papier
async function copyToClipboard(text) {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["CLIPBOARD"], justification: "Copier le prompt de résumé." });
  }
  await chrome.runtime.sendMessage({ type: "ytsum:copy", text });
}

// ---------------------------------------------------------------- retours visuels
function setBadge(tab, text, color, clearAfter) {
  if (!tab?.id) return;
  const tabId = tab.id;
  chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  if (clearAfter) setTimeout(() => chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {}), clearAfter);
}

/** Petit toast dans la page d'origine. Silencieux si la page n'est pas injectable (chrome://, etc.). */
function notify(tab, kind, message) {
  if (!tab?.id) return;
  if (kind === "error") chrome.action.setTitle({ tabId: tab.id, title: `ytsum : ${message}` }).catch(() => {});
  chrome.scripting.executeScript({ target: { tabId: tab.id }, func: toast, args: [kind, message] }).catch(() => {});
}

function toast(kind, message) {
  const ID = "ytsum-toast";
  let host = document.getElementById(ID);
  if (!host) {
    host = document.createElement("div");
    host.id = ID;
    host.attachShadow({ mode: "open" }).innerHTML = `
      <style>
        .t { position: fixed; z-index: 2147483647; top: 20px; right: 20px; max-width: 360px;
             display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-radius: 10px;
             background: #1b1e23; color: #f1f3f5; border: 1px solid #2f343b;
             font: 500 13.5px/1.4 -apple-system, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
             box-shadow: 0 10px 30px rgba(0,0,0,.28); opacity: 0; transform: translateY(-6px);
             transition: opacity .16s, transform .16s; }
        .t.show { opacity: 1; transform: none; }
        .i { width: 16px; height: 16px; flex: none; display: grid; place-items: center; }
        .spin { width: 14px; height: 14px; border: 2px solid #495057; border-top-color: #8c9bff; border-radius: 50%; animation: s .8s linear infinite; }
        .ok { color: #51cf66; } .error { color: #ff6b6b; }
        @keyframes s { to { transform: rotate(360deg); } }
      </style>
      <div class="t" role="status"><span class="i"></span><span class="m"></span></div>`;
    document.documentElement.appendChild(host);
  }
  const root = host.shadowRoot, box = root.querySelector(".t"), icon = root.querySelector(".i");
  icon.className = "i " + kind;
  icon.innerHTML = kind === "loading" ? '<div class="spin"></div>' : kind === "ok" ? "✓" : "!";
  root.querySelector(".m").textContent = message;
  requestAnimationFrame(() => box.classList.add("show"));
  clearTimeout(host._timer);
  if (kind !== "loading") host._timer = setTimeout(() => { box.classList.remove("show"); setTimeout(() => host.remove(), 200); }, kind === "error" ? 5000 : 2600);
}

// Pour les tests automatisés.
globalThis.ytsum = { summarize, extractVideoId, readTranscript };
