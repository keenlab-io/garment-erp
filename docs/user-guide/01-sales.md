# Sales

This chapter is for sales staff, the accountant and the owner. It covers customers, quotations and invoices, Thai VAT and withholding tax, PromptPay QR codes, recording payments and receipts, voiding invoices, document templates, exporting documents and the accounts-receivable aging report. Read [Getting started](00-getting-started.md) first if you have not used the system before.

All sales screens are under **Sales** (การขาย) in the sidebar:

| Screen | Thai | Used for |
|---|---|---|
| **Sales → Documents** | การขาย → เอกสาร | Creating quotations and invoices and moving them through their life. |
| **Sales → Customers** | การขาย → ลูกค้า | Registering and finding customers. |
| **Sales → Payments** | การขาย → การชำระเงิน | Recording payments and voiding invoices. |
| **Sales → Templates** | การขาย → เทมเพลต | Trying out the logo, signature and stamp on documents. |
| **Sales → AR aging** | การขาย → อายุลูกหนี้ | Seeing who owes money and how overdue it is. |

> **Warning:** **Work through each sale in one sitting.** The **Documents** list and the **Payments** screen only show quotations and invoices that you created or worked on since you last opened the page. Everything you create is saved safely on the server, but if you reload the page, sign out or switch computers, those two screens start empty again and cannot show the earlier documents. Documents created by a colleague do not appear in your list either. So create, issue and record payment for a document in a single session where you can. **AR aging** and **Customers** are not affected: they always show everything.

## Customers

Register a customer once and pick them on every document from then on.

### Register a new customer

1. Open **Sales → Customers** (การขาย → ลูกค้า).
2. Click **New customer** (ลูกค้าใหม่).
3. Fill in the fields (see the table below).
4. Click **Create customer** (สร้างลูกค้า). The toast "Customer created" confirms it.

| Field | Thai | Notes |
|---|---|---|
| Name | ชื่อ | The registered company name, for example `Bangkok Textiles Co., Ltd.` Required. |
| Tax id | เลขผู้เสียภาษี | The customer's 13-digit tax identification number. Needed for tax invoices. |
| Branch code | รหัสสาขา | `00000` for head office, otherwise the branch number. |
| Credit terms (days) | เครดิตเทอม (วัน) | For example `30`. Used to work out the invoice due date. |
| Address | ที่อยู่ | Printed in the "Bill to" block. |

### Find a customer

Type part of the name or the tax ID into the search box at the top of the customer list. Click **View** (ดู) on a row to open the customer's page. It shows their details, an **AR aging** (อายุลูกหนี้) summary of what they owe ("No outstanding balance on record." if nothing), and the documents for them that you have worked on in this session.

Who can do this: requires permission to manage customers.

## How a sale moves through the system

A typical order goes through these steps:

1. Create a **quotation** (ใบเสนอราคา). It starts as **Draft**.
2. **Send** it to the customer. It becomes **Sent**.
3. When the customer agrees, **Approve** it, or **Reject** it if they decline.
4. **Convert to invoice**. The quotation becomes **Converted** and a new **Draft** invoice is created with exactly the same lines and prices.
5. **Issue** the invoice. It becomes **Issued** and a PromptPay QR code becomes available.
6. Record **payments**. The invoice becomes **Partially paid** and then **Paid**, and a receipt is issued.

You can also create an invoice directly without a quotation, for example for a repeat order, and continue from step 5.

At each step the screen shows only the buttons that make sense for the document's current status. For example, you cannot issue an invoice that is still waiting to be converted, and once a quotation has been converted there is no second **Convert to invoice** button.

## Quotations

### Create a quotation

