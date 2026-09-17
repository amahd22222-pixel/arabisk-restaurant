# ARABISK 2.0 — Phase 10

This phase adds the customer-facing smart-menu data layer and UX hooks.

## Smart product metadata
- `tags`: currently supports `spicy`.
- `dietary`: supports `vegetarian`, `vegan`, `gluten-free`.
- `spiceLevel`: 0–3.
- `chefChoice`: boolean.
- `isNew`: boolean, with a 30-day recency fallback when `createdAt` exists.

## Popularity
The public product API calculates a privacy-safe `smart.popular` flag from non-cancelled orders created in the last 7 days. Only the top 6 products are marked popular; customer/order details are never exposed.

## Customer UX
Category pages support smart filters and popular sorting, while product pages render available smart badges and dietary/spice metadata. Existing availability filtering and ordering flows remain unchanged.

Dietary badges are only shown when explicit product metadata exists; the system does not infer allergy-related claims from product names.
