# Releasing `@froglylabs/orderly-plugin`

Releases are published only by GitHub Actions (`.github/workflows/release.yml`) when a `v*` tag is pushed. Never publish from a laptop.

## Requirements

- The GitHub repository `froglylabs/frogly-orderly` must be public before the first release. npm provenance needs a public repository.
- `repository.url` in `package.json` is `git+https://github.com/froglylabs/frogly-orderly.git` and must match the repository.
- The workflow uses Node 24.20.0 and upgrades npm to 11.19.0 (trusted publishing needs Node 22.14.0 or later and npm 11.5.1 or later).
- The workflow file name is `release.yml`. npm's trusted publisher settings must name exactly this file.

## Before every release

1. Bump `version` in `package.json` and add a section to `CHANGELOG.md`.
2. If Frogly's core changed, change `CORE_SRC` and `CORE_INTEGRITY` in `src/core.ts` together. A new core version always means a new plugin version.
3. Run the checks:

   ```bash
   cd ~/frogly-orderly && pnpm release:check
   ```

4. Keep `package.json` free of npm lifecycle scripts (`preinstall`, `install`, `postinstall`, `prepare`, `prepublish`, `prepublishOnly`, `prepack`, `postpack`). The Orderly Marketplace review rejects a package that has any. The release workflow builds the package itself.
5. Commit, push, and tag. The tag must equal the version (`v0.1.0` for `0.1.0`); the workflow checks this.

   ```bash
   cd ~/frogly-orderly && git tag v0.1.0
   cd ~/frogly-orderly && git push origin v0.1.0
   ```

## Path A: trusted publishing (no token)

Use this whenever npm lets you add a trusted publisher for the package.

1. Sign in at https://www.npmjs.com as the owner of the `@froglylabs` scope.
2. Open the package page for `@froglylabs/orderly-plugin`, then **Settings**.
3. Under **Trusted Publisher**, choose **GitHub Actions** and enter:
   - Organization or user: `froglylabs`
   - Repository: `frogly-orderly`
   - Workflow filename: `release.yml`
   - Environment: leave empty
4. Save. Push the tag (step 5 above). The workflow publishes with OIDC and npm attaches provenance automatically.
5. Afterwards, in the same **Settings** page under **Publishing access**, choose **Require two-factor authentication and disallow tokens**, and save.

## Path B: one-time first release with a short-lived token

Use this only if npm will not let you set up a trusted publisher before the package exists.

1. On https://www.npmjs.com go to your avatar, **Access Tokens**, **Generate New Token**, **Granular Access Token**.
   - Expiration: 1 day.
   - Packages and scopes: read and write, limited to the `@froglylabs` scope.
2. Copy the token. In GitHub open `froglylabs/frogly-orderly`, **Settings**, **Secrets and variables**, **Actions**, **New repository secret**. Name it `NPM_TOKEN` and paste the token.
3. Push the tag (step 5 above). The workflow publishes `0.1.0` with the token, with provenance.
4. Check the release at https://www.npmjs.com/package/@froglylabs/orderly-plugin.
5. Set up trusted publishing (Path A, steps 1 to 3).
6. Delete the token everywhere:
   - GitHub: **Settings**, **Secrets and variables**, **Actions**, delete `NPM_TOKEN`.
   - npm: **Access Tokens**, delete the token you made in step 1.
7. Disallow tokens: on the package **Settings** page under **Publishing access**, choose **Require two-factor authentication and disallow tokens**, and save.

Every later release uses Path A only.

## After a release

- After the npm publish succeeds, the workflow creates the GitHub release itself (job `github-release`), with the built-in `GITHUB_TOKEN`, so its author is github-actions. The title is the tag (`v0.1.0`) and the notes are that version's section of `CHANGELOG.md`; the job fails if the section is missing. Do not create releases by hand.
- Only that job can write to the repository (`contents: write`). The publish job has `contents: read` and `id-token: write`.
- Confirm the version and its provenance badge on the npm package page.
- Updating the Orderly Marketplace listing (`orderly-devkit submit`) is a separate, manual step done by a signed-in maintainer. It is not part of this workflow.
