# Troubleshooting

Use this page to identify whether a problem is caused by Docker, Home Assistant connectivity, gateway authentication, policy configuration, public HTTPS, or the ChatGPT Action.

## Container exits immediately

Check:

```bash
docker compose ps
docker compose logs --tail=100 ha-chatgpt-gateway
```

Common causes include:

- a required environment variable is missing;
- a gateway API key is not exactly 64 hexadecimal characters;
- two configured gateway keys are identical;
- `READ_ONLY=false` is configured while `ALLOWED_ENTITIES` is empty;
- an asynchronous or administration feature is enabled without its required allow-list;
- the configured port is already in use.

Compare your local configuration with the current [.env.example](https://github.com/aferende/ha-chatgpt-gateway/blob/main/.env.example).

## `/health` is unreachable locally

Verify that the container is running:

```bash
docker compose ps
```

Then test:

```bash
curl http://localhost:8787/health
```

If it still fails, check the container logs and confirm that another service is not occupying the mapped port.

## Gateway runs but Home Assistant is unavailable

The most common issue is that `HOME_ASSISTANT_URL` works from your browser but is not reachable from the gateway container.

Check:

- DNS resolution from the Docker environment;
- firewall rules;
- Home Assistant LAN address and port;
- Docker network routing;
- whether an mDNS `.local` hostname is resolvable from the container.

A stable LAN IP or Docker DNS name may be more reliable.

Use the gateway diagnostics endpoint to distinguish gateway health from Home Assistant connectivity.

## `401 Unauthorized`

The gateway credential sent by the client is missing or invalid.

Check that the ChatGPT Action uses:

```text
GATEWAY_WRITE_API_KEY
```

or the backward-compatible `GATEWAY_API_KEY`.

Do not use `HOME_ASSISTANT_TOKEN` as the GPT Action credential.

If you regenerated a key, update both `.env` and the Action configuration, then restart the gateway.

## `403 Forbidden`

Authentication succeeded, but the gateway policy rejected the operation.

Check:

```text
READ_ONLY
ALLOWED_DOMAINS
ALLOWED_ENTITIES
```

For administration calls, also check:

```text
ENABLE_ADMIN_ACTIONS
ADMIN_ALLOWED_ACTIONS
```

For asynchronous service dispatch, check:

```text
ENABLE_ASYNC_SERVICE_DISPATCH
ASYNC_SERVICE_DOMAINS
```

Do not respond to a `403` by broadly exposing more entities. Confirm the exact entity and intended service first.

## An entity cannot be found

Check whether:

- the entity exists in Home Assistant;
- its domain is present in `ALLOWED_DOMAINS`;
- the entity is visible during read-only discovery;
- the exact entity ID is in `ALLOWED_ENTITIES` after discovery;
- the entity is currently unavailable in Home Assistant.

Remember that some physical lights are represented as `switch.*` rather than `light.*`.

## A service exists in Home Assistant but the GPT cannot use it

Ask the GPT to retrieve:

```text
GET /api/v1/services
GET /api/v1/services/{domain}/{service}
```

The gateway uses Home Assistant's live service contract. Confirm that:

- the service belongs to an allowed domain;
- the target entity is explicitly allowed;
- the service actually supports an entity target;
- the requested field name and value appear in the live contract.

The gateway deliberately blocks ordinary target-less/global service calls.

## A climate command only changes one setting

Climate integrations often use separate Home Assistant services for mode, temperature, and fan mode.

The GPT should inspect each live service contract and use one ordered batch when the user clearly requested several related settings.

Example sequence:

```text
set_hvac_mode
set_temperature
set_fan_mode
```

Do not invent field names or supported values.

## A batch stops halfway through

Batches execute sequentially and stop on the first Home Assistant error.

They are not transactional. If an earlier call completed successfully, the gateway cannot generically roll it back.

Inspect the failed item and re-read the affected entities before deciding what to do next.

## A long-running automation times out

Home Assistant can keep the service request open until the automation or script finishes.

If the domain has been reviewed for this use case, enable asynchronous dispatch as described in the [Configuration Guide](Configuration-Guide).

A successful asynchronous request returns `202` with a dispatch ID. This means the request was started, not completed.

## A `202` response never appears to finish

Query the service-dispatch status using the returned dispatch ID.

Also check:

- Home Assistant logs;
- the gateway background timeout;
- `HOME_ASSISTANT_ASYNC_SERVICE_TIMEOUT_MS`;
- whether the automation itself is waiting on another condition or long delay.

A gateway-side timeout does not necessarily mean Home Assistant rolled back any work already performed.

## ChatGPT cannot import `/openapi.json`

Check from an external network:

```bash
curl --fail https://ha-gateway.example.com/openapi.json
```

Confirm:

- trusted TLS certificate;
- public reachability;
- standard HTTPS port `443`;
- `PUBLIC_BASE_URL` matches the imported origin;
- `/openapi.json` returns valid JSON.

If URL import in the GPT editor does not respond, open the schema in a browser and paste the complete JSON into the schema editor.

## ChatGPT ignores the Action

Confirm that:

- the Action is saved on the custom GPT you are actually using;
- authentication is configured on that Action;
- the schema imported successfully;
- you are not assuming the Action is automatically available in an unrelated ordinary ChatGPT conversation.

## ChatGPT says a service parameter is unavailable

Re-import the current `/openapi.json` schema if the gateway has been upgraded.

Then have the GPT:

1. read the selected entity state;
2. retrieve the selected service's live contract;
3. use only the returned field names and supported values;
4. put service parameters in the structured `data` object.

Do not put target fields such as `entity_id`, `device_id`, `area_id`, or `label_id` inside `data`.

## Public HTTPS works, but all users appear as the same client IP

This is expected when a reverse proxy is in front of the gateway and `TRUSTED_PROXIES` is empty: the gateway sees the proxy socket peer.

Before changing the setting:

1. make a harmless request through the proxy;
2. inspect the gateway request log;
3. identify the actual proxy peer address seen by the container;
4. configure only that exact IP or the narrowest stable verified CIDR.

Do not trust arbitrary forwarded headers from the Internet.

## Rate-limit responses appear unexpectedly

Check both limiters:

```text
RATE_LIMIT_MAX
RATE_LIMIT_WINDOW_MS
SERVICE_RATE_LIMIT_MAX
SERVICE_RATE_LIMIT_WINDOW_MS
```

Behind a reverse proxy, also verify `TRUSTED_PROXIES` so distinct real clients are not unintentionally grouped into one proxy-IP bucket.

Do not disable the gateway limiters unless another trusted upstream limiter provides equivalent protection.

## An automation works manually but is forbidden through the gateway

Check that the exact `automation.*` entity is allowed and that write mode is enabled.

Also remember that scripts, scenes, and automations can have indirect effects outside the targeted entity. This restriction is intentional; review the automation before granting it write-capable access.

## A maintenance action is rejected

Target-less maintenance calls use a separate opt-in endpoint.

Verify:

```env
ENABLE_ADMIN_ACTIONS=true
ADMIN_ALLOWED_ACTIONS=...
READ_ONLY=false
```

The requested exact `domain.service` must be supported by the gateway and present in `ADMIN_ALLOWED_ACTIONS`.

The gateway does not expose arbitrary global Home Assistant calls.

## After upgrading, previously working behavior changed

Review:

- [Releases](https://github.com/aferende/ha-chatgpt-gateway/releases)
- [CHANGELOG](https://github.com/aferende/ha-chatgpt-gateway/blob/main/CHANGELOG.md)
- [.env.example](https://github.com/aferende/ha-chatgpt-gateway/blob/main/.env.example)

Then:

```bash
docker compose pull
docker compose up -d
docker compose ps
```

If the public API schema changed, re-import `/openapi.json` into the GPT Action.

## Diagnostic order

When the cause is unclear, troubleshoot in this order:

```text
1. Container running?
2. /health works locally?
3. Home Assistant reachable from gateway?
4. Gateway authentication works?
5. Entity/domain policy allows the target?
6. Live Home Assistant service contract supports the request?
7. Public HTTPS works externally?
8. ChatGPT Action imported the current schema and credential?
```

This order avoids changing permissions or network exposure before the simpler layers have been verified.

For deeper technical details, use the repository's [Docker](https://github.com/aferende/ha-chatgpt-gateway/blob/main/docs/docker.md), [reverse proxy](https://github.com/aferende/ha-chatgpt-gateway/blob/main/docs/reverse-proxy.md), [ChatGPT Action](https://github.com/aferende/ha-chatgpt-gateway/blob/main/docs/chatgpt-action.md), and [security](https://github.com/aferende/ha-chatgpt-gateway/blob/main/docs/security.md) guides.
