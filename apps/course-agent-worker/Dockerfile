FROM docker.io/cloudflare/sandbox:0.12.7

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir 'duckdb>=1.3,<2'

RUN npm install -g @anthropic-ai/claude-code@2.1.239

COPY sandbox/ /opt/prairielearn/

ENV COMMAND_TIMEOUT_MS=900000
ENV PYTHONPATH=/opt/prairielearn
EXPOSE 3000
