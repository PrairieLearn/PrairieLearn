#!/bin/bash

yum -y install \
    epel-release \
    https://download.postgresql.org/pub/repos/yum/reporpms/EL-7-x86_64/pgdg-redhat-repo-latest.noarch.rpm \
    https://repo.ius.io/ius-release-el7.rpm

yum -y update

yum -y install \
    postgresql11-server \
    postgresql11-contrib \
    redis \
    python3 \
    python3-pip \
    python3-devel \
    gcc \
    make \
    openssl \
    dos2unix \
    tmux \
    readline-devel        `# needed for rpy2` \
    libcurl-devel         `# needed for rvest (for R)` \
    openssl-devel         `# needed for rvest (for R)` \
    libxml2-devel         `# needed for xml2 (for R)` \
    libpng-devel          `# needed for png (for R)` \
    libjpeg-turbo-devel   `# needed for jpeg (for R)` \
    R \
    ImageMagick           `# for PrairieDraw label images` \
    texlive               `# for PrairieDraw label images` \
    git224 \
    graphviz \
    graphviz-devel

yum clean all

echo "installing node via nvm"
git clone https://github.com/creationix/nvm.git /nvm
cd /nvm
git checkout `git describe --abbrev=0 --tags --match "v[0-9]*" $(git rev-list --tags --max-count=1)`
source /nvm/nvm.sh
export NVM_SYMLINK_CURRENT=true
nvm install 12
npm install npm@latest -g
for f in /nvm/current/bin/* ; do ln -s $f /usr/local/bin/`basename $f` ; done

echo "setting up postgres..."
mkdir /var/postgres && chown postgres:postgres /var/postgres
su postgres -c "/usr/pgsql-11/bin/initdb -D /var/postgres && mkdir /var/postgres/pg_log"

echo "setting up python3..."
python3 -m pip install --no-cache-dir -r /python-requirements.txt

echo "installing R packages..."
chmod +x /r-requirements.R
mkdir -p /usr/share/doc/R-3.4.3/html/
touch /usr/share/doc/R-3.4.3/html/packages.html
touch /usr/share/doc/R-3.4.3/html/R.css
su root -c "Rscript /r-requirements.R"
