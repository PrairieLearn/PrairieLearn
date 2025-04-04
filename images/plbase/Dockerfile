FROM amazonlinux:2023
ARG CACHEBUST=1

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD /bin/bash
