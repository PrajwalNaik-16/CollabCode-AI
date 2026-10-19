#!/bin/sh
set -eu

exec su-exec node sh -c 'npm run db:deploy --workspace=apps/backend && exec node dist/index.js'
