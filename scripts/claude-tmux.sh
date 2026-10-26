#!/usr/bin/env bash
# Abre `claude` en tu terminal pero dentro de su propio tmux, como las sesiones que abre la oficina: así la oficina le
# teclea tus mensajes y aprobaciones en vez de mandarlos por el mensajero. Mismos argumentos que `claude`. Uso:
#   claude-tmux.sh [args de claude]        (sugerido: alias ct=~/Proyectos/Oficina-virtual/scripts/claude-tmux.sh)
# Socket ov-<carpeta>-<hex>, igual que socketDe en server/tmux.js; OFICINA_TMUX lo liga a la sesión (hooks/hook.sh).
set -euo pipefail
slug="$(basename "$PWD" | iconv -f utf-8 -t ascii//TRANSLIT 2>/dev/null | tr 'A-Z' 'a-z' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//' | cut -c1-40)"
socket="ov-${slug:-sesion}-$(openssl rand -hex 2)"
# Su propio scope de systemd (como enScope en server/control.js): un OOM se lleva solo esta sesión.
exec env -u TMUX systemd-run --user --scope --collect --quiet \
  tmux -L "$socket" new-session -s main -c "$PWD" -e "OFICINA_TMUX=$socket" claude "$@"
