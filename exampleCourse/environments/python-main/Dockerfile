FROM centos:7

# copy in the autograder
# this is going to be mounted now
#COPY . /autograder
# copy in the bootstrapping script
COPY . /

RUN yum -y install sudo \
    && yum -y install make \
    && useradd ag

# install sudo
# make the script executable
# create a directory that is only accessible to root
# create a new user called ag
RUN yum install -y https://centos7.iuscommunity.org/ius-release.rpm \
    && yum install -y python35u python35u-pip \
    && chmod +x /init.sh

# run the bootstrap script which should run the course grading script which will give us our results
CMD /init.sh
