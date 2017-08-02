FROM centos:7

RUN yum -y install \
    epel-release \
    https://download.postgresql.org/pub/repos/yum/9.6/redhat/rhel-7-x86_64/pgdg-centos96-9.6-3.noarch.rpm \
    https://rpm.nodesource.com/pub_7.x/el/7/x86_64/nodesource-release-el7-1.noarch.rpm \
    && yum -y install postgresql96-server postgresql96-contrib nodejs scipy sympy \
    && yum clean all \
    && mkdir /var/postgres && chown postgres:postgres /var/postgres \
    && su postgres -c "/usr/pgsql-9.6/bin/initdb -D /var/postgres && mkdir /var/postgres/pg_log" \
    && yum install -y https://centos7.iuscommunity.org/ius-release.rpm \
    && yum install -y python36u python36u-pip \
    && ln -s /usr/bin/python3.6 /usr/bin/python3 \
    && python3.6 -m pip install numpy scipy matplotlib pandas sympy lxml chevron

# NOTE: Modify .dockerignore to whitelist files/directories to copy.
COPY . /PrairieLearn/

RUN chmod +x /PrairieLearn/docker/init.sh \
    && mv /PrairieLearn/docker/config.json /PrairieLearn \
    && mkdir /course \
    && cd /PrairieLearn && npm install

CMD /PrairieLearn/docker/init.sh
