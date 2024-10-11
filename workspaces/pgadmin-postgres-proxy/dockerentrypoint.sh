#! /bin/bash

echo "[run] starting Caddy reverse proxy"
export ADJUSTED_BASE_URL=${WORKSPACE_BASE_URL%%/}
echo "ADJUSTED_BASE_URL is: $ADJUSTED_BASE_URL"
caddy run --config /caddy/Caddyfile &

echo "[run] starting Postgres"
service postgresql start
psql -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"
echo "[run] PostgreSQL started and configured"
# copying pgpass servers.json didn't help with the pgadmin4 login, removing now, let students login using the localhost
# python3 /usr/local/lib/python3.10/dist-packages/pgadmin4/setup.py load-servers "/etc/postgresql/14/main/servers.json"
pgadmin4
echo "[run] pgadmin started and configured"
