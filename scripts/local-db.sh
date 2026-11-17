#!/usr/bin/env bash
# Démarre un PostgreSQL local pour le développement (port 5433, base "jobradar").
# En production, la base est celle de Supabase (DATABASE_URL).
set -euo pipefail
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(pwd)/.pgdata"
PORT="${PG_PORT:-5433}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then RUN_AS=(runuser -u postgres --); fi
if [ ! -d "$DATA" ]; then
  mkdir -p "$DATA"; [ "$(id -u)" = "0" ] && chown postgres "$DATA"
  "${RUN_AS[@]}" "$BIN/initdb" -D "$DATA" -U jobradar --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
fi
if ! "${RUN_AS[@]}" "$BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
  "${RUN_AS[@]}" "$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/server.log" start >/dev/null
  sleep 2
fi
"$BIN/psql" -h /tmp -p "$PORT" -U jobradar -d postgres -tAc "select 1 from pg_database where datname='jobradar'" | grep -q 1 \
  || "$BIN/createdb" -h /tmp -p "$PORT" -U jobradar jobradar
echo "PostgreSQL local prêt : DATABASE_URL=postgres://jobradar@localhost:$PORT/jobradar"
