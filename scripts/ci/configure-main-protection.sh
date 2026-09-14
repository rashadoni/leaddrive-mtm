#!/usr/bin/env bash
# Layer 1 of docs/DELIVERY-ARCHITECTURE.md, as a script rather than a promise.
#
# The agent review of the pull request that introduced this architecture made
# the point that killed the previous design: a replacement control that is only
# described is not a control. So the enforcement lives here, is version
# controlled, is re-runnable, and is what every other repository copies.
#
# What it configures on `main`:
#   - changes arrive only through a pull request (no direct push, no force push,
#     no branch deletion)
#   - `scope` and `tests` (ci.yml) must be green before merge
#   - no required approvals: the owner works alone, and a rule nobody can
#     satisfy is how production became undeployable in the first place
#
# Usage:  bash scripts/ci/configure-main-protection.sh [owner/repo]
set -euo pipefail

REPO="${1:-rashadoni/leaddrive-mtm}"
BRANCH="${BRANCH:-main}"

command -v gh >/dev/null || { echo "gh is required" >&2; exit 1; }

echo "Configuring branch protection on ${REPO}@${BRANCH}"

# Required checks: `scope` and `tests` from .github/workflows/ci.yml (owner
# decision 2026-09-14, replacing `agent-review`, which without its API key was
# green on every pull request and reviewed nothing). ci.yml runs on EVERY pull
# request — no paths filter — so neither check can leave a pull request waiting
# for a status that never starts; `tests` skips itself when the app is untouched.
#
# Only the required-checks list is changed. The live protection has settings
# this script never owned (enforce_admins was switched on by hand), and a full
# PUT of the protection object would silently reset them.
gh api -X PATCH "repos/${REPO}/branches/${BRANCH}/protection/required_status_checks" \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "strict": false,
  "contexts": ["scope", "tests"]
}
JSON

echo
echo "Applied. Current state:"
gh api "repos/${REPO}/branches/${BRANCH}/protection" \
  --jq '{
    pull_request_only: (.required_status_checks != null),
    required_checks: .required_status_checks.contexts,
    force_pushes: .allow_force_pushes.enabled,
    deletions: .allow_deletions.enabled
  }'

echo
echo "Note: enforce_admins is false on purpose. The owner must retain a way to"
echo "recover production when a check itself is broken — that is a break-glass"
echo "path, not a routine one. Using it is worth saying out loud in the report."
