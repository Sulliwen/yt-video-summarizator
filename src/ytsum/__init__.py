"""ytsum : récupère le transcript d'une vidéo YouTube et prépare le prompt de résumé."""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import json

import pyperclip
import yt_dlp

PROMPT_TEMPLATE = Path(__file__).with_name("prompt.md")
CHATGPT_URL = "https://chatgpt.com/"
DEFAULT_LANGS = ("fr", "en")


@dataclass
class Video:
    id: str
    title: str
    channel: str
    transcript: str
    transcript_lang: str
    auto_generated: bool
    duration: int | None = None  # secondes
    thumbnail: str | None = None

    @property
    def url(self) -> str:
        return f"https://www.youtube.com/watch?v={self.id}"


# --------------------------------------------------------------------------- #
# YouTube
# --------------------------------------------------------------------------- #

_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def extract_video_id(url_or_id: str) -> str:
    """Accepte une URL youtube.com / youtu.be / shorts, ou directement un ID."""
    s = url_or_id.strip()
    if _ID_RE.match(s):
        return s
    parsed = urlparse(s if "://" in s else f"https://{s}")
    host = (parsed.hostname or "").lower()
    if host in ("youtu.be", "www.youtu.be"):
        candidate = parsed.path.lstrip("/").split("/")[0]
    elif host.endswith("youtube.com"):
        if parsed.path == "/watch":
            candidate = parse_qs(parsed.query).get("v", [""])[0]
        else:
            # /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
            parts = [p for p in parsed.path.split("/") if p]
            candidate = parts[-1] if parts else ""
    else:
        raise ValueError(f"URL YouTube non reconnue : {url_or_id}")
    if not _ID_RE.match(candidate):
        raise ValueError(f"Impossible d'extraire l'ID de la vidéo depuis : {url_or_id}")
    return candidate


class NoTranscript(Exception):
    """Aucun sous-titre exploitable pour cette vidéo."""


class _SilentLogger:
    """yt-dlp affiche ses erreurs lui-même ; on les gère nous-mêmes via DownloadError."""

    def debug(self, msg: str) -> None: ...
    def info(self, msg: str) -> None: ...
    def warning(self, msg: str) -> None: ...
    def error(self, msg: str) -> None: ...


def _parse_json3(raw: str) -> str:
    data = json.loads(raw)
    parts: list[str] = []
    for ev in data.get("events", []):
        if ev.get("aAppend"):  # événements de mise en page des sous-titres auto
            continue
        text = "".join(seg.get("utf8", "") for seg in ev.get("segs", []))
        text = text.replace("\n", " ").strip()
        if text:
            parts.append(text)
    return " ".join(parts)


_VTT_TAG_RE = re.compile(r"<[^>]+>")
_VTT_TIME_RE = re.compile(r"^\d{2}:\d{2}:\d{2}\.\d{3} --> ")


def _parse_vtt(raw: str) -> str:
    """Les VTT auto-générés de YouTube répètent chaque ligne (effet défilement) : on déduplique."""
    parts: list[str] = []
    last = ""
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith(("WEBVTT", "Kind:", "Language:", "NOTE")) or _VTT_TIME_RE.match(line):
            continue
        line = _VTT_TAG_RE.sub("", line).replace("&nbsp;", " ").strip()
        if line and line != last:
            parts.append(line)
            last = line
    return " ".join(parts)


def _pick_track(info: dict, langs: tuple[str, ...]) -> tuple[dict, str, bool]:
    """Choisit la piste : manuelle dans une langue voulue, puis auto, puis n'importe laquelle."""
    manual: dict = info.get("subtitles") or {}
    auto: dict = info.get("automatic_captions") or {}

    def lookup(tracks: dict, lang: str) -> list | None:
        # "fr" doit aussi matcher "fr-FR" ou "fr-orig"
        for code, fmts in tracks.items():
            if code == lang or code.split("-")[0] == lang:
                return fmts
        return None

    for is_auto, tracks in ((False, manual), (True, auto)):
        for lang in langs:
            fmts = lookup(tracks, lang)
            if fmts:
                return _pick_format(fmts), lang, is_auto
    for is_auto, tracks in ((False, manual), (True, auto)):
        for code, fmts in tracks.items():
            if fmts:
                return _pick_format(fmts), code, is_auto
    raise NoTranscript


def _pick_format(fmts: list[dict]) -> dict:
    for ext in ("json3", "vtt"):
        for f in fmts:
            if f.get("ext") == ext:
                return f
    raise NoTranscript


# YouTube déclenche parfois un "Sign in to confirm you're not a bot" sur le client web ;
# le client android y échappe en général (au prix de moins de sous-titres auto disponibles).
_CLIENT_FALLBACKS: tuple[list[str] | None, ...] = (None, ["android"], ["android", "web"])


def _extract_info(video_id: str) -> tuple[dict, yt_dlp.YoutubeDL]:
    url = f"https://www.youtube.com/watch?v={video_id}"
    last: Exception | None = None
    for clients in _CLIENT_FALLBACKS:
        opts: dict = {"quiet": True, "no_warnings": True, "skip_download": True, "logger": _SilentLogger()}
        if clients:
            opts["extractor_args"] = {"youtube": {"player_client": clients}}
        ydl = yt_dlp.YoutubeDL(opts)
        try:
            return ydl.extract_info(url, download=False), ydl
        except yt_dlp.utils.DownloadError as e:
            last = e
            if "not a bot" not in str(e) and "formats found" not in str(e):
                raise
    assert last is not None
    raise last


