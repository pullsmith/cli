#!/bin/sh

AGENT=$(awk -F': *' '/^sentry_agent:/{print $2; exit}' .pullsmith)

MODEL=$(awk -v a="$AGENT" '
  /^[[:space:]]*-?[[:space:]]*name:[[:space:]]*/ {
    name=$0; sub(/^[[:space:]]*-?[[:space:]]*name:[[:space:]]*/,"",name)
    here=(name==a); next
  }
  here && /^[[:space:]]*model:[[:space:]]*/ {
    m=$0; sub(/^[[:space:]]*model:[[:space:]]*/,"",m)
    sub(/[[:space:]]*(#.*)?$/,"",m)   # strip trailing spaces/comments
    print m; exit
  }
' .pullsmith)

printf '%s\n' "$MODEL"
