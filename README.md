# BOM Generator (MERN)

A personal, single-user web tool for turning **KiCad BOM CSV exports** into a
purchasing workbook: boards, sellers, editable categorisation rules and
"common purchases" — implemented as a MERN application (MongoDB, Express,
React, Node).

This is an independent project. It borrows only the **nominal-value parsing and
categorisation algorithms** from the original Python tool; the rest is new. The
original design notes and the Python reference live in `techdocs/` and `python/`,
kept as git-ignored local working documents.

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
  keeping hand-filled product/`Общие`/packages/shipping values, removing
  disappeared rows and adding new ones (the API returns
  `{added, updated, removed}`). When the export is renamed (a new board
  revision), the import dialog requires picking the board to update explicitly;
  a file name that differs from the remembered one is blocked with a red warning
  until confirmed, after which the new name is remembered for later imports.
- **Boards**: each board is an independent set of rows with its own quantity
  ("Плат в изделии", default 1).
- **Editable categorisation rules** (`ParseCategory`) stored in MongoDB. A rule
  may constrain **Reference**, **Value** and/or **Footprint**; when more than one
  is set, all must match (AND). Each condition supports `prefix` / `regex`
  (`Footprint` also `contains`), with an optional "case sensitive" flag.
  Subcategories by `footprintContains`, per-category sort. Editing a rule takes
  effect immediately on every board, without a restart or data migration.
- **Sellers → products (1:N)**. A seller (`Seller`) is a shop: name, URL (may be
  empty), description. A product (`SellerProduct`) carries name, URL, packing
  quantity, package price, **delivery**, a category hint, a footprint and a
  description. A purchase row references a product and the shop is derived from
  it; the row delivery is its own value, otherwise the product's.
- **Import of sellers and products** from CSV or Excel (with sheet selection).
  Two layouts are accepted: the two-level one (`Продавец`, `URL продавца`,
  `Товар`, `URL товара`, `Кол-во в упаковке`, `Цена за упаковку`, `Категория`,
  `Описание`) and the legacy one (`Название`, `Категория`, `URL`,
  `Кол-во в упаковке`, `Цена за упаковку`, `Доставка`, `Описание`) where a row
  creates a shop and a product with the same name and URL. A product is matched
  by URL, otherwise by name inside its shop; an existing one gets only its
  name/URL refreshed (packaging, price, delivery and description are kept).
- **Calculated purchase columns** returned ready-made by the server
  (`totalQty`, `packs`, `shippingCost`, `cost`), never stored on the rows.
