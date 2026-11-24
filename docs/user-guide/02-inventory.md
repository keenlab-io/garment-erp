# Inventory

This chapter is for warehouse staff, the purchasing person and the owner. It covers the item catalogue and SKUs, barcode labels, receiving goods (including spreading freight over the cost), issuing stock to production, stock counts and adjustments, the inventory reports, and who can see cost figures. Read [Getting started](00-getting-started.md) first if you have not used the system before.

All inventory screens are under **Inventory** (คลังสินค้า) in the sidebar:

| Screen | Thai | Used for |
|---|---|---|
| **Inventory → Items** | คลังสินค้า → รายการสินค้า | The item catalogue, SKUs, stock card and bills of materials. |
| **Inventory → Goods receipts** | คลังสินค้า → ใบรับสินค้า | Booking in deliveries from suppliers. |
| **Inventory → Goods issues** | คลังสินค้า → ใบเบิกสินค้า | Scanning stock out to production, sales or other uses. |
| **Inventory → Stock counts** | คลังสินค้า → การนับสต๊อก | Periodic physical counts. |
| **Inventory → Stock adjustments** | คลังสินค้า → การปรับปรุงสต๊อก | Writing off damage and correcting quantities. |
| **Inventory → Barcode printing** | คลังสินค้า → พิมพ์บาร์โค้ด | Printing labels. |
| **Inventory → Reports** | คลังสินค้า → รายงาน | Stock card, valuation, low stock, dead stock. |

When you click **Inventory** itself, the system opens the first of these screens that your role allows.

## Items

### Browse the catalogue

Open **Inventory → Items** (คลังสินค้า → รายการสินค้า). The table shows each item's **Code**, **Name**, **Type**, **Standard cost**, **Min stock** and **Health**. Use the type buttons above the table to show only **Raw** (วัตถุดิบ), **Finished** (สินค้าสำเร็จรูป) or **Consumable** (วัสดุสิ้นเปลือง) items, or **All types** (ทุกประเภท).

The **Health** column shows a **Low stock** (สต๊อกต่ำ) chip (amber, **!**) when an item's on-hand quantity has fallen to or below its minimum. Items that are fine show nothing in this column.

### Create an item

1. Click **Create item** (สร้างสินค้า).
2. Fill in the fields below.
3. Click **Create item**. The toast "Item created" appears and the item is listed with a code the system assigns automatically (for example `AA00042`).

| Field | Thai | What to enter |
|---|---|---|
| Name | ชื่อ | For example `Cotton jersey 180gsm, white`. |
| Type | ประเภท | **Raw** for fabric, thread and trims you buy in; **Finished** for garments you make; **Consumable** for things used up, such as needles and packing tape. |
| Base UOM ID | รหัสหน่วยนับพื้นฐาน | The system identifier of the unit you count the item in (piece, kilogram, metre or roll). |
| Costing method | วิธีคิดต้นทุน | **Moving average** (ต้นทุนถัวเฉลี่ยเคลื่อนที่), **FIFO** (เข้าก่อนออกก่อน), or **Standard** (ต้นทุนมาตรฐาน). If you are not sure, use moving average. |
| Standard cost | ต้นทุนมาตรฐาน | The planned cost per base unit. |
| Minimum stock | สต๊อกขั้นต่ำ | The level at which the item should be flagged as low stock. |

> **Note:** There is no unit picker yet. **Base UOM ID** must be the unit's system identifier, not the word "kg". Ask your administrator for the identifiers of your four standard units (piece, kilogram, metre, roll) and keep the list beside the computer.

Who can do this: requires permission to create products.

### The item page

Click **View** (ดูรายละเอียด) on a row to open the item. It has five tabs:

