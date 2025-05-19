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

# Install dependencies
RUN apt-get install -y \
  bash-completion curl git lsof vim \
  build-essential ca-certificates \
  python3.10 python3-pip \
  postgresql \
  redis-server \
  graphviz libgraphviz-dev \
  postgresql postgresql-contrib postgresql-16-pgvector

# setup Postgres
RUN echo "PATH=\"/usr/lib/postgresql/16/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin\"" > /etc/environment
RUN sed -i 's/scram-sha-256/trust/g' /etc/postgresql/16/main/pg_hba.conf
RUN mkdir /var/postgres && chown postgres:postgres /var/postgres
RUN su postgres -c "initdb -D /var/postgres"

# Configure git user
RUN git config --global user.email "dev@example.com" \
  && git config --global user.name "Dev User" \
  && git config --global safe.directory '*'

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs

# Install Yarn
RUN corepack enable && corepack prepare yarn@stable --activate

# Install D2
RUN curl -fsSL https://d2lang.com/install.sh | sh -s --

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Install Docker
# Add Docker's official GPG key:
RUN install -m 0755 -d /etc/apt/keyrings
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
RUN chmod a+r /etc/apt/keyrings/docker.asc
RUN echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
RUN apt-get update
RUN apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Clone PrairieLearn
RUN git clone https://github.com/PrairieLearn/PrairieLearn.git
WORKDIR /PrairieLearn

# Set up a Python virtual environment
RUN /root/.local/bin/uv venv --python 3.10 --seed

# Install PrairieLearn
RUN source .venv/bin/activate && make deps

# Set up directories
RUN mkdir -p /course{,{2..9}} \
  && mkdir -p /workspace_{main,host}_zips \
  && mkdir -p /jobs

# Run migrations to initialize the DB
RUN /PrairieLearn/scripts/start_postgres.sh \
  && make build \
  && node apps/prairielearn/dist/server.js --migrate-and-exit \
  && PATH="/usr/lib/postgresql/16/bin:$PATH" /PrairieLearn/scripts/start_postgres.sh stop

HEALTHCHECK CMD curl --fail http://localhost:3000/pl/webhooks/ping || exit 1
CMD [ "/PrairieLearn/scripts/init.sh" ]