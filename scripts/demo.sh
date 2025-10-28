#!/usr/bin/env bash

set -euo pipefail

API_BASE=${API_BASE:-http://127.0.0.1:3000}
EMAIL=${EMAIL:-demo@example.com}
PASSWORD=${PASSWORD:-Passw0rd!234}
DISPLAY_NAME=${DISPLAY_NAME:-"Demo User"}
DESTINATION_ADDRESS=${DESTINATION_ADDRESS:-0x0000000000000000000000000000000000000001}
AMOUNT=${AMOUNT:-1.00}
FLOW_TOP_UP=${FLOW_TOP_UP:-0.1}
USDC_TOP_UP=${USDC_TOP_UP:-5}
SKIP_FUNDING=${SKIP_FUNDING:-0}

log() {
  printf '==> %s\n' "$*" >&2;
}

require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required to run this script. Install it and try again." >&2
    exit 1
  fi
}

generate_idempotency_key() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen
  else
    openssl rand -hex 16
  fi
}

call_json() {
  local method=$1
  local url=$2
  local data=$3
  local extra_headers=("${@:4}")

  curl -sS \
    -X "$method" \
    -H 'Content-Type: application/json' \
    "${extra_headers[@]}" \
    -d "$data" \
    -w '\n%{http_code}' \
    "$url"
}

require_jq

log "Target API base: $API_BASE"

signup_payload=$(jq -n \
  --arg email "$EMAIL" \
  --arg password "$PASSWORD" \
  --arg displayName "$DISPLAY_NAME" \
  '{email: $email, password: $password, passwordConfirmation: $password, displayName: $displayName}')

signup_raw=$(call_json POST "$API_BASE/auth/sign-up" "$signup_payload")
signup_status=$(printf '%s\n' "$signup_raw" | tail -n1)
signup_body=$(printf '%s\n' "$signup_raw" | sed '$d')

if [[ "$signup_status" == "201" ]]; then
  log "Account created for $EMAIL"
  access_token=$(printf '%s\n' "$signup_body" | jq -r '.accessToken')
  refresh_token=$(printf '%s\n' "$signup_body" | jq -r '.refreshToken')
  wallet_address=$(printf '%s\n' "$signup_body" | jq -r '.walletAddress // empty')
elif [[ "$signup_status" == "409" ]]; then
  log "Account already exists, falling back to sign-in"
  signin_payload=$(jq -n \
    --arg email "$EMAIL" \
    --arg password "$PASSWORD" \
    '{email: $email, password: $password}')
  signin_raw=$(call_json POST "$API_BASE/auth/sign-in" "$signin_payload")
  signin_status=$(printf '%s\n' "$signin_raw" | tail -n1)
  signin_body=$(printf '%s\n' "$signin_raw" | sed '$d')

  if [[ "$signin_status" != "200" ]]; then
    echo "Sign-in failed (status $signin_status): $signin_body" >&2
    exit 1
  fi

  access_token=$(printf '%s\n' "$signin_body" | jq -r '.accessToken')
  refresh_token=$(printf '%s\n' "$signin_body" | jq -r '.refreshToken')
  wallet_address=${WALLET_ADDRESS:-}
else
  echo "Sign-up failed (status $signup_status): $signup_body" >&2
  exit 1
fi

if [[ -z "$access_token" || "$access_token" == "null" ]]; then
  echo "Unable to obtain access token." >&2
  exit 1
fi

log "Access token acquired (length: ${#access_token})"

if [[ -z "${wallet_address:-}" ]]; then
  wallet_address=${WALLET_ADDRESS:-}
fi

if [[ -z "${wallet_address:-}" ]]; then
  cat >&2 <<'EOF'
Wallet address was not returned by the API and WALLET_ADDRESS is not set.
Supply WALLET_ADDRESS=<address> when reusing an existing account or delete the user before re-running the script.
EOF
  exit 1
fi

log "Wallet address: $wallet_address"

if [[ "$SKIP_FUNDING" != "1" ]]; then
  if ! command -v bun >/dev/null 2>&1; then
    echo "bun is required to run scripts/fund-wallet.ts. Install Bun or set SKIP_FUNDING=1." >&2
    exit 1
  fi
  if [[ ! -f scripts/fund-wallet.ts ]]; then
    echo "scripts/fund-wallet.ts not found. Ensure the repository is up to date." >&2
    exit 1
  fi

  log "Funding wallet with ${FLOW_TOP_UP} FLOW and ${USDC_TOP_UP} USDC (via faucet)"
  bun run scripts/fund-wallet.ts -- "$wallet_address" "$FLOW_TOP_UP" "$USDC_TOP_UP"
else
  log "Skipping funding step (SKIP_FUNDING=$SKIP_FUNDING)"
fi

idempotency_key=${IDEMPOTENCY_KEY:-$(generate_idempotency_key)}

transfer_payload=$(jq -n \
  --arg amount "$(printf '%.2f' "$AMOUNT")" \
  --arg destination "$DESTINATION_ADDRESS" \
  '{amount: $amount, destinationAddress: $destination}')

transfer_raw=$(call_json POST "$API_BASE/wallet/transfer" "$transfer_payload" \
  -H "Authorization: Bearer $access_token" \
  -H "Idempotency-Key: $idempotency_key")
transfer_status=$(printf '%s\n' "$transfer_raw" | tail -n1)
transfer_body=$(printf '%s\n' "$transfer_raw" | sed '$d')

log "Transfer response (status $transfer_status):"
printf '%s\n' "$transfer_body" | jq .

cat <<EOF

Next steps:
  - Re-run this script with custom credentials via environment variables:
      EMAIL=user@example.com PASSWORD="MyPass123!" ${0}
  - Inspect raw requests in docs/requests.http for manual testing.
EOF
