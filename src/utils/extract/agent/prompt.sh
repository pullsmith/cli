#!/bin/sh

AGENT=$(awk -F': *' '/^sentry_agent:/{print $2; exit}' .pullsmith)

PROMPT=$(awk -v a="$AGENT" '
  /^[[:space:]]*-?[[:space:]]*name:[[:space:]]*/ {
    name=$0; sub(/^[[:space:]]*-?[[:space:]]*name:[[:space:]]*/,"",name)
    here=(name==a); inp=0; next
  }
  here && /prompt:[[:space:]]*\|/ { inp=1; ind=-1; next }
  inp {
    if ($0 ~ /^[[:space:]]*$/) { print ""; next }
    n=match($0,/[^[:space:]]/)-1
    if (ind<0) ind=n
    if (n<ind) { inp=0; next }
    print substr($0, ind+1)
  }
' .pullsmith)

printf '%s\n' "$PROMPT"
