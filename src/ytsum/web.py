"""Interface web locale : `ytsum-web` lance un serveur sur localhost et ouvre le navigateur."""

from __future__ import annotations

import argparse
import threading
from pathlib import Path

import yt_dlp
from flask import Flask, jsonify, request, send_from_directory

from ytsum import PROMPT_TEMPLATE, NoTranscript, load_video, open_browser, render_prompt, save_outputs

STATIC = Path(__file__).with_name("static")
app = Flask(__name__, static_folder=None)
app.config["OUT_DIR"] = Path("summaries")
app.config["TEMPLATE"] = PROMPT_TEMPLATE


@app.get("/")
def index():
    return send_from_directory(STATIC, "index.html")


@app.get("/api/template")
def template():
    return jsonify(template=Path(app.config["TEMPLATE"]).read_text(encoding="utf-8"))


@app.post("/api/transcript")
def transcript():
    body = request.get_json(silent=True) or {}
    url = (body.get("url") or "").strip()
    langs = tuple(l.strip() for l in (body.get("langs") or "fr,en").split(",") if l.strip())
    if not url:
        return jsonify(error="URL manquante"), 400
    try:
        video = load_video(url, langs)
    except ValueError as e:
        return jsonify(error=str(e)), 400
    except NoTranscript:
        return jsonify(error="Aucun sous-titre disponible pour cette vidéo."), 404
    except yt_dlp.utils.DownloadError as e:
        return jsonify(error=str(e).removeprefix("ERROR: ")), 502

    template_text = body.get("template") or Path(app.config["TEMPLATE"]).read_text(encoding="utf-8")
    try:
        prompt = render_prompt(video, template_text)
    except (KeyError, IndexError, ValueError) as e:
        return jsonify(error=f"Template invalide (placeholder inconnu : {e})"), 400
    saved = None
    if app.config["OUT_DIR"] is not None:
        saved = str(save_outputs(video, prompt, app.config["OUT_DIR"]))
    return jsonify(
        id=video.id,
        title=video.title,
        duration=video.duration,
        thumbnail=video.thumbnail,
        transcript=video.transcript,
        channel=video.channel,
        url=video.url,
        lang=video.transcript_lang,
        auto=video.auto_generated,
        words=len(video.transcript.split()),
        prompt=prompt,
        saved=saved,
    )


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="ytsum-web", description="Interface web locale de ytsum.")
    p.add_argument("-p", "--port", type=int, default=8765)
    p.add_argument("-d", "--out-dir", type=Path, default=Path("summaries"))
    p.add_argument("-t", "--template", type=Path, default=PROMPT_TEMPLATE)
    p.add_argument("--no-save", action="store_true", help="ne rien écrire sur le disque")
    p.add_argument("--no-browser", action="store_true", help="ne pas ouvrir le navigateur")
    args = p.parse_args(argv)

    app.config["OUT_DIR"] = None if args.no_save else args.out_dir.resolve()
    app.config["TEMPLATE"] = args.template
    url = f"http://127.0.0.1:{args.port}/"
    print(f"ytsum-web : {url}  (Ctrl+C pour arrêter)")
    if not args.no_browser:
        threading.Timer(0.8, open_browser, args=(url,)).start()
    app.run(host="127.0.0.1", port=args.port, debug=False)


if __name__ == "__main__":
    main()
