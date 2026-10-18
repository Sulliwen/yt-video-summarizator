// Récupération du transcript. Tout ce fichier doit rester autonome : readTranscript est
// injectée telle quelle dans l'onglet YouTube (chrome.scripting, monde MAIN).

export function extractVideoId(input) {
  const s = (input || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(s); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
      id = m && m[2];
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/**
 * S'exécute dans une page youtube.com/watch, avec le lecteur de la page.
 * Retourne { title, channel, duration, lang, auto, text }, ou { error } avec un message
 * affichable tel quel.
 *
 * Les URL de sous-titres exigent un jeton (pot) que seul le lecteur sait produire : on lui
 * fait charger des sous-titres via son module « captions » (état d'origine restauré ensuite),
 * on relit l'URL qu'il a demandée dans le Resource Timing, et on reporte son jeton sur la
 * piste voulue.
 * `pauseVideo` : true quand l'onglet a été ouvert par l'extension.
 */
export async function readTranscript(videoId, langs, pauseVideo) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fail = error => ({ error });

  // Le lecteur peut ne pas être prêt (onglet tout juste ouvert, navigation interne en cours).
  let player, resp;
  for (const end = Date.now() + 20000; Date.now() < end; await sleep(250)) {
    player = document.getElementById("movie_player");
    resp = player?.getPlayerResponse?.();
    if (resp?.videoDetails?.videoId === videoId) break;
    resp = null;
  }
  if (!resp) return fail("Le lecteur YouTube ne s'est pas chargé. Recharge la page et réessaie.");

  const tracks = resp.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (!tracks.length) {
    const status = resp.playabilityStatus || {};
    if (status.status && status.status !== "OK") return fail(status.reason || "Vidéo indisponible.");
    return fail("Cette vidéo n'a pas de sous-titres.");
  }

  const base = code => code.split("-")[0];
  const pick = auto => {
    for (const l of langs) {
      const t = tracks.find(t => (t.kind === "asr") === auto && (t.languageCode === l || base(t.languageCode) === l));
      if (t) return t;
    }
    return null;
  };
  const track = pick(false) || pick(true) || tracks.find(t => t.kind !== "asr") || tracks[0];

  // Fait demander des sous-titres au lecteur, en passant d'une piste à l'autre : il ne refait
  // pas la requête d'une piste déjà chargée. Pendant une publicité, ou tant que la vidéo n'a
  // jamais démarré, il n'en demande pas : on la lance alors en sourdine le temps de la capture.
  const signed = () => performance.getEntriesByType("resource").map(e => e.name)
    .filter(n => n.includes("/api/timedtext") && n.includes("pot=") && n.includes(`v=${videoId}`)).pop();
  const shown = player.getOption("captions", "track");
  const wasMuted = player.isMuted();
  performance.setResourceTimingBufferSize(5000);
  performance.clearResourceTimings();
  player.loadModule("captions");
  let captured, tries = 0, kicked = false, stalledSince = 0;
  const start = Date.now();
  while (!(captured = signed())) {
    const waited = Date.now() - start;
    const ad = player.classList.contains("ad-showing");
    if (waited > 90000 || (waited > 15000 && !ad)) break;
    if (!kicked && waited > 2500 && [-1, 5].includes(player.getPlayerState())) { kicked = true; player.mute(); player.playVideo(); }
    // Une publicité qui ne se lance pas ne finira jamais : inutile d'attendre 90 s.
    stalledSince = ad && document.querySelector("video")?.paused ? stalledSince || Date.now() : 0;
    if (kicked && stalledSince && Date.now() - stalledSince > 5000) break;
    const t = tracks[tries++ % tracks.length];
    player.setOption("captions", "track", { languageCode: t.languageCode, ...(t.kind ? { kind: t.kind } : {}) });
    for (let i = 0; i < 8 && !(captured = signed()); i++) await sleep(150);
    if (captured) break;
  }
  player.setOption("captions", "track", shown?.languageCode ? shown : {});
  if (kicked || pauseVideo) player.pauseVideo();
  if (kicked && !wasMuted) player.unMute();
  if (!captured) {
    return fail(player.classList.contains("ad-showing")
      ? "Une publicité bloque les sous-titres : lance la vidéo, puis réessaie à la fin de la pub."
      : "YouTube n'a pas fourni les sous-titres. Lance la vidéo quelques secondes et réessaie.");
  }

  const from = new URL(captured);
  const subUrl = new URL(track.baseUrl, location.href);
  for (const [k, v] of from.searchParams) {
    if (/^(pot|potc|c|cver|cplayer|cos|cosver|cplatform|cbr|cbrver|xorb|xobt|xovt)$/.test(k)) subUrl.searchParams.set(k, v);
  }
  subUrl.searchParams.set("fmt", "json3");
  const sub = await fetch(subUrl, { credentials: "same-origin" }).catch(() => null);
  const raw = sub?.ok ? (await sub.text()).trim() : "";
  if (!raw) return fail("YouTube a renvoyé des sous-titres vides.");

  let parts;
  if (raw.startsWith("{")) {
    parts = (JSON.parse(raw).events || [])
      .filter(e => e.segs && !e.aAppend)
      .map(e => e.segs.map(s => s.utf8 || "").join(""));
  } else {
    // YouTube ignore parfois fmt=json3 et renvoie du XML (<p> en srv3, <text> en ancien format).
    const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    const decode = t => t
      .replace(/&#(x?)([0-9a-f]+);/gi, (_, hex, n) => String.fromCodePoint(parseInt(n, hex ? 16 : 10)))
      .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => entities[n]);
    parts = [...raw.matchAll(/<(p|text)\b[^>]*>([\s\S]*?)<\/\1>/g)]
      .map(m => decode(decode(m[2].replace(/<[^>]+>/g, ""))));
  }
  const text = parts.map(t => t.replace(/\n/g, " ").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (!text) return fail("Les sous-titres de cette vidéo sont vides.");

  const d = resp.videoDetails;
  return {
    title: d.title || videoId,
    channel: d.author || "",
    duration: Number(d.lengthSeconds) || null,
    lang: track.languageCode,
    auto: track.kind === "asr",
    text,
  };
}
