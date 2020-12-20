#!/bin/bash

yum update -y

amazon-linux-extras install -y \
    vim \
    docker \
    postgresql11 \
    redis4.0

yum -y install \
    postgresql-server \
    man \
    emacs-nox \
    gcc \
    make \
    openssl \
    dos2unix \
    tmux \
    tar \
    ImageMagick           `# for PrairieDraw label images` \
    texlive               `# for PrairieDraw label images` \
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
python3 -m pip install --no-cache-dir --no-warn-script-location -r /python-requirements.txt

echo "installing R packages..."
chmod +x /r-requirements.R
mkdir -p /usr/share/doc/R-3.4.3/html/
touch /usr/share/doc/R-3.4.3/html/packages.html
touch /usr/share/doc/R-3.4.3/html/R.css
#su root -c "Rscript /r-requirements.R"
