// Récupération du transcript. Tout ce fichier doit rester autonome : fetchTranscript
// est aussi injecté tel quel dans l'onglet YouTube (chrome.scripting) en secours.

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
 * Retourne { title, channel, duration, lang, auto, text } ou lève une Error
 * dont le message est affichable tel quel.
 * `sameOrigin` : true quand la fonction tourne dans une page youtube.com.
 */
export async function fetchTranscript(videoId, langs, sameOrigin) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    credentials: sameOrigin ? "same-origin" : "omit",
    headers: { "Content-Type": "application/json" },
    // Le client web exige un jeton anti-bot pour lire les sous-titres ; le client Android non.
    body: JSON.stringify({
      context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, hl: "fr" } },
      videoId,
    }),
  });
  if (!res.ok) throw new Error(`YouTube a répondu ${res.status}.`);
  const data = await res.json();
  const status = data.playabilityStatus || {};
  const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (!tracks.length) {
    if (status.status && status.status !== "OK") throw new Error(status.reason || "Vidéo indisponible.");
    throw new Error("Cette vidéo n'a pas de sous-titres.");
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

  const subUrl = new URL(track.baseUrl);
  subUrl.searchParams.set("fmt", "json3");
  const sub = await fetch(subUrl, { credentials: sameOrigin ? "same-origin" : "omit" });
  const raw = sub.ok ? (await sub.text()).trim() : "";
  if (!raw) throw new Error("YouTube a renvoyé des sous-titres vides.");

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
  if (!text) throw new Error("Les sous-titres de cette vidéo sont vides.");

  const d = data.videoDetails || {};
  return {
    title: d.title || videoId,
    channel: d.author || "",
    duration: Number(d.lengthSeconds) || null,
    lang: track.languageCode,
    auto: track.kind === "asr",
    text,
  };
}
