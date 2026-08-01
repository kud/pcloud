# Changelog

## [1.0.0] - 2026-08-01

The API is settled and the code that can destroy data is covered by tests. That
is what the major version marks — not new features, but the point at which the
promises are ones I am willing to keep.

### Added

- **Tests.** This package holds `planRewind` and `applyRewind` — the only code
  here that restores deletions and reverts files — and had none. Twenty-seven
  now cover the rewind engine, path resolution, the share endpoints and
  credential handling.
- The rewind engine and the diff path resolver moved here from the CLI, so the
  CLI and the interactive browser share one implementation. Two bugs existed
  only because the browser had reimplemented logic the CLI already had right.

### Fixed

- **`listShares()` is typed as pCloud actually answers it** — two objects split
  by direction, never the flat array the type claimed. A `.forEach` on it
  typechecked and threw at runtime.
- **`removeShare` takes a `shareid`, not a `sharerequestid`.** It sent the
  latter, pCloud answered `Please provide 'shareid'.`, and nothing was ever
  removed.
- Test files were compiled into `dist/` and published; dev dependencies carried
  `^` ranges.

### Documentation

- The README was titled `@kud/pcloud-sdk`, a name this package has not used, and
  documented `listRewindFiles` and `restoreFromRewind` — which call an endpoint
  pCloud has never exposed. Replaced with the rewind engine that works, plus the
  authentication helpers, which were undocumented entirely.

[1.0.0]: https://github.com/kud/pcloud/compare/v0.6.0...v1.0.0

## [0.1.0] — 2026-04-19

### Added

- `PCloudAPI` class with full pCloud REST API coverage
- Username/password authentication and OAuth access token support
- File operations: copy, move, rename, delete, stat, get download link, checksum
- Folder operations: list, create, delete
- Revision management: list revisions, revert to revision
- Sharing: list, share folder, accept/decline/remove share requests
- Public links: create, list, delete for files and folders
- Zip link generation for multiple files/folders
- Trash: list and restore
- Rewind: list events and restore files
- Full TypeScript types for all API responses
