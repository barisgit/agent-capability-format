# npm releases

The root manifest and all [public package manifests](../../README.md#packages)
must share one version. `bun scripts/packages.ts list` prints their directories
in dependency order; private workspaces such as `@caplet/golden` are excluded.

## Normal releases

After bootstrap, do not publish manually or create tags. Bump the shared version
in the root and six public manifests, run `bun install` to refresh the lockfile,
commit, and merge to `main`. `.github/workflows/release.yml` serializes releases
in concurrency group `npm-production`, without cancelling an active release.
`queue: max` preserves up to 100 pending runs rather than replacing a queued
version bump with the next push (pushes beyond that limit are cancelled):

1. Compare against `github.event.before`. Versions must be canonical SemVer and
   agree across manifests at both commits. An unchanged version skips the
   release; a changed version must be strictly newer. Query exact npm versions,
   treating only E404 as absent. If none are missing, finish green.
2. Run `bun run ci` (including builds) and pack each package once. Check the existing
   allowlist (`dist/`, manifest, README, LICENSE), write `SHA256SUMS`, and
   smoke-install those exact tarballs on Node 20 before uploading the artifact.
3. In the `npm-production` GitHub environment, download and verify checksums,
   repeat the registry preflight, and publish those archives in dependency order
   derived by `scripts/packages.ts`. Only this job has `id-token: write`.
   npm 11.5.1 uses trusted publishing and automatic provenance, without a token.
4. Create `v<version>` at the published commit, or verify an existing tag points
   there. Create or refresh the GitHub Release with the tarballs and checksums.

Stable versions, including **0.x**, use npm `latest` and a normal GitHub Release.
A SemVer prerelease such as `0.2.0-rc.1` uses npm `next` and a GitHub prerelease.
Build metadata does not change SemVer precedence and is not a version bump.

On a partial failure, rerun the original workflow run at the original commit
(so its original `before` comparison is retained). An already-published exact
version is accepted only if npm's SHA-512 archive integrity matches the prepared
tarball. A mismatch fails closed; do not overwrite an npm version. Preflight
also refuses to publish a missing version when its destination npm dist-tag
already points to a newer version, preventing superseded retries from rolling
`latest` or `next` backward. Repacking in a new build can change archive bytes,
so prefer rerunning failed jobs to retain the original artifact. If every package already exists, rerunning the entire
workflow skips release creation too; rerun the failed GitHub Release job to
repair missing attachments or a missing tag.

## Trusted publishing

Configure a trusted publisher on **each** of the six npm packages:

| Setting | Value |
|---|---|
| Provider | GitHub Actions |
| Repository owner | `barisgit` |
| Repository | `agent-capability-format` |
| Workflow filename | `release.yml` |
| Environment | `npm-production` |
| Allowed actions | `npm publish` |

The `npm-production` GitHub environment restricts deployments to `main` through
a custom deployment-branch policy. It has no required reviewers: eligible
releases do not wait for manual approval. Keep publisher records aligned with
the workflow and environment. No `NPM_TOKEN` belongs in repository secrets or
workflow configuration.

## Bootstrap: first publication and publisher setup

Pending: mark these steps done only after they happen. npm requires a package
to exist before its trusted publisher can be configured.

1. Under an authorized maintainer npm session, check that the root and six public
   manifests are `0.1.0`, then prepare and inspect the exact archives:

   ```sh
   bun install --frozen-lockfile
   bun run ci
   bun scripts/packages.ts pack .packs
   (cd .packs && sha256sum ./*.tgz > SHA256SUMS)
   bun scripts/packages.ts smoke .packs
   ```

2. Log in with `npm login`, then run `bun scripts/packages.ts publish .packs`.
   npm inherits the terminal for 2FA/browser confirmation. This command uses the
   same dependency order, integrity checks, and `latest`/`next` rules as CI;
   only E404 means unpublished. The first `0.1.0` release goes to `latest`.
3. Configure the six per-package trusted publishers with the records above.
4. Verify `npx @caplet/cli@latest add github:vercel-labs/skills --pin main` on clean macOS
   and Linux machines using disposable HOME, `CLAUDE_CONFIG_DIR`, and XDG base
   directories. Mark bootstrap complete here and update backlog B1.

The bootstrap does not create a manual tag. Subsequent version bumps on `main`
create their tags and GitHub Releases automatically.
