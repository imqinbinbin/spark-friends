#!/bin/zsh
set -eu

SCRIPT_DIR=${0:A:h}
exec node "$SCRIPT_DIR/send-once.cjs" "$@"
