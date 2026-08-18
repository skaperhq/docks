# Changelog

Notable changes to Docks are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-08-17

### Added

- Session-isolated duplicate request tabs and explicit custom-request saving.
- Lean `docksUI({ url, database })` PostgreSQL setup with automatic migrations.
- Project/global Docks Agent Skill installation and an API knowledge graph that works directly from OpenAPI, with optional revisioned PostgreSQL workspace enrichment.
- Automatic knowledge refresh on every status, query, explanation, path, and action invocation, including no-cache validation for remote OpenAPI sources.
- Allowlisted graph-resolved upstream actions with environment-only credentials.

### Removed

- MCP transports, client installers, dependencies, and public package subpath.
- Public PostgreSQL runtime subpath and request-tab persistence.

### Changed

- Improved repository governance, release verification, and third-party
  license compliance.
- Split large UI modules into focused components and transport helpers.

## [0.4.0] - 2026-08-02

### Added

- PostgreSQL-backed shared workspace storage and authentication.
- MCP access to persisted custom requests.

## [0.3.0]

### Added

- Published `docks` CLI entry point and package integration coverage.

## [0.2.0]

### Added

- Initial public OpenAPI workspace package.

[Unreleased]: https://github.com/kalidasrajeev1997/docks/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/kalidasrajeev1997/docks/compare/v0.4.0...v0.6.0
[0.4.0]: https://github.com/kalidasrajeev1997/docks/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/kalidasrajeev1997/docks/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kalidasrajeev1997/docks/releases/tag/v0.2.0
