FROM amazonlinux:2

# Make sure we are using UTF-8 for python3
ENV LANG=en_US.UTF-8

# plbase-install.sh       - script to install everything (also used by production builds)
# python-requirements.txt - list of python packages to be installed by pip
COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD /bin/bash
