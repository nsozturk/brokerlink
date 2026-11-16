#!/usr/bin/env python3
"""brokerlink — local daemon + MCP server for the brokerlink browser extension.

  python3 brokerlink.py serve     # daemon on 127.0.0.1:18890 (job queue the extension polls)
  python3 brokerlink.py mcp       # stdio MCP server for any LLM CLI (talks to the daemon)

The daemon never sees the MobilG session: the extension runs each call inside the user's own
logged-in tab. Every call is checked against extension/catalog.json here AND in the extension.
Raw responses are stored (sanitized) in data/raw.sqlite.
"""
import gzip, hashlib, json, os, re, sqlite3, sys, threading, time, uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = json.load(open(os.path.join(ROOT, "extension", "catalog.json")))
CONFIG_PATH = os.path.join(ROOT, "config.json")
DB_PATH = os.path.join(ROOT, "data", "raw.sqlite")
HOST, PORT = "127.0.0.1", 18890
JOB_TTL, WAIT_S = 150, 60

# Orders: the on/off switch lives in the extension popup (the extension enforces it; the daemon only
# mirrors it to answer early). Every order still waits for a human click in the popup, and the caps
# below (override in config.json) are checked before an order is ever queued.
DEFAULT_CONFIG = {"max_order_try": 2500, "max_daily_try": 10000}
_state = {"orders_enabled": True, "yolo": False}
SECRET_KEYS = {"clientId", "ClientId", "otpToken", "dataToken", "hashkey", "hashKey", "userName", "email", "l"}


def config():
    c = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_PATH):
        c.update(json.load(open(CONFIG_PATH)))
    return c


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------- raw store
def db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=30)
    c.execute("PRAGMA journal_mode=WAL")
    c.executescript("""CREATE TABLE IF NOT EXISTS blobs(sha TEXT PRIMARY KEY, body BLOB);
      CREATE TABLE IF NOT EXISTS fetches(id INTEGER PRIMARY KEY, ts TEXT, name TEXT, method TEXT,
        path TEXT, params TEXT, status INTEGER, sha TEXT);""")
    return c


def scrub(o):
    if isinstance(o, dict):
        return {k: ("<redacted>" if k in SECRET_KEYS else scrub(v)) for k, v in o.items()}
    if isinstance(o, list):
        return [scrub(x) for x in o]
    return o


def store(name, method, path, params, status, body):
    try:
        obj = json.loads(body)
        if isinstance(obj, str):                  # double-encoded JSON
            obj = json.loads(obj)
        body = json.dumps(scrub(obj), ensure_ascii=False)
    except Exception:
        pass
    raw = body.encode()
    sha = hashlib.sha256(raw).hexdigest()
    with db() as c:
        c.execute("INSERT OR IGNORE INTO blobs VALUES (?,?)", (sha, gzip.compress(raw)))
        c.execute("INSERT INTO fetches(ts,name,method,path,params,status,sha) VALUES (?,?,?,?,?,?,?)",
                  (now(), name, method, path, json.dumps(params, ensure_ascii=False), status, sha))
    return body


# ---------------------------------------------------------------- updates (git)
CHECK_EVERY_S = 3 * 3600                 # one `git fetch` per 3 hours; nothing else leaves the machine
_rel = {"t": 0.0, "at": None, "remote": None, "error": None}


def git(*args):
    import subprocess
    env = {**os.environ, "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin", "GIT_TERMINAL_PROMPT": "0"}
    return subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True, timeout=60,
                          check=True, env=env).stdout.strip()


def remote_release():
    if time.time() - _rel["t"] > CHECK_EVERY_S:
        _rel.update(t=time.time(), at=now())
        try:
            git("fetch", "--quiet", "origin", "main")
            _rel.update(remote=json.loads(git("show", "origin/main:extension/release.json")), error=None)
        except Exception as e:
            _rel["error"] = str(getattr(e, "stderr", "") or e)[:200]
    return _rel


# ---------------------------------------------------------------- job queue
jobs, results, lock, ready = {}, {}, threading.Lock(), threading.Condition()


def denied(path):
    return any(path.lower().startswith(p.lower()) for p in CATALOG["denied_prefixes"])


