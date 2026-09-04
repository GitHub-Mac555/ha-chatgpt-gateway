FROM node:22-alpine3.22

ARG BUILD_VERSION=0.1.0
ARG BUILD_ARCH

LABEL \
  io.hass.version=$BUILD_VERSION \
  io.hass.type=app \
  io.hass.arch=$BUILD_ARCH \
  org.opencontainers.image.source=https://github.com/aferende/ha-chatgpt-gateway

WORKDIR /app
COPY server.mjs ./server.mjs

USER node
EXPOSE 8099
CMD ["node", "server.mjs"]
