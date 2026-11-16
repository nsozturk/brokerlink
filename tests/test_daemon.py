"""Guards that must never regress: allowlist, deny list, order switch and caps. Run: python3 tests/test_daemon.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
import brokerlink as b

ORDER = {"symbolId": "1", "stock": "TEST.E", "side": "buy", "quantity": 1, "price": 10.0}


def test_guards():
    job, err = b.build_job({"name": "portfolio", "params": {"date": "2026-01-02", "evil": "x"}})
    assert err is None and job["params"] == {"date": "2026-01-02"}          # unknown params are dropped
    assert b.build_job({"name": "nope"})[1]                                  # unknown endpoint refused
    for e in list(b.CATALOG["endpoints"].values()) + list(b.CATALOG["writes"].values()):
        assert not b.denied(e["path"]), e["path"]                           # catalog never lists a denied path
    for p in ("EFT/moneyTransferAsync", "Transfer/sendTransferTransactionAsync", "Auth/Login",
              "Setting/changeUserPasswordAsync", "ForeignCurrency/setForeignCurrencyTransactionAsync"):
        assert b.denied(p), p                                                # money-out and auth stay denied
    assert all(v.get("method", "GET") == "GET" for v in b.CATALOG["endpoints"].values())

    b._state["orders_enabled"] = False
    assert "Emirler" in b.build_job({"kind": "order", "order": ORDER})[1]   # popup switch off
    b._state["orders_enabled"] = True
    job, err = b.build_job({"kind": "order", "order": ORDER})
    assert err is None and job["kind"] == "order" and job["body"]["buyOrCell"] == "A"
    assert "max_order_try" in b.build_job({"kind": "order", "order": {**ORDER, "price": 1e6}})[1]
    assert b.build_job({"kind": "order", "order": {"action": "cancel", "orderId": "abc"}})[1]
    assert b.scrub({"otpToken": "s", "a": [{"clientId": "c", "x": 1}]}) == {"otpToken": "<redacted>", "a": [{"clientId": "<redacted>", "x": 1}]}

    ok = {"status": 200, "body": '{"data":{"hsr":"42","errorCode":0,"errorMessage":"Talebiniz İletilmiştir"},"success":true}'}
    assert b.outcome(ok)["outcome"] == "sent_to_broker" and b.outcome(ok)["sent"] and b.outcome(ok)["broker_order_id"] == "42"
    assert b.outcome({"status": 499, "body": "{}"})["outcome"] == "rejected_by_user"
    bad = {"status": 200, "body": '{"data":{"errorCode":7,"errorMessage":"Yetersiz bakiye"},"success":false}'}
    assert b.outcome(bad)["outcome"] == "refused_by_broker" and not b.outcome(bad)["sent"]


if __name__ == "__main__":
    test_guards()
    print("ok")
