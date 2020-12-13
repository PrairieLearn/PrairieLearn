#!/bin/bash

yum update -y

amazon-linux-extras install -y \
    vim \
    docker \
    postgresql11 \
    redis4.0 \
    R3.4

yum -y install \
    postgresql-server \
    man \
    emacs \
    gcc \
    make \
    openssl \
    dos2unix \
    tmux \
    tar \
    readline-devel        `# needed for rpy2` \
    libcurl-devel         `# needed for rvest (for R)` \
    openssl-devel         `# needed for rvest (for R)` \
    libxml2-devel         `# needed for xml2 (for R)` \
    libpng-devel          `# needed for png (for R)` \
    libjpeg-turbo-devel   `# needed for jpeg (for R)` \
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

echo "setting up python3..."
cd /
curl -LO https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh
bash Miniforge3-Linux-x86_64.sh -b -p /miniforge3
/miniforge3/bin/conda init
source /root/.bashrc
python3 -m pip install --no-cache-dir -r /python-requirements.txt

echo "run .bashrc even for non-interactive shells..."
cat > /root/.bash_profile <<EOF
if [ -f ~/.bashrc ]; then
	. ~/.bashrc
fi
EOF

echo "installing R packages..."
chmod +x /r-requirements.R
mkdir -p /usr/share/doc/R-3.4.3/html/
touch /usr/share/doc/R-3.4.3/html/packages.html
touch /usr/share/doc/R-3.4.3/html/R.css
su root -c "Rscript /r-requirements.R"
