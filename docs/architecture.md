# Architecture

This codebase follows clean architecture to separate business rules from delivery and infrastructure concerns.

## Layers
- Domain: business entities and core rules.
- Application: use cases and orchestration logic.
- Infrastructure: database, external APIs, framework adapters.
- Interfaces: controllers, routes, views, serializers, or UI entry points.

## Test Strategy
- Unit tests validate isolated business logic.
- Integration tests validate module boundaries and external interactions.

## Tooling
- Linting enforces code consistency and baseline quality.
- Docker enables reproducible local and deployment runtime.
