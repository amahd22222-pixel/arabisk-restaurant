# ARABISK Restaurant & Cafe

A bilingual Arabic/English restaurant platform and admin operating dashboard built around the ARABISK visual identity.

## Apps

- `apps/web` — customer-facing website + Express API
- `apps/admin` — administration dashboard

## Architecture

Railway is intentionally kept to two application services plus media storage:

1. `web` — public website and `/api/*` endpoints.
2. `@arabisk/admin` — protected administration dashboard.
3. `arabisk-media-storage` — S3-compatible media bucket for images, videos, Memories, and product media.

The API is embedded in the web service to avoid a separate API service.

## Current product areas

### Customer experience

- Bilingual Arabic/English menu
- Product details and media
- Online ordering
- Dine-in and pickup flows
- Table reservations
- Experiences/events
- Community Memories
- Recovery/reorder links for eligible revenue opportunities

### Restaurant operations

- Product/category management
- Order status workflow
- Reservation management
- Kitchen board
- Experiences management
- Memories moderation
- Customer 360

### Revenue Engine

The Revenue Engine is designed as an operational loop:

**Discover → Execute → Measure → Learn**

It currently includes:

- Funnel visibility for menu → product → cart → checkout → order
- Abandoned-cart opportunities
- Inactive/re-activation opportunities
- Returning-customer opportunities
- Product-interest opportunities
- Upcoming reservation opportunities
- Revenue alerts
- Operational revenue forecasting
- Conversion health indicators
- Revenue opportunity/task management
- Owner assignment and SLA tracking
- Task activity history
- Blocker and blocker-duration analysis
- Revenue risk exposure
- Value realization
- Task performance by owner
- Outcome reasons
- Outcome learning
- Attribution of measured actions to resulting orders where available

### Customer Intelligence

Customer 360 combines the customer record with operational and revenue context:

- Order count and order value
- Average order value
- Days since last order
- Average return cadence when enough history exists
- Favorite/repeated products
- Last-order contents
- Recent tracked activity
- Active revenue opportunities
- Related revenue actions
- Next-action context
- Consent/marketing-opt-in visibility

### Memories

Memories supports:

- Public text, image, and video posts
- Likes, comments, sharing, and reporting
- Moderation, hide/show, pin, edit, and delete
- Persistent loading and like states
- Deep links to individual memories
- Optional product context
- Optional experience context
- Experience links from a memory
- Admin visibility of Memory context

Existing Memories without context remain supported.

## Security

The admin dashboard uses a protected session and API key proxy. Production authentication and API secrets must remain in Railway environment variables and must never be committed to Git.

Secrets and environment files are excluded from Git. Never commit API keys, database credentials, or production secrets.

## Development

Admin and web are separate applications inside the same repository. The admin Vite build injects optional feature modules such as Revenue Command Center and Customer Intelligence without requiring a rewrite of the dashboard HTML.

## Deployment

Production is deployed through Railway from the `main` branch.

Before treating a deployment as complete, verify that the relevant Railway deployment reaches `SUCCESS`.
