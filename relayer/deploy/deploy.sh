#!/usr/bin/env bash
# Updates the hosted relayer's code and restarts only muster-relayer. First-time setup (user, Node,
# env file, unit, Caddy route) is described in relayer/README.md.
set -euo pipefail
H=${RELAYER_HOST:?set RELAYER_HOST=user@host}
cd "$(dirname "$0")/../.."
ssh "$H" 'sudo chown -R "$(id -un)" /opt/muster/app'
rsync -az --delete --relative package.json package-lock.json tsconfig.json scripts/lib scripts/keeper.ts relayer/src deployments "$H:/opt/muster/app/"
ssh "$H" 'cd /opt/muster/app && PATH=/opt/muster/node/bin:$PATH npm ci --no-audit --no-fund >/dev/null && sudo chown -R muster:muster /opt/muster/app && sudo systemctl restart muster-relayer && (systemctl is-enabled muster-keeper >/dev/null 2>&1 && sudo systemctl restart muster-keeper || true) && sleep 3 && curl -s localhost:8794/health'
