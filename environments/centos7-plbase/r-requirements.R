#! /usr/bin/env RScript

# R Code Ahead to install packages!

# Dynamical detect physical cores...
Ncpus = parallel::detectCores(logical = FALSE)

# Cap number of cores used in installation to be 4 or less
if(Ncpus > 4) {
  Ncpus = 4
} else {
  Ncpus = Ncpus
}

# Set the default number of cores to use for compiling code
# during package installation/updation and set the default mirror
options(Ncpus = Ncpus, repos = c("CRAN" = "https://cran.rstudio.com"))

# Check if any updates exist, if so... Install!
update.packages(ask = FALSE, checkBuilt = TRUE)

# The following are packages used in STAT 385 and STAT 432
pkg_list = c(
  'tidyverse',
  'remotes',
  'RcppArmadillo',
  'rmarkdown',
  'RSQLite',
  'nycflights13',
  'fueleconomy',
  'babynames',
  'rbenchmark',
  'microbenchmark',
  'maps',
  'maptools',
  'mapproj',
  'mapdata',
  'ggmap',
  'fivethirtyeight',
  'caret',
  'e1071',
  'factoextra',
  'gbm',
  'glmnet',
  'ISLR',
  'kernlab',
  'klaR',
  'mlbench',
  'nnet',
  'pROC',
  'randomForest',
  'rpart',
  'rpart.plot',
  'rsample',
  'kableExtra'
)

# Determine what packages are NOT installed already.
to_install_pkgs = pkg_list[!(pkg_list %in% installed.packages()[,"Package"])]

# Install the missing packages
if(length(to_install_pkgs)) {
  install.packages(to_install_pkgs)
}

# List of packages only on GitHub
gh_pkg_list = c('coatless/ucidata')

# Install packages from GitHub
remotes::install_github(gh_pkg_list)