1. Open **Sales → Documents** (การขาย → เอกสาร).
2. Click **New document** (เอกสารใหม่).
3. In **Document type** (ประเภทเอกสาร), choose **Quotation** (ใบเสนอราคา).
4. In **Customer** (ลูกค้า), click **Look up a customer…** and type part of the name or tax ID, then pick the customer. Their name, tax ID, branch and address appear in the **Bill to** block of the paper preview on the right.
5. Choose the VAT treatment with the **VAT** and **Calc** switches (see [VAT on quotations](#vat-on-quotations)).
6. Set **Valid until** (ใช้ได้ถึง), the last day the prices hold.
7. For each line, pick an **Item** (optional), then type the **Description**, **Qty**, **Unit price** and, if you are giving one, a **Discount**.
8. Click **+ Add line** for each further line.
9. Check the paper preview. It updates as you type.
10. Click **Create quotation** (สร้างใบเสนอราคา).

**Create quotation** stays greyed out until you have chosen a customer and entered at least one complete line (description, quantity above zero and a unit price). When you create it, the quotation gets its number (for example `QV20260007`) and a **Draft** chip.

> **Note:** The **Discount** on a line is an amount in baht taken off that line, not a percentage. A line of 300 × ฿185.00 with a discount of ฿500.00 totals ฿55,000.00.

> **Warning:** After you click **Create**, the document can no longer be edited. You cannot change a line, a price or the customer afterwards. Check the preview carefully before you create. If something is wrong on a draft, create a new, correct document.

### Send, approve or reject

Open the quotation from the **Documents** list by clicking **View** (ดู), then:

1. Click **Send** (ส่ง) once you have sent the quotation to the customer. The chip changes to **Sent**.
2. When the customer accepts, click **Approve** (อนุมัติ). The chip changes to **Approved**. If they decline, click **Reject** (ปฏิเสธ) instead.

Who can do this: requires permission to manage quotations.

> **Note:** **Send** records that the quotation has gone to the customer. It does not email the customer. Send the PDF or printout yourself.

### Expired quotations

A quotation past its **Valid until** date shows **Expired**, with the hint "This quotation has passed its valid-until date." To quote the same items again, open the row's action menu in the **Documents** list and choose **Duplicate to renew** (ทำสำเนาเพื่อต่ออายุ). This creates a new draft quotation with the same lines and opens it.

## VAT on quotations

The **VAT** switch chooses between **VAT** (มี VAT) and **Non-VAT** (ไม่มี VAT). For VAT documents, the **Calc** switch chooses how the 7% is applied:

| Setting | Thai | How it works |
|---|---|---|
| **Excl.** (VAT added on top, "VAT nok") | แยกภาษี | Prices are before VAT. VAT = 7% of the subtotal, and the grand total = subtotal + VAT. This is the default. |
| **Incl.** (VAT included, "VAT nai") | รวมภาษี | Prices already include VAT. The system backs the VAT out of the total. |
| **Non-VAT** | ไม่มี VAT | No VAT. The quotation uses the separate QNV number series. |

### Worked example

An order for 300 polo shirts at ฿185.00 each, plus a one-off embroidery set-up charge of ฿1,500.00. The lines total 55,500.00 + 1,500.00 = ฿57,000.00.

| | VAT added on top (Excl.) | VAT included (Incl.) | Non-VAT |
|---|---|---|---|
| Subtotal (ยอดรวมก่อนภาษี) | ฿57,000.00 | ฿53,271.03 | ฿57,000.00 |
| VAT 7% (ภาษีมูลค่าเพิ่ม) | ฿3,990.00 | ฿3,728.97 | ฿0.00 |
| Grand total (ยอดรวมทั้งสิ้น) | ฿60,990.00 | ฿57,000.00 | ฿57,000.00 |
| Number series | QV… | QV… | QNV… |

With VAT included, the subtotal is ฿57,000.00 ÷ 1.07 = ฿53,271.03, and the VAT is the difference, ฿3,728.97. The two always add back to the grand total exactly.

> **Note:** An invoice converted from a quotation keeps the quotation's VAT treatment. An invoice you create **directly** always uses VAT added on top (Excl.), and the editor offers no VAT switch for it. To invoice a non-VAT or VAT-included sale, create a quotation first and convert it.

## Invoices

### Convert an approved quotation

1. Open the **Approved** quotation.
2. Click **Convert to invoice** (แปลงเป็นใบแจ้งหนี้).

The new invoice opens with its own number (for example `INV20260012`), the same lines and prices, and a **Draft** chip. The quotation now shows **Converted**.

### Create an invoice directly

1. Open **Sales → Documents** and click **New document**.
2. In **Document type**, choose **Invoice** (ใบแจ้งหนี้).
3. Pick the **Customer**.
4. Either set the **Due date** (วันครบกำหนด) or enter **Credit terms (days)** (เครดิตเทอม (วัน)). If you leave both empty, the due date becomes today plus the customer's credit terms.
5. Enter a **WHT rate** if the customer withholds tax (see [Withholding tax](#withholding-tax-wht)).
6. Enter the lines as for a quotation.
7. Click **Create invoice** (สร้างใบแจ้งหนี้).

### Issue the invoice

1. Open the **Draft** invoice.
2. Click **Issue** (ออกเอกสาร). The chip changes to **Issued** and the toast "Invoice issued" appears.

Only an issued invoice can be paid. Invoice lines linked to an inventory item take that quantity out of stock when the invoice is issued.

Who can do this: converting and issuing require permission to create invoices.

## Withholding tax (WHT)

When you invoice a company for a service, such as screen printing or sewing on garments the customer supplied, the customer usually withholds 3% of the pre-VAT amount and gives you a withholding-tax certificate. The invoice editor shows exactly how much the customer will actually transfer.

1. While creating the invoice, find the WHT panel.
2. Type the rate into **WHT rate** (อัตราภาษีหัก ณ ที่จ่าย) **as a decimal**: `0.03` for 3%, `0.01` for 1%, `0.05` for 5%.
3. Read the panel and the paper preview. Both show the withholding amount and the **Net to receive** (ยอดรับสุทธิ).

> **Warning:** Type the rate as a decimal, not as a percentage. Typing `3` would mean 300%. Check that the withholding line looks sensible before you create the invoice.

If the field is empty, the panel says **No withholding** (ไม่มีการหักภาษี ณ ที่จ่าย) and the net to receive equals the grand total.

### Worked example

Screen printing on 1,000 customer-supplied T-shirts at ฿25.00 each, VAT added on top, WHT 3%:

| Line | Amount |
|---|---|
| Subtotal | ฿25,000.00 |
| VAT 7% | ฿1,750.00 |
| Grand total | ฿26,750.00 |
| WHT 3% (of the subtotal, not the grand total) | (฿750.00) |
| **Net to receive** | **฿26,000.00** |

Check the customer's bank transfer against the **Net to receive** figure, ฿26,000.00. When the first payment is recorded, the system also records a withholding-tax certificate for the invoice, numbered `WHT-` followed by the invoice number.

## PromptPay QR

An issued invoice shows a **PromptPay** (พร้อมเพย์) block with a QR code, the hint **Scan to pay**, the invoice amount and a **Ref** (เลขอ้างอิง) to match the incoming transfer against.

On a draft invoice there is no QR code. The block says "Issue the invoice to generate a PromptPay QR", so a customer cannot be given a payment code for a document that has not been officially issued.

1. Issue the invoice.
2. Show the QR code on screen to the customer, or take a screenshot and send it.
3. When the money arrives, record the payment with method **PromptPay** and the reference (see below).

## Payments and receipts

### Record a payment

1. Open **Sales → Payments** (การขาย → การชำระเงิน). You can also click **Go to payments** (ไปที่การชำระเงิน) on an issued invoice.
2. In the list on the left, click the invoice. The right-hand panel shows **Grand total**, **Amount paid** and **Outstanding**.
3. Check **Amount** (จำนวนเงิน). It is filled in with the outstanding balance. Change it if the customer paid only part.
4. Choose the **Method** (วิธีชำระเงิน): **Bank transfer**, **PromptPay**, **Cash**, **Cheque** or **Credit card**.
5. For PromptPay, type the transfer reference into **PromptPay ref**.
6. Click **Record payment** (บันทึกการชำระเงิน).

The status changes to **Partially paid** if money is still owed, or to **Paid** once the full amount has been received.

### Receipts and tax invoices

The **first** payment recorded against an invoice issues its receipt automatically. A green box shows the receipt number (for example `RE20260015`) and "Receipt issued" with the date and time. For a VAT invoice this is a combined receipt/tax invoice. For a non-VAT invoice it is a plain receipt, never a tax invoice. Later payments on the same invoice do not create another receipt.

### Worked example: deposit then balance

Invoice `INV20260012` for ฿60,990.00 (the polo-shirt order above):

| Step | Amount | Method | Amount paid | Outstanding | Status |
|---|---|---|---|---|---|
| Issued | | | ฿0.00 | ฿60,990.00 | Issued |
| 50% deposit | ฿30,000.00 | Bank transfer | ฿30,000.00 | ฿30,990.00 | Partially paid, receipt issued |
| Balance on delivery | ฿30,990.00 | PromptPay | ฿60,990.00 | ฿0.00 | Paid |

> **Note:** For an invoice with withholding tax, record the amount actually received (the **Net to receive**, ฿26,000.00 in the WHT example). The system then treats the invoice as fully paid, because the withheld ฿750.00 is covered by the customer's certificate. In the same sitting, the Payments panel may still show ฿750.00 outstanding and **Partially paid**. To confirm the invoice is settled, check **AR aging**, where it will no longer appear.

Who can do this: requires permission to record payments.

## Voiding an invoice

Use void to cancel an issued invoice that should never have been raised, for example when the customer cancelled the order. Voiding never deletes the document. It stays on record with a **Void** chip (grey, struck through), and the void and its reason are recorded in the audit log.

1. Open **Sales → Payments** and select the invoice.
2. Click **Void** (ยกเลิก).
3. Read the confirmation. It warns that the void cannot be undone.
4. Type the reason, for example `Customer cancelled order`. You cannot confirm without a reason.
5. Click **Void** to confirm.

The toast "Invoice voided" confirms it. A voided invoice can no longer be paid, and any stock it had taken out is returned.

> **Warning:** You cannot void an invoice once a receipt or tax invoice has been issued for it, which happens as soon as any payment is recorded. The system refuses with "Can't void this invoice: a receipt or tax invoice has already been issued for this invoice" and changes nothing. Speak to your accountant about the correct correction document.

Who can do this: requires permission to void sales documents. This is usually only the accountant. Other users see the **Void** button, but the confirm button in the dialog stays disabled.

There is no void action for quotations. Use **Reject** for a quotation the customer declined.

## Document templates

**Sales → Templates** (การขาย → เทมเพลต), titled **Document templates** (เทมเพลตเอกสาร), lets you preview how your company's assets look on a sample quotation:

1. Under **Assets** (สื่อประกอบ), click **Upload** (อัปโหลด) next to **Logo** (โลโก้), **Signature** (ลายเซ็น) or **Stamp** (ตราประทับ), and choose an image file.
2. Under **Excel named-range map** (ผังชื่อช่วงเซลล์ Excel), click **+ Add mapping** and pair each named range in your Excel form with a document field.
3. Check the sample document beside the form. It updates as you go.

> **Warning:** This screen is currently a preview workbench only. Nothing you upload or map here is saved. When you reload the page everything returns to **Not set** (ยังไม่ได้กำหนด), and generated documents do not use these settings yet.

## Export, PDF and printing

To export invoices as PDF files from the **Documents** list:

1. Tick the checkbox on each invoice row you want to export. A coloured bar appears with the number selected.
2. Click **Export** (ส่งออก) in that bar.
3. A background-job toast shows "Exporting *n* document(s)…" and then "Export started for *n* document(s)".

> **Note:** Export works for invoices only. Quotations in the selection are skipped. The files are produced in the background, and the toast does not offer a download link (see [Background-job toasts](00-getting-started.md#background-job-toasts)). To print or share a single document straight away, use the paper preview on the document screen with your browser's print function (**Ctrl-P** / **⌘P**), or take a screenshot.

There is no screen for submitting invoices to the Revenue Department's e-Tax Invoice service yet. Submit e-Tax documents outside the system for now.

## Aging and overdue invoices

### The aging column in the documents list

Each invoice row in **Documents** has an **Aging** chip showing how many days overdue it is, using the buckets below. The status filter, the customer filter (**Filter by customer…**), the type filter (**All**, **Quotations**, **Invoices**) and **From date** help you narrow the list.

For an overdue invoice, the row's action menu offers **Send reminder** (ส่งการแจ้งเตือน). At present this only notes on screen that the reminder was sent ("Reminder sent for INV…"). It does not email or message the customer. Contact the customer yourself.

### The AR aging report

1. Open **Sales → AR aging** (การขาย → อายุลูกหนี้).
2. Read the summary strip: one total per bucket.
3. Read the table: one row per customer, with their unpaid balance split into buckets.
4. To see the position on an earlier date, change **As of** (ณ วันที่).

| Bucket | Thai | Meaning |
|---|---|---|
| Current | ยังไม่ครบกำหนด | Not yet due. |
| 1–30 days | 1–30 วัน | Up to 30 days past due. |
| 31–60 days | 31–60 วัน | 31 to 60 days past due. |
| 61–90 days | 61–90 วัน | 61 to 90 days past due. |
| 90+ days | มากกว่า 90 วัน | More than 90 days past due. |

The report includes every issued, partially paid and overdue invoice in your factory, including invoices created by colleagues or on earlier days. It shows the amount still expected after any withholding tax. Paid and voided invoices drop out. Once a day the system also marks unpaid invoices that are past their due date as **Overdue**.

Who can do this: requires permission to view sales reports.

> **Note:** Because of the one-sitting limitation, an overdue invoice from an earlier day appears in **AR aging** but not in the **Payments** list, so you cannot record its payment from the Payments screen. Ask your administrator how payments on older invoices should be handled until this is resolved.

## Who does what

| Task | Typical role |
|---|---|
| Register customers | Sales staff |
| Create, send, approve, reject quotations | Sales staff |
| Convert to invoice, issue invoices | Sales staff, accountant |
| Record payments | Sales staff, accountant |
| Void invoices | Accountant only |
| AR aging | Accountant, owner |

For sales dashboards and scheduled reports, see [Reports](05-reports.md). To change who can do what, see [Admin & access](06-admin-access.md).
