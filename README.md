<p align="center">
  <img src="assets/banner.png" alt="brokerlink — your MobilG brokerage tab as an MCP server" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/nsozturk/brokerlink?color=d97757" alt="version 0.3.0">
  <img src="https://img.shields.io/badge/python-3.10%2B-3776ab" alt="Python 3.10+">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
  <img src="https://img.shields.io/badge/API%20keys-none-success" alt="no API keys">
  <a href="AGENTS.md"><img src="https://img.shields.io/badge/AI%20agent-native%20ready-8b5cf6" alt="AI agent ready"></a>
  <img src="https://img.shields.io/badge/browsers-Chrome%20%7C%20Firefox-lightgrey" alt="platform">
</p>

<p align="center">
  <code>mcp</code> <code>chrome-extension</code> <code>bist</code> <code>borsa-istanbul</code> <code>phillipcapital</code> <code>mobilg</code> <code>claude</code> <code>codex</code> <code>gemini</code> <code>order-book</code>
</p>

brokerlink is a free, open-source Chrome extension and local MCP server that lets Claude, Codex, Gemini and other AI tools read your own PhillipCapital MobilG brokerage account through your logged-in browser tab.

**Unofficial.** Not affiliated with, endorsed by or supported by PhillipCapital. For your own account only, at your own risk. Not investment advice.

## Screenshots

Sample data, not a real account.

| Portfolio | Charts with indicators |
|---|---|
| <img src="assets/screens/portfolio.png" width="330" alt="Portfolio tab: positions, cost, price, day change, profit and loss with a colour scale"> | <img src="assets/screens/charts.png" width="330" alt="Charts tab: candles with moving averages, Bollinger Bands, RSI and MACD"> |

| Depth ladder and last trades | Cumulative depth chart |
|---|---|
| <img src="assets/screens/depth.png" width="330" alt="Depth tab: ten bid and ask levels with quantity bars"> | <img src="assets/screens/depth-chart.png" width="330" alt="Depth tab: cumulative buy and sell curve around the mid price"> |

| Orders waiting for approval | Send without approval | Order history |
|---|---|---|
| <img src="assets/screens/orders.png" width="220" alt="Orders tab: an order waiting for approval"> | <img src="assets/screens/auto-send.png" width="220" alt="Auto-send card with per-order limit, daily limit and duration"> | <img src="assets/screens/history.png" width="220" alt="History tab: sent, amended, cancelled and rejected orders"> |

