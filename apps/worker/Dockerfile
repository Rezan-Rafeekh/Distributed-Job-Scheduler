FROM node:20-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install --workspace=@codity/worker --workspace=@codity/db --workspace=@codity/shared --include-workspace-root

COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/worker apps/worker
COPY tsconfig.base.json ./

RUN npm run generate --workspace=@codity/db
RUN npm run build --workspace=@codity/shared
RUN npm run build --workspace=@codity/db
RUN npm run build --workspace=@codity/worker

ENV NODE_ENV=production
CMD ["node", "apps/worker/dist/index.js"]
