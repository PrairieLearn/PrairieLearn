FROM centos:7

# Needed to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8

COPY requirements.txt /
RUN yum -y update \
    && yum install -y sudo gcc make \
    && yum install -y https://centos7.iuscommunity.org/ius-release.rpm \
    && yum install -y python36u python36u-devel python36u-pip \
    && yum install -y graphviz graphviz-devel \
    && ln -s /usr/bin/python3.6 /usr/bin/python3 \
    && python3 -m pip install --no-cache-dir -r /requirements.txt

RUN useradd ag
