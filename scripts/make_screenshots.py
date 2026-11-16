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
        {"symbolWithGroup": "GARAN(E)", "quantity": 200, "cost": 128.40, "price": 134.20, "profitLoss": 1160.0},
        {"symbolWithGroup": "THYAO(E)", "quantity": 100, "cost": 296.00, "price": 310.50, "profitLoss": 1450.0},
        {"symbolWithGroup": "ASELS(E)", "quantity": 60, "cost": 331.00, "price": 340.00, "profitLoss": 540.0},
        {"symbolWithGroup": "KCHOL(E)", "quantity": 50, "cost": 190.00, "price": 190.00, "profitLoss": 0.0}]},
        "balances": {"rows": [{"description": "Toplam Net Bakiye", "tBalance": 12500.0, "t2Balance": 12500.0},
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
const local = {tab: TAB, history: S.history, seenVersion: '0'}, session = {pending: TAB === 'orders' && !AUTO ? S.pending : [], autoUntil: AUTO ? Date.now() + 3 * 3600e3 : 0};
const store = o => ({get: async k => o, set: async v => Object.assign(o, v)});
window.chrome = {storage: {local: store(local), session: store(session)},
  permissions: {contains: async () => true, request: async () => true},
  tabs: {query: async () => [{url: 'https://mobilg.phillip.com.tr/tr/dashboard'}]},
  runtime: {getURL: p => p, getManifest: () => ({version: REL.version}),
    sendMessage: async m => m.type === 'portfolio' ? {data: S.portfolio} : m.type === 'update' ? {forced: false, available: false, notes: REL.notes, checkedAt: Date.now()} : {ok: true}}};
window.fetch = async u => ({ok: true, json: async () => REL});
""" % (json.dumps(SAMPLE, ensure_ascii=False), json.dumps(RELEASE, ensure_ascii=False), NOW)

tmp = tempfile.mkdtemp(prefix="brokerlink-shots-")
shutil.copytree(os.path.join(ROOT, "extension"), tmp, dirs_exist_ok=True)
html = open(os.path.join(tmp, "popup.html")).read().replace('<script src="popup.js">', '<script src="stub.js"></script><script src="popup.js">')
open(os.path.join(tmp, "popup.html"), "w").write(html)
open(os.path.join(tmp, "stub.js"), "w").write(STUB)
for name, query in (("portfolio", "tab=portfolio"), ("orders", "tab=orders"), ("auto-send", "tab=orders&auto=1"),
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
