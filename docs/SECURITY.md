# Security baseline

## Production requirements

- `ARABISK_ADMIN_API_KEY` must be a random secret of at least 32 characters.
- Do not place admin credentials in source code, HTML, query strings, or committed files.
- Configure `ARABISK_CORS_ORIGINS` explicitly when more than the default production admin origin is required.
- Storage object keys are validated before signing to prevent traversal-style keys.
- Admin API failures use safe client messages and do not expose configured secrets.
- Rate limits are currently process-local. If the service is scaled horizontally, move rate-limit state to a shared store before relying on it for cross-instance protection.
- Business data currently uses the project's object-storage persistence layer. A transactional database should be introduced before multi-instance writes or high-concurrency order processing.

## Change discipline

Security-sensitive changes must be deployed only after:
1. both application builds succeed;
2. the health endpoint responds;
3. protected admin endpoints reject missing credentials;
4. public order/reservation endpoints still work;
5. Railway reports a successful deployment.
