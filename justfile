set shell := ["bash", "-euo", "pipefail", "-c"]

export BUILD_PROFILE := env_var_or_default("BUILD_PROFILE", "local")

default:
    @just --list --unsorted

[private]
_install:
    @[ -d node_modules ] || pnpm install

# Start a dev session for a browser target: just dev chrome
dev browser="chromium": _install
    BUILD_PROFILE={{ BUILD_PROFILE }} BROWSER={{ browser }} DEBUG_PORT=$(just _port {{ browser }}) pnpm exec wxt -b {{ browser }}

# Build one target: just build chrome
build browser="chromium": _install
    script="build"; \
    case "{{ browser }}" in \
        chrome) script="build:chrome" ;; \
        firefox) script="build:firefox" ;; \
        edge) script="build:edge" ;; \
    esac; \
    BUILD_PROFILE={{ BUILD_PROFILE }} pnpm run "$script"

build-all: (build "chrome") (build "firefox") (build "edge")
    @echo "All browsers built."

clean:
    node ./scripts/clean-output.mjs

# Generate an unsigned Safari Xcode project.
safari-project: _install
    BUILD_PROFILE={{ BUILD_PROFILE }} pnpm safari:project

# Re-render every shipped icon from the vector masters in brand/icon/.
icons:
    bash ./scripts/generate-icons.sh

# Capture the popup, options, and demo page from a real browser running the built extension.
captures: _install
    node ./scripts/capture-shots.mjs

# Compose store screenshots and promo tiles from brand/store/copy.json. Pass id filters: just store-assets marquee
store-assets *filters: _install
    node ./scripts/render-store-assets.mjs {{ filters }}

# Icons, fresh captures, then every store asset.
brand: icons captures store-assets
    @echo "Brand assets rebuilt in brand/icon and brand/store/out."

# Zip one target: just zip chrome
zip browser="chromium": _install
    script="zip"; \
    case "{{ browser }}" in \
        chrome) script="zip:chrome" ;; \
        firefox) script="zip:firefox" ;; \
        edge) script="zip:edge" ;; \
    esac; \
    BUILD_PROFILE={{ BUILD_PROFILE }} pnpm run "$script"

zip-all: (zip "chrome") (zip "firefox") (zip "edge")
    @echo "All ZIPs created."

# Validate one packaged public browser artifact.
validate-release browser:
    node ./scripts/validate-release.mjs {{ browser }}

# Type-check the project.
compile: _install
    pnpm exec wxt prepare && pnpm exec tsc --noEmit

check: _install
    BUILD_PROFILE={{ BUILD_PROFILE }} pnpm compile

# Run the unit test suite once.
test: _install
    pnpm test

# Enforce focused unit coverage thresholds.
test-coverage: _install
    pnpm test:coverage

# Build and smoke-test the public Chromium extension.
test-e2e: _install
    pnpm test:e2e

test-watch: _install
    pnpm test:watch

# Type-check + tests in one shot.
verify: compile test
    @echo "Compile + tests passed."

# Bump version, commit, and tag after full verification.
tag level="patch": verify
    bash ./scripts/tag-release.sh {{ level }}

debug browser="chromium":
    BUILD_PROFILE={{ BUILD_PROFILE }} DEBUG=wxt:* BROWSER={{ browser }} DEBUG_PORT=$(just _port {{ browser }}) pnpm exec wxt -b {{ browser }}

[private]
_port browser:
    #!/usr/bin/env bash
    case "{{ browser }}" in
        chrome)   echo 6201 ;;
        chromium) echo 6202 ;;
        firefox)  echo 6203 ;;
        edge)     echo 6204 ;;
        *)        echo 9220 ;;
    esac
