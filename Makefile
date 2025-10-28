SHELL := /bin/bash

PROJECT_NAME ?= $(notdir $(CURDIR))

COMPOSE ?= docker compose
DEV_PROFILE := --profile dev
PROD_PROFILE := --profile prod

.PHONY: help dev-up dev-down dev-reset dev-wipe dev-logs dev-migrate db-shell prod-build prod-up prod-down prod-logs prod-restart ensure-env health test verify

help:
	@echo "Available targets:"
	@echo "  make dev-up        # Start MySQL only (dev profile)"
	@echo "  make dev-down      # Stop MySQL (dev profile)"
	@echo "  make dev-reset     # Stop MySQL and drop the dev volume"
	@echo "  make dev-wipe      # Fully reset dev stack (prune volumes, restart MySQL, run migrations)"
	@echo "  make dev-logs      # Tail MySQL logs"
	@echo "  make dev-migrate   # Run Drizzle migrations from host"
	@echo "  make db-shell      # Open a MySQL shell via docker"
	@echo "  make prod-build    # Build production images"
	@echo "  make prod-up       # Launch API + MySQL in Docker"
	@echo "  make prod-down     # Stop API + MySQL"
	@echo "  make prod-logs     # Tail production logs"
	@echo "  make prod-restart  # Rebuild and restart production stack"
	@echo "  make health        # Call the /health endpoint on the running API"
	@echo "  make test          # Run Bun test suite"
	@echo "  make verify        # Run typecheck, lint, format:check, and tests"

ensure-env:
	@test -f .env || (echo "Missing .env file. Copy .env.example to .env before running this target." && exit 1)

dev-up: ensure-env
	$(COMPOSE) $(DEV_PROFILE) up -d mysql

dev-down: ensure-env
	$(COMPOSE) $(DEV_PROFILE) down

dev-reset: ensure-env
	$(COMPOSE) $(DEV_PROFILE) down -v

DEV_VOLUMES := $(PROJECT_NAME)_mysql-data $(PROJECT_NAME)_my-db-dev-volume $(PROJECT_NAME)_my-db-volume

dev-wipe: ensure-env
	@echo "Stopping dev stack and removing Docker volumes..."
	-$(COMPOSE) $(DEV_PROFILE) down -v --remove-orphans
	@for volume in $(DEV_VOLUMES); do \
		if docker volume inspect $$volume >/dev/null 2>&1; then \
			echo "Removing volume $$volume"; \
			docker volume rm $$volume >/dev/null || true; \
		fi; \
	done
	@echo "Starting MySQL with a clean state..."
	$(COMPOSE) $(DEV_PROFILE) up -d mysql
	@echo "Waiting for MySQL to become ready..."
	@set -a; source .env; set +a; \
	until $(COMPOSE) $(DEV_PROFILE) exec -T mysql mysqladmin ping -h localhost -uroot -p$$MYSQL_ROOT_PASSWORD >/dev/null 2>&1; do \
		sleep 1; \
	done
	@echo "Running database migrations..."
	@set -a; source .env; set +a; \
	  attempt=0; \
	  until bun run drizzle:migrate >/tmp/beezie-migrate.log 2>&1; do \
	    attempt=$$((attempt + 1)); \
	    if [ $$attempt -ge 5 ]; then \
	      echo "Migration failed after $$attempt attempts:"; \
	      cat /tmp/beezie-migrate.log; \
	      rm -f /tmp/beezie-migrate.log; \
	      exit 1; \
	    fi; \
	    echo "Migration attempt $$attempt failed; retrying in 2s..."; \
	    sleep 2; \
	  done; \
	  cat /tmp/beezie-migrate.log; \
	  rm -f /tmp/beezie-migrate.log
	@echo "Development environment wiped and re-initialized."

dev-logs: ensure-env
	$(COMPOSE) $(DEV_PROFILE) logs -f mysql

dev-migrate: ensure-env
	bun run drizzle:migrate

db-shell: ensure-env
	$(COMPOSE) $(DEV_PROFILE) exec mysql mysql -u$$MYSQL_USER -p$$MYSQL_PASSWORD $$MYSQL_DATABASE

prod-build:
	$(COMPOSE) $(PROD_PROFILE) build

prod-up: ensure-env
	$(COMPOSE) $(PROD_PROFILE) up -d --build

prod-down: ensure-env
	$(COMPOSE) $(PROD_PROFILE) down

prod-logs: ensure-env
	$(COMPOSE) $(PROD_PROFILE) logs -f

prod-restart: prod-down prod-up

health: ensure-env
	@set -a; source .env; set +a; \
	HOST=$${HOST:-127.0.0.1}; \
	PORT=$${PORT:-3000}; \
	echo "Checking health endpoint at http://$${HOST}:$${PORT}/health"; \
	if curl -fsS "http://$${HOST}:$${PORT}/health" >/tmp/beezie-health.json; then \
	  cat /tmp/beezie-health.json; \
	  rm /tmp/beezie-health.json; \
	else \
	  echo "Health check failed. Ensure the API is running."; \
	  rm -f /tmp/beezie-health.json; \
	  exit 1; \
	fi

test:
	bun run test

verify:
	bun run typecheck
	bun run lint
	bun run format:check
	bun run test
