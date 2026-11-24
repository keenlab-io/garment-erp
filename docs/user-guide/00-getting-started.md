# Getting started

This chapter is for everyone who uses the ERP: the owner, sales and accounts staff, the warehouse team, the production lead and floor operators. It explains how to sign in, how the screen is laid out, how to find your way around quickly, and how to read the colours, symbols, numbers and messages that appear throughout the system. Read it once before you move on to the chapter for your own job.

## Signing in

Each factory has its own web address, for example `https://somchai-garment.example.com`. Your administrator gives you this address together with your username and a temporary password. Always sign in through your factory's address. When you open it, the sign-in page shows your factory's name and logo above the form, so you can be sure you are in the right place.

1. Open your factory's web address in Chrome, Edge, Safari or Firefox.
2. Check that your factory's name and logo appear above the form.
3. Type your username in **Username** (ชื่อผู้ใช้).
4. Type your password in **Password** (รหัสผ่าน).
5. Click **Sign in** (เข้าสู่ระบบ).

The **Sign in** button stays greyed out until you have filled in both fields. While the system checks your details the button reads **Signing in…**. When it is done you land on the **Dashboard** (แดชบอร์ด).

> **Tip:** Bookmark your factory's address. If the sign-in page shows no factory name or logo, you have probably opened the wrong address.

### If sign-in fails

If the username or password is wrong, a red message appears: "Incorrect username or password." Check that Caps Lock is off and that the keyboard is set to the right language (a Thai keyboard layout will type the wrong characters into an English password), then try again.

> **Warning:** After **5 wrong passwords in a row** your account is locked for **15 minutes**. While it is locked, the sign-in page still shows "Incorrect username or password.", even if you then type the correct password. Wait 15 minutes before you try again, or ask your administrator for help. The same message also appears if your administrator has disabled your account.

### Messages on the sign-in page

You may sometimes find yourself back on the sign-in page with a yellow notice:

| Notice | What happened | What to do |
|---|---|---|
| "Your access changed. Please sign in again." | An administrator changed your role or permissions, or ended your sessions. | Sign in again. Your menus will reflect your new access. |
| "Your session expired. Please sign in again." | You stayed signed in for too long, or your sign-in was cancelled for security reasons. | Sign in again. Work you had already saved is safe. |

### Staying signed in

When you close the browser tab or reload the page, the system signs you back in automatically, so you do not need to type your password every time you open it. It returns you to the screen you were on.

> **Warning:** Some screens only remember work done since you last opened the page, for example the sales documents list and the stock counts screen. The chapters for those screens explain this. Anything you saved is safe on the server, but reloading the page clears those screens' lists.

### Signing out

1. Click your initials (your avatar) at the top right of the screen.
2. Check the name and email shown at the top of the menu.
3. Click **Sign out** (ออกจากระบบ).

