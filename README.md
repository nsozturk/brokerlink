<p align="center">
  <img src="assets/banner.png" alt="brokerlink — your MobilG brokerage tab as an MCP server" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.2.2-d97757" alt="version 0.2.2">
  <img src="https://img.shields.io/badge/python-3.10%2B-3776ab" alt="Python 3.10+">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
  <img src="https://img.shields.io/badge/API%20keys-none-success" alt="no API keys">
  <a href="AGENTS.md"><img src="https://img.shields.io/badge/AI%20agent-native%20ready-8b5cf6" alt="AI agent ready"></a>
  <img src="https://img.shields.io/badge/platform-Chrome%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="platform">
</p>

<p align="center">
  <code>mcp</code> <code>chrome-extension</code> <code>bist</code> <code>borsa-istanbul</code> <code>phillipcapital</code> <code>mobilg</code> <code>claude</code> <code>codex</code> <code>gemini</code> <code>order-book</code>
</p>

brokerlink is a free, open-source Chrome extension and local MCP server that lets Claude, Codex, Gemini and other AI tools read your own PhillipCapital MobilG brokerage account through your logged-in browser tab.

**Unofficial.** Not affiliated with, endorsed by or supported by PhillipCapital. For your own account only, at your own risk. Not investment advice.

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
| Market data | `price_info`, `depth` (order book), `last_trades` (tape), `akd` (broker distribution, needs licence), `metrics`, `chart_history` (OHLCV), `stock_list` |
| News and research | `kap_for_symbol`, `kap_notifications`, `news`, `stock_reports`, `model_portfolio` |
| VIOP, funds, IPO, foreign, FX, T+0 | `viop_*`, `fund_*`, `public_offering*`, `foreign_*`, `fx_*`, `t0_*` (read only) |
| Safe writes | follow lists and price alarms |
| Orders | off by default, see below |

The extension popup also shows your positions, cost, last price and profit/loss.

**Never included:** money-out and asset-transfer endpoints (EFT, transfers, FX conversion, collateral), login, password and settings, and the broker's AI-authorization switches. They are on a deny list.

## Orders

Off unless `config.json` contains `{"orders_enabled": true}`. Even then an order is only **queued**: nothing is sent until **you click Approve in the extension popup**, and `max_order_try` (default 2,500 TL) and `max_daily_try` (default 10,000 TL) are checked first. An AI agent cannot approve.

## Quick start

```bash
git clone https://github.com/nsozturk/brokerlink.git && cd brokerlink
pip install mcp
python3 server/brokerlink.py serve
```

1. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → the `extension/` folder.
2. Open https://mobilg.phillip.com.tr and log in as usual.
3. Register the MCP server (stdio command: `python3 /path/to/brokerlink/server/brokerlink.py mcp`):

| Client | How |
|---|---|
| Claude Code | `claude mcp add --scope user brokerlink -- python3 /path/server/brokerlink.py mcp` |
| Codex | `codex mcp add brokerlink -- python3 /path/server/brokerlink.py mcp` |
| Antigravity (agy) | `agy mcp add brokerlink python3 /path/server/brokerlink.py mcp` |
| Gemini CLI | `~/.gemini/settings.json` → `"mcpServers": {"brokerlink": {"command": "python3", "args": ["/path/server/brokerlink.py", "mcp"]}}` |
| OpenCode | `opencode.json` → `"mcp": {"brokerlink": {"type": "local", "command": ["python3", "/path/server/brokerlink.py", "mcp"]}}` |
| Cursor, Claude Desktop, others | the same stdio command in their MCP settings |

## MCP tools

| Tool | Purpose |
|---|---|
| `catalog()` | List every endpoint with its parameters |
| `read(name, params)` | Call a read endpoint by catalog name |
| `write(name, params, body)` | Follow-list and price-alarm changes |
| `place_order`, `cancel_order`, `amend_order`, `order_result` | Queue an order action for human approval (disabled by default) |

Date formats follow MobilG and differ per endpoint; each catalog entry says which.

## Updates

The daemon checks `origin/main` once every 3 hours (`git fetch`, nothing else leaves your machine). The popup shows what is new and an **Update** button that pulls and reloads the extension. A release can set `min_supported`; older builds then stop working until updated.

## FAQ

### Do I have to copy tokens or cookies after logging in?
No. The extension reads the session inside the MobilG tab at the moment of each call.

### Can an AI place trades with this?
Not by default. With `orders_enabled` an agent can only queue an order; a person must click Approve in the popup.

### Can it withdraw or transfer money?
No. Those endpoints are on a deny list in both the daemon and the extension.

### Does it work with claude.ai or ChatGPT in the browser?
No. Cloud chat apps cannot reach a server on your localhost. Use a local client such as Claude Code, Codex, Gemini CLI, agy, OpenCode, Cursor or Claude Desktop.

### Why does MobilG log me out when I reload the page?
MobilG ties the session to the page instance. brokerlink never reloads the tab for this reason.

## Compared with

- **Phillip Intelligence** (PhillipCapital's official MCP): official and supports orders with approval cards, but connects only from claude.ai and ChatGPT. brokerlink is an unofficial, read-first bridge for local AI clients.
- **Exporting a HAR or cookies by hand**: brokerlink needs no export and keeps the session in the browser.

## For AI agents

See [`AGENTS.md`](AGENTS.md) for the rules of this repo, [`GLOBAL_AGENT_RULE.md`](GLOBAL_AGENT_RULE.md) for a snippet to paste into your own assistant, and [`llms.txt`](llms.txt).

## License

MIT. Trademarks belong to their owners.
