# Security

## Trust boundaries

- ChatGPT knows only one gateway credential: preferably `GATEWAY_WRITE_API_KEY`, or the backward-compatible `GATEWAY_API_KEY`.
- HA ChatGPT Gateway knows gateway credentials and `HOME_ASSISTANT_TOKEN`.
- Home Assistant never needs OpenAI credentials.
- `HOME_ASSISTANT_TOKEN` must never be copied into a GPT Action.

## Recommended baseline

- use HTTPS for every public request;
- for a new deployment, run `openssl rand -hex 32` separately for `GATEWAY_READ_API_KEY` and `GATEWAY_WRITE_API_KEY`; each key must be a distinct 64-character hexadecimal value representing 32 random bytes (256-bit nominal entropy). Give the GPT only the write key;
- start with `READ_ONLY=true`, `ALLOWED_DOMAINS=light,switch`, and an empty allow-list only long enough to discover devices;
- then use `ALLOWED_ENTITIES` for a strict, short entity allow-list before enabling writes. The gateway refuses to start with `READ_ONLY=false` when this list is empty;
- avoid exposing sensitive domains such as `lock` and `alarm_control_panel` by default;
- keep `.env` out of version control;
- run the container as an unprivileged user;
- do not expose Home Assistant itself merely to make this gateway work.

## Safe rollout sequence

1. Keep `READ_ONLY=true` and expose only `light,switch` for discovery.
2. List entities and select one to three harmless, reversible devices. A lamp or an isolated test plug is a good first choice.
3. Set `ALLOWED_ENTITIES` to those exact entity IDs and restart the container.
4. Test state reads, then one on/off cycle while physically observing the device.
5. Set `READ_ONLY=false` only after those tests pass.
6. Add devices one at a time. Keep an allow-list permanently rather than relying on a broad domain policy.

Avoid initially authorizing the following, even if their entity IDs are in an otherwise common domain:

- door, gate, garage, shutter, or blind controls;
- alarm, lock, camera, presence, and security-related entities;
- climate/heating controls and appliances;
- scripts and scenes, because their internal effects can be broader than their names suggest;
- plugs powering a NAS, router, Home Assistant host, medical device, or other critical equipment.

## Policy details

`ALLOWED_DOMAINS` is required. `ALLOWED_ENTITIES` may be empty only in `READ_ONLY=true` discovery mode. Write-enabled deployments require a non-empty exact entity-ID allow-list. Every entity in a multi-entity service call is checked.

Service calls require an explicit `entity_id` or legacy `target.entity_id`. Before forwarding a write, the gateway resolves group-like entity targets recursively into concrete entity IDs. Every concrete result must stay in the requested domain and pass the entity allow-list; one blocked member, target cycle, malformed group, or excessive expansion rejects the entire call before any service call is sent. The gateway deliberately rejects global calls and `device_id`, `area_id`, and `label_id` targets.

For GPT Actions, parameterized service data is sent as a `data_json` string containing one JSON object. The gateway parses it locally, rejects malformed JSON, target fields hidden in the payload, and Home Assistant template expressions, then applies the normal domain/entity policy before forwarding it to Home Assistant. `POST /api/v1/services/batch` resolves and validates every call in a batch before performing its first write, executes them in order, and stops on an upstream error. It cannot roll back a service that Home Assistant has already completed.

`GATEWAY_READ_API_KEY` has only `read` scope. `GATEWAY_WRITE_API_KEY` has `read` and `write` scopes because the GPT must discover entities and services before acting. `GATEWAY_API_KEY` remains a backward-compatible read/write key; migrate to separate scoped keys to reduce the effect of a leaked read-only credential. Every configured key must use the strict 64-hex-character format and must differ from every other configured key. Service endpoints have a separate in-memory limit controlled by `SERVICE_RATE_LIMIT_MAX` and `SERVICE_RATE_LIMIT_WINDOW_MS`, in addition to the general endpoint rate limit.

An allowed script, scene, or automation can itself produce indirect effects outside the entity targeted by its own service call. The gateway cannot safely infer all of those internal effects at runtime. Treat permission to run one of these entities as permission for its complete Home Assistant behavior, and do not grant them to a write-capable key unless that behavior has been reviewed.

An in-memory per-client rate limiter runs before authentication on every protected API request, including missing, malformed, and invalid Bearer credentials. Configure it with `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`, or set `RATE_LIMIT_MAX=0` only when another trusted limiter protects the endpoint. The separate service-call limiter protects writes with `SERVICE_RATE_LIMIT_MAX` and `SERVICE_RATE_LIMIT_WINDOW_MS`. Home Assistant requests have a bounded timeout controlled by `HOME_ASSISTANT_TIMEOUT_MS`.

Fastify request logs contain request IDs, method, route, status, and duration. The application never logs the Home Assistant token, gateway key, or Authorization header; error responses are deliberately generic and do not include upstream response bodies.
