#!/usr/bin/env python3
"""
DeepSeek Chat Viewer — visualizador local do export de dados do DeepSeek.

Uso:
    python server.py                       # procura um export na pasta dados/ (ou ao lado do script)
    python server.py caminho/export.zip    # usa um .zip específico
    python server.py caminho/pasta         # usa uma pasta já extraída
    python server.py --port 9000 --no-browser

Só usa a biblioteca padrão do Python (3.8+). Tudo roda na sua máquina e o
servidor escuta apenas em 127.0.0.1: nenhum dado sai do seu computador.
"""
import argparse
import json
import os
import re
import sys
import threading
import unicodedata
import webbrowser
import zipfile
import io
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import topics  # noqa: E402  (detecção de temas, ver topics.py)

CUSTOM_PATH = os.path.join(HERE, "topicos.json")  # temas criados por você
STATIC = os.path.join(HERE, "static")
MAX_FILE = 300 * 1024 * 1024      # limite por arquivo dentro do zip
MAX_UPLOAD = 1024 * 1024 * 1024   # limite de upload pela interface


# ----------------------------------------------------------------------------
# Texto / busca
# ----------------------------------------------------------------------------
def fold(s):
    """Minúsculas e sem acentos, preservando o comprimento (índices alinhados)."""
    out = []
    for c in s:
        n = unicodedata.normalize("NFD", c)[:1].lower()
        out.append(n if len(n) == 1 else c)
    return "".join(out)


def fragment_text(frag, with_thinking=False):
    t = frag.get("type", "")
    if t in ("REQUEST", "RESPONSE"):
        return frag.get("content") or ""
    if with_thinking and t == "THINK":
        return frag.get("content") or ""
    return ""


