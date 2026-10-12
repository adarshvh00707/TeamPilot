# Builds either backend service from the monorepo.
#   docker build -f infra/docker/node-service.Dockerfile --build-arg SERVICE=api -t teampilot-api .
#   docker build -f infra/docker/node-service.Dockerfile --build-arg SERVICE=worker -t teampilot-worker .
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/mobile/package.json apps/mobile/

FROM manifests AS build
ARG SERVICE
# The worker bundles API source (repositories/services), so both are always installed and copied.
# Install scripts must run so esbuild fetches its Linux binary (the lockfile is generated on Windows).
RUN npm ci --workspace @teampilot/api --workspace @teampilot/worker --workspace @teampilot/shared
# Rollup's native binary has no install script, so add the Alpine build at the locked version.
RUN v=$(node -p "require('/app/node_modules/rollup/package.json').version") \
 && mkdir /tmp/native && cd /tmp/native && npm init -y >/dev/null \
 && npm install --no-audit --no-fund @rollup/rollup-linux-x64-musl@$v \
 && cp -r node_modules/@rollup/rollup-linux-x64-musl /app/node_modules/@rollup/ \
 && rm -rf /tmp/native
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/worker apps/worker
RUN npm run build --workspace @teampilot/${SERVICE}

FROM manifests AS prod-deps
ARG SERVICE
RUN npm ci --omit=dev --workspace @teampilot/${SERVICE} --ignore-scripts

FROM node:${NODE_VERSION} AS runtime
ARG SERVICE
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/${SERVICE}/dist ./dist
COPY --from=build --chown=node:node /app/apps/${SERVICE}/package.json ./package.json
COPY --chown=node:node infra/certs ./certs
USER node
STOPSIGNAL SIGTERM
CMD ["node", "--enable-source-maps", "dist/index.js"]