def load_video(url_or_id: str, langs: tuple[str, ...]) -> Video:
    video_id = extract_video_id(url_or_id)
    info, ydl = _extract_info(video_id)
    with ydl:
        fmt, lang, is_auto = _pick_track(info, langs)
        raw = ydl.urlopen(fmt["url"]).read().decode("utf-8")
    text = _parse_json3(raw) if fmt["ext"] == "json3" else _parse_vtt(raw)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        raise NoTranscript
    return Video(
        id=video_id,
        title=info.get("title") or video_id,
        channel=info.get("channel") or info.get("uploader") or "",
        transcript=text,
        transcript_lang=lang,
        auto_generated=is_auto,
        duration=info.get("duration"),
        thumbnail=info.get("thumbnail"),
    )


# --------------------------------------------------------------------------- #
# Prompt, sorties
# --------------------------------------------------------------------------- #


def build_prompt(video: Video, template_path: Path) -> str:
    return render_prompt(video, template_path.read_text(encoding="utf-8"))


def render_prompt(video: Video, template: str) -> str:
    return template.format(
        title=video.title,
        channel=video.channel,
        url=video.url,
        transcript=video.transcript,
    )


def slugify(text: str, max_len: int = 60) -> str:
    s = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE).strip().lower()
    s = re.sub(r"[\s_-]+", "-", s)
    return s[:max_len].strip("-") or "video"


def save_outputs(video: Video, prompt: str, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    base = f"{date.today():%Y-%m-%d}-{slugify(video.title)}"
    transcript_path = out_dir / f"{base}.transcript.txt"
    prompt_path = out_dir / f"{base}.prompt.md"
    header = (
        f"# {video.title}\n"
        f"Chaîne : {video.channel}\nURL : {video.url}\n"
        f"Transcript : {video.transcript_lang}"
        f"{' (auto-généré)' if video.auto_generated else ''}\n\n"
    )
    transcript_path.write_text(header + video.transcript + "\n", encoding="utf-8")
    prompt_path.write_text(prompt, encoding="utf-8")
    return prompt_path


def copy_to_clipboard(text: str) -> bool:
    try:
        pyperclip.copy(text)
        return True
    except pyperclip.PyperclipException:
        pass
    # Secours WSL : clip.exe attend de l'UTF-16 pour les accents.
    clip = shutil.which("clip.exe")
    if clip:
        subprocess.run([clip], input=text.encode("utf-16"), check=False)
        return True
    return False


def open_browser(url: str) -> None:
    for cmd in (["wslview", url], ["cmd.exe", "/c", "start", "", url], ["xdg-open", url]):
        if shutil.which(cmd[0]):
            subprocess.Popen(
                cmd, cwd="/mnt/c" if cmd[0] == "cmd.exe" else None,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            return
    print(f"Ouvre manuellement : {url}", file=sys.stderr)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="ytsum",
        description="Récupère le transcript d'une vidéo YouTube, construit le prompt de "
        "résumé et le copie dans le presse-papier, prêt à coller dans ChatGPT.",
    )
    p.add_argument("url", help="URL YouTube (watch, youtu.be, shorts) ou ID de la vidéo")
    p.add_argument(
        "-o", "--open", action="store_true", help="ouvre ChatGPT dans le navigateur après la copie"
    )
    p.add_argument(
        "-l",
        "--langs",
        default=",".join(DEFAULT_LANGS),
        help=f"langues de transcript préférées, par ordre (défaut : {','.join(DEFAULT_LANGS)})",
    )
    p.add_argument(
        "-d",
        "--out-dir",
        type=Path,
        default=Path("summaries"),
        help="dossier où sauvegarder transcript et prompt (défaut : ./summaries)",
    )
    p.add_argument(
        "-t",
        "--template",
        type=Path,
        default=PROMPT_TEMPLATE,
        help="fichier de template du prompt (placeholders : {title} {channel} {url} {transcript})",
    )
    p.add_argument("--no-clip", action="store_true", help="ne pas copier dans le presse-papier")
    p.add_argument("--no-save", action="store_true", help="ne rien écrire sur le disque")
    p.add_argument("--print", action="store_true", help="afficher le prompt complet sur stdout")
    args = p.parse_args(argv)

    langs = tuple(l.strip() for l in args.langs.split(",") if l.strip())

    try:
        video = load_video(args.url, langs)
    except ValueError as e:
        print(f"Erreur : {e}", file=sys.stderr)
        return 2
    except NoTranscript:
        print("Erreur : aucun sous-titre disponible pour cette vidéo.", file=sys.stderr)
        return 1
    except yt_dlp.utils.DownloadError as e:  # vidéo privée, supprimée, réseau…
        print(f"Erreur lors de la récupération : {e}", file=sys.stderr)
        return 1

    prompt = build_prompt(video, args.template)
    words = len(video.transcript.split())

    print(f"Vidéo     : {video.title}" + (f" — {video.channel}" if video.channel else ""))
    print(
        f"Transcript: {video.transcript_lang}"
        f"{' (auto-généré)' if video.auto_generated else ''}, ~{words} mots"
    )

    if not args.no_save:
        path = save_outputs(video, prompt, args.out_dir)
        print(f"Sauvegardé: {path}")

    if args.print:
        print("\n" + prompt)

    if not args.no_clip:
        if copy_to_clipboard(prompt):
            print("Prompt copié dans le presse-papier. Colle-le dans ChatGPT (Ctrl+V).")
        else:
            print("Impossible d'accéder au presse-papier, utilise --print.", file=sys.stderr)

    if args.open:
        open_browser(CHATGPT_URL)

    return 0


if __name__ == "__main__":
    sys.exit(main())
