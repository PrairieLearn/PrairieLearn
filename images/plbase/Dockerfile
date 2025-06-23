FROM ubuntu:24.04
ARG CACHEBUST=2025-06-05-17-00-00

SHELL ["/bin/bash", "-c"]

# Install system packages
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
        bash-completion \
        build-essential \
        ca-certificates \
        curl \
        git \
        graphviz \
        libgraphviz-dev \
        imagemagick \
        libffi-dev \
        libjpeg-dev \
        libssl-dev \
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
        wget \
        zlib1g-dev && \
    rm -rf /var/lib/apt/lists/*

# Download and build Python 3.10
WORKDIR /usr/src
RUN wget -q https://www.python.org/ftp/python/3.10.14/Python-3.10.14.tgz && \
    tar xzf Python-3.10.14.tgz
WORKDIR /usr/src/Python-3.10.14
RUN ./configure --enable-optimizations && \
    make -j"$(nproc)" && \
    make altinstall
WORKDIR /

# Set python3.10 as the default python3 and pip
RUN update-alternatives --install /usr/bin/python python /usr/local/bin/python3.10 1 && \
    update-alternatives --install /usr/bin/python3 python3 /usr/local/bin/python3.10 1 && \
    /usr/local/bin/python3.10 -m ensurepip && \
    /usr/local/bin/python3.10 -m pip install --upgrade pip

# Set up Postgres
RUN echo "PATH=\"/usr/lib/postgresql/16/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin\"" > /etc/environment && \
    mkdir /var/postgres && chown postgres:postgres /var/postgres && \
    su postgres -c "initdb -D /var/postgres" && \
    sed -i 's/scram-sha-256/trust/g' /etc/postgresql/16/main/pg_hba.conf

# Install Node.js 22
RUN wget -qO- https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs
    
# Install Yarn
RUN corepack enable && corepack prepare yarn@stable --activate

# Install Additional Libraries
COPY python-requirements.txt /python-requirements.txt
RUN /usr/local/bin/python3.10 -m pip install --break-system-packages --no-cache-dir -r /python-requirements.txt

# Clean up to reduce image size
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/*
