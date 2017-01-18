FROM centos:7

RUN yum -y install \
    https://download.postgresql.org/pub/repos/yum/9.6/redhat/rhel-7-x86_64/pgdg-centos96-9.6-3.noarch.rpm\
    https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm \
    && yum -y install postgresql96-server postgresql96-contrib nodejs \
    && mkdir /var/postgres && chown postgres:postgres /var/postgres \
    && su postgres -c "/usr/pgsql-9.6/bin/initdb -D /var/postgres && mkdir /var/postgres/pg_log"

# NOTE: Modify .dockerignore to whitelist files/directories to copy.
COPY . /prairielearn/

RUN mv /prairielearn/docker/init.sh /etc/init.sh && chmod +x /etc/init.sh \
    && mv /prairielearn/docker/config.json /prairielearn \
    && mv /prairielearn/exampleCourse /exampleCourse \
    && mkdir /course \
    && cd /prairielearn && npm install

CMD /etc/init.sh
