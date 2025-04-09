FROM amazonlinux:2023
ARG CACHEBUST=2025-04-09-12-51-27

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
