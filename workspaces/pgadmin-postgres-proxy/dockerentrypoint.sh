#! /bin/bash

echo "[run] starting Postgres"
/usr/lib/postgresql/16/bin/pg_ctl -D /pgdata start
echo "Waiting for postgres to start..."
while ! pg_isready ; do sleep 1s ; done
echo "[run] PostgreSQL started and configured"

date
echo "[run] starting pgadmin..."
pgadmin4 &
while ! curl http://localhost:5050/misc/ping >/dev/null 2>&1 ; do echo "..." ; sleep 0.5s ; done
date
python3 /usr/local/lib/python3.10/dist-packages/pgadmin4/setup.py load-servers "/usr/local/lib/python3.10/dist-packages/pgadmin4/servers.json" 
python3 /usr/local/lib/python3.10/dist-packages/pgadmin4/setup.py set-prefs pgadmin4@pgadmin.org sqleditor:auto_completion:autocomplete_on_key_press=true
echo "[run] pgadmin started and configured"

echo "[run] starting Caddy reverse proxy"
export ADJUSTED_BASE_URL=${WORKSPACE_BASE_URL%%/}
echo "ADJUSTED_BASE_URL is: $ADJUSTED_BASE_URL"
exec caddy run --config /caddy/Caddyfile
