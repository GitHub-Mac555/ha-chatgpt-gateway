# Getting Started

This guide takes a new installation from zero to one verified, low-risk Home Assistant command.

## Prerequisites

You need:

- a running Home Assistant instance;
- a Docker-capable host such as a NAS, mini PC, Raspberry Pi, Linux server, or VPS;
- a public HTTPS hostname for the gateway if you want to use it from a ChatGPT GPT Action;
- access to create a Home Assistant Long-Lived Access Token;
- a personal/custom GPT with Actions support.

## 1. Create a Home Assistant token

In Home Assistant, create a **Long-Lived Access Token** from the profile of the user the gateway should operate as.

Prefer a dedicated non-administrator Home Assistant user when your setup permits it.

Keep this token only on the gateway host. Never paste it into ChatGPT and never commit it to Git.

See [Connecting Home Assistant](Connecting-Home-Assistant).

## 2. Create the gateway directory

For a production deployment using the published image:

```bash
mkdir -p ha-chatgpt-gateway
cd ha-chatgpt-gateway
curl -fsSLO https://raw.githubusercontent.com/aferende/ha-chatgpt-gateway/main/docker-compose.ghcr.yml
mv docker-compose.ghcr.yml docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/aferende/ha-chatgpt-gateway/main/.env.example
mv .env.example .env
chmod 600 .env
```

## 3. Generate gateway credentials

Generate the read and write credentials independently:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Each configured key must be a different 64-character hexadecimal value.

Use the first for `GATEWAY_READ_API_KEY` and the second for `GATEWAY_WRITE_API_KEY`.

## 4. Configure a safe discovery policy

Edit `.env` and set at least:

```env
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=replace_with_your_token
GATEWAY_READ_API_KEY=replace_with_first_generated_key
GATEWAY_WRITE_API_KEY=replace_with_second_generated_key

ALLOWED_DOMAINS=light,switch
ALLOWED_ENTITIES=
READ_ONLY=true
```

An empty `ALLOWED_ENTITIES` value is acceptable only during this short read-only discovery phase.

## 5. Start the gateway

```bash
docker compose pull
docker compose up -d
docker compose ps
```

Check local health:

```bash
curl http://localhost:8787/health
```

If the container exits, inspect only this project's logs:

```bash
docker compose logs --tail=100 ha-chatgpt-gateway
```

## 6. Verify Home Assistant connectivity

Use the protected diagnostics endpoint with a configured gateway key, then verify that the gateway can reach Home Assistant.

Next, discover entities through `GET /api/v1/entities` and choose only one to three harmless entity IDs.

Good first candidates are a desk lamp or test plug.

## 7. Lock down the entity allow-list

Update `.env`, for example:

```env
ALLOWED_DOMAINS=light,switch
ALLOWED_ENTITIES=light.desk_lamp,switch.test_plug
READ_ONLY=true
```

Restart the project:

```bash
docker compose up -d
```

Verify reads again before enabling writes.

## 8. Configure public HTTPS

A ChatGPT Action must reach the gateway through a trusted public HTTPS origin, normally on port `443`.

Set:

```env
PUBLIC_BASE_URL=https://ha-gateway.example.com
```

Place the gateway behind a reverse proxy or secure outbound tunnel. Do not expose Home Assistant port `8123` or the gateway's plain HTTP port `8787` directly to the Internet.

See [Deploying the Gateway](Deploying-the-Gateway) and the repository's [reverse-proxy guide](https://github.com/aferende/ha-chatgpt-gateway/blob/main/docs/reverse-proxy.md).

## 9. Configure the ChatGPT Action

Import:

```text
https://ha-gateway.example.com/openapi.json
```

into the GPT Action editor and configure Bearer authentication with `GATEWAY_WRITE_API_KEY`.

Never use `HOME_ASSISTANT_TOKEN` as the Action credential.

See [Configuring the ChatGPT Action](Configuring-the-ChatGPT-Action).

## 10. Test read-only behavior

Before enabling writes:

1. check gateway health;
2. list the allowed entities;
3. read one selected entity state;
4. discover its available service contract;
5. confirm that a service call is blocked while `READ_ONLY=true`.

This proves that connectivity, authentication, discovery, and the policy boundary work before the gateway can change anything.

## 11. Enable write access

Only after the exact entity allow-list is correct, set:

```env
READ_ONLY=false
```

Restart the gateway and perform one harmless, observable command such as turning a test lamp on and then off.

Re-read the entity state after each first test.

## 12. Expand gradually

Add devices and domains one at a time. For parameterized devices such as climate entities, let the GPT inspect the entity state and live Home Assistant service contract before calling a service.

Do not broaden the allow-list just to make an error disappear. Use [Troubleshooting](Troubleshooting) to determine whether the problem is connectivity, configuration, policy, or a service contract mismatch.
