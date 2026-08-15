# Public HTTPS endpoint

ChatGPT GPT Actions require the OpenAPI server URL to be under the imported HTTPS origin. Use standard HTTPS on port `443`; do not use a non-standard port such as `:5153` in `PUBLIC_BASE_URL` or the Action import URL.

A ChatGPT GPT Action must reach the gateway through a public HTTPS URL. The gateway itself listens on HTTP on its local Docker port; terminate TLS with the existing Synology Reverse Proxy, Nginx, Nginx Proxy Manager, Caddy, Traefik, or a secure tunnel.

Create one virtual host such as `gateway.example.com` that forwards HTTPS traffic to `http://127.0.0.1:8787` (or the NAS LAN address and mapped port). Preserve the `Authorization` header, do not cache API responses, and restrict the proxy route to this gateway only.

## Router port forwarding

Forward the **HTTPS listener of the reverse proxy**, not the Docker port. A safe example for a NAS at `192.168.100.105` is:

| Router field      | Value             |
| ----------------- | ----------------- |
| Protocol          | TCP               |
| WAN/external port | `443`             |
| LAN destination   | `192.168.100.105` |
| LAN/internal port | `443`             |

Do **not** forward `8787` (the gateway's plain HTTP Docker port) and do **not** forward Home Assistant port `8123`. Check that the NAS has a fixed DHCP lease/static LAN address, and that the Internet connection has a public IPv4 address rather than CGNAT. Test the final URL from mobile data or another external network, not only from the home Wi-Fi.

For the Synology setup above, create this rule in **Control Panel → Login Portal → Advanced → Reverse Proxy**:

| Setting              | Value                                                     |
| -------------------- | --------------------------------------------------------- |
| Source protocol      | HTTPS                                                     |
| Source hostname      | the public DNS name, for example `ferendeles.synology.me` |
| Source port          | `443`                                                     |
| Destination protocol | HTTP                                                      |
| Destination hostname | `127.0.0.1`                                               |
| Destination port     | `8787`                                                    |

Assign a valid certificate for the source hostname in **Control Panel → Security → Certificate**. If a distinct subdomain is available, prefer it (for example `ha-gateway.example.com`). Do not overwrite or delete existing reverse-proxy rules for other services.

Do not make Home Assistant port 8123 public for this integration. The intended path is:

```text
Internet -> HTTPS reverse proxy -> HA ChatGPT Gateway :8787 -> LAN -> Home Assistant :8123
```

Verify both the certificate and reachability after configuration:

```bash
curl --fail --silent --show-error https://gateway.example.com/openapi.json
```

The public import URL is:

```text
https://ferendeles.synology.me/openapi.json
```
