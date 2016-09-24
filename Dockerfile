FROM alpine:3.4

ADD https://github.com/just-containers/s6-overlay/releases/download/v1.11.0.1/s6-overlay-amd64.tar.gz /tmp/
COPY v2 /pl
RUN tar xzf /tmp/s6-overlay-amd64.tar.gz -C / && rm -f /tmp/s6-overlay-amd64.tar.gz \
    \
    && apk add --no-cache postgresql nodejs \
    && adduser -D -h /pl pl \
    \
    && cd /pl \
    && npm install \
    && chown -R pl /pl \
    && mv /pl/exampleCourse /course

EXPOSE 3000

COPY docker /

CMD ["/init"]
