# Changelog

## v0.4.2 — Proxy-aware rate limiting

### Security

- Adds explicit trusted-proxy configuration for correct per-client rate limiting behind reverse proxies.
- Prevents untrusted clients from influencing rate-limit identity through forwarded IP headers.
- Adds regression coverage for proxy-aware authentication throttling and independent client buckets.

## v0.4.1 — Security hardening

- Runs the general protected-route rate limiter before authentication, so failed authentication attempts are limited.
- Requires every configured gateway credential to be a distinct, exactly 64-character hexadecimal key generated from 32 random bytes.
- Refuses to start write-enabled deployments without an explicit `ALLOWED_ENTITIES` allow-list.
- Adds security regression tests for these controls.