# ----------------------------------------------------------------------------
# Carregamento do export (zip ou pasta) — tudo em memória, nada é extraído
# ----------------------------------------------------------------------------
class Store:
    def __init__(self):
        self.source = None
        self.chats = {}       # id -> dict completo
        self.meta = {}        # id -> metadados do índice
        self.search_text = {}  # id -> (title, texto original, texto "folded")
        self.user_name = ""
        self.errors = []
        self.analysis = {"chat_cats": {}, "chat_kw": {}}

    # -- leitura --------------------------------------------------------
    @staticmethod
    def _read_zip(data_or_path):
        files = {}
        with zipfile.ZipFile(data_or_path) as z:
            for info in z.infolist():
                if info.is_dir() or info.file_size > MAX_FILE:
                    continue
                name = info.filename.replace("\\", "/")
                if name.lower().endswith(".json"):
                    files[name] = z.read(info)
        return files

    @staticmethod
    def _read_dir(path):
        files = {}
        for root, _dirs, names in os.walk(path):
            for n in names:
                if n.lower().endswith(".json"):
                    full = os.path.join(root, n)
                    if os.path.getsize(full) > MAX_FILE:
                        continue
                    rel = os.path.relpath(full, path).replace("\\", "/")
                    with open(full, "rb") as fh:
                        files[rel] = fh.read()
        return files

    def load(self, source):
        """source: caminho (zip/pasta) ou bytes de um zip."""
        if isinstance(source, (bytes, bytearray)):
            files = self._read_zip(io.BytesIO(source))
            label = "arquivo enviado"
        elif os.path.isdir(source):
            files = self._read_dir(source)
            label = source
        else:
            files = self._read_zip(source)
            label = source

        chats, errors = {}, []
        index, user = [], {}
        for name, raw in files.items():
            base = name.rsplit("/", 1)[-1].lower()
            try:
                obj = json.loads(raw.decode("utf-8-sig"))
            except Exception as e:  # noqa: BLE001
                errors.append("%s: %s" % (name, e))
                continue
            parts = name.lower().split("/")
            if "chat_sessions" in parts[:-1] and isinstance(obj, dict) and "messages" in obj:
                cid = str(obj.get("id") or base[:-5])
                obj["id"] = cid
                chats[cid] = obj
            elif base == "chat_session_index.json" and isinstance(obj, list):
                index = obj
            elif base == "user.json" and isinstance(obj, dict):
                user = obj

        if not chats:
            raise ValueError(
                "Nenhum chat encontrado. O export deve conter a pasta 'chat_sessions'."
            )

        meta = {}
        for it in index:
            if isinstance(it, dict) and it.get("id"):
                meta[str(it["id"])] = it

        self.source = label
        self.chats = chats
        self.meta = meta
        self.errors = errors
        self.user_name = self._user_name(user)
        self._build_search()

    @staticmethod
    def _user_name(user):
        for p in user.get("oauth_profiles") or []:
            try:
                prof = json.loads(p.get("profile_json") or "{}")
                if prof.get("name"):
                    return prof["name"]
            except Exception:  # noqa: BLE001
                pass
        return ""

    def _build_search(self):
        self.search_text = {}
        for cid, c in self.chats.items():
            chunks = []
            for m in c.get("messages", []):
                for f in m.get("fragments", []) or []:
                    t = fragment_text(f)
                    if t:
                        chunks.append(t)
            text = "\n".join(chunks)
            title = c.get("title") or ""
            self.search_text[cid] = (title, text, fold(text), fold(title))
        self.analysis = topics.analyze(self.chats)

    def topics_payload(self):
        """Grupos de temas (personalizados, categorias e palavras-chave) + temas de cada chat."""
        custom = topics.custom_groups(topics.load_custom(CUSTOM_PATH), self.search_text)
        auto = topics.build_groups(self.analysis, list(self.chats))
        groups = custom + auto
        chat_topics = {cid: [] for cid in self.chats}
        for g in groups:
            if g["kind"] == "keyword":
                continue
            for cid in g["chat_ids"]:
                if cid in chat_topics:
                    chat_topics[cid].append(g["key"])
        return {
            "groups": groups,
            "chat_topics": chat_topics,
            "chat_keywords": {cid: kws[:6] for cid, kws in self.analysis["chat_kw"].items()},
        }

    # -- API --------------------------------------------------------------
    def summary(self, cid):
        c = self.chats[cid]
        m = self.meta.get(cid, {})
        msgs = c.get("messages", [])
        first_user = ""
        for msg in msgs:
            if msg.get("role") == "USER":
                for f in msg.get("fragments", []) or []:
                    if f.get("type") == "REQUEST":
                        first_user = (f.get("content") or "")[:160]
                        break
                if first_user:
                    break
        times = [x.get("inserted_at") for x in msgs if x.get("inserted_at")]
        return {
            "id": cid,
            "title": c.get("title") or m.get("title") or "(sem título)",
            "pinned": bool(c.get("pinned", m.get("pinned", False))),
            "message_count": len(msgs),
            "inserted_at": c.get("inserted_at") or m.get("inserted_at") or (min(times) if times else None),
            "updated_at": c.get("updated_at") or m.get("updated_at") or (max(times) if times else None),
            "preview": first_user,
        }

    def list(self):
        return [self.summary(cid) for cid in self.chats]

    def search(self, query, limit=200):
        terms = [t for t in fold(query).split() if t]
        if not terms:
            return []
        results = []
        for cid, (title, text, ftext, ftitle) in self.search_text.items():
            blob = ftitle + "\n" + ftext
            if not all(t in blob for t in terms):
                continue
            count = sum(ftext.count(t) + ftitle.count(t) for t in terms)
            snippet = None
            pos = ftext.find(terms[0])
            if pos < 0:
                for t in terms[1:]:
                    pos = ftext.find(t)
                    if pos >= 0:
                        break
            if pos >= 0:
                tl = len(terms[0])
                a = max(0, pos - 70)
                b = min(len(text), pos + tl + 110)
                snippet = {
                    "before": ("…" if a > 0 else "") + text[a:pos].replace("\n", " "),
                    "match": text[pos:pos + tl].replace("\n", " "),
                    "after": text[pos + tl:b].replace("\n", " ") + ("…" if b < len(text) else ""),
                }
            results.append({
                "id": cid,
                "count": count,
                "title_match": any(t in ftitle for t in terms),
                "snippet": snippet,
            })
        results.sort(key=lambda r: (not r["title_match"], -r["count"]))
        return results[:limit]


STORE = Store()
LOCK = threading.Lock()


def find_default_source():
    cands = []
    for base in (os.path.join(HERE, "dados"), HERE, os.getcwd()):
        if not os.path.isdir(base):
            continue
        if os.path.isdir(os.path.join(base, "chat_sessions")):
            cands.append(base)
        for n in sorted(os.listdir(base)):
            full = os.path.join(base, n)
            if n.lower().endswith(".zip") and zipfile.is_zipfile(full):
                try:
                    with zipfile.ZipFile(full) as z:
                        if any("chat_sessions/" in i.filename.replace("\\", "/") for i in z.infolist()):
                            cands.append(full)
                except Exception:  # noqa: BLE001
                    pass
            elif os.path.isdir(full) and os.path.isdir(os.path.join(full, "chat_sessions")):
                cands.append(full)
    return cands[0] if cands else None


