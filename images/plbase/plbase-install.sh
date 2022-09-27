#!/bin/bash
set -ex

yum update -y

amazon-linux-extras install -y \
    vim \
    docker \
    postgresql11 \
    redis4.0

# Notes:
# - `libjpeg-devel` is needed by the Pillow package
# - `gcc-c++` is needed to build the native bindings in `packages/bind-mount`
# `texlive` and `texlive-dvipng` are needed for matplotlib LaTeX labels
yum -y install \
    tmux \
    postgresql-server \
    postgresql-contrib \
    man \
    emacs-nox \
    gcc \
    make \
    lsof \
    openssl \
    dos2unix \
    tar \
    ImageMagick \
    texlive \
    texlive-dvipng \
    git \
    graphviz \
    graphviz-devel \
    libjpeg-devel \
    gcc-c++

yum clean all

echo "installing node via nvm"
git clone https://github.com/creationix/nvm.git /nvm
cd /nvm
git checkout `git describe --abbrev=0 --tags --match "v[0-9]*" $(git rev-list --tags --max-count=1)`
source /nvm/nvm.sh
export NVM_SYMLINK_CURRENT=true
nvm install 16
# PrairieLearn doesn't currently use `npm` itself, but we can't be sure that
# someone else isn't using our base image and relying on `npm`, so we'll
# continue to install it to avoid breaking things.
npm install npm@latest -g
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
    conda install --channel r r-essentials

    echo "installing Python packages..."
    python3 -m pip install --no-cache-dir -r /python-requirements.txt
else
    echo "R package installation is disabled"
    sed '/rpy2/d' /python-requirements.txt > /py_req_no_r.txt # Remove rpy2 package.
    echo "installing Python packages..."
    python3 -m pip install --no-cache-dir -r /py_req_no_r.txt
fi

conda clean --all
rm Miniforge3-Linux-${arch}.sh
