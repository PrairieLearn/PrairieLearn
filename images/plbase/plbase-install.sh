#!/bin/bash
set -ex

# If you need to rebuild this image without actually changing anything,
# add a dot to the following line:
# .

dnf update -y

# Notes:
# - `gcc-c++` is needed to build the native bindings in `packages/bind-mount`
# - `libjpeg-devel` is needed by the Pillow package
# - `procps-ng` is needed for the `pkill` executable, which is used by `zygote.py`
# - `texlive` and `texlive-dvipng` are needed for matplotlib LaTeX labels
dnf -y install \
    bash-completion \
    gcc \
    gcc-c++ \
    git \
    graphviz \
    graphviz-devel \
    ImageMagick \
    libjpeg-devel \
    lsof \
    make \
    openssl \
    postgresql16 \
    postgresql16-server \
    postgresql16-contrib \
    procps-ng \
    redis6 \
    tar \
    texlive \
    texlive-dvipng \
    texlive-type1cm \
    tmux

echo "installing node via nvm"
git clone https://github.com/creationix/nvm.git /nvm
cd /nvm
git checkout `git describe --abbrev=0 --tags --match "v[0-9]*" $(git rev-list --tags --max-count=1)`
source /nvm/nvm.sh
export NVM_SYMLINK_CURRENT=true
nvm install 20
npm install yarn@latest -g
for f in /nvm/current/bin/* ; do ln -s $f /usr/local/bin/`basename $f` ; done

echo "setting up postgres..."
mkdir /var/postgres && chown postgres:postgres /var/postgres
su postgres -c "initdb -D /var/postgres"

echo "installing pgvector..."
dnf -y install postgresql16-server-devel
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
dnf -y remove postgresql16-server-devel
dnf -y autoremove

echo "setting up uv + venv..."
cd /
curl -LO https://astral.sh/uv/install.sh
env UV_INSTALL_DIR=/usr/local/bin sh /install.sh && rm /install.sh

# /.venv/bin/python3 -> /usr/local/bin/python3 -> /usr/share/uv/python/*/bin/python3.10
export UV_PYTHON_INSTALL_DIR=/usr/share/uv/python
export UV_PYTHON_BIN_DIR=/usr/local/bin
export UV_PYTHON_DOWNLOADS=manual

if [[ "$(uname)" = "Linux" ]] && [[ "$(uname -m)" = "x86_64" ]] ; then
    # v2 seems safe but 4 may be too incompatible with some x86_64 machines still in common use.
    # Refer to:
    # https://gregoryszorc.com/docs/python-build-standalone/main/running.html
    # v2: 64-bit Intel/AMD CPUs approximately newer than Nehalem (released in 2008).
    # v3: 64-bit Intel/AMD CPUs approximately newer than Haswell (released in 2013) and Excavator (released in 2015)
    UV_ARCH="linux-x86_64_v3"
elif [[ "$(uname)" = "Darwin" ]] && [[ "$(uname -m)" = "arm64" ]] ; then
    UV_ARCH="macos-aarch64-none"
else
    echo "Unsupported architecture combination" >&2
    exit 1
fi
# This seems to locate the most recent minor version (e.g. 3.10.16) just by omitting it.
UV_PY_VER="3.10"
UV_PY_VER_FULL="cpython-${UV_PY_VER}-${UV_ARCH}"

# Installing to a different directory is a preview feature
uv python install --default --preview "$UV_PY_VER_FULL"

uv venv
. .venv/bin/activate
export UV_PYTHON_PREFERENCE=only-managed # defining after "uv venv" to avoid lookup issue
uv pip install --no-cache-dir --upgrade pip setuptools # alternative to ensurepip
uv pip install --no-cache-dir -r /python-requirements.txt
uv cache clean

# Clear various caches to minimize the final image size.
dnf clean all
nvm cache clear
