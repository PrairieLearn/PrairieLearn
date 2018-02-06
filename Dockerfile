FROM prairielearn/centos7-plbase

# Install Python/NodeJS dependencies before copying code to limit download size
# when code changes.
COPY requirements.txt package.json /PrairieLearn/
RUN python3 -m pip install --no-cache-dir -r /PrairieLearn/requirements.txt \
    && cd /PrairieLearn \
    && npm install \
    && npm --force cache clean

# NOTE: Modify .dockerignore to whitelist files/directories to copy.
COPY . /PrairieLearn/

RUN chmod +x /PrairieLearn/docker/init.sh \
    && mv /PrairieLearn/docker/config.json /PrairieLearn \
    && mkdir /course

# r-requirements.R is copied in the above setup.
# Install a list of R packages to work with
RUN chmod +x /PrairieLearn/r-requirements.R \
    && mkdir -p /usr/share/doc/R-3.4.3/html/ \
    && touch /usr/share/doc/R-3.4.3/html/packages.html \
    && touch /usr/share/doc/R-3.4.3/html/R.css \
    && su root -c "Rscript /PrairieLearn/r-requirements.R"

HEALTHCHECK CMD curl --fail http://localhost:3000/pl/webhooks/ping || exit 1
CMD /PrairieLearn/docker/init.sh
