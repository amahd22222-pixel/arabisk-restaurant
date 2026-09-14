# ARABISK Restaurant & Cafe

A bilingual Arabic/English restaurant website and admin dashboard built around the visual identity of the supplied ARABISK menu.

## Apps
- `apps/web` — customer-facing website + Express API
- `apps/admin` — administration dashboard

## Architecture
Railway is intentionally kept to two services:

1. `web` — serves the public website and the `/api/*` endpoints.
2. `@arabisk/admin` — serves the administration dashboard.

The API is embedded in the web service to avoid paying for a separate API service.

## Brand
The visual system follows the supplied menu: deep black, warm gold, ivory/cream surfaces, elegant typography, generous spacing, premium restaurant photography, and RTL-first Arabic support.

## Current admin capabilities
- Load categories and products from the API
- Search products
- Add a product
- Edit a product
- Delete a product
- Toggle availability
- View live product/category counts

## API
- `GET /health`
- `GET /api/categories`
- `GET /api/products`
- `GET /api/products?category=Breakfast`
- `GET /api/products?search=حمص`
- `GET /api/products/:id`
- `POST /api/products`
- `PATCH /api/products/:id`
- `DELETE /api/products/:id`

## Local admin API connection
The admin reads `ARABISK_API_BASE` from `localStorage` when present. Otherwise it uses `http://localhost:3000`.

Example in the browser console:

```js
localStorage.setItem('ARABISK_API_BASE', 'https://YOUR-WEB-DOMAIN')
```

## Security
Secrets and environment files are excluded from Git. Never commit API keys, database credentials, or production secrets.
