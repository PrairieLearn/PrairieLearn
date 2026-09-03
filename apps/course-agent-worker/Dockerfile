FROM docker.io/cloudflare/sandbox:0.12.7

RUN apt-get update && apt-get install -y --no-install-recommends python3 python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openai/codex@0.153.0-alpha.5

ENV COMMAND_TIMEOUT_MS=900000
EXPOSE 3000
