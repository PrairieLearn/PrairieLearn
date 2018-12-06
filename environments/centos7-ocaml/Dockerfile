FROM centos:7

ENV PYTHONIOENCODING=UTF-8

RUN yum -y update \
    && yum install -y sudo \
    && yum install -y https://centos7.iuscommunity.org/ius-release.rpm \
    && yum install -y python36u python36u-pip \
    && yum install -y ocaml make \
    && yum install -y m4 \
	&& yum install -y bubblewrap \
	&& yum install -y patch \
	&& echo /usr/local/bin | sh <(curl -sL https://raw.githubusercontent.com/ocaml/opam/master/shell/install.sh) \
	&& (echo y; echo y) | opam init --disable-sandboxing \
	&& eval $(opam env) \
	&& opam switch create 4.07.0 \
	&& echo y | opam install aez \
	&& eval $(opam env)
