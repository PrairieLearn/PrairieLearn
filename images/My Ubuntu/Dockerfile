# https://prairielearn.readthedocs.io/en/latest/installingNative/

FROM ubuntu:24.04
SHELL ["/bin/bash", "-c"]

# Git and curl
RUN apt-get update && apt-get upgrade -y

# Locale and Timezone
ENV LC_ALL=en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US.UTF-8
RUN apt install -y locales locales-all tzdata && \
  ln -fs /usr/share/zoneinfo/America/Los_Angeles /etc/localtime && \
  dpkg-reconfigure --frontend noninteractive tzdata

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
        texlive \
        texlive-dvipng \
        texlive-type1cm \
        tmux \
        vim

# Set up Postgres
RUN echo "PATH=\"/usr/lib/postgresql/16/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin\"" > /etc/environment && \
    mkdir /var/postgres && chown postgres:postgres /var/postgres && \
    su postgres -c "initdb -D /var/postgres" && \
    sed -i 's/scram-sha-256/trust/g' /etc/postgresql/16/main/pg_hba.conf

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs

# Install D2
RUN curl -fsSL https://d2lang.com/install.sh | sh -s --

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Install Python packages
COPY python-requirements.txt /python-requirements.txt
RUN python3 -m pip install --no-cache-dir -r /python-requirements.txt

# Set up a Python virtual environment
RUN /root/.local/bin/uv venv --python 3.10 --seed

# Clean up
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/*