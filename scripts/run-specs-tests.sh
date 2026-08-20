#!/bin/bash
# Run the SpeCS QCBench corpus and report a verdict per test.
#
# SpeCS writes <input>.smt next to its input, so the corpus is copied to a
# temporary directory first; running in place would overwrite the committed
# .smt fixtures in the submodule.
#
# Usage: scripts/run-specs-tests.sh [extra specs flags, e.g. -qc]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPECS="$ROOT/specs/SpeCS/src/specs"
TESTS="$ROOT/specs/SpeCS/tests"

if [[ ! -x $SPECS ]]; then
    echo "specs binary not found at $SPECS -- build it with: (cd specs/SpeCS/src && make)" >&2
    exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp "$TESTS"/* "$work"/

cd "$work" || exit 1
declare -A counts=()

for f in $(ls | grep -vE '\.smt$|\.rdfs$' | sort -V); do
    out=$(timeout 90 "$SPECS" -file "$f" "$@" 2>/dev/null)
    rc=$?

    if [[ $rc -eq 124 ]]; then
        verdict="TIMEOUT"
    else
        # "sat - <union index>" collapses to "sat"; unsat has no suffix.
        verdict=$(printf '%s' "$out" | tr -d '\n' | sed 's/ *- *[0-9]*$//')
        [[ -z $verdict ]] && verdict="NO-OUTPUT"
    fi

    counts[$verdict]=$(( ${counts[$verdict]:-0} + 1 ))
    printf '%-10s %s\n' "$f" "$verdict"
done

echo
echo "--- totals ---"
for v in "${!counts[@]}"; do
    printf '%-10s %s\n' "$v" "${counts[$v]}"
done
