# Beezie Backend

Backend bootstrap for the Beezie assignment built with Bun, Hono, and Drizzle ORM. The codebase is intentionally structured to highlight production-ready practices (typed environment handling, layered architecture, automated linting/formatting, and dedicated configuration for database tooling and TypeChain).

## Tech Stack

- Runtime: [Bun](https://bun.com) (ESM) + TypeScript
- Framework: [Hono](https://hono.dev) with `@hono/zod-validator`
- Schema validation: [Zod](https://zod.dev)
- Database: MySQL via [Drizzle ORM](https://orm.drizzle.team) + `mysql2`
- Auth & crypto: `jose` (JWT), `bcryptjs`, `ethers`
- Tooling: ESLint (flat config), Prettier, Drizzle Kit, TypeChain (ethers-v6 target)

## Getting Started

1. Install dependencies:

   ```bash
   bun install
   ```

2. Copy the environment template and adjust values (un seul fichier `.env` alimente Bun et Docker Compose). Renseignez un hôte (`MYSQL_HOST`, par défaut `127.0.0.1`), le port, et gardez un `DATABASE_URL` pleinement résolu (sans `${VAR}`) :

   ```bash
   cp .env.example .env
   # edit .env to set strong passwords, JWT keys, Flow config, etc.
   ```

3. Launch the development database (MySQL only; API runs locally in hot reload):

   ```bash
 make dev-up
  ```

   Use `make dev-logs` to wait for the “ready for connections” message on first boot.

   Tail logs with `make dev-logs` and stop with `make dev-down`.

4. Run the development server with hot reload:

   ```bash
   bun run dev
   ```

5. Apply migrations from your host (uses the same `.env` values):

   ```bash
   make dev-migrate
   ```

6. Generate database SQL or migrations when the schema evolves:

   ```bash
   bun run drizzle:generate
   ```

   Then re-run `make dev-migrate` to apply the new SQL locally.

7. Produce updated TypeChain typings after compiling Flow/USDC artifacts into `./artifacts`:

   ```bash
   bun run typechain
   ```

### Running everything in Docker (production profile)

When you need the full stack running inside containers:

1. Ensure `.env` is populated (same values as development).
2. Build and start both services:
   ```bash
   make prod-up
   ```
3. Stream combined logs with `make prod-logs` as needed.
4. Stop everything with `make prod-down`.

## Available Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Run the API with Bun's watch mode. |
| `bun run build` | Bundle the server into `dist/` for production. |
| `bun run start` | Execute the compiled build. |
| `bun run typecheck` | Static type analysis using `tsc --noEmit`. |
| `bun run lint` / `bun run lint:fix` | ESLint (flat config) in strict mode. |
| `bun run format` / `bun run format:check` | Prettier formatting helpers. |
| `bun run drizzle:generate` | Generate SQL migrations using Drizzle Kit. |
| `bun run drizzle:migrate` | Apply migrations to the configured database. |
| `bun run typechain` | Generate typed contract factories from Flow/USDC artifacts. |

## Make Targets

| Target | Description |
| --- | --- |
| `make dev-up` | Start the MySQL container only (hot-reload API still runs on the host). |
| `make dev-down` | Stop and remove the development database container. |
| `make dev-reset` | Stop the dev container and drop the bind volume (fresh database). |
| `make dev-logs` | Tail the MySQL logs for local debugging. |
| `make dev-migrate` | Run Drizzle migrations using the host Bun toolchain. |
| `make db-shell` | Open an interactive MySQL shell inside the container. |
| `make prod-up` | Build the image and run API + MySQL inside Docker (production profile). |
| `make prod-down` | Stop the production stack. |
| `make prod-logs` | Stream logs from API and database containers. |
| `make prod-restart` | Rebuild and restart both services (production profile). |

## Project Structure

```
.
├─ src/
│  ├─ app.ts               # Hono instance, middlewares, route registration
│  ├─ index.ts             # Entry point (bootstraps server)
│  ├─ server.ts            # Bun server binding with centralized error handling
│  ├─ config/              # Environment validation and runtime config
│  ├─ controllers/         # Request handlers (auth, wallet)
│  ├─ db/                  # Drizzle schema and MySQL client
│  ├─ lib/                 # Crypto, ethers helpers, etc.
│  ├─ middlewares/         # Cross-cutting middleware (JWT guard)
│  ├─ routes/              # Hono router definitions
│  ├─ schemas/             # Zod request payload schemas
│  ├─ services/            # Business logic placeholders
│  └─ utils/               # Small utilities (e.g. structured logger)
├─ drizzle/                # Generated SQL migrations
├─ drizzle.config.ts       # Drizzle Kit configuration
├─ typechain.config.ts     # Shared TypeChain CLI configuration
├─ bunfig.toml             # Bun alias configuration (`@/` → `src/`)
├─ docker-compose.yml      # Multi-profile Docker stack (dev/prod)
├─ Dockerfile              # Production image for the API
├─ Makefile                # Helper commands for dev/prod flows
└─ .env.example            # Environment template
```

## Implementation Roadmap

- Wire up `authService`, `walletService`, and `tokenService` with Drizzle repositories once schemas are finalized.
- Implement secure key management (derive AES key from `ENCRYPTION_KEY`, envelope-encrypt user wallets).
- Integrate JWT signing/verification using `jose` and expose refresh token endpoints.
- Fetch and compile Flow USDC artifacts, then run `bun run typechain` to generate strongly typed factories for transfers.
- Expand automated tests (unit + integration) as business logic solidifies.

## Quality Gates

- All source code is typed and linted; CI should at minimum run `bun run typecheck` and `bun run lint`.
- Migrations are generated via Drizzle to keep schema changes auditable.
- Environment variables are validated at startup; invalid configuration fails fast with actionable errors.
