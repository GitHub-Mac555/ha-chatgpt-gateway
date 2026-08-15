# HA ChatGPT Gateway

Self-hosted Docker gateway that lets a personal ChatGPT GPT Action securely access and control a Home Assistant instance through a small, policy-enforced REST API.

The gateway is designed to run on a NAS, mini PC, Raspberry Pi, VPS, or any Docker host. It does **not** use the OpenAI API and does **not** require an OpenAI API key.

## Architecture

```text
ChatGPT GPT Action
        |
        | HTTPS + Gateway API key
        v
HA ChatGPT Gateway
        |
        | Home Assistant Long-Lived Access Token
        v
Home Assistant REST API
```

## Features

- Node.js 22 + TypeScript + Fastify
- Zod validation
- OpenAPI 3.1 schema suitable for GPT Actions
- Home Assistant state and service discovery
- Area and device discovery scoped to allowed entities
- Generic Home Assistant service calls
- Domain and entity allow-lists
- Optional read-only mode
- Separate gateway and Home Assistant credentials
- Docker / Docker Compose deployment
- Multi-stage, non-root container
- GitHub Actions for CI and GHCR publishing
- Vitest, ESLint, and Prettier

## Quick start

```bash
git clone https://github.com/aferende/ha-chatgpt-gateway.git
cd ha-chatgpt-gateway
cp .env.example .env
```

Edit `.env` and set at least:

```env
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=your_home_assistant_long_lived_token
GATEWAY_API_KEY=use_a_long_random_secret
READ_ONLY=true
```

Start with a local build:

```bash
docker compose up -d --build
```

Or, when the GHCR image is available:

```bash
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

Check the service:

```bash
curl http://localhost:8787/health
```

## Configuration

All runtime configuration is provided through environment variables.

| Variable                    | Default                           | Description                                                                                 |
| --------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| `PORT`                      | `8787`                            | HTTP port used inside the container                                                         |
| `HOME_ASSISTANT_URL`        | `http://homeassistant.local:8123` | Home Assistant base URL                                                                     |
| `HOME_ASSISTANT_TOKEN`      | required                          | Home Assistant Long-Lived Access Token                                                      |
| `GATEWAY_API_KEY`           | required                          | Secret used by the GPT Action to authenticate to the gateway                                |
| `ALLOWED_DOMAINS`           | required                          | Comma-separated Home Assistant domains exposed by the gateway                               |
| `ALLOWED_ENTITIES`          | empty                             | Optional comma-separated entity allow-list. Empty means every entity in the allowed domains |
| `READ_ONLY`                 | `false`                           | When `true`, blocks service calls while keeping read operations available                   |
| `LOG_LEVEL`                 | `info`                            | Fastify/Pino log level                                                                      |
| `HOME_ASSISTANT_TIMEOUT_MS` | `10000`                           | Timeout for each REST or internal WebSocket request to Home Assistant                       |
| `RATE_LIMIT_MAX`            | `120`                             | Requests per source IP in the rate-limit window; `0` disables the in-memory limiter         |
| `RATE_LIMIT_WINDOW_MS`      | `60000`                           | Rate-limit window in milliseconds                                                           |

See `.env.example` for the complete template.

## Public API

The initial API surface is intentionally smaller than Home Assistant's API. The gateway is **not** a transparent reverse proxy.

```text
GET  /health
GET  /openapi.json

GET  /api/v1/config
GET  /api/v1/diagnostics
GET  /api/v1/services
GET  /api/v1/areas
GET  /api/v1/devices

GET  /api/v1/entities
GET  /api/v1/entities/{entityId}
GET  /api/v1/entities/{entityId}/state

POST /api/v1/services/call
```

All `/api/v1/*` endpoints require:

```http
Authorization: Bearer <GATEWAY_API_KEY>
```

`/health` and `/openapi.json` are public so that infrastructure health checks and GPT Action schema import work without exposing Home Assistant credentials.

## Calling Home Assistant services

