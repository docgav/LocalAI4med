"""Serveur factice pour tester l'interface sans llamafile (developpement uniquement).

Sert app/ comme `llamafile --server --path app`, et imite /health et
/v1/chat/completions en streaming. Usage : python3 dev/serveur_factice.py [port]
Le fichier app/prompts/_liste.txt est regenere comme le fait Demarrer.bat.
"""
import json
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"


class Gestionnaire(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP), **kwargs)

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.startswith("/health"):
            return self._json({"status": "ok"})
        if self.path.startswith("/props"):
            return self._json({"model_path": "ressources\\gemma-4-E2B-it-Q4_K_M.gguf",
                               "modalities": {"vision": True, "audio": False}})
        self.path = self.path.split("?")[0]
        return super().do_GET()

    def do_POST(self):
        if not self.path.startswith("/v1/chat/completions"):
            return self.send_error(404)
        corps = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        messages = corps["messages"]
        dernier = messages[-1]["content"]
        images = 0
        if isinstance(dernier, list):
            images = sum(1 for p in dernier if p.get("type") == "image_url")
            dernier = " ".join(p.get("text", "") for p in dernier if p.get("type") == "text")
        reponse = f"[Réponse factice : {len(messages)} messages, système de {len(messages[0]['content'])} " \
                  f"caractères, {images} image(s)]\n\n**Reçu :** {dernier[:300]}"
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        for mot in reponse.split(" "):
            self._sse({"choices": [{"delta": {"content": mot + " "}}]})
            time.sleep(0.01)
        self._sse({"choices": [{"delta": {}, "finish_reason": "stop"}], "timings": {"predicted_per_second": 12.3}})
        self.wfile.write(b"data: [DONE]\n\n")

    def _sse(self, obj):
        self.wfile.write(b"data: " + json.dumps(obj).encode() + b"\n\n")
        self.wfile.flush()

    def _json(self, obj):
        donnees = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(donnees)))
        self.end_headers()
        self.wfile.write(donnees)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    prompts = APP / "prompts"
    liste = sorted(p.name for p in prompts.glob("*.txt") if not p.name.startswith("_"))
    (prompts / "_liste.txt").write_text("\n".join(liste) + "\n", encoding="utf-8")
    print(f"http://127.0.0.1:{port}/")
    ThreadingHTTPServer(("127.0.0.1", port), Gestionnaire).serve_forever()
