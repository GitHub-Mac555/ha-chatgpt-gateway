# Connecting Home Assistant

The gateway connects to Home Assistant using a Long-Lived Access Token and a Home Assistant URL reachable from the gateway container.

## Create a dedicated token

In Home Assistant, open the profile of the user the gateway should operate as and create a **Long-Lived Access Token**.

When possible, prefer a dedicated non-administrator Home Assistant user. The gateway's own allow-list is an additional policy boundary, not a replacement for Home Assistant permissions.

Store the token only in the gateway host's `.env` file:

```env
HOME_ASSISTANT_TOKEN=replace_with_your_long_lived_token
```

Never:

- paste this token into the ChatGPT GPT Action;
- expose it through a public endpoint;
- commit it to Git;
- reuse it as a gateway API key.

## Choose a reachable Home Assistant URL

Configure:

```env
HOME_ASSISTANT_URL=http://homeassistant.local:8123
```

The hostname must resolve **from the gateway container or Docker host**, not only from your desktop browser.

Depending on the environment, a stable LAN IP or Docker DNS name may be more reliable than an mDNS hostname.

Examples:

```env
HOME_ASSISTANT_URL=http://192.168.1.10:8123
```

or, when both services share a suitable Docker network:

```env
HOME_ASSISTANT_URL=http://homeassistant:8123
```

Do not expose Home Assistant to the Internet just to support this gateway.

## Start in read-only discovery mode

A safe first configuration is:

```env
ALLOWED_DOMAINS=light,switch
ALLOWED_ENTITIES=
READ_ONLY=true
```

This lets you discover harmless entities without allowing the gateway to change state.

Use the gateway to list entities and select one to three exact IDs, for example:

```text
light.desk_lamp
switch.test_plug
```

Then lock the policy down:

```env
ALLOWED_ENTITIES=light.desk_lamp,switch.test_plug
```

Restart the gateway and verify reads again before setting `READ_ONLY=false`.

## Domains and entities

`ALLOWED_DOMAINS` defines which Home Assistant domains are exposed through the gateway.

`ALLOWED_ENTITIES` is the exact entity allow-list used by the gateway policy.

For example:

```env
ALLOWED_DOMAINS=light,switch,sensor,climate,automation
ALLOWED_ENTITIES=light.desk_lamp,switch.test_plug,sensor.nas_temperature,climate.bedroom,automation.good_night
```

Do not add an entire domain merely because one device is not working. Confirm the exact entity and service first.

## Service discovery

Home Assistant remains the source of truth for services and service fields.

The gateway provides:

```text
GET /api/v1/services
GET /api/v1/services/{domain}/{service}
```

The second endpoint returns the live contract for one service, including available fields, examples, selectors, and response capability when Home Assistant publishes them.

For parameterized commands, the GPT should read the entity state and service contract before calling the service.

This is especially important for:

- climate modes and temperatures;
- fan modes;
- light brightness and color;
- cover positions;
- media-player parameters;
- integration-specific service fields.

## Areas and devices

The gateway can use Home Assistant's authenticated WebSocket API internally to discover area, device, and entity registry information.

That WebSocket connection remains between the gateway and Home Assistant. It is not exposed publicly to ChatGPT.

Areas and devices are useful for discovery, but ordinary state-changing service calls still require explicit allowed entity IDs. The gateway does not turn an area name into unrestricted area-wide control.

## Energy analysis

To let ChatGPT analyze real Home Assistant energy data, allow only the relevant sensor entities.

Typical examples include:

```text
sensor.appliance_power
sensor.appliance_energy
```

Add the `sensor` domain and those exact IDs to the policy.

The history endpoint is bounded and intentionally avoids becoming a generic unrestricted Home Assistant history proxy.

## Automation inspection

To inspect an automation, allow the specific `automation.*` entity and add the `automation` domain.

The gateway exposes selected automation configuration read-only and redacts values whose keys look like tokens, passwords, API keys, Authorization data, secrets, or webhooks.

Remember that **running** an automation is different from inspecting it. An allowed automation may have broad indirect effects inside Home Assistant, so review its behavior before granting write access to it.

## Long-running automations

Home Assistant service calls for automations or scripts can remain open until execution finishes. If this causes timeouts, the gateway can optionally use asynchronous dispatch for explicitly reviewed domains.

See the [Configuration Guide](Configuration-Guide) before enabling this feature.

A `202` response means the gateway has started the request in the background. It does not prove that the automation has completed successfully.

## Verify the connection

After starting the gateway:

1. check `/health`;
2. call the protected diagnostics endpoint;
3. list allowed entities;
4. read one entity state;
5. inspect one service contract;
6. confirm that writes remain blocked while `READ_ONLY=true`.

For the canonical technical details, see the repository's [Home Assistant guide](https://github.com/aferende/ha-chatgpt-gateway/blob/main/docs/home-assistant.md).
