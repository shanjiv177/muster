#!/usr/bin/env bash
# Updates the hosted relayer's code and restarts only muster-relayer. First-time setup (user, Node,
# env file, unit, Caddy route) is described in relayer/README.md.
set -euo pipefail
H=${RELAYER_HOST:?set RELAYER_HOST=user@host}
cd "$(dirname "$0")/../.."
rsync -az --delete --relative package.json package-lock.json tsconfig.json scripts/lib relayer/src deployments "$H:/opt/muster/app/"
ssh "$H" 'sudo chown -R shanjiv /opt/muster/app && cd /opt/muster/app && PATH=/opt/muster/node/bin:$PATH npm ci --no-audit --no-fund >/dev/null && sudo chown -R muster:muster /opt/muster/app && sudo systemctl restart muster-relayer && sleep 3 && curl -s localhost:8794/health'
