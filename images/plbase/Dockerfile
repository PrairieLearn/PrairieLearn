FROM amazonlinux:2023
ARG CACHEBUST=2025-04-04-17-34-59

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
