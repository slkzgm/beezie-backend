# syntax=docker/dockerfile:1.7

FROM oven/bun:1.1.29 AS builder

WORKDIR /app

COPY bun.lock package.json bunfig.toml tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY typechain ./typechain
COPY artifacts ./artifacts

RUN bun install --frozen-lockfile
RUN bun run build

FROM oven/bun:1.1.29 AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY bunfig.toml package.json bun.lock tsconfig.json drizzle.config.ts ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["bun", "run", "start"]
