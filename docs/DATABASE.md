# Database — PostgreSQL

`apps/web` persists all application/business state in a real PostgreSQL
database instead of a JSON blob on object storage. Media files (images and
video) still live on S3-compatible object storage (`arabisk-media-storage`) —
that is the correct place for binary files; the database holds structured
application state.

## How it works

- `apps/web/db.js` opens a connection pool (`pg`) to `DATABASE_URL` and keeps
  one table, `app_state(key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ)`.
  The table is created automatically on first use (`CREATE TABLE IF NOT EXISTS`).
- Every part of the app that used to read/write a JSON snapshot (products,
  categories, orders, customers, reservations, push subscriptions,
  experiences, Studio, Memories, promotions, the Revenue Engine, and product
  details) now reads/writes its snapshot as a row in `app_state`, keyed the
  same way it always was (e.g. `data/arabisk-state.json`).
- This is a drop-in replacement: `db.js` exposes the exact same
  `readJson` / `readJsonWithStatus` / `writeJson` function signatures that
  `storage.js` used to provide, so no route or business-logic file had to
  change — only the wiring in `server.js` (and the handful of `storageReady`
  gates that needed to become `dbReady` gates) changed.
- Each request still runs against in-memory arrays (fast, synchronous),
  which are loaded from PostgreSQL on boot and written back to PostgreSQL on
  every mutation (debounced). This keeps the existing service/route code
  completely unchanged while giving you real, durable, queryable storage
  with transactions, backups, and no risk of a corrupted single JSON file.

## Required environment variable

```
DATABASE_URL=postgres://user:password@host:5432/dbname
```

Optional:

```
DATABASE_SSL=strict      # verify the DB server's TLS certificate (default: accept it without verifying, which is what Railway's managed Postgres needs)
DATABASE_SSL=disable      # no TLS at all (local Postgres in Docker, etc.)
DATABASE_POOL_MAX=10      # max connections in the pool (default 10)
```

If `DATABASE_URL` is not set, the app still boots (useful for local frontend
work) but every service that needs persistence will report `ok:false` on
`/health` — set the variable before relying on the app for real data.

## Setting it up on Railway

1. In your Railway project, click **New → Database → Add PostgreSQL**.
2. Railway creates a `DATABASE_URL` variable automatically on the new
   Postgres service. Open the `web` service → **Variables** → **Add
   Reference** → point it at the Postgres service's `DATABASE_URL`. (Or copy
   the value directly if you prefer.)
3. No manual migration step is required — the `app_state` table is created
   automatically the first time the web service starts with `DATABASE_URL`
   set.
4. Redeploy. Check `GET /health` — `database.ok` should be `true`.

## Setting it up locally

```bash
# with Docker
docker run --name arabisk-postgres -e POSTGRES_PASSWORD=devpass -p 5432:5432 -d postgres:16

# then:
export DATABASE_URL="postgres://postgres:devpass@localhost:5432/postgres"
export DATABASE_SSL=disable
npm --workspace apps/web run dev
```

## One-time migration from the old JSON-in-object-storage snapshots

If you have existing production data sitting as JSON files in the old
object-storage bucket (e.g. `data/arabisk-state.json`) and want to import it
into PostgreSQL once, run this after setting `DATABASE_URL` and the storage
env vars (`AWS_*`) at the same time:

```js
// scripts/migrate-json-to-db.mjs (example — not included by default)
import { readJson as readFromStorage } from '../apps/web/storage.js';
import { writeJson as writeToDb } from '../apps/web/db.js';

const keys = [
  'data/arabisk-state.json',
  'data/arabisk-categories.json',
  'data/arabisk-experiences.json',
  'data/arabisk-studio.json',
  'data/arabisk-memories.json',
  'data/arabisk-revenue-v1.json',
  'data/arabisk-promotions-v1.json',
  'data/arabisk-product-details.json'
];

for (const key of keys) {
  const value = await readFromStorage(key, null);
  if (value !== null) {
    const ok = await writeToDb(key, value);
    console.log(key, ok ? 'migrated' : 'FAILED');
  } else {
    console.log(key, 'no existing snapshot, skipped');
  }
}
```

Run it once (`node scripts/migrate-json-to-db.mjs`), confirm `/health` looks
correct, then remove the script.

## Why not a fully relational schema (a `products` table, an `orders` table, etc.)?

The service layer (`apps/web/services/*.js`) is written against synchronous
in-memory arrays (`array.find`, `array.filter`, in-place mutation) across
roughly 4,000 lines of business logic and 87 existing tests. Converting every
one of those call sites to `await` a normalized SQL query per operation is a
much larger, higher-risk rewrite that touches almost every file in the repo.
The approach used here gives you a real, durable, transactional, backed-up,
horizontally-shareable PostgreSQL database today with a minimal, low-risk
diff. If/when you want true per-entity SQL tables (for direct SQL reporting,
for example), that can be done incrementally, service by service, starting
with the highest-value one (typically `orders`), without blocking on the
rest.

## Automatic first-boot migration

When PostgreSQL is enabled and the existing S3-compatible storage is configured, the web service performs the one-time legacy snapshot import automatically before restoring state. This is intentionally limited to the known snapshot keys listed below, is safe to repeat until completion, and never deletes the source JSON objects or media.
