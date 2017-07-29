FROM centos:7

# Needed for AWS to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8

# We need python in order to install AWS
RUN yum -y update \
    && yum install -y sudo \
    && yum install -y https://centos7.iuscommunity.org/ius-release.rpm \
    && yum install -y python35u python35u-pip \
    && python3.5 -m pip install awscli requests \
    && yum install -y ocaml make

RUN useradd ag

RUN mkdir /grade

ADD main.py /

ENTRYPOINT ["python3.5", "main.py"]
