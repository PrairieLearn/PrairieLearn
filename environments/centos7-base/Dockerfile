FROM centos:7

# Needed for AWS to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8

ADD main.py /

# We need python in order to install AWS
RUN yum -y update \
    && yum install -y sudo \
    && yum install -y https://centos7.iuscommunity.org/ius-release.rpm \
    && yum install -y python35u python35u-pip \
    && python3.5 -m pip install awscli requests \
    && useradd ag \
    && mkdir /grade \
    && chmod +x /etc/rc.d/rc.local \ 
    && echo "" >> /etc/rc.d/rc.local && echo 'python3.5 /main.py' >> /etc/rc.d/rc.local

# set up  firewalld stuff
RUN yum -y install systemd; yum clean all; \
(cd /lib/systemd/system/sysinit.target.wants/; for i in *; do [ $i == systemd-tmpfiles-setup.service ] || rm -f $i; done); \
rm -f /lib/systemd/system/multi-user.target.wants/*;\
rm -f /etc/systemd/system/*.wants/*;\
rm -f /lib/systemd/system/local-fs.target.wants/*; \
rm -f /lib/systemd/system/sockets.target.wants/*udev*; \
rm -f /lib/systemd/system/sockets.target.wants/*initctl*; \
rm -f /lib/systemd/system/basic.target.wants/*;\
rm -f /lib/systemd/system/anaconda.target.wants/*;
VOLUME [ “/sys/fs/cgroup” ]

# add an IPtable to block all network access from non-root (courses shouldn't be using it in their graders either...)
# drop all outgoing, on non loopback, from non root
#RUN iptables -A OUTPUT -o ! lo -m owner --uid-owner ! 0
RUN yum install -y firewalld
# can't do anything else but this here, need to wait until runtime for init to have run

#ENTRYPOINT ["python3.5", "main.py"]
CMD ["/usr/sbin/init"]
