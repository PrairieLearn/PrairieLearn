#! /bin/bash

echo "[run] starting Postgres"
/usr/lib/postgresql/14/bin/pg_ctl -D /pgdata start
echo "Waiting for postgres to start..."
while ! pg_isready ; do sleep 1s ; done
echo "[run] PostgreSQL started and configured"
# copying pgpass servers.json didn't help with the pgadmin4 login, removing now, let students login using the localhost
# python3 /usr/local/lib/python3.10/dist-packages/pgadmin4/setup.py load-servers "/etc/postgresql/14/main/servers.json"
date
echo "[run] starting pgadmin..."
pgadmin4 &
while ! curl http://localhost:5050/misc/ping >/dev/null 2>&1 ; do echo "..." ; sleep 0.5s ; done
date
echo "[run] pgadmin started and configured"

echo "[run] starting Caddy reverse proxy"
export ADJUSTED_BASE_URL=${WORKSPACE_BASE_URL%%/}
echo "ADJUSTED_BASE_URL is: $ADJUSTED_BASE_URL"
exec caddy run --config /caddy/Caddyfile
