# Production

This chapter is for the production lead, the planner and floor operators. It covers work orders, bills of materials and routings, the live production timeline and its delay alerts, the shop-floor scan station, the WIP board and subcontracting. Floor operators only need the section [The scan station](#the-scan-station). Read [Getting started](00-getting-started.md) first if you have not used the system before.

All production screens are under **Production** (การผลิต) in the sidebar:

| Screen | Thai | Used for | Typical user |
|---|---|---|---|
| **Production → Timeline** | การผลิต → ไทม์ไลน์ | The live picture of every order and step, with alerts. | Production lead |
| **Production → Work orders** | การผลิต → ใบสั่งผลิต | Creating work orders and seeing their detail. | Production lead, planner |
| **Production → Scan station** | การผลิต → จุดสแกน | Start/Finish scans and defect reports on the floor. | Floor operator |
| **Production → WIP board** | การผลิต → งานระหว่างทำ | Where work is piling up, by department. | Production lead |
| **Production → Subcontracts** | การผลิต → งานจ้างเหมาช่วง | Steps sent to outside workshops. | Production lead |

## How production works in the system

1. The planner creates a **work order** (ใบสั่งผลิต) for a finished item and quantity, based on a **routing template**: the ordered list of steps, such as cutting, screen printing, sewing, and QC and packing, each with its standard minutes.
2. Write or print the work-order number on the traveler card, the paper ticket that goes with the bundle through the factory.
3. At each step, the operator scans the traveler card at the **scan station** and taps **START**, then scans again and taps **FINISH** when done.
4. The first START moves the order from **Pending** to **In progress**. Finishing the last step moves it to **Completed**, and the system automatically deducts the materials on the item's bill of materials from stock (shown as **Backflush** on the stock card).
5. Meanwhile, the production lead watches the **timeline**. A step that runs past its standard time turns **Delayed** and appears in the **Alerts** list.

### Statuses

| Applies to | Chip | Symbol | Meaning |
|---|---|---|---|
| Order and step | Pending | ○ | Not started. |
| Order and step | In Progress | ◐ | Being worked on. |
| Order and step | Completed | ●✓ | Finished. |
| Step | Delayed | ▲ (red) | Running longer than its standard minutes. This replaces In Progress so it stands out. |
| Step | On Hold | ❙❙ | Paused by the lead. |
| Step | Subcontracted | ↗ | Out at a subcontractor. |
| Order | Cancelled | ○ | Shown grey and ~~struck through~~. |

## Bills of materials and routings

### Bills of materials (BOM)

A bill of materials lists the materials used to make one unit of a finished item. It drives the automatic stock deduction when a work order completes. You set it up on the item, in Inventory.

1. Open **Inventory → Items** (คลังสินค้า → รายการสินค้า) and click **View** on a **Finished** item.
2. Open the **BOM** (สูตรการผลิต (BOM)) tab.
3. For each material, pick the **Component item**, enter its **Base UOM ID**, the **Qty** per finished unit and the **Scrap %** (อัตราของเสีย (%)).
4. Click **Add component** for each further material.
5. Click **Create BOM & preview**. The toast "BOM created" appears, and a tree shows each component's unit cost and extended cost, the **Conversion cost** (labour and overhead, if set up) and the **Rolled-up cost** of one finished unit.

> **Warning:** Despite its label, type **Scrap %** as a decimal: `0.05` means 5% extra material. Typing `5` would mean 500%.

Worked example: one polo shirt, size L.

| Component | Qty | Scrap | Qty incl. scrap | Unit cost | Extended cost |
|---|---|---|---|---|---|
| Cotton jersey 180gsm | 0.25 kg | 0.05 | 0.2625 kg | ฿186.00 | ฿48.83 |
| Rib collar trim | 0.03 kg | 0 | 0.03 kg | ฿252.00 | ฿7.56 |
| Polyester thread | 0.05 cone | 0 | 0.05 cone | ฿45.00 | ฿2.25 |
| **Material cost** | | | | | **฿58.64** |

Completing a work order for 300 shirts deducts 300 × 0.2625 = 78.75 kg of jersey from stock.

> **Note:** The BOM tab only shows the BOM created in your current session. After a reload it says "No BOM created this session yet.", although the BOM is saved and is still used for stock deduction. BOMs can only be set up on **Finished** items.

### Routing templates

When you create a work order, you pick a routing template, which sets the steps and their standard minutes. You see the steps on the work order's **Steps** tab and as bars on the timeline.

> **Note:** There is no screen for creating or editing routing templates yet. Ask your administrator to load your factory's routings (for example "Polo, screen print": Cutting 120 min, Screen print 90 min, Sewing 240 min, QC & pack 60 min) before you start creating work orders.

## Work orders

### Create a work order

1. Open **Production → Work orders** (การผลิต → ใบสั่งผลิต).
2. Click **New work order** (สร้างใบสั่งผลิต). A two-step form opens.
3. In **Routing template** (เทมเพลตขั้นตอนผลิต), choose the routing.
4. Enter the **Finished item id** (รหัสสินค้าสำเร็จรูป).
5. Optionally, enter the **Customer id** (รหัสลูกค้า).
6. Enter the **Quantity** (จำนวน), the **Due date** (กำหนดส่ง) and, if you like, the **Machine** (เครื่องจักร).
7. Click **Continue** (ถัดไป), check the summary, and click **Create work order** (สร้างใบสั่งผลิต).

The order is created with a number such as `WO20260031`, status **Pending** and steps done `0/4`.

> **Note:** The work-order form has no item or customer picker yet. **Finished item id** and **Customer id** need the system identifiers, not the item code or customer name. Your administrator can show you where to find them.

Who can do this: requires permission to manage work orders.

### The work-order list and detail

The list shows each order's **WO no.**, **Due date**, **Steps done** (for example `2/4`) and **Status**. Click **View** (ดู) to open an order. It has four tabs:

| Tab | Thai | Contents |
|---|---|---|
| Overview | ภาพรวม | Finished item, quantity, due date, machine, customer, mockup file reference. |
| Steps | ขั้นตอน | Each step with its status. Click a step to open its panel (see below). |
| Defects | ของเสีย | Every defect reported on the order, with type and quantity. |
| History | ประวัติ | When each step started and finished. |

## The production timeline

**Production → Timeline**, titled **Production timeline** (ไทม์ไลน์การผลิต), is the lead's control centre. On a computer it shows one row per work order with its due date, and each step as a coloured bar using the status chips. On a phone it becomes a simple list showing each order's current step.

The timeline is **live**. When an operator scans at a station, the step's colour changes within a few seconds and the bar briefly pulses. You never need to reload the page.

### Delays and the Alerts list

The **Alerts** (การแจ้งเตือน) list beside the timeline names every step running past its standard time, for example "Sewing is running over its 240m standard". When nothing is late it reads **No active alerts**. Click an alert to open that step's panel.

### The step panel

Click any step bar, alert or step row to open its panel. It shows who the step is **Assigned** to, the **Machine**, **Elapsed** time against the **Standard**, and any **Defects**. Two actions are available:

**Put a step on hold**

1. Click **Hold** (พัก).
2. Read the warning "The step stops the clock until it's resumed."
3. Type a reason, for example `Waiting for thread colour approval`, and confirm.

**Send a step to a subcontractor**: see [Subcontracting](#subcontracting).

> **Warning:** A held step cannot be resumed from the scan station at present. The station skips it and offers the next waiting step. Before operators continue that order, check with your administrator how held steps should be resumed.

## The scan station

The scan station is the screen on the shop-floor tablet or computer. It is designed for operators wearing gloves and working fast.

### A locked-down floor screen

When the **Scan station** is open, the screen has **no menu, sidebar, search or shortcuts**: just the scan field, the order card and the connection badge, in large Touch layout. Floor accounts usually have permission for the scan station only, so they see nothing else in the system anyway. This makes it safe to leave the station running all shift.

To set up a station, sign in with the floor account, open **Production → Scan station** from the menu, and leave the screen open. Because there is no menu on this screen, to leave it the supervisor closes the browser tab or uses the browser's Back button.

### The scan loop: START and FINISH

1. Scan the barcode on the traveler card, or type the work-order number into **Scan the traveler card** (สแกนบัตรติดตามงาน) and press **Enter**.
2. A card appears showing the work-order number, item and quantity, and the **current step** with its elapsed time and standard minutes.
3. If the step has not started, tap **▶ START** (▶ เริ่ม). The toast "Step started" appears and the screen is ready for the next scan.
4. When the step is done, scan the same card again and tap **■ FINISH** (■ เสร็จ). The toast "Step finished" appears.
5. The next scan of that card lands on the following step.

Only the button that makes sense is active: START for a step that has not started, FINISH for a running step. After the final step is finished, the order shows **Completed**, and a further scan says "This work order has no step left to scan."

A code that is not a work order gives "No work order found for code …" and nothing is recorded.

### Report a defect

1. Scan the traveler card.
2. Tap **⚑ Report defect** (⚑ รายงานของเสีย).
3. Tap the defect type: **Misprint**, **Bad stitch**, **Wrong size**, **Stain**, **Torn** or **Other**.
4. Set the quantity with **−** / **+**.
5. Tap **Report defect**.

The toast "Defect reported" appears and the station returns to scanning. The lead sees the defect on the order's **Defects** tab and in the step panel. You cannot submit until you have chosen a defect type.

### When the Wi-Fi drops: the offline queue

The station keeps working without a connection. START and FINISH taps are saved on the device, and a badge shows "Offline — 2 scan(s) queued". When the connection returns, the badge shows "Syncing…", sends the scans in the order they were made, and clears. Queued scans survive a reload of the station screen on the same device.

> **Warning:** Only START and FINISH work offline. **Defect reports need a connection**, so if the station is offline, write the defect on the traveler card and report it once the badge has cleared. Occasionally, a scan made just as the connection dropped may be recorded twice. If an order's history looks wrong after an outage, tell the production lead.

> **Note:** There is no camera scanning. Use a handheld barcode scanner or type the number.

Who can do this: requires permission to scan.

### Worked example

Work order `WO20260031`: 300 polo shirts. The routing is Cutting 120 min → Screen print 90 min → Sewing 240 min → QC & pack 60 min.

| Time | Station action | Result on the timeline |
|---|---|---|
| 08:00 | Cutting: START | Order **In progress**, Cutting ◐ |
| 09:55 | Cutting: FINISH | Cutting ●✓, steps done 1/4 |
| 10:10 | Screen print: START | Screen print ◐ |
| 11:45 | Screen print: still running after 95 min | Screen print turns **Delayed** ▲ and an alert appears |
| 12:05 | Screen print: FINISH | Screen print ●✓, alert clears, 2/4 |
| 13:00 | Sewing: Report defect, Bad stitch × 3 | Defect listed on the order |

## The WIP board

**Production → WIP board**, titled **WIP / bottleneck board** (งานระหว่างทำ / จุดคอขวด), shows one card per department with how many steps are **in progress** and how many are **delayed**. The department with the most delays is listed first, which is where to look for a bottleneck. When nothing is running, it says "No in-progress steps right now."

> **Note:** Cards are labelled "Department" followed by a system identifier rather than the department's name. Ask your administrator which identifier is which department and note it down.

## Subcontracting

Send a step, such as embroidery or a special wash, to an outside workshop with a promised return date, and track it until the work comes back.

### Send a step out

1. On the **Timeline** or a work order's **Steps** tab, click the step.
2. Click **Subcontract** (จ้างเหมาช่วง).
3. Enter the **Vendor** (ผู้รับเหมา), for example `Siam Stitch Co.`.
4. Set **SLA due** (กำหนด SLA), the date the vendor promised to return the work.
5. Click **Send** (ส่ง).

The step shows **Subcontracted** (↗) and the toast "Step sent to subcontractor" appears.

### Track and receive

1. Open **Production → Subcontracts** (การผลิต → งานจ้างเหมาช่วง).
2. Use the **Status** filter: **All**, **Sent** (ส่งแล้ว), **Overdue** (เกินกำหนด) or **Received** (รับคืนแล้ว).
3. Read the **SLA** column: "Due in 5h 30m", "Overdue by 26h 10m", "Received" or "No SLA set".
4. When the work comes back, click **Receive** (รับคืน) on the row.

The row changes to **Received**, the toast "Subcontract received" appears, and the step returns to the line. The order continues from where it left off without any further action.

Who can do this: requires permission to manage subcontracts.

> **Note:** Subcontract actions need a connection; they cannot be done offline.

## Related chapters

- Materials issued to production and the automatic backflush: [Inventory](02-inventory.md#goods-issues).
- Production cost and profit dashboards: [Reports](05-reports.md).
- Setting up floor accounts and roles: [Admin & access](06-admin-access.md). Floor accounts limited to scanning do not use a paid seat.
