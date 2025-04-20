# Borrow the leg work done by the rocker project
# c.f. https://github.com/rocker-org/rocker-versioned/tree/master/tidyverse
FROM rocker/tidyverse:3.6.1

# Set a new label for the image
LABEL org.label-schema.license="GPL-2.0" \
      org.label-schema.vcs-url="https://github.com/PrairieLearn/PrairieLearn" \
      org.label-schema.vendor="PrairieLearn" \
      maintainer="James Joseph Balamuta <balamut2@illinois.edu>"

# Add a script to install any additional R packages from CRAN or GitHub
COPY r-requirements.R /

# Modify the image to meet with PrairieLearn specifications
# Enable autograde user for PrairieLearn and create home directory
RUN adduser --disabled-password --gecos "" ag \                        
    && su root -c "Rscript /r-requirements.R"

# Rejoice! The docker image is built.
