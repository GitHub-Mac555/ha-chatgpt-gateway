# Security

## Trust boundaries

- ChatGPT knows `GATEWAY_API_KEY`.
- HA ChatGPT Gateway knows both `GATEWAY_API_KEY` and `HOME_ASSISTANT_TOKEN`.
- Home Assistant never needs OpenAI credentials.
- `HOME_ASSISTANT_TOKEN` must never be copied into a GPT Action.

## Recommended baseline

- use HTTPS for every public request;
- generate a long random `GATEWAY_API_KEY`;
- start with `READ_ONLY=true`, `ALLOWED_DOMAINS=light,switch`, and an empty allow-list only long enough to discover devices;
- then use `ALLOWED_ENTITIES` for a strict, short entity allow-list before enabling writes;
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

`ALLOWED_DOMAINS` is required. `ALLOWED_ENTITIES` is optional: when empty, all entities in the allowed domains are eligible; when non-empty, it is an exact entity-ID allow-list. Every entity in a multi-entity service call is checked.

Service calls require an explicit `entity_id` or `target.entity_id`. The gateway deliberately rejects global calls and `device_id`, `area_id`, and `label_id` targets. Those target types cannot be proven to stay within an entity allow-list without a broader authorization policy, so refusing them is safer than silently widening access.

An in-memory per-client rate limiter protects authenticated API routes by default. Configure it with `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`, or set `RATE_LIMIT_MAX=0` only when another trusted limiter protects the endpoint. Home Assistant requests have a bounded timeout controlled by `HOME_ASSISTANT_TIMEOUT_MS`.

Fastify request logs contain request IDs, method, route, status, and duration. The application never logs the Home Assistant token, gateway key, or Authorization header; error responses are deliberately generic and do not include upstream response bodies.
