FROM amazonlinux:2023
ARG CACHEBUST=2025-04-08-23-05-34

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
