FROM centos:7

# Needed for AWS to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8

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
    && yum clean all \
    && mkdir /var/postgres && chown postgres:postgres /var/postgres \
    && su postgres -c "/usr/pgsql-9.6/bin/initdb -D /var/postgres && mkdir /var/postgres/pg_log" \
    && ln -s /usr/bin/python3.6 /usr/bin/python3

CMD /bin/bash
