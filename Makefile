.PHONY: install setup dev dev-full dev-backend dev-frontend build clean docker-up docker-down db-generate db-push

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

deploy:
	git pull
	docker compose -f docker-compose.prod.yml up --build -d
