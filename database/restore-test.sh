#!/usr/bin/env bash
# Testa se um backup realmente restaura: cria um banco temporário, restaura e confere as tabelas.
# Uso: PGHOST=... PGUSER=... PGPASSWORD=... ./restore-test.sh arquivo.dump
set -euo pipefail

FILE="${1:?Informe o arquivo de backup (.dump)}"
TEMP_DB="sesfa_restore_test_$$"

createdb "$TEMP_DB"
trap 'dropdb --if-exists "$TEMP_DB"' EXIT

pg_restore --no-owner --dbname="$TEMP_DB" "$FILE"
TABLES=$(psql -At -d "$TEMP_DB" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
USERS=$(psql -At -d "$TEMP_DB" -c "SELECT COUNT(*) FROM users")
FAMILIES=$(psql -At -d "$TEMP_DB" -c "SELECT COUNT(*) FROM families")
echo "Restauração OK: $TABLES tabelas, $USERS usuários, $FAMILIES famílias."
