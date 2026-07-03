FROM node:20-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install --workspace=@codity/api --workspace=@codity/db --workspace=@codity/shared --include-workspace-root

COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/api apps/api
COPY tsconfig.base.json ./

RUN npm run generate --workspace=@codity/db
RUN npm run build --workspace=@codity/shared
RUN npm run build --workspace=@codity/db
RUN npm run build --workspace=@codity/api

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
