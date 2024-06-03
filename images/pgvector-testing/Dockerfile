FROM amazonlinux:2023

RUN dnf install -y postgresql15 postgresql15-server postgresql15-contrib postgresql15-server-devel git && \
    cd /tmp && \
    git clone --branch v0.7.0 https://github.com/pgvector/pgvector.git && \
    cd pgvector && \
    make && \
    make install

# Start postgres, run `psql` to create the `vector` extension
RUN mkdir /var/postgres && \
    chown postgres:postgres /var/postgres && \
    su postgres -c "initdb -D /var/postgres"
