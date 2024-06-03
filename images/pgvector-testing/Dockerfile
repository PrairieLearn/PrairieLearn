FROM amazonlinux:2023

RUN dnf install -y postgresql15 postgresql15-server postgresql15-contrib postgresql15-server-devel git && \
    cd /tmp && \
    git clone https://github.com/pgvector/pgvector.git && \
    cd pgvector && \
    make OPTFLAGS="" && \
    make install && \
    rm -rf /tmp/pgvector && \
    dnf -y remove postgresql15-server-devel && \
    dnf -y autoremove

# Start postgres, run `psql` to create the `vector` extension
RUN mkdir /var/postgres && \
    chown postgres:postgres /var/postgres && \
    su postgres -c "initdb -D /var/postgres"
