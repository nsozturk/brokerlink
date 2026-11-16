# Contributing

1. Read [`AGENTS.md`](AGENTS.md): the five hard rules apply to people and AI agents alike.
2. New endpoint: add it to `extension/catalog.json` (reads are GET only). `research/endpoints.json` lists 108 known paths with parameters.
3. Run `python3 tests/test_daemon.py` and `node --check extension/*.js` before opening a pull request.
4. Never commit HAR files, `data/`, `config.json`, account numbers, IPs or session values. CI greps for the common ones.
5. Release: bump `version` in `extension/manifest.json` and `extension/release.json`, add notes to `release.json` and `CHANGELOG.md`, push to `main`.

Out of scope, please do not send: money-out or transfer features, automatic order approval, anything that opens, reloads or logs in to MobilG.
