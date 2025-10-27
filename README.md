# Beezie Backend

Backend API built for the Beezie technical exercise. It delivers authentication, encrypted wallet provisioning, and a Flow USDC transfer surface while showcasing production-focused patterns (idempotency, logger correlation, resilient RPC access, encrypted key storage).

## Deliverables at a Glance

| Requirement | Implementation |
| --- | --- |
| API Framework & Validation | Bun + Hono with Zod on every route (`src/routes`, `src/schemas`). |
| Auth Flow | Signup & signin with bcrypt passwords, RS256 JWTs (`kid/iss/aud`), refresh token rotation & reuse detection. |
| Protected Wallet Route | `/wallet/transfer` guarded by bearer tokens, supports idempotency + audit logging, broadcasts Flow USDC via TypeChain factory. |
| Wallet Security | New `ethers` wallet per user; private keys encrypted with AES-256-GCM (`src/lib/crypto.ts`). |
| Persistence | MySQL via Drizzle ORM; repositories layer encapsulates DB access. |
| Tooling | Drizzle migrations, TypeChain typings, ESLint/Prettier, Bun test runner. |

## Running the Project

### Prerequisites

- Bun ≥ 1.0.30
- MySQL 8 (local or via Docker Compose)
- Node-compatible OpenSSL (for crypto)

### Setup

```bash
cp .env.example .env        # fill credentials, keys, Flow config
bun install

# Start the MySQL container (optional but recommended)
make dev-up

# Apply database migrations
make dev-migrate

# Launch the API with hot reload
bun run dev
```

### Quality Gate

```bash
make verify    # typecheck + lint + prettier + bun test
```

### Environment Reference

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Full DSN (`mysql://user:pass@host:3306/db`). |
| `MYSQL_*` | Used by Drizzle CLI / docker-compose (`MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`). |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | PEM-encoded RSA keys for RS256 signing/verification. |
| `JWT_KEY_ID` | Identifier for the active signing key. |
| `JWT_ADDITIONAL_PUBLIC_KEYS` | JSON array of `{ kid, publicKey }` to support legacy verification. |
| `ENCRYPTION_KEY` | ≥32 character secret for AES-GCM wallet encryption. |
| `FLOW_ACCESS_API` | Flow EVM JSON-RPC endpoint (e.g. `https://evm-testnet.flowscan.io/v1/<project-id>`). |
| `FLOW_USDC_CONTRACT_ADDRESS` | Testnet USDC contract (42 hex chars). |

Rotation example:

```env
JWT_ADDITIONAL_PUBLIC_KEYS=[{"kid":"legacy-key","publicKey":"-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----"}]
```

## API Surface

### Auth

| Endpoint | Notes |
| --- | --- |
| `POST /auth/sign-up` | Creates user + encrypted wallet, returns access/refresh tokens with expiry. |
| `POST /auth/sign-in` | Validates credentials and rotates tokens. |
| `POST /auth/refresh` | Exchanges refresh token; detects reuse (`401` with `code="refresh_token_reused"`) and expiry. |

### Wallet

| Endpoint | Notes |
| --- | --- |
| `POST /wallet/transfer` | Protected. Requires bearer token + `Idempotency-Key`. Broadcasts Flow USDC transfer and surfaces pending/cached states via `202` responses. |

All error responses share `{ code, message, requestId }`. `requestId` mirrors the `X-Request-ID` header for log correlation.

## Architecture Notes

- **Layered design**: routes ➜ controllers ➜ services ➜ repositories. `withTransaction` ensures multi-step operations are ACID.
- **Idempotency**: hashed keys stored in `transfer_requests`; mismatched payloads trigger `409 idempotency_conflict`. Cached completions echo the transaction hash and audit log entry.
- **Wallet security**: AES-256-GCM with per-record salt/nonce, scrypt-derived key, and versioned payloads (supports future rotation).
- **JWT hardening**: tokens include `kid`, `iss`, `aud`, and `nbf`. Verification enforces claims and supports additional public keys for rotation.
- **Resilient Flow provider**: wraps `JsonRpcProvider` with timeouts, capped retries, exponential backoff, and structured logging.
- **Observability**: correlation IDs (`X-Request-ID`), consistent error envelopes, CSP/HSTS headers, and dedicated `wallet-audit` namespace.

## Testing

`bun test` covers both units and integrations:

- `tests/unit/token-service.test.ts`: JWT issuance, claim enforcement, multi-key verification.
- `tests/unit/auth-service.refresh.test.ts`: refresh rotation, reuse detection, malformed tokens.
- `tests/unit/wallet-service.test.ts`: idempotent reservations, error mapping, audit logging.
- `tests/integration/auth.routes.test.ts`: route-level auth flows including reuse/expired refresh handling.
- `tests/integration/wallet.routes.test.ts`: transfer replay, conflict, missing idempotency header warnings.
- `tests/integration/security.headers.test.ts`: CSP/HSTS/permissions-policy smoke.

## Database & Migrations

- Schema defined in `src/db/schema.ts` (Drizzle).
- Migrations generated via `bun run drizzle:generate` and committed in `drizzle/`.
- `make dev-migrate` applies migrations using the same `.env` configuration as the application.

## Wallet & Flow Integration

1. On signup, `ethers.Wallet.createRandom()` generates a keypair.
2. Private key is encrypted with `crypto.randomBytes` salt + AES-GCM; ciphertext stored in `wallets` table.
3. `/wallet/transfer` decrypts the key, instantiates a signer, loads the TypeChain USDC factory, validates balance, and submits the transfer.
4. RPC requests run through the resilient provider wrapper (timeouts/retries). Rate limits and 5xx responses map to `429`/`504` envelopes for clients.

## Logging & Idempotency

- `wallet-audit` logger emits `{ userId, amountBaseUnits, destinationAddress, transactionHash, source }` for reconciliation.
- Missing `Idempotency-Key` headers trigger an `X-Idempotency-Warning` response header and log warning.
- Successful transfers return `202` to reflect asynchronous broadcast behaviour.

## Project Layout

```
src/
  app.ts            # Hono setup, middleware (logger, CSP, CORS, correlation IDs)
  controllers/      # Auth & wallet controllers
  services/         # Auth/token/wallet business logic
  db/               # Drizzle schema, repositories, transaction helper
  lib/              # Crypto manager, resilient ethers provider
  schemas/          # Zod schemas per route
  utils/            # Logger, hash utilities, HTTP helpers
drizzle/            # Generated migrations + metadata
tests/              # Bun test suites (unit + integration)
```

## Evaluation Guidance

- Populate `.env` from the template, run `make dev-up`, `make dev-migrate`, then `bun run dev` to exercise the API.
- Tests and linting are automated via `make verify`.
- The README focuses on the interviewer’s perspective; feel free to reach out for clarifications on design trade-offs or follow-up scenarios.