A part-by-part tour is in the [documentation](https://nsozturk.github.io/brokerlink/#tour).

## Popup features

| Tab | What you get |
|---|---|
| **Portföy** (portfolio) | Positions with quantity, cost, last price, today's change, and profit/loss in TL and percent. The P/L pair is framed in a colour that runs from red (−15 % or worse) to green (+15 % or better). Totals, share value, cash (T / T+2) |
| **Derinlik** (depth) | Per position: best bid and ask, spread, where the price sits between today's floor and ceiling. *Kademeler*: up to ten bid/ask levels with quantity bars, buy/sell balance and the last trades. *Derinlik grafiği*: cumulative depth curve. Levels need a depth licence on your account; without one the card says so |
| **Grafik** (charts) | Candle, line or area charts of your positions from MobilG's own chart feed. Eleven periods: 1 hour, 1 day, 3 days, 1 week, 2 weeks, 1, 2, 3 and 6 months, YTD, 1 year. Nine indicators: MA 7 / 25 / 99, EMA 20, Bollinger Bands, VWAP, volume, RSI 14, MACD (up to five at once) |
| **Emirler** (orders) | Orders queued by an AI with Onayla / Reddet, the orders on/off switch, and the "send without approval" card with your own limits |
| **Geçmiş** (history) | Every order that passed through the extension with MobilG's answer, eight per page |
| Version label | Opens the release notes; an update banner appears when a newer version exists |

Also: a button that opens MobilG when you are not logged in, desktop notifications with the broker's answer for every order, and nothing loaded from third parties (charts are drawn locally).

## How it works

```
AI client ──stdio MCP──▶ brokerlink.py mcp ──HTTP──▶ brokerlink.py serve (127.0.0.1:18890)
                                                         ▲ long-poll
                                 Chrome extension ──executeScript──▶ your logged-in MobilG tab
                                                                      fetch('/api/...') with the tab's own session
```

- **Nothing to configure after login.** Each call reads the session inside your MobilG tab at call time, so the bridge works as soon as you are logged in and stops when you log out. No token export, no sync button.
- **The session never leaves the tab.** The daemon, the MCP server and the AI never see your account number, password or session token.
- **It never opens or reloads MobilG.** A reload makes MobilG end the session, so brokerlink only uses the tab you already have open.
- **Double allowlist.** Every call is checked against [`extension/catalog.json`](extension/catalog.json) in the daemon and again in the extension.
- **Raw responses are kept locally** in `data/raw.sqlite` with session fields redacted.

## What you can ask for

| Area | Catalog names |
|---|---|
| Portfolio and cash | `portfolio`, `overall_history`, `bank_statement`, `stock_extract`, `stoppage` |
| Trades and orders (read) | `executed_transactions` (any date range), `transaction_result_form`, `order_tracking`, `synthetic_orders`, `synthetic_order_logs` |
| Market data | `price_info`, `depth` (order book), `last_trades` (tape), `akd` (broker distribution, needs licence), `metrics` (foreign stocks), `chart_history` (OHLCV), `stock_list` |
| News and research | `kap_for_symbol`, `kap_notifications`, `news`, `stock_reports`, `model_portfolio` |
| VIOP, funds, IPO, foreign, FX, T+0 | `viop_*`, `fund_*`, `public_offering*`, `foreign_*`, `fx_*`, `t0_*` (read only) |
| Safe writes | follow lists and price alarms |
| Orders | new, cancel, amend: queued for your click, see below |

The extension popup shows the same data without an AI client: see [Popup features](#popup-features).

**Never included:** money-out and asset-transfer endpoints (EFT, transfers, FX conversion, collateral), login, password and settings, and the broker's AI-authorization switches. They are on a deny list.

## Orders

The popup is in Turkish (the broker's market): *Portföy* = portfolio, *Derinlik* = depth, *Grafik* = charts, *Emirler* = orders, *Geçmiş* = history, *Onayla / Reddet* = approve / reject, *Emirler açık* = orders enabled, *Onaysız gönderim* = send without approval.

On by default, with a switch in the extension popup ("Emirler açık") to turn them off. An order from an AI is only **queued**: nothing is sent until **you click Onayla (approve) in the popup**. The per-order and daily limits you set in the popup (defaults 2,500 TL and 10,000 TL) are checked first. An AI agent cannot approve and cannot flip the switches: they live in the browser.

### Auto-send ("Onaysız gönderim")

A separate card in the popup's **Emirler** tab, **off by default**. While it is on, limit orders, amendments and cancels below your limits are sent **without asking**; the reply to `place_order` is then MobilG's answer. Market orders and anything above the limits still wait for your click. You set the three values yourself: limit per order (default 2,500 TL), limit per day (default 10,000 TL) and how long it stays on (default 4 hours). It also ends when the browser restarts, and asks for confirmation when switched on. Only the popup can change these; no tool or daemon call can.

Be aware of what this means: an AI agent that misreads you, or that is steered by text it reads elsewhere (a news item, a web page), can trade real money within those limits.

### History and notifications

Every order that passes through the extension gets a notification with MobilG's answer, and a line in the popup's **Geçmiş** tab: sent with your approval, sent without approval, rejected by you, or refused by MobilG.

## Placing an order, step by step

Order tools are experimental: the request shapes come from real MobilG traffic, but test with one lot and a far-away limit price first.

1. **Check the switch.** Open the extension popup; in the **Emirler** tab "Emirler açık" must be ticked.
2. **Find the instrument.** `read("stock_list", {"type": "dashboard", "shortSell": "0"})` → take `sid` (the numeric `symbolId`) and the code with its suffix, e.g. `GARAN.E`.
3. **Look at the price.** `read("price_info", {"symbolId": "<sid>", "symbol": "GARAN", "market": "Hisse", "buyCell": "A", "detail": "1"})` gives bid, ask, floor and ceiling; `read("depth", {"symbolId": "<sid>"})` gives the order book.
4. **Queue the order.** `place_order(symbolId="<sid>", stock="GARAN.E", side="buy", quantity=1, price=134.20)`. Optional: `type` = `limit` (default) or `market`, `tif` = `day` (default) or `ioc`. The call waits (50 s by default) for what happens next.
5. **Approve in the browser.** A notification appears; open the popup, read the preview and click **Onayla** (approve) or **Reddet** (reject) in the **Emirler** tab.
6. **The AI gets the outcome.** The reply tells the model exactly what happened:

   | `outcome` | Meaning |
   |---|---|
   | `sent_to_broker` | Approved (or auto-sent) and accepted by MobilG; includes `broker_order_id` and `broker_message` |
   | `rejected_by_user` | You clicked Reddet |
   | `refused_by_broker` | Sent, but MobilG refused it; `broker_message` says why |
   | `awaiting_user_approval` | You have not clicked yet; the model asks again with `order_result(id)` |
   | `orders_switched_off`, `not_sent`, `not_queued` | Switch off, no MobilG tab or update needed, or refused by the limits |

7. **Follow it.** `read("order_tracking")` lists today's orders with their ids and status.

To change or cancel a working order, take its id from `order_tracking`:

- `amend_order(orderId, oldPrice, oldAmount, newPrice, newAmount)`
- `cancel_order(orderId)`

Both are queued and need the same click in the popup.

| Refusal | Meaning |
|---|---|
| `orders are disabled (switch them on in the brokerlink popup)` | The popup switch is off |
| `order … TL exceeds max_order_try` / `daily cap … reached` | Above the limits set in the popup (defaults 2,500 TL per order, 10,000 TL per day) |
| `409 … Open MobilG and log in` | No logged-in MobilG tab |
| `426 … update required` | Popup → Update |

Example prompt for any AI client: *"With brokerlink, find the symbolId of GARAN, show me bid/ask, then queue a limit buy of 1 lot at 134.20 and tell me when it is waiting for my approval."*

## Quick start

```bash
git clone https://github.com/nsozturk/brokerlink.git && cd brokerlink
pip install -r requirements.txt   # Python 3.10+
python3 server/brokerlink.py serve
```

1. Load the extension:
   - **Chrome / Edge / Brave:** `chrome://extensions` → Developer mode → **Load unpacked** → the `extension/` folder.
   - **Firefox 121+:** `python3 scripts/package.py`, then `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → `dist/brokerlink-firefox-<version>.xpi`. Open the popup once and click **İzin ver** to grant site access (Firefox asks; Chrome grants at install).
2. Open https://mobilg.phillip.com.tr and log in as usual.
3. Register the MCP server (stdio command: `python3 /path/to/brokerlink/server/brokerlink.py mcp`):

| Client | How |
|---|---|
| Claude Code | `claude mcp add --scope user brokerlink -- python3 /path/server/brokerlink.py mcp` |
| Codex | `codex mcp add brokerlink -- python3 /path/server/brokerlink.py mcp` |
| Antigravity (eski adıyla Gemini CLI) | `agy mcp add brokerlink python3 /path/server/brokerlink.py mcp`<br>or in `~/.gemini/settings.json`: `"mcpServers": {"brokerlink": {"command": "python3", "args": ["/path/server/brokerlink.py", "mcp"]}}` |
| OpenCode | `opencode.json` → `"mcp": {"brokerlink": {"type": "local", "command": ["python3", "/path/server/brokerlink.py", "mcp"]}}` |
| Cursor, Claude Desktop, others | the same stdio command in their MCP settings |

## MCP tools

| Tool | Purpose |
|---|---|
| `catalog()` | List every endpoint with its parameters, plus the order switches, limits and where the user changes them |
| `read(name, params)` | Call a read endpoint by catalog name |
| `write(name, params, body)` | Follow-list and price-alarm changes |
| `place_order`, `cancel_order`, `amend_order`, `order_result` | Queue an order action for human approval |

Date formats follow MobilG and differ per endpoint; each catalog entry says which.

## Updates

The daemon checks `origin/main` once every 3 hours (`git fetch`, nothing else leaves your machine). The popup shows what is new and an **Update** button that pulls and reloads the extension. A release can set `min_supported`; older builds then stop working until updated.

## Packages

Each [release](https://github.com/nsozturk/brokerlink/releases) carries ready-made files, built by `python3 scripts/package.py`:

| File | Use |
|---|---|
| `brokerlink-chrome-<v>.zip` | Unzip, then **Load unpacked** in Chrome, Edge or Brave. This is the route that works everywhere |
| `brokerlink-chrome-<v>.crx` | Signed Chrome package. Chrome on Windows and macOS refuses CRX files that are not from the Web Store, so use it on Linux or with an enterprise policy |
| `brokerlink-firefox-<v>.xpi` | Firefox: temporary add-on in any edition; permanent install only in Developer Edition, Nightly or ESR with `xpinstall.signatures.required` off, because it is not signed by Mozilla |

The one-click **Update** button needs a git clone. With a packaged install, update by installing the next release. You still need the daemon from this repository.

## Run the daemon at login (optional)

macOS: save this as `~/Library/LaunchAgents/dev.brokerlink.plist` (fix the two paths), then `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.brokerlink.plist`. `KeepAlive` also lets the Update button restart the daemon.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>dev.brokerlink</string>
  <key>ProgramArguments</key><array><string>/usr/bin/python3</string><string>/path/to/brokerlink/server/brokerlink.py</string><string>serve</string></array>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
</dict></plist>
```

Linux: run `python3 server/brokerlink.py serve` from a systemd user unit with `Restart=always`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `timed out: is the daemon running…` | Start `python3 server/brokerlink.py serve`; check the popup shows Daemon "running" |
| `409 … Open MobilG and log in` | No logged-in MobilG tab in this browser profile. The popup's Portföy tab has a button that opens it |
| `401` / `403` from MobilG | The session ended (often after a page reload). Log in again |
| `426 … update required` | Popup → Update |
| Tool says orders are disabled but the switch is on | Your AI client holds an old MCP process; restart the client |
| `depth` returns zeros | Market closed, or your account has no depth licence |
| `metrics` returns zeros | It only covers foreign stocks |
| Update button fails | The folder must be a git clone with `origin` reachable; run `git pull` by hand to see the error |

## Privacy and data

- Leaves your machine: calls to MobilG from your own tab, and one `git fetch` every 3 hours. Nothing else; no analytics.
- Stays on your machine: `data/raw.sqlite` (responses with session fields redacted) and `logs/`. Both are git-ignored. Delete them any time.
- Uninstall: remove the extension, stop the daemon, delete the folder and the MCP entry in your client.

## Repository layout

| Path | What |
|---|---|
| `extension/` | Chrome extension (MV3): `catalog.json` allowlist, `background.js`, popup, `release.json` |
| `server/brokerlink.py` | `serve` (daemon + raw store) and `mcp` (stdio MCP server) |
| `scripts/` | `package.py` (zip, xpi, crx) and `make_screenshots.py` (popup images from sample data) |
| `tests/test_daemon.py` | Guard tests: allowlist, deny list, order switch and caps |
| `research/` | Endpoint map parsed from MobilG's web app and order request shapes |
| `docs/` | Documentation site (single HTML file) and `llms.txt` |

## FAQ

### Do I have to copy tokens or cookies after logging in?
No. The extension reads the session inside the MobilG tab at the moment of each call.

### Can an AI place trades with this?
An agent can only queue an order; a person must click Onayla (approve) in the popup. The exception is auto-send, which you switch on yourself.

### Can it withdraw or transfer money?
No. Those endpoints are on a deny list in both the daemon and the extension.

### Does it work with claude.ai or ChatGPT in the browser?
No. Cloud chat apps cannot reach a server on your localhost. Use a local client such as Claude Code, Codex, Antigravity (eski adıyla Gemini CLI), OpenCode, Cursor or Claude Desktop.

### Why does MobilG log me out when I reload the page?
MobilG ties the session to the page instance. brokerlink never reloads the tab for this reason.

## Compared with

- **Phillip Intelligence** (PhillipCapital's official MCP): official and supports orders with approval cards, but connects only from claude.ai and ChatGPT. brokerlink is an unofficial, read-first bridge for local AI clients.
- **Exporting a HAR or cookies by hand**: brokerlink needs no export and keeps the session in the browser.

## For AI agents

See [`AGENTS.md`](AGENTS.md) for the rules of this repo, [`GLOBAL_AGENT_RULE.md`](GLOBAL_AGENT_RULE.md) for a snippet to paste into your own assistant, and [`llms.txt`](llms.txt).

## Contributing and security

See [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md) and [`CHANGELOG.md`](CHANGELOG.md).

## License

MIT. Trademarks belong to their owners.
