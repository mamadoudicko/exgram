# Releasing exgram

Delivery is **commit-based**. There is no npm/registry publish. The installable
skill lives in [`skills/exgram/`](skills/exgram/) (a subdirectory so the CLI
ships the **full** runtime — a root-level `SKILL.md` would ship only `SKILL.md`).

Any push to the default branch (`main`) is delivered to users on their next:

```bash
npx skills update exgram
```

## Release checklist

1. Bump the version in **lockstep** — both must match:
   - `skills/exgram/package.json` → `version`
   - `skills/exgram/SKILL.md` → frontmatter `metadata.version`
2. Update `CHANGELOG.md` with the new version and notes.
3. Commit, then tag and push:

   ```bash
   git tag vX.Y.Z
   git push origin main --tags
   ```

That's the whole release. The next `npx skills update exgram` picks it up.

> The two versions MUST stay equal. `skills/exgram/lib/serve.mjs` reports the
> `package.json` version at `/whoami`; `SKILL.md` `metadata.version` is what the
> skills CLI records. A mismatch makes updates confusing to diagnose.
