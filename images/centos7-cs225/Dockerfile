FROM prairielearn/centos7-base

RUN    yum -y install epel-release \
	&& yum -y install make \
	&& yum -y install clang \
	&& yum -y install gcc \
	&& yum -y install gcc-c++ \
	&& yum -y install centos-release-scl-rh \
	&& yum -y install devtoolset-3-gcc devtoolset-3-gcc-c++ \
	&& yum -y install valgrind \
	&& yum -y install devtoolset-3-valgrind

ENV PATH=/opt/rh/devtoolset-3/root/usr/bin/:${PATH}
