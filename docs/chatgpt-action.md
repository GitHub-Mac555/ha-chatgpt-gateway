# ChatGPT GPT Action setup

1. Deploy the gateway behind a public HTTPS endpoint and verify `https://your-host.example/openapi.json` returns JSON.
2. In the GPT editor, create or edit a personal GPT, open **Actions**, and import that OpenAPI URL.
3. Keep the imported authentication scheme as HTTP Bearer. Enter the value of `GATEWAY_API_KEY` as the action secret.
4. Do not enter `HOME_ASSISTANT_TOKEN` anywhere in ChatGPT. It is an internal gateway-to-Home-Assistant credential.
5. Test with `listHomeAssistantEntities`, then `getHomeAssistantEntityState`, while `READ_ONLY=true`.
6. Review `ALLOWED_DOMAINS` and, where appropriate, set `ALLOWED_ENTITIES`. Only then set `READ_ONLY=false` and restart the gateway.

The action should discover entities/services before making assumptions. For area-oriented requests, it can use `listHomeAssistantAreas` and `listHomeAssistantDevices`, then resolve to explicit allowed entity IDs before `callHomeAssistantService`.

The schema intentionally does not contain a `servers` entry. This lets the GPT Action retain the HTTPS base URL supplied during import and avoids publishing an internal hostname.
