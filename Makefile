SUPABASE_PROJECT_REF := $(shell grep -m1 PUBLIC_SUPABASE_URL .env 2>/dev/null | sed -E 's#.*https://([^.]+)\.supabase\.co.*#\1#')

.PHONY: up down status logs build preview install db-link db-push migration

install: node_modules

node_modules: package.json
	npm install

up: install
	npx astro dev --background
	@echo "Site: http://localhost:4321/"

down:
	npx astro dev stop

status:
	npx astro dev status

logs:
	npx astro dev logs --follow

build: install
	npm run build

preview: build
	npm run preview

# ---- Banco (migrations) ----
# Rode "npx supabase login" uma vez (abre o navegador) antes de usar os alvos abaixo.

db-link: install
	npx supabase link --project-ref $(SUPABASE_PROJECT_REF)

db-push: install
	npx supabase db push

# Uso: make migration name=nome-da-mudanca
migration: install
	npx supabase migration new $(name)
