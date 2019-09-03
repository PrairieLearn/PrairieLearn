FROM centos:7

ENV PYTHONIOENCODING=UTF-8

RUN yum -y update \
    && yum install -y sudo \
    && yum install -y https://centos7.iuscommunity.org/ius-release.rpm \
    && yum install -y python36u python36u-pip \
    && yum install -y ocaml make
