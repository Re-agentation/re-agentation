# Changesets

This directory is used by [changesets](https://github.com/changesets/changesets) to track unreleased changes.

When you make a user-visible change to one of the packages, run:

```bash
pnpm changeset
```

Pick the affected package(s), the bump type (patch / minor / major), and write one line describing the change. Commit the generated `.changeset/*.md` file with your PR.

CI handles the rest: on merge to `main`, a "Version Packages" PR is auto-opened. Merging that PR publishes to npm.
