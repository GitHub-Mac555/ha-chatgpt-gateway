# Security

## Trust boundaries

- ChatGPT knows `GATEWAY_API_KEY`.
- HA ChatGPT Gateway knows both `GATEWAY_API_KEY` and `HOME_ASSISTANT_TOKEN`.
- Home Assistant never needs OpenAI credentials.
- `HOME_ASSISTANT_TOKEN` must never be copied into a GPT Action.

## Recommended baseline

- use HTTPS for every public request;
- generate a long random `GATEWAY_API_KEY`;
- start with `READ_ONLY=true`;
- keep `ALLOWED_DOMAINS` minimal;
- use `ALLOWED_ENTITIES` for a strict entity allowlist when practical;
- avoid exposing sensitive domains such as `lock` and `alarm_control_panel` by default;
- keep `.env` out of version control;
- run the container as an unprivileged user;
- do not expose Home Assistant itself merely to make this gateway work.
