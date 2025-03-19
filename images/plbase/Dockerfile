FROM amazonlinux:2023

# plbase-install.sh: script to install all needed packages and dependencies
# pyproject.toml: dependencies for the Python portions of PrairieLearn
COPY scripts/plbase-install.sh pyproject.toml /

RUN /bin/bash /plbase-install.sh

CMD /bin/bash
