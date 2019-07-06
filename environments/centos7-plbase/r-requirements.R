#! /usr/bin/env RScript

# R Code Ahead to install packages!

# Dynamical detect physical cores...
Ncpus = parallel::detectCores(logical = FALSE)

# Cap number of cores used in installation to less than 4
if(Ncpus > 4) {
  Ncpus = 4
} else {
  Ncpus = Ncpus
}

# Set the default number of cores to use for compiling code
# during package installation/updation and set the default mirror
options(Ncpus = Ncpus, repos = c("CRAN" = "https://cran.rstudio.com"))


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
  install.packages(to_install_pkgs)
}

# Check if any updates exist, if so... Install!
update.packages(ask = FALSE)