def build_job(req):
    """Validate a client request into a job. Returns (job, error)."""
    name = req.get("name")
    if req.get("kind") == "order":
        return order_job(req)
    e = CATALOG["endpoints"].get(name) or CATALOG["writes"].get(name)
    if not e:
        return None, f"unknown endpoint {name!r}; see catalog"
    if denied(e["path"]):
        return None, f"denied: {e['path']}"
    params = {k: v for k, v in (req.get("params") or {}).items() if k in e.get("params", [])}
    body = req.get("body") if name in CATALOG["writes"] else None
    return {"id": uuid.uuid4().hex, "name": name, "path": e["path"], "method": e.get("method", "GET"),
            "params": params, "body": body, "t": time.time()}, None


_daily = {"day": None, "sum": 0.0}


def order_job(req):
    """Equity order (BuySellAsync), cancel or amend. Off by default; capped; always needs a click
    in the popup. Body shapes verified from a MobilG HAR (2026-11-16)."""
    c = config()
    if not _state["orders_enabled"]:
        return None, "orders are disabled (switch them on in the brokerlink popup)"
    o = req.get("order") or {}
    action = o.get("action", "new")
    if action == "cancel":
        oid = str(o.get("orderId") or "")
        if not oid.isdigit():
            return None, "cancel needs a numeric orderId (from order_tracking)"
        return {"id": uuid.uuid4().hex, "kind": "order", "name": "order_cancel", "auth_in_body": True,
                "path": "OrderTransaction/orderCancelAsync", "method": "POST", "body": {"orderId": oid},
                "preview": f"CANCEL order {oid}", "t": time.time()}, None
    if action == "amend":
        try:
            oid, new_price, new_qty = str(o["orderId"]), float(o["newPrice"]), int(o["newAmount"])
            old_price, old_qty = float(o["oldPrice"]), int(o["oldAmount"])
        except (KeyError, ValueError) as e:
            return None, f"amend needs orderId, oldPrice, oldAmount, newPrice, newAmount: {e}"
        if new_price * new_qty > c["max_order_try"]:
            return None, f"amended order exceeds max_order_try {c['max_order_try']}"
        body = {"orderId": oid, "newPrice": f"{new_price:g}", "oldPrice": f"{old_price:g}",
                "oldAmount": str(old_qty), "newAmount": str(new_qty), "approval": "2", "seance": o.get("seance", "GUN")}
        return {"id": uuid.uuid4().hex, "kind": "order", "name": "order_amend", "auth_in_body": True,
                "path": "OrderTransaction/orderImprovementAsync", "method": "PUT", "body": body,
                "preview": f"AMEND order {oid}: {old_qty} @ {old_price:g} -> {new_qty} @ {new_price:g}", "t": time.time()}, None
    try:
        side = {"buy": "A", "sell": "S"}[o["side"]]
        qty, price = int(o["quantity"]), float(o["price"])
        order_type = {"limit": "LMT", "market": "PYS"}[o.get("type", "limit")]
        seance = {"day": "GUN", "ioc": "KIE"}[o.get("tif", "day")]
        symbol_id, stock = str(o["symbolId"]), o["stock"]          # stock like "NTGAZ.E"
    except (KeyError, ValueError) as e:
        return None, f"bad order: {e}"
    amount = qty * price
    day = datetime.now().date().isoformat()
    if _daily["day"] != day:
        _daily.update(day=day, sum=0.0)
    if amount > c["max_order_try"]:
        return None, f"order {amount:.2f} TL exceeds max_order_try {c['max_order_try']}"
    if _daily["sum"] + amount > c["max_daily_try"]:
        return None, f"daily cap {c['max_daily_try']} TL reached"
    _daily["sum"] += amount
    body = {"symbolId": symbol_id, "stock": stock, "buyOrCell": side, "orderType": order_type,
            "seance": seance, "quantity": str(qty), "price": f"{price:g}", "approval": "2"}
    preview = f"{'BUY' if side == 'A' else 'SELL'} {stock} {qty} @ {price:g} TRY ({order_type}/{seance}) = {amount:,.2f} TL"
    return {"id": uuid.uuid4().hex, "kind": "order", "name": "order", "path": "StockOrder/BuySellAsync",
            "method": "POST", "body": body, "preview": preview, "t": time.time()}, None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, obj=None):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        origin = self.headers.get("Origin") or ""
        if origin.startswith("chrome-extension://"):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.end_headers()
        if obj is not None:
            self.wfile.write(json.dumps(obj, ensure_ascii=False).encode())

    def _forbidden(self):
        o = self.headers.get("Origin")       # only the extension or Origin-less local scripts
        return bool(o) and not o.startswith("chrome-extension://")

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or "")
        self.send_header("Access-Control-Allow-Methods", "GET, POST")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.end_headers()

    def do_GET(self):
        if self._forbidden():
            return self._send(403)
        if self.path == "/health":
            return self._send(200, {"ok": True, "pending": len(jobs), **_state})
        if self.path == "/release":                        # on-disk release + what origin/main has (checked every 3 h)
            rel = json.load(open(os.path.join(ROOT, "extension", "release.json")))
            r = remote_release()
            return self._send(200, {**rel, "remote": r["remote"], "checked_at": r["at"], "check_error": r["error"]})
        if self.path == "/catalog":
            return self._send(200, CATALOG)
        if self.path == "/jobs/next":                      # extension long-poll
            end = time.time() + 25
            with ready:
                while time.time() < end:
                    with lock:
                        for jid, j in list(jobs.items()):
                            if time.time() - j["t"] > JOB_TTL and not (j.get("taken") and j.get("kind") == "order"):
                                jobs.pop(jid)
                            elif not j.get("taken"):
                                j["taken"] = True
                                return self._send(200, j)
                    ready.wait(timeout=end - time.time())
            return self._send(204)
        m = re.fullmatch(r"/jobs/([0-9a-f]{32})", self.path)
        if m:
            with lock:
                r = results.pop(m.group(1), None)
            return self._send(200, r) if r else self._send(202, {"state": "pending"})
        self._send(404)

    def do_POST(self):
        if self._forbidden():
            return self._send(403)
        if self.path == "/settings":                       # mirror of the popup switch, sent by the extension
            body = self._body()
            _state.update(orders_enabled=bool(body.get("orders_enabled")), yolo=bool(body.get("yolo")))
            return self._send(200, _state)
        if self.path == "/update":                         # fast-forward to origin/main, then restart (launchd KeepAlive)
            try:
                out = git("pull", "--ff-only", "--quiet", "origin", "main")
            except Exception as e:
                return self._send(500, {"error": str(e)[:300]})
            self._send(200, {"ok": True, "output": out})
            threading.Timer(0.5, os._exit, [0]).start()
            return
        if self.path == "/jobs":
            job, err = build_job(self._body())
            if err:
                return self._send(400, {"error": err})
            with lock:
                jobs[job["id"]] = job
            with ready:
                ready.notify_all()
            return self._send(200, {"id": job["id"], "preview": job.get("preview")})
        m = re.fullmatch(r"/jobs/([0-9a-f]{32})/result", self.path)
        if m:
            res = self._body()
            with lock:
                job = jobs.pop(m.group(1), None)
            if job:
                res["body"] = store(job["name"], job["method"], job["path"], job.get("params") or job.get("body"),
                                    res.get("status"), res.get("body") or "")
                with lock:
                    results[m.group(1)] = res
            return self._send(200, {"ok": True})
        self._send(404)


