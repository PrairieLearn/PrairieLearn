FROM ubuntu:22.04

ENV HOST=127.0.0.1
ENV DB_HOST=127.0.0.1
ENV POSTGRES_HOST=127.0.0.1
ENV SERVER_MODE = False
RUN groupadd -r postgres && useradd -r -g postgres -m -d /home/postgres postgres \
    && chown -R postgres:postgres /home/postgres

RUN apt-get update \
  && apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl \
  && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
  && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
  && apt-get update \
  && apt-get install caddy \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN apt-get update \
  && apt-get install -y libpq-dev python3-pip python3-dev sudo \
  && DEBIAN_FRONTEND=noninteractive apt-get -yq install postgresql postgresql-contrib \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m pip install --upgrade pip \
  && python3 -m pip install sqlparse psycopg2\
  && python3 -m pip install rstr \
  && python3 -m pip install pgadmin4==8.10 \
  && sed -i "s/DEFAULT_SERVER = '127.0.0.1'/DEFAULT_SERVER = '0.0.0.0'/" /usr/local/lib/python3.10/dist-packages/pgadmin4/config.py \
  && sed -i 's/SERVER_MODE = True/SERVER_MODE = False/g' /usr/local/lib/python3.10/dist-packages/pgadmin4/config.py \
  && sed -i 's/MASTER_PASSWORD_REQUIRED = True/MASTER_PASSWORD_REQUIRED = False/g' /usr/local/lib/python3.10/dist-packages/pgadmin4/config.py \
  && sed -i "s|\"pg-14\": \"\"|\"pg-14\": \"/usr/lib/postgresql/14/bin\"|" /usr/local/lib/python3.10/dist-packages/pgadmin4/config.py \
  && mkdir -p /var/lib/pgadmin \
  && chown postgres:postgres /var/lib/pgadmin \
  && chmod 700 /var/lib/pgadmin \
  && mkdir /sql-scripts \
  && mkdir -p /var/run/postgresql && chown -R postgres:postgres /var/run/postgresql \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

COPY database/imdb.sql database/world.sql database/mds.sql /sql-scripts/
COPY pg_hba.conf postgresql.conf /etc/postgresql/14/main/
# copying pgpass servers.json didn't help with the pgadmin4 login, removing now, let students login using the localhost

COPY servers.json pgpass /usr/local/lib/python3.10/dist-packages/pgadmin4/
RUN chown postgres:postgres /usr/local/lib/python3.10/dist-packages/pgadmin4/pgpass && chmod 600 /usr/local/lib/python3.10/dist-packages/pgadmin4/pgpass

# I don't think this will work in production.
# VOLUME /var/run/postgresql

COPY install.sh pl-gosu-helper.sh /
RUN /bin/bash /install.sh
COPY install-pg.sh pg-init.sh /
RUN /bin/bash /install-pg.sh

COPY dockerentrypoint.sh /sbin/dockerentrypoint.sh
RUN chmod 755 /sbin/dockerentrypoint.sh
COPY Caddyfile /caddy/

# UNSAFE - for local debugging only
# COPY Caddyfile.test_https /caddy/
# COPY --chmod=0755 pl-unsafe-test.sh /caddy/

USER postgres
WORKDIR /

# Expose the pgadmin port
EXPOSE 5050

CMD ["pl-gosu-helper.sh", "/sbin/dockerentrypoint.sh"]
