FROM prairielearn/centos7-plbase

# Install Python/NodeJS dependencies before copying code to limit download size
# when code changes.
COPY requirements.txt package.json /PrairieLearn/
RUN python3 -m pip install --no-cache-dir -r /PrairieLearn/requirements.txt \
    && cd /PrairieLearn \
    && npm install \
    && npm --force cache clean

# Will move to centos7-plbase once confirmed this works
RUN yum install git -y

# NOTE: Modify .dockerignore to whitelist files/directories to copy.
COPY . /PrairieLearn/

RUN chmod +x /PrairieLearn/docker/init.sh \
    && mv /PrairieLearn/docker/config.json /PrairieLearn \
    && mkdir /course

HEALTHCHECK CMD curl --fail http://localhost:3000/pl/webhooks/ping || exit 1
CMD /PrairieLearn/docker/init.sh