| Tab | Thai | Contents |
|---|---|---|
| Overview | ภาพรวม | Code, name, type, costing method, standard cost and minimum stock. |
| SKUs | SKU | Variants of the item, for example size and colour, each with its own barcode. |
| Lots | ล็อต | Not available yet. |
| Stock card | การ์ดสต๊อก | Every movement in and out for a date range, with the running balance (see [Inventory reports](#inventory-reports)). |
| BOM | สูตรการผลิต (BOM) | The bill of materials, for finished items only (see [Production](03-production.md#bills-of-materials-and-routings)). |

> **Note:** You can only open items that appear in the first 100 rows of the catalogue. For an item further down, the page says "This item isn't on the first page of the items list".

### Add SKUs (variants)

1. On the item page, open the **SKUs** tab.
2. Enter the **Variant** (ตัวเลือกสินค้า), for example `Navy / L`.
3. Enter the **Barcode** (บาร์โค้ด) if the variant already has one.
4. Click **Create SKU** (สร้าง SKU).

> **Note:** The SKUs tab only lists SKUs created since you last opened the page. Existing SKUs are saved, but they are not listed again after you reload. Write down each new SKU's identifier if you will need it for label printing.

### Export the catalogue

Tick rows in the items table, then click **Export CSV** (ส่งออก CSV) in the selection bar to download a spreadsheet file (`items.csv`) with the code, name, type and minimum stock of those items.

## Barcodes and labels

You can print labels for SKUs and lots in two ways:

- From **Inventory → Items**: tick rows, then click **Print barcodes** (พิมพ์บาร์โค้ด) in the selection bar.
- From **Inventory → Barcode printing** (คลังสินค้า → พิมพ์บาร์โค้ด).

Either way:

1. Enter the SKU identifiers in **SKU IDs** (รหัส SKU), separated by commas, and/or the lot identifiers in **Lot IDs** (รหัสล็อต).
2. Click **Print barcodes**.
3. A job toast shows "Queuing label job…", then "Label job started: You'll be notified when the labels are ready."

> **Note:** Labels are produced in the background, and the toast does not track whether printing finished. If labels do not appear on your label printer, ask your administrator to check the print queue. You must type identifiers here; there is no list of SKUs or lots to pick from.

## Goods receipts

A goods receipt books an incoming delivery into stock at its true landed cost: the goods plus a fair share of freight and import charges. A receipt moves from **Draft** (ฉบับร่าง) to **Confirmed** (ยืนยันแล้ว) to **Posted** (ผ่านรายการแล้ว). Only posting puts the stock on the books.

### Step 1: Lines

1. Open **Inventory → Goods receipts** (คลังสินค้า → ใบรับสินค้า).
2. Click **New receipt** (สร้างใบรับสินค้า). The receipt wizard opens on the **Lines** (รายการสินค้า) step.
3. Enter the **Supplier ID** (รหัสผู้จำหน่าย).
4. On the first line, pick the **Item**. **Receiving UOM ID** fills in with the item's base unit.
5. Enter **Qty** and **Unit price**. If you will spread freight by weight, also enter **Unit weight**.
6. If the supplier delivered in a different unit from the item's base unit (for example rolls instead of kilograms), tick **Received in a non-base UOM?** and enter the **Base UOM equivalent qty**.
7. Click **Add line** for each further item.
8. Click **Continue** (ถัดไป).

**Continue** stays greyed out until every line has an item, unit, quantity and unit price.

> **Note:** There is no supplier list to pick from yet. **Supplier ID** must be the supplier's system identifier, which your administrator can give you. Keep the supplier's own delivery-note number on your paper file.

### Step 2: Landed cost

1. Choose the **Allocation method** (วิธีปันส่วนต้นทุน): **By value** (ตามมูลค่า), **By weight** (ตามน้ำหนัก) or **By quantity** (ตามจำนวน).
2. Enter the **Freight / import total** (ค่าขนส่ง/นำเข้ารวม): shipping, customs duty, clearing fees and so on.
3. Read the preview table. It shows each line's **Allocated landed cost** and **New unit cost**, and the **Total allocated**.
4. Click **Continue**.

### Step 3: Review and confirm

1. Check the lines under **Review lines**.
2. Click **Create & confirm receipt** (สร้างและยืนยันใบรับสินค้า). The toast "Receipt *code* created and confirmed" appears and the receipt is listed as **Confirmed**.

### Post the receipt

1. In the goods receipts list, open the row's action menu for the receipt.
2. Click **Post** (ผ่านรายการ). The status changes to **Posted** and the quantity is added to stock.

If a receipt shows **Draft**, click **Confirm** (ยืนยัน) first, then **Post**.

Who can do this: requires permission to manage goods receipts.

### Worked example: freight spread by value

A delivery from a Samut Prakan fabric mill, with ฿2,400.00 freight:

| Item | Qty | Unit price | Goods value | Share of freight (by value) | New unit cost |
|---|---|---|---|---|---|
| Cotton jersey 180gsm | 200 kg | ฿180.00 | ฿36,000.00 | ฿1,800.00 | ฿189.00 |
| Rib collar trim | 50 kg | ฿240.00 | ฿12,000.00 | ฿600.00 | ฿252.00 |
| **Total** | | | **฿48,000.00** | **฿2,400.00** | |

The jersey is 36,000 ÷ 48,000 = 75% of the goods value, so it takes 75% of the freight (฿1,800.00). Its landed cost is (36,000 + 1,800) ÷ 200 = ฿189.00 per kg.

If you already had 100 kg of the jersey at an average of ฿180.00, after posting the moving-average cost becomes (100 × 180 + 200 × 189) ÷ 300 = (18,000 + 37,800) ÷ 300 = **฿186.00 per kg**.

## Goods issues

The goods issue screen is built for a tablet or touch screen in the store room. It always opens in large Touch layout.

1. Open **Inventory → Goods issues** (คลังสินค้า → ใบเบิกสินค้า).
2. Choose the **Purpose** (วัตถุประสงค์): **Production** (การผลิต), **Sale** (การขาย) or **Other** (อื่นๆ).
3. If the stock is for a particular work order, enter it in **Work order ID (optional)**.
4. Set the quantity with the **−** / **+** buttons or type it into **Qty**.
5. Scan the item's barcode with a handheld scanner, or type the item code into **Scan or enter a code** and press **Enter** or tap **Add**.
6. Repeat steps 4 and 5 for each item. Each scan drops into the **Last scans** list and the field clears, ready for the next one. Tap **Undo** on a line to remove a mistake.
7. Tap **Post issue** (ผ่านรายการเบิกสินค้า). The toast "Issue posted" confirms it, and the stock leaves the warehouse.

The scan field matches the **item code** (for example `AA00042`). An unknown code gives "No item found with code …" and nothing is added.

> **Warning:** If you try to issue more than is in stock, posting is refused with a message such as "Insufficient stock — only 15 left", stating exactly what remains. Your scanned list stays on screen, so you can correct the quantity and post again without rescanning.

> **Tip:** Scanning the same item twice creates two separate lines rather than adding to the first. That is fine for posting, but check the **Last scans** list before you post.

Camera scanning is not available yet. Use a handheld barcode scanner or type the code.

Who can do this: requires permission to manage goods issues.

## Stock counts

A stock count compares what is on the shelf with what the system thinks is there, and turns the differences into an approved adjustment. A count moves from **Open** to **Counting** to **Reconciled** to **Adjusted**.

> **Warning:** Complete a count **from start to finish without reloading the page or signing out**. The counted quantities are saved, but the stock counts screen can only show the count that was opened in your current session.

### Open the count

1. Open **Inventory → Stock counts** (คลังสินค้า → การนับสต๊อก).
2. Type the **Period** (งวด), for example `2026-11`.
3. In **Items to count** (สินค้าที่จะนับ), pick every item you will count.
4. Click **Open count** (เปิดรอบนับสต๊อก).

Each item now shows a **Locked for counting** (ล็อกสำหรับนับสต๊อก) chip (amber, **❙❙**). Stock movements for these items are held while the count is open, so finish the count promptly.

### Enter the counts

1. For each line, type the physical quantity into **Counted qty** (beside **System qty**).
2. Click **Save counts** (บันทึกจำนวนที่นับ).

### Reconcile, approve and post

1. Click **Reconcile** (กระทบยอด). A dialog explains: "This drafts a stock adjustment for the counted differences." Confirm it.
2. An **Adjustment drafted** section appears, listing each difference with its plus or minus quantity.
3. Click **Approve adjustment** (อนุมัติรายการปรับปรุงสต๊อก). Type a reason in the confirmation and confirm.
4. Click **Post adjustment** (ผ่านรายการปรับปรุงสต๊อก). The differences are now on the books.

### Worked example

| Item | System qty | Counted qty | Difference |
|---|---|---|---|
| Cotton jersey 180gsm | 155.00 kg | 152.00 kg | −3.00 kg |
| Polyester thread, black | 40.00 cones | 41.00 cones | +1.00 cone |

After posting, the jersey's on-hand quantity is 152.00 kg. At the ฿186.00 average cost, the shortage is valued at 3 × 186 = ฿558.00.

Who can do this: opening and counting require permission to manage goods issues. Approving requires permission to approve stock adjustments.

## Stock adjustments

Use a stock adjustment to write off damaged, lost or found stock outside a count. Every adjustment needs a reason, and each one is recorded in the audit log with who made it and why. An adjustment moves from **Draft** to **Approved** to **Posted**.

1. Open **Inventory → Stock adjustments** (คลังสินค้า → การปรับปรุงสต๊อก).
2. Type the **Reason** (เหตุผล), for example `Water damage in store room`.
3. Pick the **Item** and type the **Qty delta** (จำนวนที่เปลี่ยนแปลง). Use a minus sign to remove stock (`-2`) and no sign to add it (`5`). **Warehouse ID (optional)** can be left empty for your main warehouse.
4. Click **Add line** for more items.
5. Click **Create adjustment** (สร้างรายการปรับปรุงสต๊อก). It is listed as **Draft**.
6. Click **Approve** (อนุมัติ). In the confirmation, type the reason and confirm. The status becomes **Approved**.
7. Click **Post** (ผ่านรายการ). The status becomes **Posted** and on-hand stock changes.

If you leave the reason empty, the system refuses to create the adjustment and shows "A reason is required."

> **Warning:** As with counts, the adjustments screen only shows the adjustment created in your current session ("No adjustment created this session yet." after a reload). Create, approve and post in one sitting. If someone else must approve, do it together at the same computer.

Who can do this: creating requires permission to manage goods issues. Approving requires permission to approve stock adjustments.

## Inventory reports

Open **Inventory → Reports** (คลังสินค้า → รายงาน). It has four tabs.

| Tab | Thai | What it shows | Filters |
|---|---|---|---|
| Stock card | การ์ดสต๊อก | Every movement of one item: opening balance, each in and out with its reference and unit cost, the running balance, and the closing balance. | **Item**, **From**, **To** |
| Valuation | มูลค่าสต๊อก | On-hand quantity, average cost and value per item, and the **Total value**. | **As of** |
| Low stock | สต๊อกต่ำ | Items at or below their minimum stock. | |
| Dead stock | สต๊อกค้าง | Items with no movement for the chosen number of months, with the date of the last movement ("Never" if none). | **Months with no movement** (default 6) |

The stock card's **Ref** column says where each movement came from: **Goods receipt**, **Goods issue**, **Backflush** (materials used automatically when a work order is completed), **Adjustment** or **Count**. Stock taken out by issued sales invoices also appears here.

The closing balance always equals the opening balance plus all **In** minus all **Out**. For example, opening 100.00 kg, in 200.00, out 145.00 gives 155.00 kg.

For cross-module dashboards, see [Reports](05-reports.md).

## Who can see costs

Cost figures are confidential. Users whose role does not include permission to view inventory costs see a **lock with dots** instead of every money figure in the Inventory module: standard cost, landed cost, allocation, average cost, line value and total value. The figures are not sent to their computer at all. Quantities stay fully visible, so warehouse staff can still do their work.

| Role (typical) | Quantities | Cost figures |
|---|---|---|
| Warehouse staff | Visible | Masked |
| Purchasing / accountant | Visible | Visible if granted |
| Owner / Super Admin | Visible | Visible |

To change who can see costs, see [Admin & access](06-admin-access.md).
