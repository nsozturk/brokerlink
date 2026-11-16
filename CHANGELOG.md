# Changelog

## 0.4.0
- New popup tabs: depth (bid/ask cards) and charts (candles from MobilG's chart feed) for portfolio holdings.
- Fix: bid/ask and band values were empty because of a double-encoded response.
- Release notes moved behind the version label; the card says when the account has no depth licence.

## 0.3.5
- Portfolio: day change column; P/L and % grouped in one tinted block.
- Per-position cards: best bid/ask, spread, position in the daily band, depth levels when available.
- Catalog: corrected depth field names.

## 0.3.4
- The "log in to MobilG" status in the popup header is clickable too.

## 0.3.3
- Portfolio tab offers an "open MobilG" button when no logged-in tab exists.

## 0.3.2
- Firefox support (event-page build, permission prompt in the popup).
- `scripts/package.py`: Chrome zip and crx, Firefox xpi.
- Popup screenshots from sample data in the README and a popup tour in the docs.

## 0.3.1
- Order tools wait for the user's decision and return a clear `outcome` to the calling model; `order_result` can be asked repeatedly.
- MCP replies say where the order switches live.

## 0.3.0
- Popup redesigned with a segmented control: portfolio, orders, history, release notes.
- Order history and result notifications.
- Auto-send card with user-set per-order limit, daily limit and duration.

## 0.2.5
- Auto-send mode (first called YOLO): optional, session-only switch that sends small limit orders without the approval click.

## 0.2.4
- Fix: three read endpoints (VIOP orders, public offering requests, fund list) were blocked by over-broad deny prefixes.
- Guard tests, CI, SECURITY.md, CONTRIBUTING.md, troubleshooting and privacy docs.

## 0.2.3
- Orders on by default with an on/off switch in the popup (enforced in the extension).
- Step-by-step order documentation.

## 0.2.2
- Update chain verified end to end (GitHub → pull → reload).

## 0.2.1
- Update check through git every 3 hours, one-click update, forced-update lock.

## 0.2.0
- Portfolio view in the popup, "what's new" section, order cancel and amend.

## 0.1.0
- First version: read endpoints, follow-list and alarm writes, MCP bridge.
