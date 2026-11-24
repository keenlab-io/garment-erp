# Reports

This chapter is for anyone who reads figures in Garment ERP: the owner or general manager checking the business at a glance, the accountant pulling tax and cost figures, and sales and warehouse staff following their own numbers. It covers the overview dashboard you see when you sign in, the five domain dashboards, the report catalog and report viewer, filtering, exporting to PDF, Excel or CSV, and emailed report schedules. It ends with a table of who sees which reports.

Reports live under **Reports** (รายงาน) in the main menu. The overview lives on the **Dashboard** (แดชบอร์ด) home page.

| Menu entry | Thai label | What it is for |
|---|---|---|
| **Dashboard** | แดชบอร์ด | The overview you land on after signing in |
| **Reports → Reports catalog** | รายการรายงาน | Every report you are allowed to open, grouped by area |
| **Reports → Inventory dashboard** | แดชบอร์ดคลังสินค้า | Stock balance, low stock, dead stock, stock movement |
| **Reports → Sales dashboard** | แดชบอร์ดการขาย | Sales overview, top products, sales by customer, document status |
| **Reports → Cost dashboard** | แดชบอร์ดต้นทุน | Monthly cost of goods sold, cost variance, stock valuation |
| **Reports → Profit dashboard** | แดชบอร์ดกำไร | Margin by item, profit by order, net profit estimate |
| **Reports → Tax dashboard** | แดชบอร์ดภาษี | PP.30 output tax and customer (AR) aging |
| **Reports → Report schedules** | ตารางส่งรายงาน | Reports emailed automatically every day or week |

You only see the dashboards and reports your role allows. Anything you are not allowed to see is left out of the menu altogether.

## The overview dashboard

The **Overview** (ภาพรวม) is the first screen after signing in, and the owner's daily glance at the business. It has three parts:

1. **Headline cards.** There is one card for each area you can see (inventory, sales, cost, profit, tax), each showing the key total for that area.
2. **Sales trend.** A chart of sales over time.
3. **Alerts.** Things that need attention now, each labelled with where it comes from:

| Alert source | What triggers it |
|---|---|
| **Stock** | An item has fallen below its minimum stock level. The alert shows on-hand against the minimum. |
| **Production** | A work-order step is running late. |
| **Finance** | A customer has a balance more than 90 days overdue. |

Click **View** on an alert to go to the item, work order or customer concerned. When there is nothing to act on, the panel says "No alerts — everything's on track."

