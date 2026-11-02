# Agent Town live status

This branch holds only live status data for Agent Town. Bots write it with `node report.js` from the main branch.

- `data/status.json`: the latest line per bot and the overall weekly usage.
- `data/needs.json`: items that need Alex, with a handled flag.
- `data/history-YYYY-MM.jsonl`: one line per report, one file per month.

GitHub Pages builds from main, so writes here do not rebuild the site.
