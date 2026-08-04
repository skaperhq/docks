# Releasing

Releases are published from GitHub Releases through npm trusted publishing.

## One-time npm configuration

Configure `kalidasrajeev1997/docks` as a trusted publisher for `@skaper/docks`
on npm. Set the workflow filename to `npm-publish.yml`. No long-lived npm token
is required or accepted by the workflow.

## Release checklist

1. Confirm `main` is green in CI and the working tree is clean.
2. Update the version in `package.json` and `package-lock.json`.
3. Move the `CHANGELOG.md` Unreleased entries into a dated version section.
4. Run `npm ci` and `npm run verify`.
5. Inspect `npm pack --dry-run` for unexpected or missing files.
6. Create and push the signed version tag.
7. Publish a GitHub Release for that tag.
8. Verify npm provenance, package contents, and a clean-install smoke test.

The publish workflow runs the full verification suite again and publishes with
an npm provenance attestation.
