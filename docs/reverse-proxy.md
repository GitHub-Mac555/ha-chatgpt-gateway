# Public HTTPS endpoint

A ChatGPT GPT Action must reach the gateway through a public HTTPS URL. The gateway itself listens on HTTP on its local Docker port; terminate TLS with the existing Synology Reverse Proxy, Nginx, Nginx Proxy Manager, Caddy, Traefik, or a secure tunnel.

Create one virtual host such as `gateway.example.com` that forwards HTTPS traffic to `http://127.0.0.1:8787` (or the NAS LAN address and mapped port). Preserve the `Authorization` header, do not cache API responses, and restrict the proxy route to this gateway only.

Do not make Home Assistant port 8123 public for this integration. The intended path is:

```text
Internet -> HTTPS reverse proxy -> HA ChatGPT Gateway :8787 -> LAN -> Home Assistant :8123
```

Verify both the certificate and reachability after configuration:

```bash
curl --fail --silent --show-error https://gateway.example.com/openapi.json
```
