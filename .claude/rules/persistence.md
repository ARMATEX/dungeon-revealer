---
paths:
  - "server/**/*database*"
  - "server/**/*migration*"
  - "server/**/*maps*"
  - "server/**/*file-storage*"
  - "server/**/*notes-db*"
  - "server/**/*settings*"
  - "server/**/*token-image-db*"
---

# Persistence Rules

- Two storage models coexist: SQLite (`db.sqlite`: `file_uploads`, `notes`, `notes_search` FTS5,
  `tokenImages`) and the filesystem (`maps/<id>/` folders, `files/` uploads, `settings.json`).
  Know which one you are touching before changing it.
- Schema changes require a NEW migration file in `server/migrations/` that bumps `PRAGMA user_version`
  and is appended to the fall-through switch in `server/database.ts`. Never edit an existing
  migration — data dirs in the wild already ran it.
- Migrations and format changes must be backward-compatible with existing data directories and paired
  with a backup strategy. Back up the whole data dir (DB + `maps/` + `files/` + `settings.json`).
- Maps are loaded into memory at boot and mirrored to disk; mutate them only through the `Maps` API
  and its serialized task processor, keeping `fog.progress.png` (DM) and `fog.live.png` (players)
  consistent.
- DB rows store relative paths into `files/`. Preserve that contract; resolve/validate paths so they
  stay inside the storage directory (no `..` traversal).
- Never open or modify a user's real `db.sqlite` from a dev task; reason from the schema code instead.
