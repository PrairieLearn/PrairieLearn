FROM docker.io/cloudflare/sandbox:0.12.7

RUN npm install -g @openai/codex@0.153.0-alpha.5

COPY bin/validate-course.mjs /usr/local/bin/validate-course
RUN chmod 0555 /usr/local/bin/validate-course

ENV COMMAND_TIMEOUT_MS=900000
EXPOSE 3000
