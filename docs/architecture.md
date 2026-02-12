# Architecture

This project follows clean architecture principles.

## Layers
- Domain: core entities and business rules.
- Application: use-cases and orchestration.
- Infrastructure: external integrations and adapters.
- Interface: controllers/UI/api handlers.

## Suggested Structure
- src/domain
- src/application
- src/infrastructure
- src/interfaces
- tests/unit
- tests/integration

## Quality Gates
- Linting via ESLint.
- Unit and integration tests via Vitest.
- Containerization with Docker.
