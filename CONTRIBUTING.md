# Contributing to Docks

Thank you for helping improve Docks. Contributions of code, documentation,
tests, bug reports, and design feedback are welcome.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Use an issue to discuss security-sensitive or behavior-changing work first.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Keep pull requests focused; unrelated cleanup should be submitted separately.

## Development setup

Docks requires Node.js 20.19 or newer for its development toolchain.

```bash
npm ci
npm run dev
```

Before submitting a pull request, run the same verification used by CI:

```bash
npm run verify
```

If a dependency change affects bundled browser code or runtime dependencies,
regenerate the notices:

```bash
npm run notices
```

## Pull requests

- Add or update tests for observable behavior changes.
- Update README and public type declarations when the API changes.
- Add an entry under **Unreleased** in [CHANGELOG.md](CHANGELOG.md).
- Do not commit secrets, generated `dist` files, or local environment files.
- Use clear commit messages that explain the user-visible outcome.

By contributing, you agree that your contribution is licensed under the MIT
License in this repository.

Maintainers should follow [RELEASING.md](RELEASING.md) for release preparation
and npm trusted publishing.
