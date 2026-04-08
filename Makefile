.PHONY: install setup dev dev-backend dev-frontend build clean docker-up docker-down db-generate db-push

install:
	npm install

setup: install db-generate
	@echo "Setup complete. Run 'make docker-up' for PostgreSQL, then 'make db-push'."

dev:
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
