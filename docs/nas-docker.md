# NAS Docker deployment example

This example applies to Synology Container Manager and to other NAS systems that provide Docker Compose. It uses the published GHCR image, so the NAS does not need Node.js or a local source build. For the full `docker run` and Compose reference, see [docker.md](docker.md).

## Before starting

- Confirm the NAS CPU architecture is supported (`amd64` or `arm64`).
- Identify the existing Docker projects directory; on many Synology systems it is `/volume1/docker`.
- Do not modify unrelated containers, networks, volumes, or reverse-proxy rules.
- Arrange a LAN-reachable Home Assistant URL from the NAS.
- Start with a short, safe entity policy and `READ_ONLY=true`.

## Create the project

Choose a project directory consistent with the NAS conventions:

```bash
mkdir -p /volume1/docker/ha-chatgpt-gateway
cd /volume1/docker/ha-chatgpt-gateway
```

Copy `docker-compose.ghcr.yml` from this repository as `docker-compose.yml`, then create a local `.env` from `.env.example`. The `.env` file stays on the NAS and is never committed.

Example first-run `.env` values:

```env
HOME_ASSISTANT_URL=http://192.168.1.10:8123
HOME_ASSISTANT_TOKEN=replace_with_a_long_lived_token
# Preferred: use separate scoped keys. The GPT receives only the write key.
GATEWAY_READ_API_KEY=replace_with_a_random_read_only_secret
GATEWAY_WRITE_API_KEY=replace_with_a_different_random_write_secret
# Legacy alternative: GATEWAY_API_KEY=replace_with_a_long_random_secret

# Discovery only. Keep this small and read-only.
ALLOWED_DOMAINS=light,switch
ALLOWED_ENTITIES=
READ_ONLY=true

PUBLIC_BASE_URL=https://ha-gateway.example.com
```

Protect the file:

```bash
chmod 600 .env
```

## Start and verify

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 ha-chatgpt-gateway
curl http://localhost:8787/health
```

If the NAS UI manages Compose projects, import the same `docker-compose.yml` and `.env` there instead of creating a second copy of the project.

Use `GET /api/v1/entities` while read-only to choose harmless real IDs, then set a strict list such as:

```env
ALLOWED_ENTITIES=light.desk_lamp,switch.test_plug
```

Restart only this project:

```bash
docker compose up -d
```

After verified reads, change `READ_ONLY=false` only if control is needed. See [reverse-proxy.md](reverse-proxy.md) for public HTTPS and router forwarding.

## Updates

The `.env` file is preserved by ordinary image updates:

```bash
cd /volume1/docker/ha-chatgpt-gateway
docker compose pull
docker compose up -d
docker compose ps
```

Inspect images before pruning. Do not run a broad image prune on a shared NAS unless you have confirmed it cannot remove images needed by other projects.
