import { DEFAULT_TEMPLATE } from "./defaults.js";

const DEFAULTS = { langs: "fr,en", autoSend: true, template: DEFAULT_TEMPLATE };
const $ = id => document.getElementById(id);
const status = $("status");
let timer;

function saved() {
  status.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(() => status.classList.remove("show"), 1400);
}
const save = patch => chrome.storage.sync.set(patch).then(saved);

const cfg = await chrome.storage.sync.get(DEFAULTS);
$("autoSend").checked = cfg.autoSend;
$("langs").value = cfg.langs;
$("template").value = cfg.template;

$("autoSend").addEventListener("change", e => save({ autoSend: e.target.checked }));
$("langs").addEventListener("change", e => save({ langs: e.target.value }));
let debounce;
$("template").addEventListener("input", e => {
  clearTimeout(debounce);
  debounce = setTimeout(() => save({ template: e.target.value || DEFAULT_TEMPLATE }), 400);
});
$("reset").addEventListener("click", () => { $("template").value = DEFAULT_TEMPLATE; save({ template: DEFAULT_TEMPLATE }); });
