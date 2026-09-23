# ARABISK — Production Architecture Rules

This repository is treated as a production monorepo.

## Boundaries

- `apps/web`: public web application and HTTP API.
- `apps/admin`: authenticated administration application.
- `packages/*`: shared code only when a real cross-app dependency exists.

## Server rules

1. Route handlers should validate input and delegate business logic; do not duplicate business rules across routes.
2. Authentication/authorization must fail closed in production.
3. Secrets come only from environment variables; never commit credentials.
4. API errors must be safe for clients and useful in server logs.
5. Every public API request should have a request ID.
6. Persistent business data must have one authoritative storage path; do not introduce a second shadow store.

## Frontend rules

1. Each user-facing page has one canonical implementation.
2. API access should use the shared request layer already present in the admin app.
3. Escape untrusted text before inserting it into HTML.
4. Do not keep obsolete `-v2`, `old`, `copy`, or backup implementations beside the active implementation.

## Change policy

- Trace references before deleting files.
- Make one architectural change at a time.
- Build both apps after structural changes.
- Run runtime smoke tests before deployment.
- Do not call a deployment successful until Railway reports `SUCCESS`.
