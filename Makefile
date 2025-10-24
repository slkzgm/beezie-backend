COMPOSE ?= docker compose
DEV_PROFILE := --profile dev
PROD_PROFILE := --profile prod

.PHONY: help dev-up dev-down dev-reset dev-logs dev-migrate db-shell prod-build prod-up prod-down prod-logs prod-restart

help:
	@echo "Available targets:"
	@echo "  make dev-up        # Start MySQL only (dev profile)"
	@echo "  make dev-down      # Stop MySQL (dev profile)"
	@echo "  make dev-reset     # Stop MySQL and drop the dev volume"
	@echo "  make dev-logs      # Tail MySQL logs"
	@echo "  make dev-migrate   # Run Drizzle migrations from host"
	@echo "  make db-shell      # Open a MySQL shell via docker"
	@echo "  make prod-build    # Build production images"
	@echo "  make prod-up       # Launch API + MySQL in Docker"
	@echo "  make prod-down     # Stop API + MySQL"
	@echo "  make prod-logs     # Tail production logs"
	@echo "  make prod-restart  # Rebuild and restart production stack"

dev-up:
	$(COMPOSE) $(DEV_PROFILE) up -d mysql

dev-down:
	$(COMPOSE) $(DEV_PROFILE) down

dev-reset:
	$(COMPOSE) $(DEV_PROFILE) down -v

dev-logs:
	$(COMPOSE) $(DEV_PROFILE) logs -f mysql

dev-migrate:
	bun run drizzle:migrate

db-shell:
	$(COMPOSE) $(DEV_PROFILE) exec mysql mysql -u$$MYSQL_USER -p$$MYSQL_PASSWORD $$MYSQL_DATABASE

prod-build:
	$(COMPOSE) $(PROD_PROFILE) build

prod-up:
	$(COMPOSE) $(PROD_PROFILE) up -d --build

prod-down:
	$(COMPOSE) $(PROD_PROFILE) down

prod-logs:
	$(COMPOSE) $(PROD_PROFILE) logs -f

prod-restart: prod-down prod-up
