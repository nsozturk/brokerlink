# brokerlink

**Unofficial** local bridge between your own logged-in PhillipCapital **MobilG** web session and any
AI tool that speaks MCP (Claude Code, Codex, Gemini CLI, Antigravity `agy`, OpenCode, Cursor, Claude Desktop).
Not affiliated with, endorsed by or supported by PhillipCapital. Use at your own risk, on your own account only.

```
AI client ──stdio MCP──▶ brokerlink.py mcp ──HTTP──▶ brokerlink.py serve (127.0.0.1:18890)
                                                         ▲  long-poll
                                                         │
                                  Chrome extension ──executeScript──▶ your logged-in MobilG tab
                                                                       fetch('/api/...') with the tab's own session
```

- The session (`clientId`, `otpToken`) is read **inside your MobilG tab** and never leaves it.
  The daemon and the AI never see it.
- brokerlink **never opens or reloads** MobilG. A reload changes the client port and MobilG logs the
  session out (verified). Keep one MobilG tab open and logged in.
- Every call is checked against [`extension/catalog.json`](extension/catalog.json) twice: in the daemon and in the extension.
- Raw responses are kept in `data/raw.sqlite` (gzip, content-addressed), with session fields redacted.

## What it can do

| Area | Catalog names |
|---|---|
| Portfolio & cash | `portfolio`, `overall_history`, `bank_statement`, `stock_extract`, `stoppage` |
| Trades & orders (read) | `executed_transactions` (any date range), `transaction_result_form`, `order_tracking`, `synthetic_orders`, `synthetic_order_logs`, `order_summary` |
| Market data | `price_info`, `current_price`, `depth` (order book, levels per licence), `last_trades` (tape), `akd` (broker distribution, needs licence), `metrics` (52w, returns, valuation), `chart_history` (OHLCV), `stock_list`, `stock_detail`, `highlights`, `depth_steps` |
| News & research | `kap_for_symbol`, `kap_notifications`, `news`, `news_categories`, `stock_reports`, `model_portfolio` |
| VIOP, funds, IPO, foreign, FX, T+0 | `viop_*`, `fund_*`, `public_offering*`, `foreign_*`, `fx_*`, `t0_*` (read only) |
| Writes (safe) | `follow_add/delete/reorder`, `list_add/update/delete`, `alarm_add/delete` |
| Orders (off by default) | `place_order`, `cancel_order`, `amend_order` — see below |

**Never included:** any money-out or asset-transfer endpoint (EFT, transfers, FX conversion, collateral),
login/password/settings, and the broker's AI-authorization switches. They are on a deny list.

## Orders

Off unless `config.json` contains `{"orders_enabled": true}`. Even then:

- An order is only **queued**. Nothing is sent until **you click Approve in the extension popup**.
  An AI agent cannot approve; the approval exists only in the browser.
- `max_order_try` (default 2,500 TL) and `max_daily_try` (default 10,000 TL) are checked before queuing.

The broker's official AI channel ([Phillip Intelligence](https://mcp.phillipcapital.com.tr/docs/kullanim-kilavuzu))
only allows orders from card-capable apps. brokerlink keeps a human click in the loop for the same reason.

## Install

1. `pip install mcp` (Python 3.10+).
2. Start the daemon: `python3 server/brokerlink.py serve`
3. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `extension/`.
4. Open https://mobilg.phillip.com.tr and log in.
5. Register the MCP server with your client (stdio command: `python3 /path/to/brokerlink/server/brokerlink.py mcp`):

| Client | Command |
|---|---|
| Claude Code | `claude mcp add --scope user brokerlink -- python3 /path/server/brokerlink.py mcp` |
| Codex | `codex mcp add brokerlink -- python3 /path/server/brokerlink.py mcp` |
| Antigravity (agy) | `agy mcp add brokerlink python3 /path/server/brokerlink.py mcp` |
| Gemini CLI | `~/.gemini/settings.json` → `"mcpServers": {"brokerlink": {"command": "python3", "args": ["/path/server/brokerlink.py", "mcp"]}}` |
| OpenCode | `opencode.json` → `"mcp": {"brokerlink": {"type": "local", "command": ["python3", "/path/server/brokerlink.py", "mcp"]}}` |
| Cursor / Claude Desktop | same stdio command in their MCP settings |

Cloud chat apps (claude.ai, ChatGPT web) cannot reach a localhost server.

## MCP tools

`catalog()`, `read(name, params)`, `write(name, params, body)`, `place_order(...)`, `cancel_order(orderId)`,
`amend_order(...)`, `order_result(id)`.

Date formats differ per endpoint (MobilG's own): `YYYY-MM-DD`, `YYYYMMDD` or `DD/MM/YYYY` — see each catalog entry.

## License

MIT. Trademarks belong to their owners.
