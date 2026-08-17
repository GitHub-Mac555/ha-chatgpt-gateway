# Deploying the Gateway

The gateway is designed to run as a Docker container. For most production installations, use the published GHCR image rather than building the application locally.

## Recommended production deployment

Create a dedicated project directory:

```bash
mkdir -p ha-chatgpt-gateway
cd ha-chatgpt-gateway
```

Download the production Compose file and environment template:

```bash
curl -fsSLO https://raw.githubusercontent.com/aferende/ha-chatgpt-gateway/main/docker-compose.ghcr.yml
mv docker-compose.ghcr.yml docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/aferende/ha-chatgpt-gateway/main/.env.example
mv .env.example .env
chmod 600 .env
```

Edit `.env` according to the [Configuration Guide](Configuration-Guide), then start the project:

```bash
docker compose pull
docker compose up -d
docker compose ps
```

Check health:

```bash
curl http://localhost:8787/health
```

## Deploying from source

Use a local build primarily for development or when you intentionally need a custom source checkout:

```bash
git clone https://github.com/aferende/ha-chatgpt-gateway.git
cd ha-chatgpt-gateway
cp .env.example .env
# Edit .env
docker compose up -d --build
```

The published image is normally preferable for production because the NAS or server does not need a local Node.js toolchain or source build.

## NAS and Synology

The same GHCR Compose deployment works on Synology Container Manager and other NAS platforms that support Docker Compose.

A common Synology layout is:

```text
/volume1/docker/ha-chatgpt-gateway
```

Do not assume this path exists on every NAS. Use the Docker project location already established on your system.

Do not modify unrelated containers, networks, images, volumes, or reverse-proxy rules during installation.

For Synology-specific guidance, use the repository's [NAS / Synology deployment guide](https://github.com/aferende/ha-chatgpt-gateway/blob/main/docs/nas-docker.md).

## Network architecture

A typical production installation looks like this:

```text
Internet
   |
   | HTTPS :443
   v
Reverse proxy / secure tunnel
   |
   | local HTTP
   v
HA ChatGPT Gateway :8787
   |
   | LAN / private Docker network
   v
Home Assistant :8123
```

The public service is the HTTPS reverse proxy or secure tunnel. The gateway's plain HTTP port `8787` and Home Assistant port `8123` should not be directly exposed to the Internet for this integration.

## Public HTTPS

A ChatGPT GPT Action needs a public HTTPS origin. Configure:

```env
PUBLIC_BASE_URL=https://ha-gateway.example.com
```

The public endpoint should normally use standard HTTPS port `443`.

Supported deployment patterns include:

- Synology Reverse Proxy;
- Nginx or Nginx Proxy Manager;
- Caddy;
- Traefik;
- another trusted TLS ingress;
- a secure outbound tunnel when inbound port forwarding is unavailable or undesirable.

The exact reverse-proxy configuration is documented in [reverse-proxy.md](https://github.com/aferende/ha-chatgpt-gateway/blob/main/docs/reverse-proxy.md).

## Router port forwarding

Router forwarding is required only when your own reverse proxy is the Internet-facing endpoint and the router must accept the inbound HTTPS connection.

If forwarding is required, forward TCP `443` to the reverse proxy. Do not forward Home Assistant `8123` or gateway `8787` directly for this project.

When using CGNAT or an outbound tunnel, a router port-forward rule may not be needed at all.

## Trusted proxies

The gateway ignores forwarded client-IP headers by default.

Only set `TRUSTED_PROXIES` after confirming the actual reverse-proxy peer IP seen by the container. Trust the exact peer or the narrowest verified CIDR.

Never use a universal trust range just to make rate limiting appear to work.

## Verifying externally

Test from outside the home LAN, for example using mobile data:

```bash
curl --fail https://ha-gateway.example.com/health
curl --fail https://ha-gateway.example.com/openapi.json
```

Confirm that:

- TLS is trusted;
- `/health` succeeds;
- `/openapi.json` returns valid JSON;
- the schema advertises the same public HTTPS origin configured in `PUBLIC_BASE_URL`.

Do not use a lock, alarm, gate, garage door, or other high-impact device as an external connectivity test.

## Updating

For a normal Compose installation:

```bash
cd ha-chatgpt-gateway
docker compose pull
docker compose up -d
docker compose ps
```

Your local `.env` remains in place.

Before upgrading, review the project's [Releases](https://github.com/aferende/ha-chatgpt-gateway/releases) and [CHANGELOG](https://github.com/aferende/ha-chatgpt-gateway/blob/main/CHANGELOG.md) for new variables or behavior changes.

Do not run broad Docker prune commands on a shared host unless you have verified that they cannot remove resources required by other projects.

## Next step

After the gateway is running locally, continue with [Connecting Home Assistant](Connecting-Home-Assistant), then [Configuring the ChatGPT Action](Configuring-the-ChatGPT-Action).