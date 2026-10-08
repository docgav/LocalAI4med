"""Serveur factice pour tester l'interface sans llamafile (developpement uniquement).

Sert app/ comme `llamafile --server --path app` (mode secours), et imite /health, /props et
/v1/chat/completions en streaming. Usage : python3 dev/serveur_factice.py [port] [--ui-defaut]
Avec --ui-defaut, "/" renvoie une fausse interface de discussion llamafile (mode complet : la page
est alors servie par la passerelle PowerShell et appelle cette API depuis une autre origine).
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

    def end_headers(self):
        # CORS comme llama-server (origine renvoyee telle quelle)
        origine = self.headers.get("Origin")
        if origine:
            self.send_header("Access-Control-Allow-Origin", origine)
            self.send_header("Access-Control-Allow-Headers", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            return self._json({"status": "ok"})
        if self.path.startswith("/props"):
            return self._json({"model_path": "ressources\\gemma-4-E2B-it-Q4_K_M.gguf",
                               "modalities": {"vision": True, "audio": False}})
        self.path = self.path.split("?")[0]
        if UI_DEFAUT:
            if self.path != "/":
                return self.send_error(404)
            corps = "<!doctype html><meta charset=utf-8><title>llama.cpp</title><h1>Interface llamafile factice</h1>".encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(corps)))
            self.end_headers()
            return self.wfile.write(corps)
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
        schema = ((corps.get("response_format") or {}).get("json_schema") or {}).get("schema") or {}
        if "rubriques" in schema.get("properties", {}):
            # Analyse factice d'un courrier (module d'extraction de modèle)
            reponse = json.dumps({"rubriques": [{"titre": "Motif", "contenu": "raison de l'hospitalisation"},
                                                {"titre": "Histoire de la maladie", "contenu": "chronologie"},
                                                {"titre": "Conclusion", "contenu": "diagnostic et suites"}],
                                  "style": "phrases courtes, passé composé", "formules": ["Cher confrère,"],
                                  "abreviations": [{"terme": "IRM", "definition": "imagerie par résonance magnétique"},
                                                   {"terme": "PL", "definition": "ponction lombaire"},
                                                   {"terme": "TDM", "definition": "tomodensitométrie"}],
                                  "termes": ["ocrélizumab", "bandes oligoclonales"]}, ensure_ascii=False)
        elif "notes" in schema.get("properties", {}):
            reponse = json.dumps({"notes": "patient fictif 40 ans, poussée", "document": "Cher confrère, ... Dr [NOM]"}, ensure_ascii=False)
        else:
            reponse = f"[Réponse factice : {len(messages)} messages, système de {len(messages[0]['content'])} " \
                      f"caractères, {images} image(s)]\n\n**Reçu :** {dernier[:300]}"
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        n_prompt = sum(len(str(m["content"])) for m in messages) // 4
        timings = {"prompt_n": n_prompt, "prompt_ms": 850.0, "predicted_n": 0, "predicted_ms": 0.0, "predicted_per_second": 0.0}
        time.sleep(0.3)
        # Reflexion simulee, puis reponse ; timings dans chaque paquet (timings_per_token)
        for mot in "Je relis les notes et choisis la structure du courrier.".split(" "):
            self._sse({"choices": [{"delta": {"reasoning_content": mot + " "}}]})
            time.sleep(0.02)
        for i, mot in enumerate(reponse.split(" "), 1):
            timings.update(predicted_n=i, predicted_ms=i * 80.0, predicted_per_second=12.5)
            self._sse({"choices": [{"delta": {"content": mot + " "}}], "timings": dict(timings)})
            time.sleep(0.01)
        self._sse({"choices": [{"delta": {}, "finish_reason": "stop"}], "timings": dict(timings)})
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


UI_DEFAUT = "--ui-defaut" in sys.argv

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    port = int(args[0]) if args else 8080
    prompts = APP / "prompts"
    liste = sorted(p.name for p in prompts.glob("*.txt") if not p.name.startswith("_"))
    (prompts / "_liste.txt").write_text("\n".join(liste) + "\n", encoding="utf-8")
    print(f"http://127.0.0.1:{port}/")
    ThreadingHTTPServer(("127.0.0.1", port), Gestionnaire).serve_forever()
