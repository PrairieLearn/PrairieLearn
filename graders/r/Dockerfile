# Image used for PrairieLearn external grading of R questions
# as well as general support of STAT 477 Data Science Programming Methods
# (which was formerly STAT 430 Topics - Data Science Programming Methods

# Alton Barbehenn and Dirk Eddelbuettel, 2019-2022

# We initially based this container on the 'r-ubuntu:20.04' container of the
# Rocker Project which offers us a well-understood and stable basis
# in the form of an Ubuntu LTS release, along with the a) ability to
# deploy the current R version built on that release, and b) to source
# several thousand CRAN packages as r-cran-* binaries via the PPA
# See https://rocker-project.org for Rocker, and the README at
# https://cran.r-project.org/bin/linux/ubuntu/ about R and the binaries
# As of 2022, we extended this to r2u (see https://eddelbuettel.github.io/r2u/)
# which offers _all_ of CRAN as .deb binaries. Among other things this saves us
# one layer here as all R packages now comes as .deb via apt
# (Note that r2u can use install.r but that require root to get from the user
# process via systemd to apt, and the Docker build step does not allow for
# the required security escalation so we just apt as previously but pointing
# at a richer and larger repository with complete CRAN coverage.)

FROM eddelbuettel/r2u:22.04

# Needed to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8

# Install required libraries -- using prebuild binaries where available
# We also install sqlite3 to support the SQL lectures
# NB Dirk needs the line to /etc/hosts to build this locally as he hosts r2u
#  RUN echo "192.168.1.114 dirk.eddelbuettel.com" >> /etc/hosts && \
RUN apt update && apt install -y \
        curl \
	git \
        pandoc \
        r-cran-bench \        
	r-cran-data.table \
	r-cran-devtools \
        r-cran-diffobj \
	r-cran-doparallel \
	r-cran-dygraphs \
        r-cran-flexdashboard \
	r-cran-foreach \
	r-cran-fs \
	r-cran-future.apply \
	r-cran-gapminder \
	r-cran-gh \
	r-cran-git2r \
	r-cran-igraph \
	r-cran-lahman \
        r-cran-lintr \
	r-cran-memoise \
	r-cran-microbenchmark \
	r-cran-nycflights13 \
	r-cran-palmerpenguins \
	r-cran-png \
	r-cran-profmem \
	r-cran-rcpparmadillo \
	r-cran-rex \
	r-cran-rsqlite \
	r-cran-runit \
	r-cran-shiny \
	r-cran-stringdist \
	r-cran-testthat \
	r-cran-tidyverse \
	r-cran-tinytest \
        r-cran-ttdo \
        r-cran-unix \
	r-cran-xts \
	sqlite3 \
        sudo \
        && echo "options(diffobj.brightness=\"dark\")" >> /etc/R/Rprofile.site

# Install visualTest from Mango
RUN installGithub.r MangoTheCat/visualTest

# Install plr (helper package for grading R code in PrairieLearn)
COPY plr /r_autograder/plr
RUN install2.r --repos=NULL /r_autograder/plr \
	&& rm -r /r_autograder/plr

# Set up user ag
RUN useradd ag \ 
	&& mkdir /home/ag \
	&& chown ag:ag /home/ag \
	&& echo "[user]" > /home/ag/.gitconfig \
	&& echo "	name = Autograding User" >> /home/ag/.gitconfig \
	&& echo "	email = ag@nowhere" >> /home/ag/.gitconfig \
	&& chown ag:ag /home/ag/.gitconfig

# Copy autograder interface script into position
COPY r_autograder /r_autograder
