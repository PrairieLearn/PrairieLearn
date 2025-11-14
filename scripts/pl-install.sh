#!/bin/bash
set -ex

export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get upgrade -y

# Add PostgreSQL APT repository for PostgreSQL 16 (from https://www.postgresql.org/download/linux/ubuntu/)
apt-get install -y curl ca-certificates
install -d /usr/share/postgresql-common/pgdg
curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main' > /etc/apt/sources.list.d/pgdg.list

# Notes:
# - `g++` (via build-essential) is needed to build the native bindings in `packages/bind-mount`
# - `libjpeg-dev` is needed by the Pillow package
# - `procps` is needed for the `pkill` executable, which is used by `zygote.py`
# - `texlive`, `dvipng`, and `texlive-latex-extra` are needed for matplotlib LaTeX labels
#   (type1cm is only available in texlive-latex-extra, see https://github.com/matplotlib/matplotlib/issues/27654)
apt-get install -y --no-install-recommends \
    bash-completion \
    build-essential \
    curl \
    dvipng \
    git \
    graphviz \
    libgraphviz-dev \
    imagemagick \
    libjpeg-dev \
    lsof \
    openssl \
    postgresql-16 \
    postgresql-contrib-16 \
    procps \
    redis-server \
    tar \
    texlive \
    texlive-latex-extra \
    tmux

echo "installing node via nvm"
git clone https://github.com/creationix/nvm.git /nvm
cd /nvm
git checkout "$(git describe --abbrev=0 --tags --match "v[0-9]*" "$(git rev-list --tags --max-count=1)")"
source /nvm/nvm.sh
export NVM_SYMLINK_CURRENT=true
nvm install 22
npm install yarn@latest -g
for f in /nvm/current/bin/*; do ln -s $f "/usr/local/bin/$(basename $f)"; done

echo "setting up postgres..."
mkdir /var/postgres && chown postgres:postgres /var/postgres
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/postgres"

echo "installing pgvector..."
apt-get install -y --no-install-recommends postgresql-server-dev-16
cd /tmp
git clone --branch v0.7.0 https://github.com/pgvector/pgvector.git
cd pgvector
# This Docker image will be built in GitHub Actions but must run on a variety
# of platforms, so we need to build it without machine-specific instructions.
# https://github.com/pgvector/pgvector/issues/130
# https://github.com/pgvector/pgvector/issues/143
make OPTFLAGS=""
make install
rm -rf /tmp/pgvector
apt-get remove -y postgresql-server-dev-16
apt-get autoremove -y

# TODO: use standard OS Python installation? The only reason we switched to Conda
# was to support R and `rpy2`, but now that we've removed those, we might not
# get any benefit from Conda.
echo "setting up conda..."
cd /
arch="$(uname -m)"
# Pinning the Conda version so the default Python version is 3.10. Later conda versions use 3.12 as the default.
curl -LO https://github.com/conda-forge/miniforge/releases/download/24.3.0-0/Miniforge3-Linux-${arch}.sh
bash Miniforge3-Linux-${arch}.sh -b -p /usr/local -f

# Clear various caches to minimize the final image size.
apt-get clean
rm -rf /var/lib/apt/lists/*
conda clean --all
nvm cache clear
rm Miniforge3-Linux-${arch}.sh
