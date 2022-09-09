FROM prairielearn/prairielearn
WORKDIR /PrairieLearn/

# We need pkill in this image
RUN yum -y install procps-ng

RUN pip3 install psutil

# Create our unprivileged user
RUN groupadd executor \
    && useradd -g executor executor \
    # Limit to 2048 open files
    && echo "executor soft nofile 2048" >> /etc/security/limits.conf \
    && echo "executor hard nofile 2048" >> /etc/security/limits.conf

# The `prairielearn/prairielearn` base image specifies a healthcheck that won't
# do anything for this image, so we'll just disable it here.
HEALTHCHECK --interval=1s --retries= --start-period=120s CMD curl --fail http://localhost:3000 || exit 1

CMD node executor.js
