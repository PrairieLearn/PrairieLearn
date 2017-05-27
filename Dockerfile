FROM centos:7

RUN yum -y install \
    epel-release \
    https://download.postgresql.org/pub/repos/yum/9.6/redhat/rhel-7-x86_64/pgdg-centos96-9.6-3.noarch.rpm \
    https://rpm.nodesource.com/pub_7.x/el/7/x86_64/nodesource-release-el7-1.noarch.rpm \
    && yum -y install postgresql96-server postgresql96-contrib nodejs scipy sympy \
    && yum clean all \
    && mkdir /var/postgres && chown postgres:postgres /var/postgres \
    && su postgres -c "/usr/pgsql-9.6/bin/initdb -D /var/postgres && mkdir /var/postgres/pg_log" \
    && mkdir -p /PrairieLearn/public/MathJax \
    && curl -L https://github.com/mathjax/MathJax/archive/2.6.0.tar.gz | tar xz --strip-components=1 -C /PrairieLearn/public/MathJax \
    && cp /PrairieLearn/public/MathJax/package.json /tmp/mathjax-dl-package.json

# NOTE: Modify .dockerignore to whitelist files/directories to copy.
COPY . /PrairieLearn/

RUN diff -q /PrairieLearn/public/MathJax/package.json /tmp/mathjax-dl-package.json >&2 \
    && chmod +x /PrairieLearn/docker/init.sh \
    && mv /PrairieLearn/docker/config.json /PrairieLearn \
    && mkdir /course \
    && cd /PrairieLearn && npm install

CMD /PrairieLearn/docker/init.sh
