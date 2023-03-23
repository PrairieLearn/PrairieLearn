FROM alpine:20230208

COPY install.sh python-requirements.txt /

RUN apk update && apk upgrade && apk add bash && /bin/sh /install.sh

CMD /bin/bash
