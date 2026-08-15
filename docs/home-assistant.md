# Home Assistant setup

Configure `HOME_ASSISTANT_URL` with the HTTP(S) address reachable from the gateway container and `HOME_ASSISTANT_TOKEN` with a Long-Lived Access Token. The gateway uses Home Assistant REST for states and services. It uses Home Assistant’s authenticated WebSocket API internally for area/device/entity registry discovery; it never exposes that WebSocket to the Internet.

Create the token in Home Assistant from your user profile, under **Long-Lived Access Tokens**. Prefer a dedicated, non-administrator user where the Home Assistant setup permits it. The gateway policy is an additional boundary, not a replacement for Home Assistant permissions.

The token belongs only in the gateway host’s `.env` file. It is not an OpenAPI credential, is never returned by an endpoint, and must not be entered into the GPT Action.

Use a gateway-reachable URL. For example, `http://homeassistant.local:8123` may work on a LAN, whereas a container often needs a stable LAN IP or an existing Docker DNS name. Test connectivity with `GET /api/v1/diagnostics` after deployment.

## Energy history and automations

The gateway can read a bounded history for an individual allowed entity and inspect the redacted configuration of an individual allowed automation. For an energy study, include the precise `sensor.*` entities that report power (`W`) and energy (`kWh`), plus the relevant `automation.*` entities, in `ALLOWED_ENTITIES`. Also add `sensor,automation` to `ALLOWED_DOMAINS`.

History requests require a start time and are capped at 31 days. The gateway always requests Home Assistant's minimal, attribute-free history response and samples it to 1,000 points by default (configurable up to 5,000), reporting whether sampling occurred. Automation configuration is read-only and redacts common secret-bearing keys before returning it to ChatGPT.
