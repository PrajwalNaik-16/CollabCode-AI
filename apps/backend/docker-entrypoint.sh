#!/bin/sh
set -eu

mkdir -p /var/data
chown -R node:node /var/data

exec su-exec node sh -c 'npm run db:deploy --workspace=apps/backend && exec node dist/index.js'
