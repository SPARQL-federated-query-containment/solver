#!/bin/bash
# specs <flags>  ->  verdict on stdout, diagnostics on stderr.
# specs          ->  serve mode: one request per line on stdin, its fields the
#                    base64-encoded flags, and one "OK <base64 verdict>" or
#                    "ERR <base64 message>" per line on stdout.
#
# Normalises SpeCS output: the negative verdict is printed as "sat - <union
# index>", collapsed here to "sat". Exit status is 0 whenever a verdict was
# produced -- sat and unsat are both legitimate answers -- and 1 on failure.
set -uo pipefail

ERRFILE=/tmp/specs.err

# SpeCS reports a failed z3 invocation as "sat" instead of erroring, so a broken
# solver silently turns every query into "not contained". Fail loudly instead.
if ! z3 --version >/dev/null 2>&1; then
    echo "specs: z3 is not executable in this image" >&2
    exit 1
fi

# Prints the verdict, or the reason it produced none and returns 1. Diagnostics
# are left in $ERRFILE, which is safe to reuse since requests are serialised.
run() {
    local out status verdict

    out=$(/opt/specs/specs "$@" 2>"$ERRFILE")
    status=$?

    verdict=$(printf '%s' "$out" | tr -d '\n' | sed 's/ *- *[0-9]*$//')

    if [[ $status -ne 0 || -z $verdict ]]; then
        printf 'no verdict produced\n'
        return 1
    fi

    printf '%s\n' "$verdict"
}

if [[ $# -gt 0 ]]; then
    out=$(run "$@")
    status=$?
    cat "$ERRFILE" >&2

    if [[ $status -ne 0 ]]; then
        echo "specs: $out" >&2
        exit 1
    fi

    printf '%s\n' "$out"
    exit 0
fi

while IFS= read -r line; do
    [[ -z $line ]] && continue

    args=()
    for field in $line; do
        args+=("$(base64 -d <<<"$field")")
    done

    if out=$(run "${args[@]}"); then
        printf 'OK %s\n' "$(printf '%s' "$out" | base64 -w0)"
    else
        printf 'ERR %s\n' "$(printf '%s: %s' "$out" "$(cat "$ERRFILE")" | base64 -w0)"
    fi
done
