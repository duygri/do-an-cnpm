# Admin Revenue Statistics Design

## Goal

Give the shop owner an internal revenue summary in the unified management portal. This is an MVP operations report, not a tax invoice or accounting statement.

## Access

- Add a revenue statistics module to the employee management portal.
- Only `admin` can view it. `manager` and customers cannot access its API or page.
- The backend authorization guard is the security boundary; frontend navigation and route checks are supplementary.
- This is part of the single management portal on port `5175`, not a separate portal.

## Revenue definition

- Count orders whose `payment_status` is `paid` and whose order `status` is not `cancelled`.
- Attribute revenue to `payment_confirmed_at`, converted to `Asia/Ho_Chi_Minh` before grouping by calendar date. This works for both COD confirmation and PayOS settlement.
- Sum `sales_order.total_amount`, which is the amount charged to the customer after discount and includes the recorded shipping fee. Label the measure as collected order amount so it is not mistaken for merchandise-only revenue or a statutory accounting figure.
- Do not count unpaid orders, cancelled orders, import/purchasing amounts, or invoice rows. Invoices are a one-to-one record of paid orders and must not be summed separately.
- The system has no refunds, returns, or tax-invoice lifecycle in this MVP; this report does not claim to calculate those accounting adjustments.

## API

Expose `GET /admin/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD` behind employee JWT and admin-only role checks.

- Both dates are required valid calendar dates, interpreted in `Asia/Ho_Chi_Minh`.
- `to` must be on or after `from`; a requested range may span at most 366 calendar days.
- Return decimal money as strings, never JavaScript floating-point values.
- Return a continuous daily series including zero-activity dates.
- Response shape:

```json
{
  "from": "2026-10-01",
  "to": "2026-10-03",
  "timezone": "Asia/Ho_Chi_Minh",
  "paidOrderCount": 2,
  "collectedAmount": "1250000.00",
  "daily": [
    { "date": "2026-10-01", "orderCount": 1, "amount": "500000.00" },
    { "date": "2026-10-02", "orderCount": 0, "amount": "0.00" },
    { "date": "2026-10-03", "orderCount": 1, "amount": "750000.00" }
  ]
}
```

## Management UI

- Add an admin-only “Thống kê doanh thu” entry and protected route to the unified management panel.
- Default the date range to the current calendar month in Vietnam time; allow admins to change both dates within the API range.
- Show the collected amount, paid order count, and daily amounts. Keep the daily visualization accessible and usable without adding a chart dependency; pair bars with an exact-value table/list.
- Managers do not see the menu item and direct navigation is denied.

## Verification

- Backend integration tests prove the report sums paid, non-cancelled orders by payment-confirmed Vietnam date, includes empty dates, and denies manager/customer/anonymous callers while allowing an admin.
- Validation tests cover invalid calendar dates, reversed ranges, and ranges longer than 366 days.
- Frontend tests prove only admins can navigate to the report, its request uses the selected dates, and totals render from decimal-string API values.
- Existing COD, PayOS webhook, invoice, order, and customer behavior remains unchanged.
