# API + worker in one container, for single-service hosts (e.g. Render free plan).
#   docker build -f infra/docker/combined.Dockerfile -t teampilot-combined .
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/mobile/package.json apps/mobile/

FROM manifests AS build
# Install scripts must run so esbuild fetches its Linux binary (the lockfile is generated on Windows).
RUN npm ci --workspace @teampilot/api --workspace @teampilot/worker --workspace @teampilot/shared
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/worker apps/worker
RUN npm run build --workspace @teampilot/api && npm run build --workspace @teampilot/worker

FROM manifests AS prod-deps
RUN npm ci --omit=dev --workspace @teampilot/api --workspace @teampilot/worker --ignore-scripts

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./api/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./api/package.json
COPY --from=build --chown=node:node /app/apps/worker/dist ./worker/dist
COPY --from=build --chown=node:node /app/apps/worker/package.json ./worker/package.json
COPY --chown=node:node infra/certs ./certs
COPY --chown=node:node infra/docker/start-all.mjs ./start-all.mjs
USER node
STOPSIGNAL SIGTERM
CMD ["node", "start-all.mjs"]
