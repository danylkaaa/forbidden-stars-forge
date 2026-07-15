.PHONY: dev-server dev-web build test

dev-server:
	cd server && CARDFORGE_DB=./data/cardforge.db go run .

dev-web:
	cd web && npm run dev

build:
	cd web && npm run build
	rm -rf server/webdist && mkdir -p server/webdist
	cp -R web/dist/. server/webdist/
	cd server && go build -o ../bin/cardforge .

test:
	cd server && go test ./...
	cd web && npx vitest run
