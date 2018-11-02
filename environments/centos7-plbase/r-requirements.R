#! /usr/bin/env RScript

# R Code Ahead to install packages!

# Set the default number of cores to use for compiling code
# during package installation/updation.
options(Ncpus = 4)

# Have more than 4 cores? Let's dynamical detect physical cores...
# parallel::detectCores(logical = FALSE)

# The following are packages used in STAT 385
pkg_list = c('tidyverse', 'RcppArmadillo', 'rmarkdown',
             'RSQLite', 'nycflights13', 'fueleconomy', 'babynames',
             'rbenchmark', 'microbenchmark', 
             'maps', 'maptools', 'mapproj', 'mapdata', 'ggmap',
             'fivethirtyeight')

# Determine what packages are NOT installed already.
to_install_pkgs = pkg_list[!(pkg_list %in% installed.packages()[,"Package"])]

# Install the missing packages
if(length(to_install_pkgs)) {
  install.packages(to_install_pkgs, repos = "https://cran.rstudio.com")
}

# Check if any updates exist, if so... Install!
update.packages(ask = FALSE)
