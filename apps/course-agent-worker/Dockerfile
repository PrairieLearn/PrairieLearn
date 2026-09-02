FROM docker.io/cloudflare/sandbox:0.12.7

RUN npm install -g @anthropic-ai/claude-code@2.1.239

RUN mkdir -p /opt/prairielearn
COPY sandbox/course_agent_mcp.py /opt/prairielearn/course_agent_mcp.py
COPY sandbox/course-agent.mcp.json /opt/prairielearn/course-agent.mcp.json

ENV COMMAND_TIMEOUT_MS=900000
EXPOSE 3000
