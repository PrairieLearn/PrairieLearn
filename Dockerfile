FROM centos:7


# Notes: The following dependencies are related to R
# readline-devel is a required dependency for rpy2
# libcurl-devel and openssl-devel for rvest
# libxml2-devel for xml2
# libpng-devel for png
# libjpeg-turbo-devel for jpeg

RUN yum -y install \
        epel-release \
        https://download.postgresql.org/pub/repos/yum/9.6/redhat/rhel-7-x86_64/pgdg-centos96-9.6-3.noarch.rpm \
        https://rpm.nodesource.com/pub_8.x/el/7/x86_64/nodesource-release-el7-1.noarch.rpm \
        https://centos7.iuscommunity.org/ius-release.rpm \
    && yum -y update \
    && yum -y install \
        postgresql96-server \
        postgresql96-contrib \
        nodejs \
        python36u \
        python36u-pip \
        python36u-devel \
        gcc \
        make \
        readline-devel \
        libcurl-devel \
        openssl-devel \ 
        libxml2-devel \
        libpng-devel \
        libjpeg-turbo-devel \
        R \
    && yum clean all \
    && mkdir /var/postgres && chown postgres:postgres /var/postgres \
    && su postgres -c "/usr/pgsql-9.6/bin/initdb -D /var/postgres && mkdir /var/postgres/pg_log" \
    && ln -s /usr/bin/python3.6 /usr/bin/python3

# Install Python/NodeJS dependencies before copying code to limit download size
# when code changes.
COPY requirements.txt package.json /PrairieLearn/
RUN python3 -m pip install --no-cache-dir -r /PrairieLearn/requirements.txt \
    && cd /PrairieLearn \
    && npm install \
    && npm --force cache clean

# NOTE: Modify .dockerignore to whitelist files/directories to copy.
COPY . /PrairieLearn/

RUN chmod +x /PrairieLearn/docker/init.sh \
    && mv /PrairieLearn/docker/config.json /PrairieLearn \
    && mkdir /course

# r-requirements.R is copied in the above setup.
# Install a list of R packages to work with
RUN chmod +x /PrairieLearn/r-requirements.R \
    && mkdir -p /usr/share/doc/R-3.4.3/html/ \
    && touch /usr/share/doc/R-3.4.3/html/packages.html \
    && touch /usr/share/doc/R-3.4.3/html/R.css \
    && su root -c "Rscript /PrairieLearn/r-requirements.R"

HEALTHCHECK CMD curl --fail http://localhost:3000/pl/webhooks/ping || exit 1
CMD /PrairieLearn/docker/init.sh
