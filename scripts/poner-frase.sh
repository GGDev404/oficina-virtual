#!/usr/bin/env bash
# Pone (o cambia) tu frase para entrar a la oficina. Córrelo TÚ en tu terminal: la frase no se muestra ni se guarda,
# solo su hash scrypt en ~/.config/oficina-virtual/frase (0600). Después entra en la página una vez por navegador.
set -euo pipefail
archivo="${OFICINA_FRASE:-$HOME/.config/oficina-virtual/frase}"
[ -t 0 ] || { echo "Córrelo en una terminal interactiva (no desde un agente)." >&2; exit 1; }
read -rsp "Frase (mínimo 12 caracteres): " a; echo
read -rsp "Repítela: " b; echo
[ "$a" = "$b" ] || { echo "No coinciden." >&2; exit 1; }
[ "${#a}" -ge 12 ] || { echo "Muy corta: usa 12 caracteres o más." >&2; exit 1; }
mkdir -p "$(dirname "$archivo")"
umask 077
printf '%s' "$a" | node --input-type=module -e "
import { hashFrase } from '$(dirname "$(readlink -f "$0")")/../server/guardia.js';
let f = ''; for await (const c of process.stdin) f += c;
process.stdout.write(hashFrase(f));" > "$archivo"
chmod 600 "$archivo"
echo "Listo. Recarga la oficina y entra con tu frase (una vez por navegador, dura 30 días)."
