#!/usr/bin/env bash
# Cursor Agent add-on entrypoint: persistent home in /data, web terminal on the ingress port.
set -euo pipefail

OPTIONS=/data/options.json
opt() { jq -r --arg k "$1" '.[$k] // empty' "$OPTIONS"; }

export HOME=/data/home
mkdir -p "$HOME/.ssh" "$HOME/.local/bin" /data/workspace
chmod 700 "$HOME/.ssh"
# ssh resolves ~ from /etc/passwd (/root), not $HOME.
rm -rf /root/.ssh && ln -s "$HOME/.ssh" /root/.ssh

{
  echo "export HOME=/data/home"
  echo "export PATH=\"/data/home/.local/bin:\$PATH\""
  echo "export HA_SHARE=/config"
  echo "export HA_API_URL=http://homeassistant:8123"
  echo "export REPO_URL=$(printf %q "$(opt repo_url)")"
  key="$(opt cursor_api_key)"
  if [ -n "$key" ]; then echo "export CURSOR_API_KEY=$(printf %q "$key")"; fi
} > /etc/profile.d/10-cursor-agent.sh
chmod 600 /etc/profile.d/10-cursor-agent.sh
cp /etc/cursor-agent/login.sh /etc/profile.d/20-cursor-login.sh

name="$(opt git_user_name)"
email="$(opt git_user_email)"
[ -n "$name" ] && git config --global user.name "$name"
[ -n "$email" ] && git config --global user.email "$email"
git config --global init.defaultBranch master
git config --global pull.ff only

# GitHub deploy key (add the public key to the repo with write access).
if [ ! -f "$HOME/.ssh/id_ed25519" ]; then
  ssh-keygen -t ed25519 -N "" -C "ha-cursor-agent" -f "$HOME/.ssh/id_ed25519" >/dev/null
fi
ssh-keyscan -t ed25519 github.com > "$HOME/.ssh/known_hosts" 2>/dev/null || true

# Cursor CLI lives in /data so it survives add-on rebuilds and can self-update.
if [ ! -x "$HOME/.local/bin/cursor-agent" ]; then
  echo "Installing Cursor CLI..."
  curl -fsSL https://cursor.com/install | bash || echo "WARN: Cursor CLI install failed; run: curl https://cursor.com/install -fsS | bash"
fi

echo "Starting web terminal on port 7681"
exec ttyd --port 7681 --writable --ping-interval 30 \
  -t fontSize=14 -t 'theme={"background":"#11151c"}' -t titleFixed=Cursor \
  tmux new-session -A -s cursor bash -l
