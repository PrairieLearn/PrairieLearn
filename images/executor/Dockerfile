FROM prairielearn/prairielearn:latest
ARG CACHEBUST=2025-11-15-14-13-19

WORKDIR /PrairieLearn/

# Create our unprivileged user
RUN groupadd executor \
    && useradd -g executor executor \
    # Limit to 2048 open files
    && echo "executor soft nofile 2048" >> /etc/security/limits.conf \
    && echo "executor hard nofile 2048" >> /etc/security/limits.conf

# The `prairielearn/prairielearn` base image specifies a healthcheck that won't
# do anything for this image, so we'll just disable it here.
HEALTHCHECK NONE

CMD [ "make", "-s", "start-executor" ]