Always sign out when you use a shared computer. On the shop floor, a scan station uses its own floor account (see [Production](03-production.md#the-scan-station)).

## The screen layout

Once you are signed in, every screen has the same frame around it.

| Area | Where | What it does |
|---|---|---|
| Sidebar | Left edge, dark background (larger screens) | Lists the modules you can use: **Dashboard**, **Inventory** (คลังสินค้า), **Production** (การผลิต), **Sales** (การขาย), **HR & Payroll** (บุคคล & เงินเดือน), **Reports** (รายงาน). Click a module to open its list of screens. **Admin & Access** (ผู้ดูแล & สิทธิ์) sits separately at the bottom and only Super Admins see it. |
| Top bar | Across the top | Shows the breadcrumb, the search box, the notifications bell, and buttons for density, language and theme, plus your avatar. |
| Breadcrumb | Top bar, left | Shows where you are, for example **Home › Goods receipts**. Click **Home** (หน้าแรก) to return to the Dashboard. |
| Banners | Under the top bar | Subscription notices (see [Read-only and renewal banners](#read-only-and-renewal-banners)). |
| Work area | Centre | The screen you are working on. |

The sidebar keeps its dark background in both light and dark themes.

### On a phone or small tablet

On narrow screens the sidebar is hidden and a **tab bar** appears along the bottom.

1. Tap one of the first four module icons in the tab bar to jump straight to that module.
2. To reach anything else, tap **More** (เพิ่มเติม) at the right end of the tab bar, or tap the menu icon at the top left. A drawer slides in from the left with the full menu.
3. Tap a screen in the drawer. The drawer closes by itself.

Some wide screens change their layout on a phone. For example, the production timeline becomes a simple list instead of bars.

## The command palette

The command palette is the fastest way to move around. It lists every screen you are allowed to open, including screens that sit inside a module group.

1. Press **Ctrl-K** (Windows) or **⌘K** (Mac). You can also click the search box in the top bar, or press **/** when the cursor is not in a text field.
2. Start typing part of a screen name, for example `receipt` or `ใบรับ`.
3. Use the arrow keys to pick a result and press **Enter**, or click it.

Pressing **Ctrl-K** again closes the palette, and so does **Esc**. When you are typing in a text box, **/** types a normal slash and does not open the palette.

> **Note:** The palette moves you between screens. It does not search inside records, so you cannot use it to find a customer or a document number. Each list screen has its own search and filter boxes for that.

## Theme: light or dark

Click the sun/moon button in the top bar. Its label reads **Switch to dark** (เปลี่ยนเป็นโหมดมืด) or **Switch to light** (เปลี่ยนเป็นโหมดสว่าง). Until you choose a theme, the system follows your computer's or phone's own light/dark setting. Once you have chosen, your choice is remembered on that device.

## Density: Comfortable, Compact and Touch

Density controls how tightly rows and buttons are packed.

| Density | Thai | When it is used |
|---|---|---|
| Comfortable | สบายตา | The default on computers with a mouse. |
| Compact | กะทัดรัด | More rows on screen, which suits accounts and long lists. |
| Touch | (automatic) | Larger buttons and text for fingers and gloves. It switches on by itself on touch-screen devices and is always used on the **Goods issues** and **Scan station** screens. |

To switch between Comfortable and Compact, click the density button (the rows icon) in the top bar. Your choice is remembered on that device. The density button is hidden while Touch is active, so on a touch-screen device you stay in Touch.

## Language: Thai or English

The system starts in Thai. To switch, click the language button in the top bar. It always shows the language you will switch **to**: it reads **English** while you are in Thai and **ภาษาไทย** while you are in English. The change happens straight away without reloading, and it is remembered on that device.

> **Note:** Printed-style documents always show both languages in their titles, for example "ใบเสนอราคา / Quotation", whichever language you are using. In Thai, document dates on quotations and invoices also show the Buddhist Era year, for example "7 Nov 2026 (BE 2569)". All other dates in the system use the Western calendar year.

## Messages, notifications and background jobs

### Toasts

Short messages appear in the corner of the screen when something happens, for example "Item created", "Payment recorded" or "Step started". Green means success, yellow is a warning and red is an error. These messages disappear by themselves.

### Background-job toasts

Some tasks take a while and run in the background: exporting documents, printing barcode labels and preparing tax exports. When you start one of these, a toast stays on screen showing the job is being queued, for example "Queuing label job…". It then changes to say the job has started (for example "Label job started") or failed.

> **Note:** At present the toast confirms that the job **started**. It does not give you a download link when the job finishes, and you cannot check the job's progress later from inside the system. If you need the finished file, ask your administrator where generated files are delivered for your factory.

### The notifications bell

The bell in the top bar is a placeholder. It does not open a list of notifications yet. Important events appear as toasts while you are working, and production delays appear in the **Alerts** list on the production timeline.

## Reading status chips

Every status in the system appears as a small **ink chip**: a coloured square with a symbol inside, followed by a word. You can always read the status from the symbol and the word, so the chips still make sense when printed in black and white or read by someone who is colour-blind.

### Production statuses

| Chip | Symbol | Colour | Meaning |
|---|---|---|---|
| Pending | ○ | Grey | Not started yet. |
| In Progress | ◐ | Cyan | Being worked on now. |
| Completed | ●✓ | Green | Finished. |
| Delayed | ▲ | Red | Running longer than its standard time. |
| On Hold | ❙❙ | Amber | Paused by the production lead. |
| Subcontracted | ↗ | Violet | Sent out to an outside workshop. |

### Document statuses (quotations and invoices)

| Chip | Symbol | Colour | Meaning |
|---|---|---|---|
| Draft (ฉบับร่าง) | ◇ | Grey | Created but not yet sent or issued. |
| Sent (ส่งแล้ว) | → | Cyan | The quotation has been sent to the customer. |
| Approved (อนุมัติแล้ว) | ✓ | Cyan | The customer has accepted the quotation. |
| Issued (ออกแล้ว) | ◐ | Cyan | The invoice is officially issued and can be paid. |
| Converted (แปลงเป็นใบแจ้งหนี้แล้ว) | ⇄ | Green | The quotation has been turned into an invoice. |
| Partially paid (ชำระบางส่วน) | ◑ | Amber | Part of the invoice has been paid. |
| Paid (ชำระแล้ว) | ✓ | Green | Fully paid. |
| Expired (หมดอายุ) | ◷ | Amber | The quotation is past its valid-until date. |
| Overdue (เกินกำหนด) | ▲ | Red | The invoice is past its due date and still unpaid. |
| Rejected (ปฏิเสธแล้ว) | ✕ | Red | The customer declined the quotation. |
| Void (ยกเลิก) | ○ | none | Cancelled. The word is grey and ~~struck through~~. |

### Stock and aging statuses

| Chip | Symbol | Colour | Meaning |
|---|---|---|---|
| In stock / Posted | ✓ | Green | Healthy stock, or a stock document that has been posted. |
| Low stock / Near minimum | ! | Amber | On-hand quantity is at or below the item's minimum. |
| Dead stock | ▲ | Red | No movement for the chosen period. |
| Current | ✓ | Green | Not yet due. |
| 1–30 days | ◐ | Cyan | Up to 30 days overdue. |
| 31–60 days | ! | Amber | 31 to 60 days overdue. |
| 61–90 days | ▲ | Red | 61 to 90 days overdue. |
| 90+ days | ▲▲ | Red | More than 90 days overdue. |

A chip with a **magenta ring** is selected or matched, for example the row you are working on.

## Document numbers

The system gives every document a number automatically when you create it. You never type document numbers yourself. Numbers run in order through the year and restart at 1 each January:

| Document | Example | Pattern |
|---|---|---|
| Quotation with VAT | QV20260001 | QV + year + 4-digit running number |
| Quotation without VAT | QNV20260001 | QNV + year + running number |
| Invoice | INV20260001 | INV + year + running number |
| Receipt / tax invoice | RE20260001 | RE + year + running number |
| Work order | WO20260001 | WO + year + running number |
| Item code | AA00001 | AA + 5-digit running number (never restarts) |

Quotations with VAT and without VAT use separate number series, as Thai tax practice requires. Document numbers appear in a monospaced font and in the link colour, so they are easy to spot in lists.

## How money and quantities are shown

- Money is shown in Thai baht with the ฿ sign, thousands separators and two decimal places, aligned to the right: **฿60,990.00**.
- Negative amounts are shown in red and in brackets: **(฿750.00)**.
- Quantities are shown with two decimal places and, where known, their unit: **152.00 kg**.
- The system calculates every total exactly, to the satang, without rounding errors. The totals you see on screen are the totals saved on the document.

## Why some menu items are missing

If a module or screen you expect is missing from the sidebar and the command palette, there are two possible reasons:

1. **Your role does not include it.** Each user has one or more roles, and each role grants specific permissions. Screens you have no permission for are **hidden completely**, not greyed out. If you type their web address directly, the system sends you back to the Dashboard. For example, a floor operator sees only the Scan station, and warehouse staff may see quantities but not costs.
2. **Your factory's subscription package does not include the module.** Each package switches modules on or off (HR & Payroll, Inventory, Production, Sales, Reports). A module outside your package is hidden for everyone, including Super Admins.

If you think you should have access, ask your administrator. They manage roles in **Admin & Access** (see [Admin & access](06-admin-access.md)). Some individual buttons can also be visible but disabled for you, for example **Void** on an invoice when you lack the right to void documents. In that case the dialog shows the action is restricted.

> **Note:** Some figures are masked even on screens you can open. Where you see a small lock with dots instead of a number, your role does not include permission to see that figure (usually costs or salaries). The figure is not sent to your computer at all.

## Read-only and renewal banners

Two yellow banners may appear under the top bar. Both are about your factory's subscription:

| Banner | What it means |
|---|---|
| "Your subscription term has ended. Renew by *date* (*n* days left) to avoid the workspace going read-only. Everything keeps working until then." | The subscription is in its grace period. Everything still works. On the last day it reads "Renew today…". |
| "This workspace is read-only because its subscription needs renewing…" | The grace period has run out. You can still look up records and run payroll reports, but nothing can be saved. Each time you try to save, a toast says "Change not saved". |

Only your administrator can renew. Pass the message on to them. Once the renewal invoice is paid, full access returns.

## Getting help

- **Inside your factory**: your administrator (the Super Admin) creates users, resets passwords, unlocks access and changes roles.
- **From the system provider**: if your administrator asks the provider's support team for help, support staff may be given a time-limited support session on your workspace. Every support session needs a written reason, and every action taken during it is recorded in your factory's audit log, so your administrator can see exactly what was done.
- **This guide**: see the [index](index.md) for the other chapters: [Sales](01-sales.md), [Inventory](02-inventory.md), [Production](03-production.md), [HR & payroll](04-hr-payroll.md), [Reports](05-reports.md) and [Admin & access](06-admin-access.md).

When you report a problem, include the screen name from the breadcrumb, the document number if there is one, and the exact wording of any message.
