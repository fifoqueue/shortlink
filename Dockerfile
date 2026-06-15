# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
WORKDIR /app

FROM base AS deps
ENV NODE_ENV=development
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
RUN corepack enable && yarn install --immutable

FROM deps AS build
COPY . .
RUN yarn build

FROM base AS production-deps
ENV NODE_ENV=production
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
RUN corepack enable \
  && yarn workspaces focus --all --production \
  && yarn cache clean

FROM base AS runtime
ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3000 \
  HOME=/home/shortlink

RUN addgroup -S -g 10001 shortlink \
  && adduser -S -D -h /home/shortlink -u 10001 -G shortlink shortlink \
  && mkdir -p /home/shortlink \
  && chown shortlink:shortlink /home/shortlink

COPY --from=production-deps --chown=shortlink:shortlink /app/node_modules ./node_modules
COPY --from=build --chown=shortlink:shortlink /app/build ./build
COPY --from=build --chown=shortlink:shortlink /app/package.json ./package.json

USER 10001:10001
EXPOSE 3000

CMD ["node", "build/index.js"]
