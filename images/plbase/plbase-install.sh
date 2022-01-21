#!/bin/bash
set -e

yum install -y tmux

yum update -y

amazon-linux-extras install -y \
    vim \
    docker \
    postgresql11 \
    redis4.0

yum -y install \
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
    fontconfig-devel \
    texlive \
    texlive-dvipng \
    git \
    graphviz \
    graphviz-devel

yum clean all

echo "installing node via nvm"
git clone https://github.com/creationix/nvm.git /nvm
cd /nvm
git checkout `git describe --abbrev=0 --tags --match "v[0-9]*" $(git rev-list --tags --max-count=1)`
source /nvm/nvm.sh
export NVM_SYMLINK_CURRENT=true
nvm install 14
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

if [[ "${arch}" != "aarch64" ]]; then # R is not yet supported on ARM64.
    echo "installing R..."
    conda install r-essentials

    echo "installing Python packages..."
    python3 -m pip install --no-cache-dir -r /python-requirements.txt

    if [[ "${SKIP_R_PACKAGES}" != "yes" ]] ; then
        echo "installing R packages..."
        echo "set SKIP_R_PACKAGES=yes to skip this step"
        Rscript /r-requirements.R
    fi
else
    sed '/rpy2/d' /python-requirements.txt > /py_req_no_r.txt # Remove rpy2 package.
    echo "installing Python packages..."
    python3 -m pip install --no-cache-dir -r /py_req_no_r.txt
fi
