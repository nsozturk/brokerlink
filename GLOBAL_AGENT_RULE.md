# brokerlink — rule for your AI assistant

Paste this into your assistant's instructions (CLAUDE.md, AGENTS.md, GEMINI.md, Cursor rules).

When the user asks about their PhillipCapital MobilG account (portfolio, P/L, cash, orders, executed trades,
statements, order book, last trades, KAP news), use the `brokerlink` MCP server:

1. `catalog()` once to see endpoint names and parameters.
2. `read(name, params)` for data. Start with `portfolio` (`date` = today, `YYYY-MM-DD`).
   `executed_transactions` and `bank_statement` take `startDate`/`endDate` as `YYYYMMDD`; omit `symbolId` for all symbols.
3. Symbols need MobilG's numeric `symbolId` for `depth`, `last_trades` and `price_info`; get it from `stock_list` (`sid`).
4. `write(...)` only changes follow lists and price alarms.
5. Order tools only queue an order (the user may have switched them off in the popup); tell the user to approve it in the
   brokerlink popup and never claim an order was sent before `order_result` says so.

Order flow: `stock_list` → `sid` and code with suffix (`GARAN.E`) → `price_info`/`depth` → `place_order(symbolId, stock,
side, quantity, price)` → reply `awaiting_user_approval` → ask the user to click Approve in the popup → `order_result(id)`
→ `read("order_tracking")`. Change/cancel with `amend_order` / `cancel_order` (ids from `order_tracking`), same click.
Never retry a refused order with a smaller size or different parameters unless the user asks.

Errors: `409` = no logged-in MobilG tab (ask the user to open and log in; never try to open or reload it),
`426` = extension update required (popup → Update), timeout = daemon or extension not running.
Never ask for, print or store the user's password, SMS code or session values. This is not investment advice.
