FROM amazonlinux:2023

# plbase-install.sh       - script to install everything (also used by production builds)
# python-requirements.txt - list of python packages to be installed by pip
COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD /bin/bash
