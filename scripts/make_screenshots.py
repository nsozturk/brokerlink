#!/usr/bin/env python3
"""Render the popup with SAMPLE data (no account needed) into assets/screens/*.png.
Usage: python3 scripts/make_screenshots.py   (needs Google Chrome)"""
import json, os, shutil, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
RELEASE = json.load(open(os.path.join(ROOT, "extension", "release.json")))
NOW = 1767258000000  # fixed clock so the images are reproducible

SAMPLE = {
    "portfolio": {"stockOrders": {"totalAmount": 87450.0, "totalProfitLoss": 3150.0, "rows": [
        {"symbolWithGroup": "GARAN(E)", "foreksCode": "H1", "dayPct": 1.21, "quote": {"bid": 134.15, "ask": 134.25, "floor": 119.35, "ceil": 145.85}, "trades": [{"creationTime":"15:42:07","quantity":1200,"price":134.2},{"creationTime":"15:42:01","quantity":350,"price":134.15},{"creationTime":"15:41:55","quantity":5000,"price":134.15},{"creationTime":"15:41:40","quantity":80,"price":134.2},{"creationTime":"15:41:32","quantity":2400,"price":134.25}], "depth": [{"bid":134.15,"bidQty":18400,"ask":134.25,"askQty":9200},{"bid":134.10,"bidQty":22100,"ask":134.30,"askQty":15800},{"bid":134.05,"bidQty":9700,"ask":134.35,"askQty":21500},{"bid":134.00,"bidQty":30500,"ask":134.40,"askQty":12300},{"bid":133.95,"bidQty":7600,"ask":134.45,"askQty":8900},{"bid":133.90,"bidQty":14200,"ask":134.50,"askQty":26400},{"bid":133.85,"bidQty":11800,"ask":134.55,"askQty":7300},{"bid":133.80,"bidQty":41000,"ask":134.60,"askQty":18200}], "quantity": 200, "cost": 128.40, "price": 134.20, "profitLoss": 1160.0},
        {"symbolWithGroup": "THYAO(E)", "foreksCode": "H2", "dayPct": -0.48, "quote": {"bid": 310.25, "ask": 310.5, "floor": 280.75, "ceil": 343.25}, "quantity": 100, "cost": 296.00, "price": 310.50, "profitLoss": 1450.0},
        {"symbolWithGroup": "ASELS(E)", "foreksCode": "H3", "dayPct": 2.1, "quote": {"bid": 339.75, "ask": 340.0, "floor": 299.75, "ceil": 366.25}, "quantity": 60, "cost": 331.00, "price": 340.00, "profitLoss": 540.0},
        {"symbolWithGroup": "KCHOL(E)", "foreksCode": "H4", "dayPct": 0.0, "quote": {"bid": 189.9, "ask": 190.0, "floor": 171.0, "ceil": 209.0}, "quantity": 50, "cost": 190.00, "price": 190.00, "profitLoss": 0.0}]},
        "depthLicence": 1, "balances": {"rows": [{"description": "Toplam Net Bakiye", "tBalance": 12500.0, "t2Balance": 12500.0},
                              {"description": "OVERALL(TL)", "tBalance": 99950.0}]}},
    "pending": [{"id": "a1", "name": "order", "preview": "BUY GARAN.E 10 @ 133.5 TRY (LMT/GUN) = 1,335.00 TL"}],
    "history": [
        {"t": NOW - 6e5, "kind": "order", "preview": "BUY THYAO.E 5 @ 309 TRY (LMT/GUN) = 1,545.00 TL", "mode": "approved", "ok": True, "message": "Talebiniz İletilmiştir"},
        {"t": NOW - 2e6, "kind": "order_amend", "preview": "AMEND order 100200300: 5 @ 309 -> 5 @ 308.5", "mode": "approved", "ok": True, "message": "Talebiniz İletilmiştir"},
        {"t": NOW - 4e6, "kind": "order", "preview": "SELL ASELS.E 10 @ 345 TRY (LMT/GUN) = 3,450.00 TL", "mode": "rejected", "ok": False, "message": "Sen reddettin"},
        {"t": NOW - 7e6, "kind": "order_cancel", "preview": "CANCEL order 100200299", "mode": "auto", "ok": True, "message": "Emir İptal Edildi"},
        {"t": NOW - 2e7, "kind": "order", "preview": "BUY GARAN.E 500 @ 134 TRY (LMT/GUN) = 67,000.00 TL", "mode": "approved", "ok": False, "message": "Hesap bakiyesi yeterli değil"}],
}
STUB = """
const S = %s, REL = %s, TAB = new URLSearchParams(location.search).get('tab') || 'portfolio';
const AUTO = new URLSearchParams(location.search).get('auto') === '1';
Date.now = () => %d;
const DV = new URLSearchParams(location.search).get('dv');
const local = {depthView: DV || 'ladder', tab: TAB, history: S.history, seenVersion: '0'}, session = {pending: TAB === 'orders' && !AUTO ? S.pending : [], autoUntil: AUTO ? Date.now() + 3 * 3600e3 : 0};
const store = o => ({get: async k => o, set: async v => Object.assign(o, v)});
window.chrome = {storage: {local: store(local), session: store(session)},
  permissions: {contains: async () => true, request: async () => true},
  tabs: {query: async () => [{url: 'https://mobilg.phillip.com.tr/tr/dashboard'}]},
  runtime: {getURL: p => p, getManifest: () => ({version: REL.version}),
    sendMessage: async m => m.type === 'chart' ? {data: candles(m.symbol, m.bars)} : m.type === 'portfolio' ? {data: S.portfolio} : m.type === 'update' ? {forced: false, available: false, notes: REL.notes, checkedAt: Date.now()} : {ok: true}}};
function candles(seed, n) { let x = [...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0), p = ({H1: 124, H2: 318, H3: 322, H4: 196})[seed] || 100; const r = () => (x = (x * 9301 + 49297) %% 233280) / 233280;
  const d = {s: 'ok', t: [], o: [], h: [], l: [], c: [], v: []}; for (let i = 0; i < n; i++) { const o = p, c = p * (1 + (r() - .47) * .03); d.t.push(i); d.v.push(2e5 + r() * 9e5); d.o.push(o); d.c.push(c); d.h.push(Math.max(o, c) * (1 + r() * .008)); d.l.push(Math.min(o, c) * (1 - r() * .008)); p = c; } return d; }
window.fetch = async u => ({ok: true, json: async () => REL});
""" % (json.dumps(SAMPLE, ensure_ascii=False), json.dumps(RELEASE, ensure_ascii=False), NOW)

