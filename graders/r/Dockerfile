# Image used for PrairieLearn external grading of R questions
# as well as general support of STAT 477 Data Science Programming Methods
# (which was formerly STAT 430 Topics - Data Science Programming Methods

# Alton Barbehenn and Dirk Eddelbuettel, 2019-2021

# We base this container on the 'r-ubuntu:20.04' container of the
# Rocker Project. This offers us a well-understood and stable basis
# in the form of an Ubuntu LTS release, along with the a) ability to
# deploy the current R version built on that release, and b) to source
# several thousand CRAN packages as r-cran-* binaries via the PPA
# See https://rocker-project.org for Rocker, and the README at
# https://cran.r-project.org/bin/linux/ubuntu/ about R and the binaries

FROM rocker/r-ubuntu:20.04

# Needed to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8

# Install required libraries -- using prebuild binaries where available
# We also install sqlite3 to support the SQL lectures
RUN apt-get update && apt-get install -y \
        curl \
	git \
	r-cran-data.table \
	r-cran-devtools \
        r-cran-diffobj \
	r-cran-doparallel \
	r-cran-dygraphs \
	r-cran-foreach \
	r-cran-fs \
	r-cran-future.apply \
	r-cran-gh \
	r-cran-git2r \
	r-cran-igraph \
	r-cran-lahman \
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
	r-cran-xts \
	sqlite3 \
        sudo \
        && echo "options(diffobj.brightness=\"dark\")" >> /etc/R/Rprofile.site

# Install additional R packages from CRAN (on top of the ones pre-built as r-cran-*)
RUN install.r bench flexdashboard gapminder lintr ttdo unix

# Install plr (from sibbling PL repo), and visualTest from Mango
RUN installGithub.r PrairieLearn/pl-r-helpers MangoTheCat/visualTest

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
