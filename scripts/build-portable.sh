#!/usr/bin/env bash
#
# build-portable.sh — produce the AgentDeck Windows portable .exe from a clean state.
#
# Steps:
#   1. Verify (lint + typecheck + tests) — fail fast on any regression
#   2. Clean (out/ + any prior dist/AgentDeck-*-portable.exe)
#   3. Build (electron-vite build) and package (electron-builder --win portable)
#   4. Report the produced .exe path + size
#
# Usage:
#   npm run release-portable
#   bash scripts/build-portable.sh   # equivalent
#

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

step() {
  echo
  printf "${BOLD}${GREEN}==>${RESET} ${BOLD}%s${RESET}\n" "$*"
}

info() {
  printf "    %s\n" "$*"
}

warn() {
  printf "${YELLOW}!!  %s${RESET}\n" "$*"
}

fail() {
  printf "${RED}xx  %s${RESET}\n" "$*" >&2
  exit 1
}

# Resolve repo root (script lives in scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

[ -f package.json ] || fail "package.json not found at $REPO_ROOT"
[ -d node_modules ] || fail "node_modules missing — run \`npm install --no-bin-links\` first"

VERSION="$(node -p "require('./package.json').version")"
EXPECTED_OUT="dist/AgentDeck-${VERSION}-portable.exe"

step "AgentDeck v${VERSION} — portable build"
info "Repo: ${REPO_ROOT}"
info "Target: ${EXPECTED_OUT}"

# ── 1. Verify ────────────────────────────────────────────────────
step "[1/4] Lint"
npm run lint

step "[2/4] Typecheck"
npm run typecheck

step "[3/4] Tests"
npm test -- --run

# ── 2. Clean ─────────────────────────────────────────────────────
step "Cleaning previous build output"

if [ -d out ]; then
  rm -rf out
  info "removed: out/"
fi

shopt -s nullglob
removed_any=0
for f in dist/AgentDeck-*-portable.exe; do
  rm -f "$f"
  info "removed: $f"
  removed_any=1
done
shopt -u nullglob
if [ "$removed_any" -eq 0 ]; then
  info "(no prior portable .exe to remove)"
fi

# ── 3. Build + package ───────────────────────────────────────────
step "[4/4] electron-vite build + electron-builder portable"
npm run dist

# ── 4. Report ────────────────────────────────────────────────────
[ -f "$EXPECTED_OUT" ] || fail "Expected output not found: $EXPECTED_OUT"

SIZE="$(du -h "$EXPECTED_OUT" | cut -f1)"
echo
printf "${BOLD}${GREEN}OK${RESET}  Portable built: ${BOLD}%s${RESET}  (%s)\n" "$EXPECTED_OUT" "$SIZE"
