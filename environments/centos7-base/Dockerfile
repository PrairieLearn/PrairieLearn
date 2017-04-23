FROM centos:7

# Needed for AWS to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8

# We need python in order to install AWS
RUN yum -y update \
    && yum install -y sudo \
    && yum install -y https://centos7.iuscommunity.org/ius-release.rpm \
    && yum install -y python35u python35u-pip \
    && python3.5 -m pip install awscli requests

RUN useradd ag

RUN mkdir /grade

ADD main.py /

RUN chmod +x /etc/rc.d/rc.local
RUN echo "" >> /etc/rc.d/rc.local && echo 'python3.5 /main.py' >> /etc/rc.d/rc.local

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
#RUN sudo systemctl unmask firewalld
#RUN sudo systemctl enable firewalld
#RUN sudo systemctl start firewalld
#RUN firewall-cmd --permanent --direct --add-rule ipv4 filter OUTPUT 0 -o ! lo -m owner --uid-owner ! 0
#RUN firewall-cmd --permanent --direct --add-rule ipv6 filter OUTPUT 0 -o ! lo -m owner --uid-owner ! 0
#RUN firewall-cmd --reload

#ENTRYPOINT ["python3.5", "main.py"]
CMD ["/usr/sbin/init"]
