# HA ChatGPT Diagnostics

This optional Home Assistant app provides a single, read-only diagnostic operation for HA ChatGPT Gateway. The normal gateway continues to work when this app is absent.

## Architecture

```text
ChatGPT -> HTTPS -> HA ChatGPT Gateway -> LAN HTTP + bearer token
        -> diagnostics app -> Supervisor GET /core/logs
```

The app reads only recent Home Assistant Core container logs from the Supervisor systemd-journal backend. It does not expose host, Supervisor, or arbitrary app logs. It has no generic proxy, shell, Docker socket, host network access, ingress, or filesystem mounts.

The only routes are:

- `GET /health` (liveness only, no authentication);
- `GET /api/v1/logs/errors?lines=100` (bearer authentication required).

`lines` defaults to 100 and must be an integer from 1 through 500. Unknown parameters, duplicate limits, paths, source selectors, and expressions are rejected. The app asks Supervisor for that many recent Core source lines, keeps only lines marked warning, error, critical, or fatal, caps upstream and downstream response sizes, and never follows logs.

## Required permission

The app declares only `hassio_api: true` and `hassio_role: homeassistant`. Home Assistant's `default` role cannot read `/core/logs`. No narrower, log-only Supervisor role currently exists.

The `homeassistant` role also technically authorizes other `/core/*` Supervisor operations, including state-changing lifecycle operations. This app never calls or proxies those operations, but compromise of its process or Supervisor token would have a larger impact than its public HTTP API suggests. This coarse upstream role is the principal residual privilege risk and the reason Supervisor access is isolated from the Internet-facing gateway.

## Threat model and limits

- The gateway-to-app bearer token must be a distinct 64-character hexadecimal secret. It is read from Home Assistant app options, compared using SHA-256 digests plus a timing-safe comparison, and is never returned or intentionally logged.
- The protected route is limited to 30 requests per source address per 60 seconds. The gateway's normal protected-route rate limit also applies.
- The source, Supervisor host, method, and path are constants. Caller-controlled URLs, paths, filenames, grep expressions, and shell input do not exist.
- Responses contain only severity-matching lines and use `Cache-Control: no-store`. Both components apply redaction for common authorization values, bearer tokens, API/access tokens, passwords, JWTs, webhook secrets, credential-bearing URLs, and sensitive query parameters.
- Regex redaction is defense in depth and cannot guarantee that every secret in arbitrary log text is removed. Authentication, a fixed source, small windows, severity filtering, response caps, and network isolation are the primary disclosure controls.
- The app uses plain HTTP on the trusted LAN because Home Assistant app port mappings do not provide app-managed TLS. Anyone able to sniff that network path could observe the bearer token and returned logs. Use a trusted isolated LAN/VLAN or a private overlay if that is not acceptable.
- Do not expose port 8099 to the Internet, Home Assistant ingress, a router port-forward, or the gateway's Tailscale Funnel.

## Install for a local/fork-based test

Do not install this unpublished branch as an upstream release. Use one of these test paths:

1. Fork the repository, place this branch on the fork's default branch, then add `https://github.com/<your-account>/ha-chatgpt-gateway` as a custom repository in **Settings > Apps > App store > Repositories**; or
2. Copy only the `ha-chatgpt-diagnostics` directory to `/addons/ha-chatgpt-diagnostics` on the Home Assistant host through an already trusted local app-development method, then reload the app store.

Next:

1. Open **HA ChatGPT Diagnostics** and install it. Keep protection mode enabled.
2. Generate a new token on a trusted machine with `openssl rand -hex 32`. Do not reuse a Home Assistant token or gateway key.
3. Paste that value into the app's `diagnostics_token` option and save.
4. Under the app's **Network** settings, map container port `8099/tcp` to host port `8099`. The mapping is disabled by default so installation alone does not expose a listener.
5. Start the app. Confirm its log contains only a normal start message; the implementation never prints configured tokens.
6. Ensure the Home Assistant host firewall/router permits port 8099 only from the Raspberry Pi gateway address. Home Assistant's app mapping itself cannot bind the published port to a chosen LAN address.

## Test from the Raspberry Pi gateway

First test the companion directly over the trusted LAN:

```bash
curl --fail http://<home-assistant-lan-ip>:8099/health
read -rsp 'Diagnostics token: ' DIAGNOSTICS_TEST_TOKEN; echo
curl --fail-with-body -H 'Authorization: Bearer '$DIAGNOSTICS_TEST_TOKEN \
  http://<home-assistant-lan-ip>:8099/api/v1/logs/errors?lines=10
unset DIAGNOSTICS_TEST_TOKEN
```

Verify status `ok`, bounded warning/error lines with authentication, and 401 without it. Inspect returned logs locally for unexpected sensitive data; do not paste raw logs into issues or chats.

Build this branch in a separate Raspberry Pi test directory and use a separate localhost-only port so production remains untouched. Keep the existing Home Assistant and policy settings, including `READ_ONLY=true`, and add these values to the test deployment's mode-600 `.env`:

```env
PORT=8788
ENABLE_ERROR_LOGS=true
DIAGNOSTICS_ADDON_URL=http://<home-assistant-lan-ip>:8099
DIAGNOSTICS_ADDON_TOKEN=<same-new-64-hex-token>
```

Bind the test compose port as `127.0.0.1:8788:8788`, build locally, and start only that test project.

```bash
curl --fail http://127.0.0.1:8788/health
curl --silent http://127.0.0.1:8788/openapi.json | grep -F /api/v1/logs/errors
read -rsp 'Gateway read key: ' GATEWAY_TEST_KEY; echo
curl --fail-with-body -H 'Authorization: Bearer '$GATEWAY_TEST_KEY \
  http://127.0.0.1:8788/api/v1/logs/errors?lines=10
unset GATEWAY_TEST_KEY
```

Also verify 401 without the gateway key, 400 for `lines=0` and `lines=501`, and 503 while only the diagnostics app is temporarily offline. Keep the production container and Funnel on `127.0.0.1:8787`; never add port 8099 or the test port to Funnel.

Afterward, clean up only the separate test project. Disable the app's host port mapping or uninstall the app if it will not be kept. Securely discard test environment copies and retain no historical tokens.
