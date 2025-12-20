#!/usr/bin/env sh
set -e

echo "[entrypoint] starting container; checking RUN_MIGRATIONS..."
if [ "${RUN_MIGRATIONS:-}" = "1" ] || [ "${RUN_MIGRATIONS:-}" = "true" ]; then
  echo "[entrypoint] RUN_MIGRATIONS set — running migration runner"
  # Prefer bun if available
  if command -v bun >/dev/null 2>&1; then
    bun run ./scripts/run-all-migrations.js || echo "[entrypoint] migration runner exited with non-zero"
  else
    node ./scripts/run-all-migrations.js || echo "[entrypoint] migration runner exited with non-zero"
  fi
else
  echo "[entrypoint] RUN_MIGRATIONS not set — skipping migrations"
fi

echo "[entrypoint] exec: $@"
exec "$@"
