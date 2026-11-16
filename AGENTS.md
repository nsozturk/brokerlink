# brokerlink — agent notes (Codex, agy, OpenCode, Gemini, Claude)

Read `README.md` first. Hard rules for anyone extending this repo:

1. **Never add money-out endpoints** (EFT, `Transfer/send*`, `ForeignCurrency/set*|send*`, collateral moves),
   login/password/settings, or `aiAuthorization/*`. They are on `denied_prefixes` in `extension/catalog.json`;
   do not remove entries from that list.
2. **Orders stay behind a human click.** Any new order type (chain, conditional/synthetic, VIOP, fund, IPO,
   T+0) must go through `kind: "order"` jobs, which the extension parks in the popup until the user clicks
   Approve. Never add a code path that sends an order from the queue directly. Keep the TL caps.
3. **Never reload or open MobilG.** A reload changes `clientport`; the server then 401s and the app calls
   `Auth/Logout`. Navigate only inside the SPA (`history.pushState` + `popstate`) when exploring.
4. **Never print, log or store** `clientId`, `otpToken`, `hashKey`, passwords, OTPs. `scrub()` in
   `server/brokerlink.py` redacts them before the raw store; extend `SECRET_KEYS` when you find more.
5. The catalog is the single allowlist for both the daemon and the extension; add endpoints there.

## Where things are

| Path | What |
|---|---|
| `extension/catalog.json` | Allowlist: read endpoints, safe writes, deny prefixes |
| `extension/background.js` | Polls the daemon, runs calls inside the MobilG tab, parks orders for approval |
| `extension/popup.*` | Status + Approve/Reject for queued orders |
| `server/brokerlink.py` | `serve` (daemon, raw store) and `mcp` (stdio MCP) |
| `research/endpoints.json` | 108 endpoints parsed from MobilG's JS bundle (path, verb, params) |
| `research/live_2026-11-16.txt` | 44 endpoints observed live |
| `research/order-endpoints.md` | Order request/response shapes (from a HAR, secrets removed) |

## Open work (good next slices)

| Slice | Notes |
|---|---|
| Conditional orders | `StockOrder/SetSyntheticOrderAsync` (POST, auth in query), `DeleteSyntheticOrderAsync?id=`; body not captured yet — capture one from the UI first |
| Chain orders | `OrderTransaction/chainOrderAsync`, body in `research/order-endpoints.md` |
| Real-time stream | SignalR hub `hubmobilg.phillip.com.tr/signalr`: `getMessage` (prices), `getDepthMessage`, `getLastCompletedOrderMessage`, `getBalanceMessage`, `getPositionNotification`. Needs an in-page listener |
| Tests | daemon validation (deny list, caps, unknown names) is pure Python and easy to unit-test |

## Releasing

Bump `version` in `extension/manifest.json` and `extension/release.json` together and add notes under the new
version. Raise `min_supported` only when older builds must stop working (forced update: jobs answer 426 until
the user clicks Update in the popup, which runs `chrome.runtime.reload()`).
