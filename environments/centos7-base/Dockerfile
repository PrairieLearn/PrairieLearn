FROM centos:7

# Needed to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8

# We need python in order to install AWS
RUN yum -y update \
    && yum install -y sudo \
    && yum install -y https://centos7.iuscommunity.org/ius-release.rpm \
    && yum install -y python36u python36u-pip \
    && ln -s /usr/bin/python3.6 /usr/bin/python3 \
    && python3 -m pip install awscli requests numpy scipy matplotlib pandas sympy

RUN useradd ag
