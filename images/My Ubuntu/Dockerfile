# https://prairielearn.readthedocs.io/en/latest/installingNative/

FROM ubuntu:24.04
SHELL ["/bin/bash", "-c"]
RUN echo "."

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
        vim \
        python3.10 \
        python3-pip

# Set up Postgres
RUN echo "PATH=\"/usr/lib/postgresql/16/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin\"" > /etc/environment && \
    mkdir /var/postgres && chown postgres:postgres /var/postgres && \
    su postgres -c "initdb -D /var/postgres" && \
    sed -i 's/scram-sha-256/trust/g' /etc/postgresql/16/main/pg_hba.conf

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs
    
# Install Yarn
RUN corepack enable && corepack prepare yarn@stable --activate

# Install D2
RUN curl -fsSL https://d2lang.com/install.sh | sh -s --

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Add uv to PATH
ENV PATH="/venv/bin:$PATH"

# Copy Python requirements file
COPY python-requirements.txt .

# Create and seed virtual environment using uv
RUN /root/.local/bin/uv venv --python 3.10 --seed /venv

# Install requirements inside the virtual environment using uv
RUN /root/.local/bin/uv pip install -r python-requirements.txt

# Clean up to reduce image size
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/*
