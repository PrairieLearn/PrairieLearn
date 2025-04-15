FROM amazonlinux:2023
ARG CACHEBUST=2025-04-15-14-15-50

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
