# Security

brokerlink touches a brokerage session, so please report problems privately: open a
[private security advisory](https://github.com/nsozturk/brokerlink/security/advisories/new) instead of a public issue.

## Design guarantees

- The MobilG session (`clientId`, `otpToken`) is read inside the browser tab and never sent to the daemon, the MCP client or any server other than MobilG itself.
- The daemon listens on `127.0.0.1` only and refuses requests that carry a web page `Origin`.
- One allowlist (`extension/catalog.json`) is enforced twice: in the daemon and in the extension.
- Money-out, transfer, login, password and settings endpoints are on a deny list and covered by `tests/test_daemon.py`.
- Auto-send (off by default, user-switched, session-only, user-set limits, limit orders only) is the single exception to the next line.
- Orders are only queued by tools. They are sent when a person clicks Approve in the popup; the on/off switch is stored and enforced in the extension.
- Stored raw responses have session fields redacted.

## What it does not protect against

- Other software on your machine that can talk to `127.0.0.1:18890` can read the same data an AI client can (it still cannot send orders without your click).
- A malicious or mistaken AI client can queue orders up to the configured caps; read every preview before approving.
- MobilG's internal API is undocumented and may change without notice.
