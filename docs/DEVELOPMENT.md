# Development

`dsh-balance` is a DeepSeek Harness (dsh) bundle plugin with two halves.

## Layout

- `lib/index.js` — host entry. Mounts `GET /dsh-balance/status`, which resolves
  the API key through the credentials service (falling back to the process
  environment), fetches `https://api.deepseek.com/user/balance`, and maintains
  the daily-balance history at `~/.dsh/dsh-balance/history.json`.
- `client/client.js` — browser bundle. Registers two slots:
  - `sidebar.footer.action` — the always-visible balance chip.
  - `shell.overlay` — the popover with the 5-day spending chart.
- `cordis.patch.yml` — inserts the plugin row into the profile layer stack.

The host half imports only Node builtins; the client bundle is a
`window.__ModuleLoader__.load({ id, factory })` module using `require("react")`.

## Install locally for testing

```sh
dsh plugin --profile web add <path-or-name>
# restart dsh web, then refresh the page
```

## Notes

- The 5-day chart is balance-delta based and fills in over time from install.
- Only cache-named folders and known temp paths are touched; nothing else.
