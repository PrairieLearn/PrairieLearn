#!/bin/bash
set -ex

export DEBIAN_FRONTEND=noninteractive
PG_BIN="/usr/lib/postgresql/17/bin"
export PATH="${PG_BIN}:$PATH"

apt-get update -y
apt-get upgrade -y

# Add PostgreSQL APT repository for PostgreSQL 17 (from https://www.postgresql.org/download/linux/ubuntu/)
apt-get install -y postgresql-common
/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
apt-get update -y

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
    postgresql-17 \
    postgresql-contrib-17 \
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
nvm install 24
npm install yarn@latest -g
for f in /nvm/current/bin/*; do ln -s $f "/usr/local/bin/$(basename $f)"; done

echo "setting up postgres..."
mkdir -p /var/run/postgresql && chown postgres:postgres /var/run/postgresql
mkdir /var/postgres && chown postgres:postgres /var/postgres
su postgres -c "${PG_BIN}/initdb -D /var/postgres"

echo "installing pgvector..."
apt-get install -y --no-install-recommends postgresql-server-dev-17
cd /tmp
git clone --branch v0.8.1 https://github.com/pgvector/pgvector.git
cd pgvector
# This Docker image will be built in GitHub Actions but must run on a variety
# of platforms, so we need to build it without machine-specific instructions.
# https://github.com/pgvector/pgvector/issues/130
# https://github.com/pgvector/pgvector/issues/143
make OPTFLAGS=""
make install
rm -rf /tmp/pgvector
# `autoremove` keeps `clang-19` due `build-essential -> dpkg-dev` recommending
# `gcc | c-compiler` (`clang-19` provides `c-compiler`). Purge these roots
# explicitly so the rest of the LLVM toolchain becomes removable.
mapfile -t llvm_pkgs < <(dpkg -l | grep -oP '(clang|llvm)-\d+(-dev)?' | sort -u)
apt-get purge -y postgresql-server-dev-17 "${llvm_pkgs[@]}" || true
apt-get autoremove -y

echo "setting up uv + venv..."
cd /
curl -fLO https://astral.sh/uv/install.sh
env UV_INSTALL_DIR=/usr/local/bin sh /install.sh && rm /install.sh

# /PrairieLearn/.venv/bin/python3 -> /usr/local/bin/python3 -> /usr/share/uv/python/*/bin/python3.13
UV_PYTHON_BIN_DIR=/usr/local/bin uv python install python3.13

# Clear various caches to minimize the final image size.
apt-get clean
rm -rf /var/lib/apt/lists/*
nvm cache clear
