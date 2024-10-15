FROM ubuntu:22.04

ENV HOST=127.0.0.1
ENV DB_HOST=127.0.0.1
ENV POSTGRES_HOST=127.0.0.1
ENV SERVER_MODE = False
RUN useradd -m 1001 --badname \
    && chown -R 1001:1001 /home/1001

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
  && mkdir -p /var/lib/pgadmin \
  && chown 1001:1001 /var/lib/pgadmin \
  && chmod 700 /var/lib/pgadmin \
  && mkdir /sql-scripts \
  && mkdir -p /var/run/postgresql && chown -R 1001:1001 /var/run/postgresql \
  && echo "1001:x:1001:1001::/home/1001:/bin/bash" >> /etc/passwd \
  && chmod 777 /home/1001 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

COPY database/imdb.sql database/world.sql database/mds.sql /sql-scripts/
COPY pg_hba.conf postgresql.conf /etc/postgresql/14/main/
# copying pgpass servers.json didn't help with the pgadmin4 login, removing now, let students login using the localhost


# I don't think this will work in production.
# VOLUME /var/run/postgresql

COPY install.sh pl-gosu-helper.sh /
#RUN /bin/bash /install.sh

COPY dockerentrypoint.sh /sbin/dockerentrypoint.sh
RUN chmod 755 /sbin/dockerentrypoint.sh
COPY Caddyfile /caddy/

# UNSAFE - for local debugging only
# COPY Caddyfile.test_https /caddy/
# COPY --chmod=0755 pl-unsafe-test.sh /caddy/

USER 1001
WORKDIR /

RUN /usr/lib/postgresql/14/bin/initdb --pgdata=$HOME/pginstance \
    && /usr/lib/postgresql/14/bin/pg_ctl -D $HOME/pginstance start \
    && createdb 1001 \
    && psql -U 1001 -d 1001 -c "ALTER USER \"1001\" WITH PASSWORD '1001';" \
    && cat /sql-scripts/imdb.sql | psql -U 1001 -d 1001 \
    && cat /sql-scripts/world.sql | psql -U 1001 -d 1001 \
    && cat /sql-scripts/mds.sql | psql -U 1001 -d 1001 \
    && /usr/lib/postgresql/14/bin/pg_ctl -D $HOME/pginstance stop

# Expose the pgadmin port
EXPOSE 5050

CMD ["/sbin/dockerentrypoint.sh"]
