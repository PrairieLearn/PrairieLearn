FROM amazonlinux:2023
ARG CACHEBUST=2025-04-10-12-51-24

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
