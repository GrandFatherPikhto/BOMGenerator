# REST API

Base URL: `/api`. JSON everywhere; import uses `multipart/form-data`. Errors
return `{ "error": "...", "details": [...] }` with an appropriate status code.

## Authentication

Optional and off by default. Users live in `auth.json` (`AUTH_FILE`), a file of
scrypt password hashes; when it is missing or has no users the API is open and
every request belongs to the implicit `default` user.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/me` | `{ authEnabled, username }` — always `200` |
| `POST` | `/auth/login` | `{ username, password }` → `200 { username }` + a signed `bom_session` cookie, else `401` |
| `POST` | `/auth/logout` | `204`, clears the cookie |

With users configured, every `/api/*` route except `/api/health` and
`/api/auth/*` requires the session cookie. Failed logins are limited in memory
(10 per 5 minutes per address).

Generate a hash with `npm run auth:hash` (asks for the user name and password)
and paste the printed object into the `users` array of `auth.json`.

## Boards

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/boards` | List boards (with `lineCount`) |
| `POST` | `/boards` | Create an empty board `{name, count?}` |
| `POST` | `/boards/import` | Import/re-import a CSV (multipart: `file`, `name`, `excludeDnp?`, `excludeFromBom?`, `targetBoardId?`, `renameSourceFile?`) |
| `GET` | `/boards/:id` | One board |
| `PUT` | `/boards/:id` | Update `{name?, count?, enabled?, inCommon?}` |
| `DELETE` | `/boards/:id` | Delete a board and its lines (service board not allowed) |
| `GET` | `/boards/:id/lines` | Grouped rows with calculated columns and totals |
| `GET` | `/boards/:id/export` | Export the purchase table (`?format=xlsx\|csv`) |
| `POST` | `/boards/:id/lines` | Add a manual line `{value, footprint?, qty?, reference?}` |
| `PUT` | `/boards/:id/lines/:lineId` | Update a line (product/`common`/`notPurchased`/`packsOverride`/`shippingCost`/`description`; manual lines may also change value/qty/footprint/reference) |
| `DELETE` | `/boards/:id/lines/:lineId` | Delete a line |

### Import response

```json
{
  "board": { "id": "…", "name": "Power-Board-v099", "sourceFile": "Power-Board-v099.csv", "count": 1 },
  "summary": { "added": 39, "updated": 0, "removed": 0, "total": 39 }
}
```

`409` responses carry a structured `details.code`:

- `SOURCE_FILE_MISMATCH` — the uploaded file name differs from the target
  board's remembered `sourceFile`; resend with `renameSourceFile=true` to confirm
  and remember the new name.
- `SOURCE_FILE_TAKEN` — the uploaded file name already belongs to another board.

### Board lines response

```json
{
  "board": { "id": "…", "name": "…", "count": 1 },
  "blocks": [
    { "kind": "category", "name": "КОНДЕНСАТОРЫ" },
    { "kind": "subcategory", "name": "Электролитические" },
    { "kind": "line", "line": {
        "id": "…", "reference": "C1", "value": "470uF 35V",
        "footprint": "Capacitor_THT:C_Radial…", "matchKey": "num|F|4.70e-4|35V\u0001capacitor_tht:…",
        "qty": 1, "totalQty": 1, "productId": null, "sellerId": null,
        "common": false, "notPurchased": false,
        "packsOverride": null, "packs": null,
        "shippingOverride": null, "shippingCost": null, "cost": null,
        "category": "Конденсаторы", "subcategory": "Электролитические" } }
  ],
  "totals": { "cost": 0, "shippingCost": 0 }
}
```

### Export

`GET /api/boards/:id/export?format=xlsx|csv` returns the board's purchase table
as a file (`Content-Disposition: attachment`). Columns: Категория, Подкатегория,
Обозначения, Наименование, Корпус/Footprint, Штук на плату, Плат, Итого, Общие,
Не закупается, Продавец, URL, В упаковке, Цена упаковки, Упаковок, Доставка,
Стоимость, Описание, plus an `ИТОГО` row (shipping and cost summed over the rows
that are neither `common` nor `notPurchased`).
The `Продавец` column holds the shop of the chosen product and `URL` its link
(the product URL, falling back to the shop URL).

`.xlsx` is built with ExcelJS (bold header, frozen header row, autofilter, number
format); `.csv` uses `;` as the delimiter with a UTF-8 BOM and comma decimals.

The same endpoint serves the manual "Докупить" list: it is the service board, so
its rows are exported through `/api/boards/:serviceId/export`.

## Sellers and products

A seller (shop) owns many products (offers). The shop holds `name` (unique),
`url` and `description`; packaging, price and delivery belong to a product.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sellers` | List shops with their `productCount` |
| `POST` | `/sellers` | Create `{name, url?, description?}` |
| `POST` | `/sellers/import/sheets` | Sheet names of an uploaded file (multipart: `file`) |
| `POST` | `/sellers/import` | Import shops and products (multipart: `file`, optional `sheet`) |
| `GET` | `/sellers/:id` | One shop |
| `PUT` | `/sellers/:id` | Update |
| `DELETE` | `/sellers/:id` | Delete the shop **and its products** (clears references) |
| `GET` | `/sellers/:id/products` | Products of one shop |
| `POST` | `/sellers/:id/products` | Create a product of that shop |

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/products` | All products with `sellerName`/`sellerUrl` (filter `?sellerId=`) |
| `GET` | `/products/categories` | Category names for the product form (sorted, de-duplicated) |
| `PUT` | `/products/:id` | Update `{name?, url?, packQty?, packPrice?, shippingCost?, category?, description?, footprint?}` |
| `DELETE` | `/products/:id` | Delete (clears the references in lines and overrides) |

```json
{
  "id": "…", "sellerId": "…", "sellerName": "AliExpress Store", "sellerUrl": "https://…/store/123",
  "name": "AD9707BCPZ", "url": "https://…/item/1.html",
  "packQty": 10, "packPrice": 3573, "shippingCost": 350,
  "category": "ЦАП", "description": "Самый дешёвый вариант", "footprint": ""
}
```

Validation (`400`): `name` is required, `packQty >= 1`, `packPrice >= 0`,
`shippingCost >= 0`.

`GET /products/categories` merges three sources and returns a sorted string
array: the categories already typed on products, the names of the categorisation
rules (`ParseCategory`) and the default category. Entries that differ only by
case are collapsed into one, and a rule name is used as the canonical spelling.
The field stays free-text in the UI, so anything new can be typed.

### Import

Accepts `.csv`, `.xlsx` and `.xlsm`. CSV encoding (UTF-8/UTF-16 by BOM, else
Windows-1251) and the delimiter (`,` / `;` / tab) are detected automatically.
For Excel the sheet is selected by name; when omitted the first sheet is used.
Columns are matched by header, extra columns are ignored and a leading title row
is tolerated. Two layouts are understood:

| Layout | Columns |
|--------|---------|
| Two-level (preferred) | `Продавец`, `URL продавца`, `Товар`, `URL товара`, `Кол-во в упаковке`, `Цена за упаковку`, `Категория`, `Описание` |
| Legacy (one row per shop item) | `Название`, `Категория`, `URL`, `Кол-во в упаковке`, `Цена за упаковку`, `Доставка`, `Описание` |

A legacy row creates a shop **and** a product with the same name and URL.

Rules: a shop is matched by name (only `url` is refreshed); a product is matched
by URL, otherwise by name inside its shop. Existing products get only `name`/
`url` updated — packaging, price, shipping, category and description are kept.
Duplicate rows inside the file keep the first one; rows without a shop or a
product name are skipped.

```json
{
  "summary": {
    "sellersCreated": 2, "sellersUpdated": 1,
    "added": 25, "updated": 3, "unchanged": 0, "skipped": 2, "total": 30
  },
  "warnings": ["Row 7: duplicate, keeping row 5"],
  "sheets": ["Продавцы"]
}
```

## Categories

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/categories` | List (ascending `order`) |
| `POST` | `/categories` | Create (validates patterns) |
| `PUT` | `/categories/:id` | Update (validates patterns) |
| `DELETE` | `/categories/:id` | Delete |

Invalid regex example response (HTTP 400):

```json
{ "error": "refPatterns[0] is not a valid regex (\"(unclosed\"): Invalid regular expression: …" }
```

## Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/settings` | Read the singleton |
| `PUT` | `/settings` | Update |

`PUT` accepts `defaultCategoryName`, `defaultSort`, `pageWidth`
(`normal` \| `wide` \| `full`), `subcategoryOtherLabel`, `excludeDnpByDefault`
and `excludeFromBomByDefault`.

## UI state

The per-user "working context" (selected board, page, filters, seller per board,
mode) that the screens remember between visits.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ui-state` | `{ version, sections }` of the current user |
| `PATCH` | `/ui-state` | Deep-merge `{ sections: { <name>: { … } } }`, return the whole state |

Only the known sections (`boards`, `purchases`, `common`, `manual`, `sellers`,
`categories`, `productPicker`, `footprints`) and their known, type-checked keys
are stored; anything else is dropped. The document is keyed by a user id (the
implicit default user for now), so it becomes per-account once authentication is
added.

## Common purchases

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/common-purchases?mode=merged\|by_board` | Aggregated rows with calculated columns and totals |
| `GET` | `/common-purchases/export?format=xlsx\|csv&mode=merged\|by_board` | Export the sheet as a file (`Content-Disposition: attachment`) |
| `PUT` | `/common-purchases` | Set override `{matchKey, productId?, packsOverride?, shippingCost?, notPurchased?}` |
| `PUT` | `/common-purchases/bulk` | Same override applied to `{matchKeys, changes}` at once (a footprint-grouped row) |
| `PUT` | `/common-purchases/:matchKey` | Same, for simple/encoded keys |

`by_board` adds a `byBoard` map to each row (`{"Board A": 2, "Board B": 3}`)
and a `boardNames` array to the response.

Only boards with **both** flags on (`enabled` and `inCommon`) contribute here.
A board can be switched on/off via `PUT /boards/:id` (`enabled`, `inCommon`);
this is the "common purchases" configurator driven from the "Платы" list.

A row whose footprint is marked for grouping carries `grouped: true`, its
`matchKeys` (for the bulk edit) and `names` (the values behind the row). The
`by_board` mode and the totals behave as usual.

`GET /common-purchases/export` returns the whole sheet (no filters, no
pagination) in the requested `mode`. Columns: Наименование,
Корпус/Footprint, Нужно всего, one column per board name in `by_board`, Позиции
(the names behind a grouped row), Продавец, Товар, Не закупается, В упаковке,
Цена упаковки, Упаковок, Доставка, Стоимость, plus an `ИТОГО` row (shipping and
cost summed over the rows that are not `notPurchased`). The file/sheet is named
«Общие закупки».

## Footprints

Footprints ("посадочные места") whose positions are collapsed by footprint only.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/footprints` | `{ footprints: [{footprint, positions, boards, totalQty, names, grouped}], groupedCount }` |
| `PUT` | `/footprints` | Set the flag `{footprint, grouped}` (an empty footprint is `400`) |

The list covers the enabled, non-service boards; an empty footprint is skipped
(it cannot be grouped). `GET /api/boards/all/lines` keeps such rows `grouped:
true` with their `names` and `lineIds`.

## Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | `{ "ok": true }` |
