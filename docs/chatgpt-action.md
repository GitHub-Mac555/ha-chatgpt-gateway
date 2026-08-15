# ChatGPT GPT Action setup

1. Deploy the gateway behind a public HTTPS endpoint.
2. Verify `https://your-host.example/openapi.json` is publicly reachable.
3. In the GPT Action editor, import that OpenAPI document.
4. Select API-key authentication using Bearer auth.
5. Enter the same secret configured as `GATEWAY_API_KEY`.
6. Never enter `HOME_ASSISTANT_TOKEN` in ChatGPT.
7. Start with `READ_ONLY=true` and test entity discovery/state reads first.
8. Enable writes only after reviewing `ALLOWED_DOMAINS` and `ALLOWED_ENTITIES`.
