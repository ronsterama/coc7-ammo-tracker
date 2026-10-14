# CoC7 Ammo Tracker

A Foundry VTT module for **Call of Cthulhu 7th Edition** (CoC7 system).
Reloading a firearm draws rounds from matching-calibre ammunition items in the
investigator's Gear, and shows the RAW reload time as a notification.

Full feature notes, the manual test checklist and settings are in
[`coc7-ammo-tracker/README.md`](coc7-ammo-tracker/README.md).

## Install

In Foundry's **Add-on Modules → Install Module**, paste this manifest URL:

```
https://github.com/ronsterama/coc7-ammo-tracker/releases/latest/download/module.json
```

Future versions show up under **Check for Update**.

## Repository layout

| Path | What it is |
|---|---|
| `coc7-ammo-tracker/` | The module itself (this is what gets zipped into each release) |
| `dev-harness/` | Mock-Foundry browser harness used to run the test checks |
| `macros/` | Helper macros, e.g. `tag-firearms.js` |
| `package.ps1` | Old Molten-hosting packaging script, no longer needed for releases |

## Releasing a new version

1. Commit and push your changes.
2. Push a tag: `git tag vX.Y.Z` then `git push origin vX.Y.Z`.
3. `.github/workflows/release.yml` creates the GitHub release, stamps the
   version and URLs into `module.json`, and attaches `module.zip`.