tmp = tempfile.mkdtemp(prefix="brokerlink-shots-")
shutil.copytree(os.path.join(ROOT, "extension"), tmp, dirs_exist_ok=True)
html = open(os.path.join(tmp, "popup.html")).read().replace('<script src="popup.js">', '<script src="stub.js"></script><script src="popup.js">')
open(os.path.join(tmp, "popup.html"), "w").write(html)
open(os.path.join(tmp, "stub.js"), "w").write(STUB)
for name, query in (("portfolio", "tab=portfolio"), ("depth", "tab=depth"), ("depth-chart", "tab=depth&dv=chart"), ("charts", "tab=charts"), ("orders", "tab=orders"), ("auto-send", "tab=orders&auto=1"),
                    ("history", "tab=history"), ("news", "tab=news")):
    for out in (os.path.join(ROOT, "assets", "screens"), os.path.join(ROOT, "docs", "assets", "screens")):
        os.makedirs(out, exist_ok=True)
    png = os.path.join(ROOT, "assets", "screens", name + ".png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
                    "--window-size=420,530", "--virtual-time-budget=3000",
                    "--screenshot=" + png, f"file://{tmp}/popup.html?{query}"], check=True, capture_output=True)
    shutil.copy(png, os.path.join(ROOT, "docs", "assets", "screens", name + ".png"))
    print(png)
shutil.rmtree(tmp)
