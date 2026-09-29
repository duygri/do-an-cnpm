# Remove Inventory Tracking Design

## Goal

Keep the approved sales, purchase-document, and packing workflows while removing inventory tracking from the application and current database schema.

## Approved scope

- Keep `Supplier`, `StockImport`, and `ImportDetail`. Import documents continue to record purchased quantities and prices, but are not used to calculate availability or alter a stock balance.
- Remove the inventory movement ledger, employee inventory endpoints, and all application dependencies on stock movements.
- Keep the customer order API and admin order list/detail/pack APIs. Preserve the current packing MVP: a packing row is created only when an employee packs an order; `packingType` remains optional; package weight and packing fee remain out of scope.
- Keep the existing order and import line quantities as transaction/document fields. They do not represent an available-stock balance.

## Application behavior

### Customer orders

- Order creation still requires an active product, a valid customer, and valid variant IDs. It calculates and stores order/detail prices and requested quantities.
- Remove variant locking that exists only to coordinate inventory changes, all balance reads and insufficient-stock errors, and all sale movement writes. An order can be placed without the system checking a remaining quantity.
- Customer cancellation remains pending-only and continues to lock the order row so it serializes with the employee packing action. Cancellation changes order status only; it does not create an inventory restoration movement.

### Purchase documents

- Keep supplier and import endpoints and their database tables.
- Import creation continues to validate supplier/variant references and save the import header and details atomically. It no longer locks variants for inventory or writes import movements.
- Import detail quantities describe the purchase document only. The application does not derive a sellable quantity from them.

### Removed inventory surface

- Remove `InventoryModule`, its routes/service/entity/DTOs, and imports of `InventoryService` or `InventoryMovement` from other modules.
- Remove all inventory/stock-balance API documentation and ledger-based claims from the README, ERD, and affected design documents.
- The existing `/inventory/...` routes will no longer be registered.

## Database and migrations

- Do not rewrite migration files that may already be applied. Add a forward migration after the current latest migration that drops `inventory_movement` and its owned indexes, constraints, and foreign keys by dropping the table.
- Keep `supplier`, `stock_import`, and `import_detail`; their foreign keys remain independent of the removed ledger.
- The migration discards existing `inventory_movement` rows. This is part of the approved removal; it does not delete sales orders, order details, imports, or import details.
- The migration's rollback recreates the ledger schema as it exists after all currently applied migrations, including the customer/order columns, constraints, foreign keys, and indexes added by the customer-order migration. It cannot restore deleted movement rows; this limitation must be explicit in the migration documentation and README.
- A fresh database still runs the immutable historical migrations, then the new removal migration, and ends with no `inventory_movement` table.

## ERD and documentation

- Use the originally supplied ERD as the baseline for retained entities, while removing `INVENTORY_MOVEMENT` and its relationships/rules.
- Preserve later approved order behavior and API requirements, including the order's recipient/shipping snapshot fields and the current packing MVP. These remain necessary for the implemented storefront and packing endpoints.
- Document that inventory availability is not tracked: order quantities are not checked against a balance, and imports do not replenish a computed balance.
- Keep shipping fees separate from packing. Do not add package weight or a packing fee.

## Superseded design documents

The following approved documents describe behavior that this design replaces. Keep their original decision history, but add a prominent supersession notice linking to this design and clarifying which inventory behaviors no longer apply:

- `2026-09-27-supplier-import-inventory-design.md`: retain supplier/import document APIs and calculations; supersede the ledger, inventory endpoints, balances, adjustments, and import movement writes.
- `2026-09-28-customer-order-placement-design.md`: supersede stock availability validation, sale movement creation, and stock restoration movements on cancellation.
- `2026-09-28-admin-order-processing-design.md`: supersede statements that an existing stock ledger is preserved and that cancellation restores stock; keep its admin order and packing contract.

## Validation and verification

- Run formatting, TypeScript build, ESLint, migration status, and diff checks.
- Apply the forward migration to the configured local development database and confirm all migrations show applied.
- Do not add or run automated tests under the current approved scope.
- Do not run migration rollback as a test. Review its schema recreation and data-loss limitation statically.

## Out of scope

- Purchase return workflows, sales availability, reservations, or stock forecasting.
- Editing or deleting historical sales/import records.
- Promotion, invoice, and payment implementation not already present in the current backend.
