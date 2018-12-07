FROM ocaml/opam2:centos
USER root

ENV PYTHONIOENCODING=UTF-8

RUN yum -y update \
    && yum install -y https://centos7.iuscommunity.org/ius-release.rpm \
    && yum install -y python36u python36u-pip \
    && opam install aez \
    && eval $(opam env)
