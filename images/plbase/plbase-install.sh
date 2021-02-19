#!/bin/bash

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
    openssl \
    dos2unix \
    tar \
    ImageMagick \
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
npm install npm@latest -g
for f in /nvm/current/bin/* ; do ln -s $f /usr/local/bin/`basename $f` ; done

echo "setting up postgres..."
mkdir /var/postgres && chown postgres:postgres /var/postgres
su postgres -c "initdb -D /var/postgres"

echo "setting up conda..."
cd /
curl -LO https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh
bash Miniforge3-Linux-x86_64.sh -b -p /usr/local -f

echo "installing R..."
conda install r-essentials

echo "installing Python packages..."
python3 -m pip install --no-cache-dir -r /python-requirements.txt

echo "installing R packages..."
echo "set SKIP_R_PACKAGS=yes to skip this step"
if [[ "${SKIP_R_PACKAGES}" != "yes" ]] ; then
    Rscript /r-requirements.R
fi
