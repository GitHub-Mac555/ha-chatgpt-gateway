# One-prompt Codex deployment assistant

The following prompt is for users of the Codex desktop app on Windows or Linux. Edit the values in the **User configuration** block before sending it. Keep the actual Home Assistant token, SSH password, private key, and gateway API key out of Git; provide them only when Codex asks for the local deployment values.

Codex can inspect and configure a host you own, but it cannot configure the router without your access to the router UI. It should report the exact port-forward rule you must create and wait for you to confirm it.

```text
Deploy and configure the public repository aferende/ha-chatgpt-gateway for my personal Home Assistant and ChatGPT GPT Action.

## User configuration — edit these values before proceeding
REPOSITORY_URL=https://github.com/aferende/ha-chatgpt-gateway.git
DEPLOYMENT_MODE=ghcr                 # ghcr or build
NAS_HOST=192.168.1.50
NAS_SSH_PORT=22
NAS_USER=admin
NAS_PROJECT_DIR=/volume1/docker/ha-chatgpt-gateway
HOME_ASSISTANT_URL=http://192.168.1.10:8123
PUBLIC_GATEWAY_HOSTNAME=ha-gateway.example.com
SAFE_ALLOWED_DOMAINS=light,switch
SAFE_ALLOWED_ENTITIES=               # leave blank for read-only discovery; then replace with selected safe IDs
READ_ONLY_INITIAL=true

# Never commit these. Ask me for them only when needed; do not print them in logs or reports.
HOME_ASSISTANT_TOKEN=<ask me securely>
# Preferred: generate two different random values if I do not provide them.
GATEWAY_READ_API_KEY=<optional read-only monitoring key>
GATEWAY_WRITE_API_KEY=<GPT Action key with read/write scope>
# Legacy alternative: GATEWAY_API_KEY=<read/write key>
NAS_SSH_PASSWORD=<ask me securely if password authentication is used>
NAS_SSH_PRIVATE_KEY=<ask me securely if key authentication is used>

## Required outcome
1. Clone or inspect the existing repository. Do not scaffold a replacement project.
2. Run the project checks: npm ci, format check, lint, test, and build. Inspect the current GitHub Actions status before making deployment claims.
3. Inspect the NAS before changing it: uname -a, id, Docker version, Docker Compose version, docker ps, docker compose ls, existing Docker directory conventions, and existing reverse-proxy infrastructure. Do not stop, remove, or modify unrelated containers, networks, volumes, or proxy routes.
4. Deploy only this project at NAS_PROJECT_DIR. Prefer ghcr.io/aferende/ha-chatgpt-gateway:latest when DEPLOYMENT_MODE=ghcr. Create a local .env with chmod 600. Never write secrets into the repository, GitHub Actions, logs, public documentation, or the final report.
5. Start with READ_ONLY=true, SAFE_ALLOWED_DOMAINS, and the smallest safe policy. Use entity discovery to identify harmless devices such as a test lamp. Do not initially permit locks, alarms, doors, gates, covers, security scripts, climate/heating, appliances, or infrastructure plugs.
6. Configure or reuse an HTTPS reverse proxy at PUBLIC_GATEWAY_HOSTNAME on port 443, forwarding only to the gateway local port 8787. Set PUBLIC_BASE_URL=https://PUBLIC_GATEWAY_HOSTNAME. Do not expose Home Assistant port 8123 or plain gateway port 8787 to the Internet.
7. If an inbound router rule is needed, do not attempt to access the router. Tell me to create TCP external 443 -> NAS_HOST internal 443, explain how to test it from an external network, and wait for my confirmation. If the ISP uses CGNAT, propose an outbound tunnel or VPS reverse proxy instead.
8. Verify externally: HTTPS certificate, /health, /openapi.json, and that the OpenAPI servers URL equals https://PUBLIC_GATEWAY_HOSTNAME with no port suffix. Verify that no secret appears in the schema.
9. Give me exact generic steps to create a personal ChatGPT GPT, import https://PUBLIC_GATEWAY_HOSTNAME/openapi.json, configure the gateway API key as Bearer authentication, and paste safe English GPT Instructions. Do not use or publish personal ChatGPT links.
10. Only after I explicitly approve the selected entity IDs, update ALLOWED_ENTITIES, set READ_ONLY=false, restart only this Compose project, and perform one observed on/off test on a harmless device. Re-read the state afterwards.

## Safety and reporting
- Use explicit entity IDs for all state-changing calls; never use target-less, area-wide, device-wide, or domain-wide writes.
- Preserve all unrelated NAS resources and report any conflict before changing shared port 443 or a proxy route.
- At the end report: repository commit, image/version, NAS architecture, project path, container status, policy domains and entity count, public health/OpenAPI URLs, TLS result, and read/write test outcome. Do not report any token, password, private key, or API key.
```
