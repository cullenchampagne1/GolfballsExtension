#!/usr/bin/env bash
# .claude/auto-push.sh
#
# Runs after every Claude Code turn (registered as a Stop hook in
# .claude/settings.json). It builds the React bundles, then commits and
# pushes all changes to the GitHub remote.
#
# It never blocks Claude: every failure path still exits 0.
# Requires a working `git push` credential (the macOS keychain entry that
# git stores after the first interactive push).

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}" 2>/dev/null || exit 0

# Only act inside a git repo that has an 'origin' remote.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
git remote get-url origin >/dev/null 2>&1 || exit 0

# Build the React bundles. Non-fatal: if the build fails, source changes
# are still committed and pushed so work is never lost.
if command -v npm >/dev/null 2>&1; then
  npm run build >/dev/null 2>&1
fi

# Stage everything, then commit only if something actually changed.
git add -A >/dev/null 2>&1
if git diff --cached --quiet 2>/dev/null; then
  exit 0   # nothing changed this turn
fi

git commit -q -m "Auto-update: $(date '+%Y-%m-%d %H:%M:%S')" >/dev/null 2>&1

# Push the current branch to origin.
if git push -q origin HEAD >/dev/null 2>&1; then
  printf '{"systemMessage": "Auto-pushed latest build to GitHub."}\n'
else
  printf '{"systemMessage": "Auto-commit succeeded but git push failed - check GitHub auth (run: git push)."}\n'
fi
exit 0
