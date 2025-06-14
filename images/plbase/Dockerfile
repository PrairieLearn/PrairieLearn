FROM amazonlinux:2023
ARG CACHEBUST=2025-05-15-14-16-41

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
