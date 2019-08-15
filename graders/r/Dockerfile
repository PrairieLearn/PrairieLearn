# Borrow the leg work done by the rocker project
FROM rocker/tidyverse:3.6.1

# Set a new label for the image
LABEL org.label-schema.license="GPL-2.0" \
      org.label-schema.vcs-url="https://github.com/PrairieLearn/PrairieLearn" \
      org.label-schema.vendor="PrairieLearn" \
      maintainer="James Balamuta <balamut2@illinois.edu>"

# Add a script to install any additional R packages
COPY r-requirements.R /

# Modify the image to meet with PrairieLearn specifications
RUN useradd ag `# Enable autograde user for PrairieLearn` \                        
    && su root -c "Rscript /r-requirements.R" `# Install the additional packages`

# Rejoice! The docker image is built.
