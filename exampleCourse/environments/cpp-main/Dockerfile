FROM prairielearn/centos7-base

# create a new user called ag
RUN yum -y install sudo \
        && yum -y install epel-release \
        && yum -y install clang \
        && yum -y install make \
        && useradd ag

# Don't put a CMD here, our base Dockerfile will run our script which will setup the AWS and grading environment, etc
