FROM centos:7

RUN yum -y install https://download.postgresql.org/pub/repos/yum/9.6/redhat/rhel-7-x86_64/pgdg-centos96-9.6-3.noarch.rpm
RUN yum -y install postgresql96-server postgresql96-contrib
RUN mkdir /var/postgres
RUN chown postgres:postgres /var/postgres
USER postgres
RUN /usr/pgsql-9.6/bin/initdb -D /var/postgres
RUN mkdir /var/postgres/pg_log

USER root

RUN yum -y install https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm
RUN yum -y install nodejs

COPY ./assessments /prairielearn/assessments
COPY cron /prairielearn/cron
COPY doc /prairielearn/doc
COPY lib /prairielearn/lib
COPY middlewares /prairielearn/middlewares
COPY models /prairielearn/models
COPY pages /prairielearn/pages
COPY public /prairielearn/public
COPY question-servers /prairielearn/question-servers
COPY schemas /prairielearn/schemas
COPY sprocs /prairielearn/sprocs
COPY sync /prairielearn/sync
COPY tests /prairielearn/tests
COPY tools /prairielearn/tools
COPY package.json /prairielearn
COPY server.js /prairielearn

WORKDIR /prairielearn
RUN npm install

EXPOSE 3000

COPY docker/init.sh /etc/init.sh
RUN chmod +x /etc/init.sh

COPY exampleCourse /course
COPY docker/config.json /prairielearn

CMD /etc/init.sh
