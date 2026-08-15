# Home Assistant setup

The gateway currently uses the Home Assistant REST API.

Configure `HOME_ASSISTANT_URL` with the address reachable from the gateway container and `HOME_ASSISTANT_TOKEN` with a Long-Lived Access Token.

Prefer a dedicated Home Assistant user and restrict its permissions where your Home Assistant deployment allows it. The gateway policy is an additional safety boundary and should not be considered a replacement for least-privilege Home Assistant credentials.
