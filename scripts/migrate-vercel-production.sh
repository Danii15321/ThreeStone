#!/usr/bin/env bash

set -euo pipefail

environment_file="${1:-.vercel/.env.production.local}"

if [[ ! -f "${environment_file}" ]]; then
  echo "Vercel production environment file not found: ${environment_file}" >&2
  exit 1
fi

set -a
source "${environment_file}"
set +a

: "${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED is required}"

DATABASE_URL="${DATABASE_URL_UNPOOLED}" corepack pnpm db:migrate
