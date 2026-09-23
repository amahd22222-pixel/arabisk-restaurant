# Backend refactoring rules

The web service is organized by responsibility:

- `middleware/`: transport-level concerns such as rate limiting.
- `services/`: request and business workflows for orders, customers, and reservations.
- `repositories/`: persistence access boundaries.
- `storage.js`: object-storage signing and persistence primitives.
- `revenue-engine.js`: revenue analytics and recovery domain.

New endpoints should not put business logic directly into `server.js`. Route handlers should validate transport input and delegate domain work to a service. Persistence must go through a repository or storage boundary.

Identifiers for orders, reservations, and products are generated from the highest existing numeric identifier rather than collection length so deletion cannot cause collisions.
