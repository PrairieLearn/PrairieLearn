FROM prairielearn/plbase AS builder
WORKDIR /app
COPY package* ./
RUN npm install
COPY ./ ./
RUN npm run build

FROM prairielearn/plbase
WORKDIR /app
COPY --from=builder /app/package* ./
RUN npm install --production
COPY --from=builder /app/dist ./dist/
CMD npm --silent start
