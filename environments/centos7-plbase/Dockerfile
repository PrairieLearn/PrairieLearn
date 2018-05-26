FROM centos:7

# Needed for AWS to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8

# python-requirements.txt - list of python packages to be installed by pip
# r-requirements.R        - list of R packages that should be installed from the Rstudio CRAN mirror
COPY python-requirements.txt r-requirements.R /

RUN yum -y install \
        epel-release \
        https://download.postgresql.org/pub/repos/yum/10/redhat/rhel-7-x86_64/pgdg-centos10-10-2.noarch.rpm \
        https://centos7.iuscommunity.org/ius-release.rpm \
    && yum -y update \
    && yum -y install \
        postgresql10-server \
        postgresql10-contrib \
        redis \
        python36u \
        python36u-pip \
        python36u-devel \
        gcc \
        make \
        readline-devel        `# needed for rpy2` \
        libcurl-devel         `# needed for rvest (for R)` \
        openssl-devel         `# needed for rvest (for R)` \
        libxml2-devel         `# needed for xml2 (for R)` \
        libpng-devel          `# needed for png (for R)` \
        libjpeg-turbo-devel   `# needed for jpeg (for R)` \
        R \
        ImageMagick           `# for PrairieDraw label images` \
        texlive               `# for PrairieDraw label images` \
        git2u \
    && yum clean all \
    && echo "installing node via nvm" \
        && git clone https://github.com/creationix/nvm.git /nvm \
        && cd /nvm \
        && git checkout `git describe --abbrev=0 --tags --match "v[0-9]*" $(git rev-list --tags --max-count=1)` \
        && source /nvm/nvm.sh \
        && export NVM_SYMLINK_CURRENT=true \
        && nvm install 10 \
        && npm install npm@latest -g \
        && for f in /nvm/current/bin/* ; do ln -s $f /usr/local/bin/`basename $f` ; done \
    && echo "setting up postgres..." \
        && mkdir /var/postgres && chown postgres:postgres /var/postgres \
        && su postgres -c "/usr/pgsql-10/bin/initdb -D /var/postgres && mkdir /var/postgres/pg_log" \
    && echo "setting up python3..." \
        && ln -s /usr/bin/python3.6 /usr/bin/python3 \
        && python3 -m pip install --no-cache-dir -r /python-requirements.txt \
    && echo "installing R packages..." \
        && chmod +x /r-requirements.R `# Install a list of R packages to work with` \
        && mkdir -p /usr/share/doc/R-3.4.3/html/ \
        && touch /usr/share/doc/R-3.4.3/html/packages.html \
        && touch /usr/share/doc/R-3.4.3/html/R.css \
        && su root -c "Rscript /r-requirements.R"

CMD /bin/bash
