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

# Redis 7 isn't available on Amazon Linux 2023. Symlink the versioned
# executables to make them work with scripts that expect unversioned ones.
ln -s /usr/bin/redis6-cli /usr/bin/redis-cli && ln -s /usr/bin/redis6-server /usr/bin/redis-server

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

# TODO: use standard OS Python installation? The only reason we switched to Conda
# was to support R and `rpy2`, but now that we've removed those, we might not
# get any benefit from Conda.
echo "setting up conda..."
cd /
arch="$(uname -m)"
# Pinning the Conda version so the default Python version is 3.10. Later conda versions use 3.12 as the default.
curl -LO https://github.com/conda-forge/miniforge/releases/download/24.3.0-0/Miniforge3-Linux-${arch}.sh
bash Miniforge3-Linux-${arch}.sh -b -p /usr/local -f

echo "installing Python packages..."
python3 -m pip install --no-cache-dir -r /PrairieLearn/requirements.txt

# Clear various caches to minimize the final image size.
dnf clean all
conda clean --all
nvm cache clear
rm Miniforge3-Linux-${arch}.sh