- **Common purchases**: virtual aggregation of every row marked `Общие` across
  all boards (accounting for each board's quantity), in `merged` or
  `by_board` modes. Product/packages/shipping set here survive re-imports.
- **"Не закупается"**: a position can be marked as not purchased in the "Закупки"
  tables (including "Все"), "Общие закупки" and "Докупить". Such rows are left
  out of the totals (and of the aggregated purchase). The filter bar offers a
  row-mode combobox: "Все" (default — every row), "Не закупается" (only the
  flagged ones), "Не заполнено" (no seller/product, neither "Общие" nor "Не
  закупается") and "Только общие" (the board tab only). On a board a row marked
  `Общие` takes the flag from the common sheet (read-only there); on the "Все"
  tab it applies to every line behind the row. The export gains a "Не закупается"
  column, and while the flag is on the seller and product pickers of the row are
  disabled.
- **"Докупить"**: a service board for positions bought outside any board.
- **Common-purchases configurator**: each board has two flags on the "Платы"
  list — "Включено" (participates in the app) and "В общих закупках"
  (contributes to the common sheet). Only enabled boards appear in the "Закупки"
  selector; the common sheet uses boards where both flags are on.
- **Per-position note** ("Описание"): free text kept across re-imports, edited on
  the "Закупки" tab.
- **Export** the purchase table of a board to Excel (`.xlsx`) or CSV from the
  "Закупки" tab.
- **JSON database dump**: `npm run dump` writes every collection to one file
  (`./backups/dump-YYYYMMDD-HHmmss.json`), and
  `npm run restore -- <file> --yes` replaces the data from it.
- **Configurable page width** (Settings → "Ширина страницы"): normal, wide or
  full — applied to every page right after saving.
- **Product links**: a small link next to the chosen product opens the offer page
  in a new tab (the shop page when the offer has no URL).
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
| `npm run migrate` | One-off idempotent "seller → seller + product" migration (also runs at startup) |
| `npm run dump` | Dump every collection to `./backups/dump-YYYYMMDD-HHmmss.json` (path optional) |
| `npm run restore -- <file> --yes` | Replace the data from a dump (`--yes` skips the confirmation) |
| `npm test` | All tests: `node:test` (shared + server + API) then Vitest (client) |
| `npm run test:node` | `node:test` suites only (shared, server helpers, API) |
| `npm run test:unit` | Unit tests only (shared + server helpers) |
| `npm run test:api` | API integration tests only |
| `npm run test:client` | Client tests (Vitest + jsdom) |
| `npm run test:coverage` | `node:test` coverage for shared/server/API |
| `npm run test:coverage:client` | Vitest coverage for `src/client` |
| `npm run lint` | ESLint over the whole repository |
| `npm run format` | Prettier write (`format:check` to verify) |

## Screens

- **Платы** — board list with the "Включено" / "В общих закупках" checkboxes,
  import dialog (file picker + drag-and-drop, board name, DNP /
  Exclude-from-BOM overrides), create/delete.
- **Закупки** — the editable purchase table of a board picked in the header:
  "Плат в изделии", a "Продавец" filter for the list, the searchable "Товар"
  picker, inline `Общие` / "Не закупается" / packages / shipping / note editing,
  the "Итого" that excludes "Общие" and "Не закупается" rows, the "Показывать не
  закупаемые" filter toggle, and **Excel/CSV export**.
- **Экран платы** — read-only BOM view: name, footprint, quantity, total and the
  note; purchase data (seller, `Общие`, shipping, cost) is not shown here.
  Reference designators are revealed per row with an arrow (collapsed by default).
- **Общие закупки** — the same table with a `merged` / `by_board` toggle.
- **Докупить** — the service board: add/edit/delete manual positions.
- **Продавцы/Товары** — master-detail: the shop list on the left, the products of the
  selected shop on the right (CRUD with paging), plus import from CSV/Excel
  (sheet picker for XLSX, summary and warnings after import). Above the table
  there is a filter by **name** and by **category** (each field has a "регекс"
  checkbox; an empty field means "no condition", both mean AND). The table has
  two modes: **"Товары магазина"** — the products of the selected shop (no
  "Продавец" column) and **"Поиск по всем магазинам"** — a search over the whole
  catalogue, with a "Продавец" column whose shop name is a link: clicking it opens
  that shop and returns the table to the shop mode. A product
  category is picked from a dropdown built from the categories already typed and
  the "Категории разбора" names, and a new one can still be typed.
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
   `packs`, `shippingCost` and `cost` on the fly.
5. At startup (and via `npm run migrate`) an idempotent migration converts the
   previous model once: every shop gets a product, the references in rows and
   overrides move to `productId` and the stale shop fields are dropped. A second
   run changes nothing.

See [`docs/architecture.md`](docs/architecture.md) for diagrams.

## Testing

```sh
npm test
```

- Unit tests for the shared module (`tests/shared`) and the server helpers
  (`tests/server`) cover the parser, the categoriser (including the acceptance
  vectors `"4K7" == "4.7K"` and `"2.2 uF" != "2.2 uF 25V"`), the seller/product
  import parsers and the purchase calculations.
- API integration tests (`tests/api`) run against a real local MongoDB and
  cover import/re-import, hand-filled value preservation, common purchases, the
  "Докупить" board, exports and the validation edge cases.
- Client tests (`tests/client`, Vitest + jsdom) cover number formatting, the
  thin API client and the pagination hook.
- `npm run lint` runs ESLint; CI runs it together with the whole test suite.

## Project structure

| Path | What it is |
|------|------------|
| [`src/shared/`](src/shared) | Framework- and dependency-free domain code: value parser, categoriser, sorting (JS port of the Python algorithms) |
| [`src/server/`](src/server) | Express API, Mongoose models, services |
| [`src/client/`](src/client) | React (Vite) user interface |
| [`tests/shared/`](tests/shared) | `node:test` unit tests for the domain module |
| [`tests/server/`](tests/server) | `node:test` unit tests for server-side helpers |
| [`tests/api/`](tests/api) | `node:test` API integration tests (need MongoDB) |
| [`tests/client/`](tests/client) | Vitest + jsdom tests for the React layer |
| [`scripts/`](scripts) | `seed.js`, `migrate.js`, `dump.js`, `restore.js`, `acceptance.js`, `inspect.local.mjs` |
| [`docs/`](docs) | Architecture, data model, API reference |
| `techdocs/`, `python/` | Git-ignored local working notes and the original Python project |

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
- Multi-document writes (import/re-import, board deletion, seller deletion) are
  **not transactional**: a failure mid-way can leave a partially applied change.
  This is a deliberate trade-off for standalone MongoDB; run a replica set and
  the operations can be wrapped in sessions/transactions.
- A `Footprint` cell listing several packages is kept as one row (the KiCad
  `Qty` is an aggregate and cannot be split reliably).
- Bare capacitor shorthand such as `100n` is read as `100 nΩ` (same behaviour
  as the Python original).
- `INDEX`-style formulas are not produced; all money is calculated on the server.
