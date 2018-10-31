#! /usr/bin/env RScript

# R Code Ahead to install packages!

# The following are packages used in STAT 385
pkg_list = c('tidyverse', 'RcppArmadillo', 'rmarkdown',
             'RSQLite', 'nycflights13', 'fueleconomy', 'babynames',
             'rbenchmark', 'microbenchmark', 
             'maps', 'maptools', 'mapproj', 'mapdata', 'ggmap',
             'fivethirtyeight')

install.packages(pkg_list, repos = "https://cran.rstudio.com")

