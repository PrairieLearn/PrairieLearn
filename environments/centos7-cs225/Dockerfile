FROM prairielearn/centos7-base

RUN 	yum -y install epel-release \
	&& yum -y install clang \
	&& yum -y install make \
	&& printf "[WandiscoSVN]\nname=Wandisco SVN Repo\nbaseurl=http://opensource.wandisco.com/centos/7/svn-1.9/RPMS/x86_64/\nenabled=1\ngpgcheck=0" > /etc/yum.repos.d/wandisco-svn.repo \
	&& yum -y install subversion \
	&& yum -y install subversion-devel \
	&& yum -y install gcc \
	&& yum -y install gcc-c++ \
	&& yum -y install centos-release-scl-rh \
	&& yum -y install devtoolset-3-gcc devtoolset-3-gcc-c++

ENV PATH=/opt/rh/devtoolset-3/root/usr/bin/:${PATH}
