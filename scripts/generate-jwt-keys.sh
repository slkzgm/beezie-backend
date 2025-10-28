#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/generate-jwt-keys.sh [output-directory]

Generates an RSA key pair suitable for JWT RS256 signing and prints escaped
environment variable values you can paste into .env files.

Arguments:
  output-directory  Optional path to write jwt_private.pem and jwt_public.pem.
                    Defaults to ./artifacts/jwt-keys.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

OUT_DIR=${1:-./artifacts/jwt-keys}
mkdir -p "$OUT_DIR"

PRIVATE_KEY_PATH="$OUT_DIR/jwt_private.pem"
PUBLIC_KEY_PATH="$OUT_DIR/jwt_public.pem"

echo "Generating RSA key pair in $OUT_DIR"

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$PRIVATE_KEY_PATH"
openssl rsa -pubout -in "$PRIVATE_KEY_PATH" -out "$PUBLIC_KEY_PATH"

escape_multiline() {
  local file=$1
  awk '{printf "%s\\n", $0}' "$file" | sed 's/\\n$//'
}

PRIVATE_ESCAPED=$(escape_multiline "$PRIVATE_KEY_PATH")
PUBLIC_ESCAPED=$(escape_multiline "$PUBLIC_KEY_PATH")

cat <<EOF

Generated files:
  - $PRIVATE_KEY_PATH
  - $PUBLIC_KEY_PATH

Copy the following into your .env file:

JWT_PRIVATE_KEY="$PRIVATE_ESCAPED"
JWT_PUBLIC_KEY="$PUBLIC_ESCAPED"
EOF
