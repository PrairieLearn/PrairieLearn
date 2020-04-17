FROM centos:7

# Needed for AWS to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8

# install.sh              - script to install everything (also used by production builds)
# python-requirements.txt - list of python packages to be installed by pip
# r-requirements.R        - list of R packages that should be installed from the Rstudio CRAN mirror
COPY install.sh python-requirements.txt r-requirements.R /

RUN chmod +x /install.sh \
    && /install.sh

CMD /bin/bash
