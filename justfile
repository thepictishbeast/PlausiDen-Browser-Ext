default: check-all

check-all: lint typecheck build-chrome build-firefox

lint:
    npx eslint src/

typecheck:
    npx tsc --noEmit

build-chrome:
    bash ./scripts/build-chrome.sh

build-firefox:
    bash ./scripts/build-firefox.sh

build-wasm:
    bash ./scripts/build-wasm.sh

dev:
    bash ./scripts/dev.sh

clean:
    rm -rf dist/
