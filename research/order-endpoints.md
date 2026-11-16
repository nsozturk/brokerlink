# MobilG order endpoints (from HAR 2026-11-16, values are test orders; secrets removed)

All POST/PUT bodies are JSON. `OrderTransaction/*` carries the auth fields (clientId, culture, ip, port,
otpToken) **in the body**; `StockOrder/BuySellAsync` carries them in the query string. All take
`appNumber` in the query and `appicationNumber` (sic) in the body.

| Action | Method + path | Body | Success response |
|---|---|---|---|
| New order | POST `StockOrder/BuySellAsync` | `symbolId, stock ("EGPRO.E"), buyOrCell (A=buy, S=sell), orderType (LMT / PYS=market), seance (GUN=day, KIE=IOC), quantity, price, approval "2"` | `data.hsr` = order id, `errorMessage "Talebiniz İletilmiştir"` |
| Cancel | POST `OrderTransaction/orderCancelAsync` | `orderId` | `"Emir İptal Edildi"` |
| Amend | PUT `OrderTransaction/orderImprovementAsync` | `orderId, newPrice, oldPrice, oldAmount, newAmount, approval "2", seance` | `"Talebiniz İletilmiştir"` |
| Chain order | POST `OrderTransaction/chainOrderAsync` | `orderId (parent), symbolId, stock, buySell, seance, quantity, price, orderType, approval "2"` | `data.hsr` |
| Conditional order | POST `StockOrder/SetSyntheticOrderAsync` (from bundle) | not captured yet | — |
| Conditional cancel | DELETE `StockOrder/DeleteSyntheticOrderAsync?id=` (from bundle) | — | — |

Implemented in brokerlink (popup switch + popup approval): new, cancel, amend.
Not implemented (left for a later contributor): chain, conditional, VIOP, funds, public offering, T0.
Money-out endpoints (EFT, transfers, FX, collateral) are permanently out of scope.
