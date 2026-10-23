# Login banner for the Cursor Agent terminal; the first shell of the session opens the agent.
WORKSPACE=/data/workspace/home-dashboard

if [ -d "$WORKSPACE/.git" ]; then
  cd "$WORKSPACE"
else
  cd /config
  keys_url="$(printf '%s' "${REPO_URL:-}" | sed -E 's#^git@github\.com:#https://github.com/#; s#\.git$##')/settings/keys"
  cat <<EOF

  Cursor Agent - workspace not set up yet (working in /config for now)

  To work on the dashboard repo:
  1. Open $keys_url
     click "Add deploy key", paste the key below, and tick "Allow write access":

     $(cat /data/home/.ssh/id_ed25519.pub 2>/dev/null)

  2. Exit the agent (Ctrl-C twice) and run:  setup-workspace

EOF
fi

case $- in *i*) ;; *) return 0 2>/dev/null || exit 0 ;; esac

if [ "${TMUX_PANE:-}" = "%0" ] && [ -z "${CURSOR_AGENT_AUTOSTARTED:-}" ]; then
  export CURSOR_AGENT_AUTOSTARTED=1
  if cursor-agent status 2>&1 | grep -qi "not logged in"; then
    cat <<EOF
  Cursor is not signed in yet. Either:

  - Easiest: create an API key at https://cursor.com/dashboard (Integrations > API Keys),
    paste it into this add-on's Configuration tab as cursor_api_key, and restart the add-on.
  - Or run:  cursor-agent login
    then open the link it prints in a browser and sign in (the terminal waits until you do;
    press Ctrl-C to cancel).

  After signing in, run 'cursor-agent' to start the agent.

EOF
  else
    assistant || true
    echo
    echo "  You're at the command line. Type 'assistant' for the plain-language helper,"
    echo "  or 'cursor-agent' for the full agent (shows its commands)."
    echo
  fi
fi
