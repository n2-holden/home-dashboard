# Cursor Agent

Runs Cursor's command-line agent (`cursor-agent`) on the Home Assistant box with a clone of the
home-dashboard repo, in a web terminal that opens from the HA sidebar (admin only).

## First run

1. Open **Cursor** in the sidebar. The banner shows an SSH public key.
2. On GitHub, open the repository's settings (not your account settings), e.g.
   `https://github.com/n2-holden/home-dashboard/settings/keys`, click **Add deploy key**, paste the
   key, and tick **Allow write access**.
3. In the terminal run `setup-workspace` (clones the repo, runs `npm ci`, writes `deploy.env`).
4. Run `cursor-agent login` and follow the link, or set `cursor_api_key` in the add-on options
   (create one in the Cursor dashboard under Integrations / API keys) and restart the add-on.
5. Run `cursor-agent` in `/data/workspace/home-dashboard`.

`npm run deploy` works from the terminal: it builds the dashboard and writes straight into
`/config` (no Samba), then reloads HA helpers and automations.

## Notes

- The terminal session is a tmux session; closing the page leaves the agent running.
- Everything under `/data` (repo, Cursor login, SSH key) persists across add-on restarts and updates.
- Anyone who can open this panel can change any HA configuration file. Keep it admin-only.
- Pull before working and push when done so the PC and HA copies of the repo stay in sync.
  `npm run deploy` refuses to run when the copy is behind GitHub (`DEPLOY_SKIP_GIT_CHECK=1` bypasses it).
