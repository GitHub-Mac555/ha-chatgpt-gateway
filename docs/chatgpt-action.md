# ChatGPT GPT Action setup

1. Deploy the gateway behind a public HTTPS endpoint. Set `PUBLIC_BASE_URL` to its externally reachable HTTPS origin, for example `https://gateway.example.com`, then restart the gateway. This adds the public OpenAPI `servers` URL required by action clients.
2. In the GPT editor, create or edit a personal GPT, open **Actions**, and import that OpenAPI URL.
3. Keep the imported authentication scheme as HTTP Bearer. Enter the value of `GATEWAY_API_KEY` as the action secret.
4. Do not enter `HOME_ASSISTANT_TOKEN` anywhere in ChatGPT. It is an internal gateway-to-Home-Assistant credential.
5. Test with `listHomeAssistantEntities`, then `getHomeAssistantEntityState`, while `READ_ONLY=true`.
6. Review `ALLOWED_DOMAINS` and, where appropriate, set `ALLOWED_ENTITIES`. Only then set `READ_ONLY=false` and restart the gateway.

The action should discover entities/services before making assumptions. For area-oriented requests, it can use `listHomeAssistantAreas` and `listHomeAssistantDevices`, then resolve to explicit allowed entity IDs before `callHomeAssistantService`.

## Example with a Synology reverse proxy

After the router and reverse-proxy setup described in [reverse-proxy.md](reverse-proxy.md), import the exact public URL, including a non-standard HTTPS port if one is used:

```text
https://ferendeles.synology.me:5153/openapi.json
```

Before saving the GPT, open the URL from an external network and confirm that it returns valid JSON over TLS. Then test the Action in this order: entity discovery, an entity state read, service discovery, and finally an approved service call. Never place the Home Assistant token in the Action authentication settings.
