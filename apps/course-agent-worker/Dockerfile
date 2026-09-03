FROM docker.io/cloudflare/sandbox:0.12.7

RUN npm install -g @openai/codex@0.153.0-alpha.5

COPY bin/validate-course.mjs /usr/local/bin/validate-course
RUN chmod 0555 /usr/local/bin/validate-course

RUN mkdir -p /opt/prairielearn
COPY sandbox/course_agent_mcp.py /opt/prairielearn/course_agent_mcp.py
COPY sandbox/course-agent.mcp.json /opt/prairielearn/course-agent.mcp.json

ENV COMMAND_TIMEOUT_MS=900000
EXPOSE 3000