With `READ_ONLY=false`, the gateway can invoke services belonging to allowed domains.

Example:

```http
POST /api/v1/services/call
Authorization: Bearer <GATEWAY_API_KEY>
Content-Type: application/json
```

```json
{
  "domain": "light",
  "service": "turn_on",
  "entity_id": "light.living_room",
  "data": {
    "brightness_pct": 50
  }
}
```

Multiple entities are also supported:

```json
{
  "domain": "light",
  "service": "turn_off",
  "entity_id": ["light.living_room", "light.kitchen"]
}
```

Every target entity must pass the configured policy. Domain-wide service calls without an explicit `entity_id` are deliberately rejected.

The equivalent structured form is also accepted:

```json
{
  "domain": "light",
  "service": "turn_on",
  "target": { "entity_id": ["light.living_room", "light.kitchen"] },
  "data": { "brightness_pct": 50 }
}
```

`device_id`, `area_id`, `label_id`, and target-less/global calls are deliberately refused in v0.2.0. An entity allow-list cannot safely prove the scope of those targets, so callers must first use entity, area, and device discovery and then send the explicit allowed entity IDs.

The service name itself is not hard-coded: the gateway forwards an authorized service call to Home Assistant. `/api/v1/services` can be used to discover the services currently exposed by the configured Home Assistant instance, filtered to allowed domains.

## Read-only mode

For an initial deployment, start with:

```env
READ_ONLY=true
```

Verify authentication, entity visibility, and Home Assistant connectivity. Then enable write operations with:

```env
READ_ONLY=false
```

`READ_ONLY` is an application policy. It is unrelated to Docker Compose's `read_only: true`, which makes the **container filesystem** read-only as a hardening measure.

## Home Assistant token

Create a Home Assistant Long-Lived Access Token for the user the gateway should operate as.

The token is stored only in the gateway's environment and is sent only to Home Assistant. It must never be placed in the GPT Action configuration or committed to Git.

See [docs/home-assistant.md](docs/home-assistant.md).

## GPT Action

After deploying the gateway behind public HTTPS, import:

```text
https://your-gateway.example.com/openapi.json
```

into the GPT Action configuration.

Configure API-key authentication using the same value as `GATEWAY_API_KEY` and send it as a Bearer token.

See [docs/chatgpt-action.md](docs/chatgpt-action.md).

## HTTPS

Do not expose port `8787` directly to the Internet unless you intentionally terminate TLS elsewhere.

Place the gateway behind an HTTPS reverse proxy such as Caddy, Nginx, Nginx Proxy Manager, Traefik, a NAS reverse proxy, or an equivalent TLS ingress.

See [docs/reverse-proxy.md](docs/reverse-proxy.md).

## Docker images

The repository contains a GitHub Actions workflow intended to publish multi-architecture images to:

```text
ghcr.io/aferende/ha-chatgpt-gateway
```

for:

```text
linux/amd64
linux/arm64
```

This makes deployment possible without installing Node.js or compiling TypeScript on the target NAS.

## Development

Requirements:

- Node.js 22
- npm

Install dependencies:

```bash
npm install
```

Run the checks:

```bash
npm run format:check
npm run lint
npm run test
npm run build
```

Run locally:

```bash
npm run dev
```

## Security model

The gateway deliberately exposes less functionality than Home Assistant itself.

Important properties include:

- Home Assistant token is never exposed to ChatGPT
- separate gateway API key
- timing-safe API-key comparison
- domain allow-list
- optional entity allow-list
- explicit target entity required for state-changing service calls
- read-only mode
- no generic `/api/*` proxy
- non-root container
- read-only container filesystem
- secrets omitted from diagnostics and logs

See [docs/security.md](docs/security.md).

## Project status

`v0.2.0` is a complete, policy-enforced operational baseline. The public interface remains HTTPS/REST only; Home Assistant’s WebSocket API is used internally and only for filtered area/device registry discovery.

## License

MIT. See [LICENSE](LICENSE).
