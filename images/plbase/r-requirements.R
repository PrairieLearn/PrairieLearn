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

# List of packages only on GitHub
gh_pkg_list = c('coatless/ucidata')

# Install packages from GitHub
remotes::install_github(gh_pkg_list)