# ----------------------------------------------------------------------------
# HTTP
# ----------------------------------------------------------------------------
MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "DeepSeekViewer/1.0"

    def log_message(self, fmt, *args):  # silencioso
        pass

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _host_ok(self):
        # protege contra DNS rebinding: só aceita localhost
        host = (self.headers.get("Host") or "").split(":")[0].lower()
        return host in ("127.0.0.1", "localhost", "[::1]", "::1")

    def do_GET(self):
        if not self._host_ok():
            return self._json({"error": "forbidden"}, 403)
        url = urlparse(self.path)
        path = unquote(url.path)

        if path == "/api/status":
            with LOCK:
                return self._json({
                    "loaded": bool(STORE.chats),
                    "source": STORE.source,
                    "user": STORE.user_name,
                    "count": len(STORE.chats),
                    "errors": STORE.errors[:5],
                })
        if path == "/api/chats":
            with LOCK:
                return self._json(STORE.list())
        if path.startswith("/api/chats/"):
            cid = path[len("/api/chats/"):]
            with LOCK:
                chat = STORE.chats.get(cid)
            if chat is None:
                return self._json({"error": "not found"}, 404)
            return self._json(chat)
        if path == "/api/search":
            q = (parse_qs(url.query).get("q") or [""])[0]
            with LOCK:
                return self._json(STORE.search(q))
        if path == "/api/topics":
            with LOCK:
                return self._json(STORE.topics_payload())

        # arquivos estáticos
        if path == "/":
            path = "/index.html"
        rel = os.path.normpath(path.lstrip("/"))
        full = os.path.join(STATIC, rel)
        if not os.path.abspath(full).startswith(os.path.abspath(STATIC) + os.sep) or not os.path.isfile(full):
            self.send_response(404)
            self.end_headers()
            return
        with open(full, "rb") as fh:
            body = fh.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(os.path.splitext(full)[1].lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not self._host_ok():
            return self._json({"error": "forbidden"}, 403)
        origin = self.headers.get("Origin")
        if origin and urlparse(origin).hostname not in ("127.0.0.1", "localhost", "::1"):
            return self._json({"error": "forbidden"}, 403)  # bloqueia POST vindo de outros sites
        route = urlparse(self.path).path
        if route == "/api/custom":  # salva a lista completa de temas personalizados
            try:
                n = int(self.headers.get("Content-Length") or 0)
                if n <= 0 or n > 2 * 1024 * 1024:
                    return self._json({"error": "Requisição inválida."}, 400)
                body = json.loads(self.rfile.read(n).decode("utf-8"))
                saved = topics.save_custom(CUSTOM_PATH, body.get("topics", []))
            except (ValueError, OSError) as e:
                return self._json({"error": "Não consegui salvar: %s" % e}, 400)
            return self._json({"ok": True, "count": len(saved)})
        if route != "/api/load":
            return self._json({"error": "not found"}, 404)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > MAX_UPLOAD:
                return self._json({"error": "Arquivo vazio ou grande demais."}, 400)
            data = self.rfile.read(n)
            new = Store()
            new.load(data)
        except zipfile.BadZipFile:
            return self._json({"error": "Esse arquivo não é um .zip válido."}, 400)
        except Exception as e:  # noqa: BLE001
            return self._json({"error": str(e)}, 400)
        with LOCK:
            STORE.__dict__.update(new.__dict__)
        return self._json({"ok": True, "count": len(STORE.chats)})


def main():
    ap = argparse.ArgumentParser(description="Visualizador local de chats do DeepSeek")
    ap.add_argument("source", nargs="?", help="export .zip ou pasta extraída")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    src = args.source or find_default_source()
    if src:
        try:
            STORE.load(src)
            print("Carregado: %s  (%d chats)" % (src, len(STORE.chats)))
        except Exception as e:  # noqa: BLE001
            print("Não consegui carregar '%s': %s" % (src, e), file=sys.stderr)
            if args.source:
                sys.exit(1)
    else:
        print("Nenhum export encontrado — arraste o .zip para a janela do navegador.")

    httpd = None
    for port in range(args.port, args.port + 20):
        try:
            httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            break
        except OSError:
            continue
    if httpd is None:
        print("Nenhuma porta livre encontrada.", file=sys.stderr)
        sys.exit(1)

    url = "http://127.0.0.1:%d/" % httpd.server_address[1]
    print("\n  Abra no navegador: %s\n  (Ctrl+C para encerrar)\n" % url)
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrado.")


if __name__ == "__main__":
    main()
