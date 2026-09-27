# REST API

Base URL: `/api`. JSON everywhere; import uses `multipart/form-data`. Errors
return `{ "error": "...", "details": [...] }` with an appropriate status code.

## Boards

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/boards` | List boards (with `lineCount`) |
| `POST` | `/boards` | Create an empty board `{name, count?}` |
| `POST` | `/boards/import` | Import/re-import a CSV (multipart: `file`, `name`, `excludeDnp?`, `excludeFromBom?`) |
| `GET` | `/boards/:id` | One board |
| `PUT` | `/boards/:id` | Update `{name?, count?}` |
| `DELETE` | `/boards/:id` | Delete a board and its lines (service board not allowed) |
| `GET` | `/boards/:id/lines` | Grouped rows with calculated columns and totals |
| `GET` | `/boards/:id/export` | Export the purchase table (`?format=xlsx\|csv`) |
| `POST` | `/boards/:id/lines` | Add a manual line `{value, footprint?, qty?, reference?}` |
| `PUT` | `/boards/:id/lines/:lineId` | Update a line (seller/`common`/`shippingCost`/`description`; manual lines may also change value/qty/footprint/reference) |
| `DELETE` | `/boards/:id/lines/:lineId` | Delete a line |

### Import response

```json
{
  "board": { "id": "…", "name": "Power-Board-v099", "sourceFile": "Power-Board-v099.csv", "count": 1 },
  "summary": { "added": 39, "updated": 0, "removed": 0, "total": 39 }
}
```

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
        "qty": 1, "totalQty": 1, "sellerId": null, "common": false,
        "shippingCost": null, "packs": null, "cost": null,
        "category": "Конденсаторы", "subcategory": "Электролитические" } }
  ],
  "totals": { "cost": 0, "shippingCost": 0 }
}
```

### Export

`GET /api/boards/:id/export?format=xlsx|csv` returns the board's purchase table
as a file (`Content-Disposition: attachment`). Columns: Категория, Подкатегория,
Обозначения, Наименование, Корпус/Footprint, Штук на плату, Плат, Итого, Общие,
Продавец, URL, В упаковке, Цена упаковки, Упаковок, Доставка, Стоимость,
Описание, plus an `ИТОГО` row (shipping and cost summed over non-common rows).

`.xlsx` is built with ExcelJS (bold header, frozen header row, autofilter, number
format); `.csv` uses `;` as the delimiter with a UTF-8 BOM and comma decimals.

## Sellers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sellers` | List |
| `POST` | `/sellers` | Create |
| `POST` | `/sellers/import/sheets` | Sheet names of an uploaded file (multipart: `file`) |
| `POST` | `/sellers/import` | Import sellers (multipart: `file`, optional `sheet`) |
| `GET` | `/sellers/:id` | One |
| `PUT` | `/sellers/:id` | Update |
| `DELETE` | `/sellers/:id` | Delete (clears references) |

### Seller import

Accepts `.csv`, `.xlsx` and `.xlsm`. CSV encoding (UTF-8/UTF-16 by BOM, else
Windows-1251) and the delimiter (`,` / `;` / tab) are detected automatically.
For Excel the sheet is selected by name; when omitted the first sheet is used.
Columns are matched by header (`Название`/`name`, `Категория`, `URL`,
`Кол-во в упаковке`, `Цена за упаковку`, `Доставка`, `Описание`); extra columns
are ignored, and a leading title row is tolerated.

Rules: sellers are matched by URL; an existing seller gets only `name`/`url`
updated (packaging, price, shipping, category and description are kept); a new
seller is created with every column. Duplicate URLs inside the file keep the
first row. Rows without a URL or a name are skipped.

```json
{
  "summary": { "added": 25, "updated": 0, "unchanged": 0, "skipped": 2, "total": 27 },
  "warnings": ["Row 7: duplicate URL, keeping row 5"],
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

## Common purchases

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/common-purchases?mode=merged\|by_board` | Aggregated rows with calculated columns and totals |
| `PUT` | `/common-purchases` | Set override `{matchKey, sellerId?, shippingCost?}` |
| `PUT` | `/common-purchases/:matchKey` | Same, for simple/encoded keys |

`by_board` adds a `byBoard` map to each row (`{"Board A": 2, "Board B": 3}`)
and a `boardNames` array to the response.

## Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | `{ "ok": true }` |
