FROM centos:7

# Needed for AWS to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8

# We need python in order to install AWS
RUN yum -y update \
    && yum install -y https://centos7.iuscommunity.org/ius-release.rpm \
    && yum install -y python35u python35u-pip \
    && pip3.5 install awscli

RUN mkdir /grade

ADD main.sh /

RUN chmod +x /main.sh

CMD sh /main.sh
