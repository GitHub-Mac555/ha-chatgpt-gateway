# HA ChatGPT Gateway Wiki

HA ChatGPT Gateway is a self-hosted bridge that lets a personal ChatGPT GPT Action securely read and control selected Home Assistant entities through a small, policy-enforced REST API.

```text
ChatGPT GPT Action
        |
        | HTTPS + Gateway API key
        v
HA ChatGPT Gateway
        |
        | Home Assistant Long-Lived Access Token
        v
Home Assistant
```

The gateway runs on your own Docker host, NAS, mini PC, Raspberry Pi, or VPS. It does **not** use the OpenAI API and does **not** require an OpenAI API key.

## Start here

If this is your first installation, follow these pages in order:

1. [Getting Started](Getting-Started)
2. [Deploying the Gateway](Deploying-the-Gateway)
3. [Connecting Home Assistant](Connecting-Home-Assistant)
4. [Configuration Guide](Configuration-Guide)
5. [Configuring the ChatGPT Action](Configuring-the-ChatGPT-Action)
6. [Usage Examples](Usage-Examples)

If something does not work, go directly to [Troubleshooting](Troubleshooting).

## What the gateway is designed to do

The gateway deliberately exposes a smaller and safer API surface than Home Assistant itself. It can:

- discover allowed entities, areas, devices, services, and live service contracts;
- read entity states and selected bounded history;
- inspect selected automation configurations with secret-like values redacted;
- call Home Assistant services only for explicitly allowed entities;
- execute short ordered batches of related service calls;
- optionally dispatch reviewed long-running automation or script domains asynchronously;
- optionally expose a small exact allow-list of Home Assistant maintenance actions.

## What it deliberately does not do

The gateway is **not** a transparent Home Assistant reverse proxy. By design it refuses broad target-less, domain-wide, device-wide, area-wide, and label-wide control for ordinary service calls.

A safe installation starts in read-only mode, discovers a few harmless entities, and enables write access only after an explicit `ALLOWED_ENTITIES` list is configured.

## Recommended first devices

Start with harmless and reversible devices such as:

- a desk lamp;
- a test light;
- a non-critical smart plug.

Avoid initially exposing locks, alarms, gates, garage doors, shutters, heating, appliances, security scripts, or plugs powering networking, storage, Home Assistant, or medical equipment.

## Documentation map

This Wiki is the **user guide and navigation layer**. The repository documentation remains the technical source of truth:

- [README](https://github.com/aferende/ha-chatgpt-gateway/blob/main/README.md)
- [Docker guide](https://github.com/aferende/ha-chatgpt-gateway/blob/main/docs/docker.md)
- [Home Assistant guide](https://github.com/aferende/ha-chatgpt-gateway/blob/main/docs/home-assistant.md)
- [NAS / Synology guide](https://github.com/aferende/ha-chatgpt-gateway/blob/main/docs/nas-docker.md)
- [Reverse proxy and HTTPS](https://github.com/aferende/ha-chatgpt-gateway/blob/main/docs/reverse-proxy.md)
- [ChatGPT Action guide](https://github.com/aferende/ha-chatgpt-gateway/blob/main/docs/chatgpt-action.md)
- [Security model](https://github.com/aferende/ha-chatgpt-gateway/blob/main/docs/security.md)
- [Changelog](https://github.com/aferende/ha-chatgpt-gateway/blob/main/CHANGELOG.md)

For the exact current HTTP schema, use the running gateway's `/openapi.json` endpoint.
