#!/usr/bin/env bash
# Backup do banco do SESFA (formato custom do pg_dump, compactado).
# Uso: PGHOST=... PGDATABASE=... PGUSER=... PGPASSWORD=... ./backup.sh [diretorio] [dias_de_retencao]
set -euo pipefail

DEST="${1:-./backups}"
RETENTION_DAYS="${2:-30}"
: "${PGDATABASE:?Defina PGDATABASE}"

umask 077
mkdir -p "$DEST"
chmod 700 "$DEST"
FILE="$DEST/sesfa_${PGDATABASE}_$(date +%Y%m%d_%H%M%S).dump"

pg_dump --format=custom --no-owner --file="$FILE"
# Verifica se o arquivo gerado é legível antes de considerá-lo válido.
pg_restore --list "$FILE" > /dev/null
echo "Backup criado e verificado: $FILE"

find "$DEST" -name 'sesfa_*.dump' -mtime +"$RETENTION_DAYS" -delete
echo "Backups com mais de $RETENTION_DAYS dias foram removidos."
