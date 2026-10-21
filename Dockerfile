FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ curl && rm -rf /var/lib/apt/lists/*

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY examples ./examples

RUN pnpm install
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV PROXY_PORT=4000

COPY --from=builder /app /app

EXPOSE 3000
EXPOSE 4000

# Start Proxy Server on 4000 and Flight Deck UI on 3000 concurrently
CMD ["sh", "-c", "node apps/proxy-server/dist/index.js & cd apps/flight-deck && npx next start -p 3000"]
