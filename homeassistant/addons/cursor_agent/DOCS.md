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
5. Reopen the panel; it starts the Home helper (see below).

`npm run deploy` works from the terminal: it builds the dashboard and writes straight into
`/config` (no Samba), then reloads HA helpers and automations.

## Home helper (default)

Opening the panel starts **Home helper**, a plain-language chat for non-technical use. It only
shows the agent's replies (no commands or code): for a change it first summarizes what it will do
and asks before going ahead, then does the work, deploys and saves it, and summarizes the result.
Its guidance lives in `/etc/cursor-agent/assistant-instructions.md`.

- Type `new` to start a fresh conversation, `exit` to drop to the command line.
- From the command line, `assistant` reopens the helper; `cursor-agent` runs the full agent.

## Notes

- The terminal session is a tmux session; closing the page leaves the agent running.
- Everything under `/data` (repo, Cursor login, SSH key) persists across add-on restarts and updates.
- Anyone who can open this panel can change any HA configuration file. Keep it admin-only.
- Pull before working and push when done so the PC and HA copies of the repo stay in sync.
  `npm run deploy` refuses to run when the copy is behind GitHub (`DEPLOY_SKIP_GIT_CHECK=1` bypasses it).
