FROM amazonlinux:2023

# Needed to properly handle UTF-8
ENV PYTHONIOENCODING=UTF-8
ENV LANG=en_US.UTF-8

COPY install.sh post-install.sh requirements.txt /
RUN /bin/bash /install.sh

# Copy the source files last to speed up local dev
COPY python_autograder /python_autograder

# Anything that needs to be run post-install
RUN /bin/bash /post-install.sh

# Add serverFilesCourse to Python path
ENV PYTHONPATH=/grade/serverFilesCourse/
