FROM centos:7

# Needed for AWS to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8

# r-requirements.R contains a list of R packages
# that should be installed from the Rstudio CRAN mirror
COPY r-requirements.R /

RUN yum -y install \
        epel-release \
        https://download.postgresql.org/pub/repos/yum/9.6/redhat/rhel-7-x86_64/pgdg-centos96-9.6-3.noarch.rpm \
        https://rpm.nodesource.com/pub_8.x/el/7/x86_64/nodesource-release-el7-1.noarch.rpm \
        https://centos7.iuscommunity.org/ius-release.rpm \
    && yum -y update \
    && yum -y install \
        postgresql96-server \
        postgresql96-contrib \
        redis \
        nodejs \
        python36u \
        python36u-pip \
        python36u-devel \
        gcc \
        make \
        readline-devel        `# needed for rpy2` \
        libcurl-devel         `# needed for rvest (for R)` \
        openssl-devel         `# needed for rvest (for R)` \
        libxml2-devel         `# needed for xml2 (for R)` \
        libpng-devel          `# needed for png (for R)` \
        libjpeg-turbo-devel   `# needed for jpeg (for R)` \
        R \
        ImageMagick           `# for PrairieDraw label images` \
        texlive               `# for PrairieDraw label images` \
        git                   `# for coveralls` \
    && yum clean all \
    && mkdir /var/postgres && chown postgres:postgres /var/postgres \
    && su postgres -c "/usr/pgsql-9.6/bin/initdb -D /var/postgres && mkdir /var/postgres/pg_log" \
    && ln -s /usr/bin/python3.6 /usr/bin/python3 \
    && chmod +x /r-requirements.R `# Install a list of R packages to work with` \
    && mkdir -p /usr/share/doc/R-3.4.3/html/ \
    && touch /usr/share/doc/R-3.4.3/html/packages.html \
    && touch /usr/share/doc/R-3.4.3/html/R.css \
    && su root -c "Rscript /r-requirements.R"

CMD /bin/bash