def serve():
    print(f"brokerlink daemon on http://{HOST}:{PORT}  (raw store {DB_PATH})", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


# ---------------------------------------------------------------- MCP (stdio)
def call(req, wait=WAIT_S):
    def http(method, path, body=None):
        r = urllib.request.Request(f"http://{HOST}:{PORT}{path}", method=method,
                                   data=json.dumps(body).encode() if body is not None else None,
                                   headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(r, timeout=10) as resp:
                return resp.status, json.loads(resp.read() or b"null")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"null")
    code, job = http("POST", "/jobs", req)
    if code != 200:
        return {"error": (job or {}).get("error", code)}
    end = time.time() + wait
    while time.time() < end:
        time.sleep(0.7)
        code, res = http("GET", f"/jobs/{job['id']}")
        if code == 200:
            for _ in range(2):                    # some MobilG endpoints return JSON encoded twice
                if not isinstance(res.get("body"), str):
                    break
                try:
                    res["body"] = json.loads(res["body"])
                except Exception:
                    break
            return res
    if req.get("kind") == "order":
        return {"state": "awaiting_user_approval", "id": job["id"], "preview": job.get("preview"),
                "next": "The user must click Approve in the brokerlink popup. Check later with order_result."}
    return {"error": "timed out: is the daemon running, the extension loaded and a logged-in MobilG tab open?"}


def mcp():
    from mcp.server.fastmcp import FastMCP
    app = FastMCP("brokerlink")
    names = sorted(CATALOG["endpoints"])

    @app.tool()
    def catalog() -> dict:
        """List every MobilG endpoint brokerlink can call: name -> path, params, description."""
        return {"read": {k: {"params": v["params"], "doc": v["doc"]} for k, v in CATALOG["endpoints"].items()},
                "write": {k: {"params": v.get("params", []), "body": v.get("body", []), "doc": v["doc"]}
                          for k, v in CATALOG["writes"].items()},
                **{k: v for k, v in json.loads(urllib.request.urlopen(f"http://{HOST}:{PORT}/health", timeout=5).read()).items()
                   if k in ("orders_enabled", "yolo")}}

    @app.tool()
    def read(name: str, params: dict | None = None) -> dict:
        """Call a read endpoint by catalog name (e.g. portfolio, depth, last_trades, metrics,
        executed_transactions, bank_statement, chart_history). Dates follow each endpoint's doc."""
        if name not in CATALOG["endpoints"]:
            return {"error": f"unknown read endpoint; one of {names}"}
        return call({"name": name, "params": params or {}})

    @app.tool()
    def write(name: str, params: dict | None = None, body: dict | None = None) -> dict:
        """Follow-list and price-alarm changes only (follow_add, follow_delete, follow_reorder,
        list_add, list_update, list_delete, alarm_add, alarm_delete). No money, no orders."""
        if name not in CATALOG["writes"]:
            return {"error": f"unknown write; one of {sorted(CATALOG['writes'])}"}
        return call({"name": name, "params": params or {}, "body": body or {}})

    @app.tool()
    def place_order(symbolId: str, stock: str, side: str, quantity: int, price: float,
                    type: str = "limit", tif: str = "day") -> dict:
        """Queue an equity order for HUMAN approval (if the user switched YOLO mode on in the popup, limit
        orders within the caps are sent at once and the reply is MobilG's answer). Orders can be switched off.
        Capped by max_order_try / max_daily_try. Nothing is sent until the user clicks Approve in the
        brokerlink popup. side buy|sell, type limit|market, tif day|ioc, stock like 'NTGAZ.E'."""
        return call({"kind": "order", "order": dict(symbolId=symbolId, stock=stock, side=side,
                     quantity=quantity, price=price, type=type, tif=tif)}, wait=20)

    @app.tool()
    def cancel_order(orderId: str) -> dict:
        """Queue a cancel of a working equity order (orderId from read('order_tracking')) for HUMAN
        approval in the brokerlink popup."""
        return call({"kind": "order", "order": {"action": "cancel", "orderId": orderId}}, wait=20)

    @app.tool()
    def amend_order(orderId: str, oldPrice: float, oldAmount: int, newPrice: float, newAmount: int) -> dict:
        """Queue a price/quantity change of a working equity order for HUMAN approval in the popup."""
        return call({"kind": "order", "order": {"action": "amend", "orderId": orderId, "oldPrice": oldPrice,
                     "oldAmount": oldAmount, "newPrice": newPrice, "newAmount": newAmount}}, wait=20)

    @app.tool()
    def order_result(id: str) -> dict:
        """Result of an order queued with place_order (after the user approved or rejected it)."""
        with urllib.request.urlopen(f"http://{HOST}:{PORT}/jobs/{id}", timeout=10) as r:
            return json.loads(r.read() or b"null")

    app.run()


if __name__ == "__main__":
    {"serve": serve, "mcp": mcp}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: print(__doc__))()
