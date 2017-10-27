FROM centos:7

RUN yum -y install \
        epel-release \
        https://download.postgresql.org/pub/repos/yum/9.6/redhat/rhel-7-x86_64/pgdg-centos96-9.6-3.noarch.rpm \
        https://rpm.nodesource.com/pub_7.x/el/7/x86_64/nodesource-release-el7-1.noarch.rpm \
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
    && npm cache clean

# NOTE: Modify .dockerignore to whitelist files/directories to copy.
COPY . /PrairieLearn/

RUN chmod +x /PrairieLearn/docker/init.sh \
    && mv /PrairieLearn/docker/config.json /PrairieLearn \
    && mkdir /course

HEALTHCHECK CMD curl --fail http://localhost:3000/pl/webhooks/ping || exit 1
CMD /PrairieLearn/docker/init.sh
