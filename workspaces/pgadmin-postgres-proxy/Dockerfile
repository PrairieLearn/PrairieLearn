FROM ubuntu:22.04

RUN groupadd -r postgres && useradd -r -g postgres -m -d /home/postgres postgres \
    && chown -R postgres:postgres /home/postgres

RUN apt-get update \
  && apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl \
  && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
  && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
  && apt-get update \
  && apt-get install -y caddy \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN apt install curl ca-certificates
RUN install -d /usr/share/postgresql-common/pgdg
RUN curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc

# Create the repository configuration file:
RUN sh -c 'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt jammy-pgdg main" > /etc/apt/sources.list.d/pgdg.list'

# Must specify pip version due to compatibility issue between pip >= 24.1 and pgadmin >= 8.11
# https://github.com/pgadmin-org/pgadmin4/issues/7836
RUN apt-get update \
  && apt-get install -y libpq-dev python3-pip python3-dev sudo \
  && DEBIAN_FRONTEND=noninteractive apt-get -yq install postgresql-16 postgresql-client-16 postgresql-contrib-16 \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m pip install --upgrade pip==24 \
  && python3 -m pip install sqlparse==0.5.3 psycopg2==2.9.10 \
  # && python3 -m pip install rstr \
  && python3 -m pip install pgadmin4==8.14 \
  && mkdir /sql-scripts \
  && mkdir -p /var/run/postgresql && chown -R postgres:postgres /var/run/postgresql \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

COPY config_local.py servers.json pgpass /usr/local/lib/python3.10/dist-packages/pgadmin4/
COPY database/ /sql-scripts/

RUN chown postgres:postgres /usr/local/lib/python3.10/dist-packages/pgadmin4/pgpass \
  && chmod 600 /usr/local/lib/python3.10/dist-packages/pgadmin4/pgpass

COPY install.sh pl-gosu-helper.sh install-pg.sh pg-init.sh /
RUN /bin/bash /install.sh
RUN /bin/bash /install-pg.sh

COPY dockerentrypoint.sh /sbin/dockerentrypoint.sh
RUN chmod 755 /sbin/dockerentrypoint.sh
COPY Caddyfile /caddy/

# UNSAFE - for local debugging only
# COPY Caddyfile.test_https /caddy/
# COPY --chmod=0755 pl-unsafe-test.sh /caddy/

COPY postgresql.conf /pgdata

USER postgres
WORKDIR /

# Expose the pgadmin port
EXPOSE 5050

CMD ["pl-gosu-helper.sh", "/sbin/dockerentrypoint.sh"]
