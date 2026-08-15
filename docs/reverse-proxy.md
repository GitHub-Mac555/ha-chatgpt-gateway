# Public HTTPS endpoint

A ChatGPT GPT Action must reach the gateway through a public HTTPS URL.

The gateway itself listens on HTTP inside the local/container network. Terminate TLS with the deployment method appropriate to your environment, for example an existing reverse proxy or secure tunnel.

Do not publish Home Assistant directly as part of this setup. Only the gateway endpoint needs to be reachable by the GPT Action.
