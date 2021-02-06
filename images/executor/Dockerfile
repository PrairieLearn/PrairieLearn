FROM prairielearn/prairielearn
WORKDIR /PrairieLearn/

# Create our unprivileged user
RUN groupadd executor \
    && useradd -g executor executor \
    # Limit to 2048 open files
    && echo "executor soft nofile 2048" >> /etc/security/limits.conf \
    && echo "executor hard nofile 2048" >> /etc/security/limits.conf

CMD npm run --silent start-executor
