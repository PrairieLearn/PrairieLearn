#!/bin/bash
set -ex

dnf update -y

# Notes:
# - `gcc-c++` is needed to build the native bindings in `packages/bind-mount`
# - `libjpeg-devel` is needed by the Pillow package
# - `procps-ng` is needed for the `pkill` executable, which is used by `zygote.py`
# - `texlive` and `texlive-dvipng` are needed for matplotlib LaTeX labels
dnf -y install \
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
    postgresql15 \
    postgresql15-server \
    postgresql15-contrib \
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
nvm install 16
npm install yarn@latest -g
for f in /nvm/current/bin/* ; do ln -s $f /usr/local/bin/`basename $f` ; done

echo "setting up postgres..."
mkdir /var/postgres && chown postgres:postgres /var/postgres
su postgres -c "initdb -D /var/postgres"

echo "setting up conda..."
cd /
arch=`uname -m`
curl -LO https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-${arch}.sh
bash Miniforge3-Linux-${arch}.sh -b -p /usr/local -f

# If R package installation is specifically disabled, we'll avoid installing anything R-related.
if [[ "${SKIP_R_PACKAGES}" != "yes" ]]; then
    echo "installing R..."
    conda install --channel r r-base r-essentials

    echo "installing Python packages..."
    python3 -m pip install --no-cache-dir -r /python-requirements.txt
else
    echo "R package installation is disabled"
    sed '/rpy2/d' /python-requirements.txt > /py_req_no_r.txt # Remove rpy2 package.
    echo "installing Python packages..."
    python3 -m pip install --no-cache-dir -r /py_req_no_r.txt
fi

# Clear various caches to minimize the final image size.
dnf clean all
conda clean --all
nvm cache clear
rm Miniforge3-Linux-${arch}.sh
