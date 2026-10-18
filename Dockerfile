FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
RUN mkdir /app/.data && chown node:node /app/.data
USER node
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/.data
EXPOSE 3000
VOLUME ["/app/.data"]
CMD ["node", "server.mjs"]
