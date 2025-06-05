# https://prairielearn.readthedocs.io/en/latest/installingNative/

FROM ubuntu:24.04
ARG CACHEBUST=2025-05-15-14-16-41

SHELL ["/bin/bash", "-c"]

# Git and curl
RUN apt-get update && apt-get upgrade -y

# Install system packages
RUN apt-get install -y \
        bash-completion \
        build-essential \
        ca-certificates \
        curl \
        git \
        graphviz \
        libgraphviz-dev \
        imagemagick \
        libjpeg-dev \
        lsof \
        make \
        openssl \
        postgresql-16 \
        postgresql-16-pgvector \
        postgresql-client-16 \
        postgresql-contrib-16 \
        procps \
        redis-server \
        tar \
        vim \
        python3.10 \
        python3-pip

# Set up Postgres
RUN echo "PATH=\"/usr/lib/postgresql/16/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin\"" > /etc/environment && \
    mkdir /var/postgres && chown postgres:postgres /var/postgres && \
    su postgres -c "initdb -D /var/postgres" && \
    sed -i 's/scram-sha-256/trust/g' /etc/postgresql/16/main/pg_hba.conf

# Install Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs
    
# Install Yarn
RUN corepack enable && corepack prepare yarn@stable --activate

# Install D2
RUN curl -fsSL https://d2lang.com/install.sh | sh -s --

# Install Additional Libraries
COPY python-requirements.txt /tmp/python-requirements.txt
RUN pip install --break-system-packages -r --no-cache-dir /tmp/python-requirements.txt

# Clean up to reduce image size
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/*
