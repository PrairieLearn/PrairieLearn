FROM docker.io/cloudflare/sandbox:0.12.7

RUN apt-get update && apt-get install -y --no-install-recommends python3 python-is-python3 \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openai/codex@0.153.0-alpha.5

COPY scripts/run-codex.mjs /opt/course-agent/scripts/run-codex.mjs
COPY skills/course-content-authoring /opt/course-agent/skills/course-content-authoring

COPY bin/validate-course.mjs /usr/local/bin/validate-course
RUN chmod 0555 /usr/local/bin/validate-course

RUN mkdir -p /opt/prairielearn
COPY sandbox/course_agent_mcp.py /opt/prairielearn/course_agent_mcp.py

ENV COMMAND_TIMEOUT_MS=540000
EXPOSE 3000
