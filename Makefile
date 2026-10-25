.PHONY: install setup dev dev-full dev-backend dev-frontend build clean docker-up docker-down db-generate db-push deploy

install:
	npm install

setup: install db-generate
	@echo "Setup complete. Run 'make docker-up' for PostgreSQL, then 'make db-push'."

dev:
	npm run dev

dev-full: install db-generate docker-up
	@echo "Waiting for PostgreSQL..."
	@until docker compose exec db pg_isready -U project_pilot -q 2>/dev/null; do sleep 1; done
	@test -f backend/.env || cp backend/.env.example backend/.env
	@test -f frontend/.env || cp frontend/.env.example frontend/.env
	cd backend && npx prisma db push --skip-generate
	npm run dev

dev-backend:
	npm run dev:backend

dev-frontend:
	npm run dev:frontend

build:
	npm run build

clean:
	rm -rf backend/dist frontend/.next mcp/dist

docker-up:
	docker compose up db -d
	@echo "PostgreSQL running on localhost:5432"

docker-down:
	docker compose down

db-generate:
	cd backend && npx prisma generate

db-push:
	cd backend && npx prisma db push

# Manual fallback for the relay deploy: same steps as `.relay.yml`
# (pull, build/up, `prisma db push` without a data-loss flag, health wait).
# A destructive schema change makes the push fail and the deploy exit non-zero.
HEALTH_TRIES ?= 30
HEALTH_INTERVAL ?= 2

deploy:
	@case "$(HEALTH_TRIES)" in ''|*[!0-9]*|0*) echo "deploy: HEALTH_TRIES must be a positive integer, got '$(HEALTH_TRIES)'" >&2; exit 2;; esac; \
	case "$(HEALTH_INTERVAL)" in ''|*[!0-9]*|0*) echo "deploy: HEALTH_INTERVAL must be a positive integer, got '$(HEALTH_INTERVAL)'" >&2; exit 2;; esac
	git pull
	docker compose -f docker-compose.prod.yml up --build -d
	docker compose -f docker-compose.prod.yml exec -T -e HOME=/tmp backend npx prisma db push --schema=prisma/schema.prisma
	@i=0; \
	until docker compose -f docker-compose.prod.yml exec -T backend wget -q --spider http://localhost:3001/api/health; do \
		i=$$((i+1)); \
		if [ $$i -ge $(HEALTH_TRIES) ]; then \
			echo "deploy failed: /api/health still failing after $(HEALTH_TRIES) attempts, $(HEALTH_INTERVAL)s apart" >&2; exit 1; \
		fi; \
		sleep $(HEALTH_INTERVAL); \
	done; \
	echo "deploy ok: backend healthy"
