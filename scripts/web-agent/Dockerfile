FROM node:24-bookworm-slim
WORKDIR /opt/lmbox
COPY package.json LICENSE ./
COPY server ./server
COPY agent ./agent
COPY bin ./bin
RUN chmod 755 /opt/lmbox/bin/ai && mkdir -p /data && chown 10001:10001 /data
USER 10001:10001
WORKDIR /data
EXPOSE 3102
CMD ["node", "/opt/lmbox/server/runtime.mjs"]
