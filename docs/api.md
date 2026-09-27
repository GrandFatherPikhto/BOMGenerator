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
| `PUT` | `/boards/:id` | Update `{name?, count?, enabled?, inCommon?}` |
| `DELETE` | `/boards/:id` | Delete a board and its lines (service board not allowed) |
| `GET` | `/boards/:id/lines` | Grouped rows with calculated columns and totals |
| `GET` | `/boards/:id/export` | Export the purchase table (`?format=xlsx\|csv`) |
| `POST` | `/boards/:id/lines` | Add a manual line `{value, footprint?, qty?, reference?}` |
| `PUT` | `/boards/:id/lines/:lineId` | Update a line (product/`common`/`packsOverride`/`shippingCost`/`description`; manual lines may also change value/qty/footprint/reference) |
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
        "qty": 1, "totalQty": 1, "productId": null, "sellerId": null, "common": false,
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
Продавец, URL, В упаковке, Цена упаковки, Упаковок, Доставка, Стоимость,
Описание, plus an `ИТОГО` row (shipping and cost summed over non-common rows).
The `Продавец` column holds the shop of the chosen product and `URL` its link
(the product URL, falling back to the shop URL).

`.xlsx` is built with ExcelJS (bold header, frozen header row, autofilter, number
format); `.csv` uses `;` as the delimiter with a UTF-8 BOM and comma decimals.

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

## Common purchases

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/common-purchases?mode=merged\|by_board` | Aggregated rows with calculated columns and totals |
| `PUT` | `/common-purchases` | Set override `{matchKey, productId?, packsOverride?, shippingCost?}` |
| `PUT` | `/common-purchases/:matchKey` | Same, for simple/encoded keys |

`by_board` adds a `byBoard` map to each row (`{"Board A": 2, "Board B": 3}`)
and a `boardNames` array to the response.

Only boards with **both** flags on (`enabled` and `inCommon`) contribute here.
A board can be switched on/off via `PUT /boards/:id` (`enabled`, `inCommon`);
this is the "common purchases" configurator driven from the "Платы" list.

## Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | `{ "ok": true }` |
