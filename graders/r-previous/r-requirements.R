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

# The following are packages used in STAT 432
pkg_list = c('randomForest', 'caret')

# Determine what packages are NOT installed already.
to_install_pkgs = pkg_list[!(pkg_list %in% installed.packages()[,"Package"])]

# Install the missing packages
if(length(to_install_pkgs)) {
    install.packages(to_install_pkgs, quiet = TRUE, verbose = FALSE)
}

# Install pl testing framework package from GitHub
remotes::install_github('illinois-r/pltest')
