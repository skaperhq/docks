# Security Policy

## Supported versions

Security updates are provided for the latest published minor release.

| Version | Supported |
| ------- | --------- |
| 0.4.x   | Yes       |
| < 0.4   | No        |

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use
[GitHub private vulnerability reporting](https://github.com/kalidasrajeev1997/docks/security/advisories/new)
and include:

- affected version and configuration;
- reproduction steps or a proof of concept;
- likely impact and any known mitigations;
- whether disclosure is subject to a deadline.

You should receive an acknowledgement within five business days. We will
coordinate validation, remediation, release timing, and disclosure with the
reporter. Please avoid accessing data that is not yours or disrupting services
while researching a report.

## Security boundaries

- The browser-only `docksUI({ password })` option is a convenience lock, not
  authorization. Use host-application authentication for deployed docs.
- Protect relay, Docks storage, and action execution with normal authentication, rate
  limiting, TLS, and network controls.
- Upstream actions resolve only documented graph operations and remain subject
  to local origin/method/operation allowlists and explicit write confirmation.
- Treat OpenAPI documents as code-like input. Only load documents and external
  references from trusted locations.
