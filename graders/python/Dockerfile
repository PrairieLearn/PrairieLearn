FROM centos:7

# Needed to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8

COPY requirements.txt /
RUN yum -y update \
    && yum install -y sudo gcc make \
    && yum install -y https://centos7.iuscommunity.org/ius-release.rpm \
    && yum install -y python3 python3-devel python3-pip dos2unix \
    && yum install -y graphviz graphviz-devel \
    && python3 -m pip install --no-cache-dir -r /requirements.txt

RUN useradd ag
