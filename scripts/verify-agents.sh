#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Playwright owns its server process; the trap only removes this run's storage.
NEMODOC_VERIFY_DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nemodoc-verify.XXXXXX")"
export NEMODOC_VERIFY_DATA_DIR
trap 'rm -rf -- "$NEMODOC_VERIFY_DATA_DIR"' EXIT
npm run build
npx playwright test --config playwright.verification.config.ts "$@"