> **Note:** If you see "No report access yet — ask an admin to grant a reporting permission.", your role has no reporting rights. Ask your system administrator (see [Admin & Access](06-admin-access.md#roles-and-permissions)).

> **Tip:** The dashboards update on their own a few seconds after stock or sales are recorded. You do not need to run anything.

## Domain dashboards

Each domain dashboard shows one panel for every report in its area. A panel has a headline figure and, where the data suits it, a **Trend** chart.

### Open a dashboard

1. Open **Reports** and choose a dashboard, for example **Sales dashboard**. You can also open **Reports → Reports catalog** and click a dashboard under **Dashboards**.
2. Read each panel's headline figure and chart.
3. To see the rows behind a panel, click **View report** on it. The full report opens in the report viewer.

### Filter by clicking a chart

You can narrow a whole dashboard to one period with a single click.

1. Click a bar, point or slice on a chart, for example this month on the sales trend.
2. Every panel on the dashboard re-filters to the same period. A filter chip such as "Month: 2026-10" appears under **Active filters**.
3. Click **View report** on any panel. The report opens already filtered to the same period.
4. To go back to the full figures, click the chip's remove button or **Clear**.

The same click-to-filter works on the overview's sales trend.

### Cost and profit figures

Cost and profit are sensitive, so they have an extra safeguard. To see real figures on the **Cost dashboard** and **Profit dashboard**, your role needs both the report permission and cost visibility. Without cost visibility, the figures show a lock with "Restricted — requires cost access", and the cost and profit reports are left out of the catalog.

## The report catalog and viewer

### Find a report

1. Open **Reports → Reports catalog**.
2. Reports are grouped by area under the dashboard names. Click a report's name to open it.

The full catalog:

| Area | Reports |
|---|---|
| Inventory | **Stock balance**, **Stock movement**, **Low stock**, **Dead stock** |
| Sales | **Sales overview**, **Top products**, **Sales by customer**, **Document status** |
| Cost | **Monthly COGS**, **Cost variance**, **Stock valuation** |
| Profit | **Margin by item**, **Profit by order**, **Net profit estimate** |
| Tax | **PP.30 output tax**, **AR aging** |

> **Tip:** You can also jump to a report or dashboard from the search box at the top of the screen. See [Getting started](00-getting-started.md#the-command-palette).

### Read a report

The report viewer shows the report as a table with a **Total** row where it applies.

- Where a row is about an item or a customer, open the row actions and choose **View detail** to go to that item or customer record.
- If the filters return nothing, the table says "No rows for this selection."

### Filter by date

1. Enter a **From** date.
2. Enter a **To** date.
3. The report reloads for that date range.

If you arrived from a dashboard with a period chip applied, typing your own From or To date replaces the chip with your dates. Click **Clear** under **Active filters** to remove a chip.

## Exporting a report

You can take any report out of the system as a PDF, Excel or CSV file. The file is prepared in the background, so you can keep working.

1. Open the report in the report viewer.
2. Next to **Export**, click **PDF**, **EXCEL** or **CSV**.
3. A message "Generating PDF export…" appears in the corner of the screen.
4. When it changes to "Export ready", click **Download** in the message to save the file.

If the message says "Export failed", try again. If it keeps failing, contact support.

> **Warning:** The download link is offered only in the "Export ready" message. There is no export history page. If you close the message before downloading, run the export again.

> **Note:** Current limitation: the exported file does not apply the From/To dates or chart filter you set on screen. It contains the report's standard range. Check the dates in the file, and filter in Excel if you need a narrower period.

## Scheduled reports by email

A report schedule emails a chosen report as an attachment to a list of people every day or every week, so managers get figures without signing in.

### Create a schedule

1. Open **Reports → Report schedules**.
2. Under **New schedule**, enter a **Schedule name**, for example "Weekly stock digest".
3. Choose the **Report**, for example **Stock balance**.
4. Choose the **Frequency**: **Every day** or **Weekly**.
5. For a weekly schedule, choose the **Day of week**, for example **Monday**.
6. Set the **Time**, for example 08:00.
7. Under **Recipients**, type an email address and click **Add**. Repeat for each recipient. To remove one, click the remove button next to the address.
8. Choose the **Format**: **PDF**, **EXCEL** or **CSV**.
9. Make sure **Active** is switched on.
10. Check the summary line, for example "Sends Every Monday 08:00".
11. Click **Save schedule**. The message "Schedule saved" confirms it.

A schedule cannot be saved without a name and at least one recipient.

The saved schedule appears under **Schedules**, showing its name, an **Active** or **Inactive** badge, the report, the cadence, the format and the recipients.

### Send a schedule now

To check that a schedule works, or to send an extra copy:

1. Under **Schedules**, find the saved schedule.
2. Click **Run now** on it. The message "Sending "Weekly stock digest" now…" appears, then "Digest sent".
3. If it says "Digest send failed", click **Retry**.

Each email has the subject "Report digest:" followed by the schedule name, with the report attached in the chosen format.

> **Tip:** After creating a schedule, use **Run now** and check that the email arrives, with the right attachment, in a recipient's inbox. Also check that the first scheduled email arrives at the time you expect. If the time is off, contact support.

### Change, pause or delete a schedule

1. Choose **Edit** on the schedule. The form fills in with its current settings.
2. Change what you need. To pause the schedule without losing it, switch **Active** off.
3. Click **Save schedule**, or **Cancel edit** to leave it unchanged.

To delete a schedule:

1. Choose **Delete** on the schedule.
2. Read the confirmation. It says deleting stops the schedule's digest emails.
3. Confirm. The message "Schedule deleted" confirms it.

**Who can do this:** staff with schedule management (`report.schedule.manage`). Other users do not see **Report schedules** at all.

> **Warning:** A schedule emails the report to anyone on its recipient list, including people who could not open that report in the system themselves. Add only recipients who are entitled to the figures, especially for cost, profit and tax reports.

## Who sees which reports

What you see depends on the permissions in your role. Your system administrator sets them in the permission matrix (see [Admin & Access](06-admin-access.md#roles-and-permissions)).

| To see | Your role needs |
|---|---|
| Inventory dashboard and inventory reports | Inventory reports (`report.inventory.view`) |
| Sales dashboard and sales reports, and the customer aging screen under Sales | Sales reports (`report.sales.view`) |
| Cost dashboard and cost reports | Cost reports (`report.cost.view`) **and** cost visibility (`inventory.cost.view`) |
| Profit dashboard and profit reports | Profit reports (`report.profit.view`) **and** cost visibility (`inventory.cost.view`) |
| Tax dashboard and tax reports | Tax reports (`report.tax.view`) |
| Report schedules | Schedule management (`report.schedule.manage`) |

These are the recommended report rights for the standard roles described in [Admin & Access](06-admin-access.md#recommended-roles-for-a-garment-factory):

| Role | Reports and dashboards |
|---|---|
| Owner / GM | All five areas. Add cost visibility so cost and profit figures are not locked, and schedule management if they set up digests. |
| Accountant | Sales, tax and cost. Add cost visibility to see real cost figures. |
| Sales staff | Sales only |
| Warehouse staff | Inventory only. Without cost visibility, cost figures stay locked. |
| HR officer, production lead, floor operator | None by default |

## Related chapters

- [Getting started](00-getting-started.md#signing-in) for signing in and using search.
- [Sales](01-sales.md) for the customer aging screen and sales documents.
- [Inventory](02-inventory.md) for the stock reports inside the inventory area.
- [Admin & Access](06-admin-access.md) for granting report permissions.
