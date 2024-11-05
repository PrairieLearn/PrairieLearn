# Image used for PrairieLearn external grading of R questions
# as well as general support of STAT 477 Data Science Programming Methods
# (which was formerly STAT 430 Topics - Data Science Programming Methods

# Alton Barbehenn and Dirk Eddelbuettel, 2019-2022
# Dirk Eddelbuettel, 2024

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
# r2u is now part of rocker so the image is now also rocker/r2u.

FROM rocker/r2u:24.04

# Needed to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8

# Install required libraries -- using prebuild binaries where available. Because we
# use r2u, the (R package) name can also be mapped to the (Ubuntu) binary provided
# by r2u so instead of, say, 'apt install r-cran-tidyverse' we can now say 'install.r
# tidyverse'. Switching to using the CRAN package names may make it easier to other R
# users to adapt and adjust the package list.  We also install sqlite3 to support the
# SQL lectures. (Adding a duckdb binary may be an option too.)
RUN apt update \
    && apt install -y curl \
	              git \
                      pandoc \
	              sqlite3 \
                      sudo \
    && install.r bench \        
	         data.table \
	         devtools \
                 diffobj \
	         doparallel \
                 duckdb \
	         dygraphs \
                 flexdashboard \
	         foreach \
	         fs \
	         future.apply \
	         gapminder \
	         gh \
	         git2r \
	         igraph \
	         lahman \
                 lintr \
	         memoise \
	         microbenchmark \
	         nycflights13 \
	         palmerpenguins \
	         png \
	         profmem \
	         RcppArmadillo \
	         rex \
	         rsqlite \
	         runit \
	         shiny \
	         stringdist \
	         testthat \
	         tidyverse \
	         tinytest \
                 ttdo \
                 unix \
	         xts \
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
