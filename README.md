# BOM Generator (MERN)

A personal, single-user web tool for turning **KiCad BOM CSV exports** into a
purchasing workbook: boards, sellers, editable categorisation rules and
"common purchases" — implemented as a MERN application (MongoDB, Express,
React, Node).

This is an independent project. It borrows only the **nominal-value parsing and
categorisation algorithms** from the original Python tool
([`python/bom_merge.py`](python/bom_merge.py)); the rest is new. See
[`techdocs/design.md`](techdocs/design.md) and
[`techdocs/plan-2026-09-27.md`](techdocs/plan-2026-09-27.md) for the original
design notes and the specification.

- [Features](#features)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Environment](#environment)
- [Scripts](#scripts)
- [Screens](#screens)
- [How it works](#how-it-works)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Design decisions and `TODO(confirm)`](#design-decisions-and-todoconfirm)
- [Known limitations](#known-limitations)

## Features

- **Import / re-import** KiCad BOM CSV exports. Re-import is keyed by the file
  name: the same file updates the existing board, refreshing quantities while
  keeping hand-filled seller/`Общие`/shipping values, removing disappeared rows
  and adding new ones (the API returns `{added, updated, removed}`).
- **Boards**: each board is an independent set of rows with its own quantity
  ("Плат в изделии", default 1).
- **Editable categorisation rules** (`ParseCategory`) stored in MongoDB:
  `prefix` / `regex` modes for both `Reference` and `Value`, subcategories by
  `footprintContains`, per-category sort. Editing a rule takes effect
  immediately on every board, without a restart or data migration.
- **Sellers** (`Seller`): packing quantity, package price, URL, description.
- **Seller import** from CSV or Excel (with sheet selection). Sellers are matched
  by URL: an existing one gets only its name/URL refreshed (packaging, price,
  shipping, category and description are kept); a new one is created with all
  columns of the file.
- **Calculated purchase columns** returned ready-made by the server
  (`totalQty`, `packs`, `cost`), never stored on the rows.
- **Common purchases**: virtual aggregation of every row marked `Общие` across
  all boards (accounting for each board's quantity), in `merged` or
  `by_board` modes. Seller/shipping set here survive re-imports.
- **"Докупить"**: a service board for positions bought outside any board.
- All values are entered and calculated on the server — no Excel formulas.

## Requirements

- **Node.js v24.21.0** (via `nvm`; [``.nvmrc`](.nvmrc) is provided):
  ```sh
  nvm install && nvm use
  ```
- **MongoDB 8.x** running locally:
  ```sh
  sudo systemctl start mongod   # and optionally: sudo systemctl enable mongod
  ```

## Quick start

```sh
nvm use
cp .env.example .env            # adjust MONGODB_URI if needed
npm install
npm run dev
```

`npm run dev` starts the Express API on `http://127.0.0.1:3000` and the Vite
dev server on `http://localhost:5173` (the client proxies `/api` to the API).
Open the Vite URL in a browser.

On first start the server seeds the default categorisation rules (ported from
the Python project) and creates the "Докупить" service board.

## Environment

| Variable | Default | Meaning |
|----------|---------|---------|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/bom-generator` | MongoDB connection string |
| `PORT` | `3000` | Express API port |
| `MONGODB_URI_TEST` | `mongodb://127.0.0.1:27017/bom-generator-test` | Base URI for integration tests (a per-process database is appended) |

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Express API + Vite dev server (via `concurrently`) |
| `npm run dev:server` | API only (`node --watch`) |
| `npm run dev:client` | Vite only |
| `npm run build` | Build the client into `dist/client` |
| `npm start` | Run the API in production (serves `dist/client` when `NODE_ENV=production`) |
| `npm run seed` | Insert the default categories/settings if empty |
| `npm run seed -- --reset` | Wipe and re-insert the default categories |
| `npm test` | All tests (`node:test`), API files run serially |
| `npm run test:unit` | Shared-module unit tests only |
| `npm run test:api` | API integration tests only |

## Screens

- **Платы** — board list, import dialog (file picker + drag-and-drop, board name,
  DNP / Exclude-from-BOM overrides), create/delete.
- **Экран платы** — grouped table with bold category/subcategory blocks,
  inline seller dropdown, `Общие` checkbox, shipping input, calculated columns
  and the "Итого" total (common rows excluded).
- **Общие закупки** — the same table with a `merged` / `by_board` toggle.
- **Докупить** — the service board: add/edit/delete manual positions.
- **Продавцы** — CRUD table plus import from CSV/Excel (sheet picker for XLSX,
  summary and warnings after import).
- **Категории разбора** — CRUD table; regex errors are shown in the form before
  saving.
- **Настройки** — default category/sort, subcategory label, DNP/BOM defaults.

## How it works

1. The client calls the Express API; Mongoose models store the data in MongoDB.
2. `POST /api/boards/import` parses the CSV (columns by name, UTF-8/BOM
   tolerant), filters DNP / Exclude-from-BOM rows, aggregates rows by
   `matchKey`, then upserts them and deletes the rows that disappeared.
3. `matchKey` is the normalised nominal value plus the normalised footprint; it
   is used for re-import matching and for the common-purchases grouping.
4. Listing a board re-resolves categories from the current `ParseCategory`
   documents, groups rows into blocks, sorts them and computes `totalQty`,
   `packs` and `cost` on the fly.

See [`docs/architecture.md`](docs/architecture.md) for diagrams.

## Testing

```sh
npm test
```

- Unit tests for the shared module (`tests/shared`) cover the parser and
  categoriser, including the acceptance vectors from the specification
  (`"4K7" == "4.7K"` by match key, `"2.2 uF" != "2.2 uF 25V"`, unparsed part
  numbers, regex modes, invalid regex rejection).
- API integration tests (`tests/api`) run against a real local MongoDB and
  cover import/re-import, hand-filled value preservation, common purchases and
  the "Докупить" board.

## Project structure

| Path | What it is |
|------|------------|
| [`src/shared/`](src/shared) | Framework- and dependency-free domain code: value parser, categoriser, sorting (JS port of the Python algorithms) |
| [`src/server/`](src/server) | Express API, Mongoose models, services |
| [`src/client/`](src/client) | React (Vite) user interface |
| [`tests/`](tests) | Node test-runner suites (shared + API) |
| [`scripts/`](scripts) | `seed.js`, `acceptance.js` |
| [`docs/`](docs) | Architecture, data model, API reference |
| [`techdocs/`](techdocs) | Working notes/examples (planned to be git-ignored later) |
| [`python/`](python) | Original Python project (reference only) |

## Design decisions and `TODO(confirm)`

1. **"Докупить"** is a service `Board` with `sourceFile` omitted (the unique
   index is `sparse`). It is created automatically, cannot be deleted and
   participates in common purchases like any other board.
2. **DNP / Exclude-from-BOM** are global `Settings` defaults with per-import
   checkboxes in the import dialog (both default to *exclude*).
3. **Calculated fields** (`totalQty`, `packs`, `cost`) are computed on every
   request and never stored.
4. **`matchKey`** is category-independent: parsed values are normalised
   (unit + magnitude + suffix), unparsed values keep their spelling. This is
   required for acceptance criterion 4 (`"4K7"` and `"4.7K"` must produce the
   same key) and keeps hand-filled values stable when categorisation rules
   change. It is a slight refinement of the plan's wording.
5. **Client tables** are built with MUI components (custom grouped rendering),
   not a table library; the requirement is about behaviour, not a package.
6. **Tests use the local MongoDB** (a per-process test database is created and
   dropped) instead of `mongodb-memory-server`.

## Known limitations

- CSV export back to Excel/CSV is out of scope for now.
- No authentication (intended for a single user on a local network).
- A `Footprint` cell listing several packages is kept as one row (the KiCad
  `Qty` is an aggregate and cannot be split reliably).
- Bare capacitor shorthand such as `100n` is read as `100 nΩ` (same behaviour
  as the Python original).
- `INDEX`-style formulas are not produced; all money is calculated on the server.
