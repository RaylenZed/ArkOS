COMPOSE=docker compose -f infra/docker-compose.yml

.PHONY: up down logs ps restart backup restore test check smoke

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=200

ps:
	$(COMPOSE) ps

restart:
	$(COMPOSE) down
	$(COMPOSE) up -d --build

backup:
	./scripts/backup.sh

restore:
	@echo "Usage: make restore BACKUP=./backups/<file>.tar.gz"
	@test -n "$(BACKUP)" && ./scripts/restore.sh "$(BACKUP)" --yes

test:
	cd apps/api && npm test

check:
	cd apps/api && npm run check
	node --check apps/web/app.js
	$(COMPOSE) config >/dev/null

smoke:
	./scripts/smoke-api.sh
