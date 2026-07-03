FROM node:20-alpine AS base
WORKDIR /repo
# Prisma's query engine needs OpenSSL; plain node:20-alpine doesn't ship it,
# which fails at runtime with an opaque "Could not parse schema engine
# response" error rather than a clear "openssl not found" message.
RUN apk add --no-cache openssl
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
# Applies any pending migrations before the API starts -- safe to run on every
# deploy since `prisma migrate deploy` is idempotent (a no-op once caught up).
CMD ["sh", "-c", "npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma && node apps/api/dist/server.js"]
