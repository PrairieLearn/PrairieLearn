FROM codercom/code-server:4.0.1

USER root
COPY install.sh /
RUN /bin/bash /install.sh

ENV PL_USER coder
COPY pl-gosu-helper.sh /pl-gosu-helper.sh
RUN chmod +x /pl-gosu-helper.sh

USER coder
WORKDIR /home/coder
ENTRYPOINT /pl-gosu-helper.sh /usr/bin/entrypoint.sh --bind-addr 0.0.0.0:8080 --auth none .
