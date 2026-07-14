import type { shellEn } from "./en";

// Same key structure as the English resources (a missing/extra key is a compile error) but with
// widened string values. Group 7 adds the runtime th/en completeness check.
type ShellResources = {
  [Group in keyof typeof shellEn]: Record<keyof (typeof shellEn)[Group], string>;
};

export const shellTh: ShellResources = {
  nav: {
    dashboard: "แดชบอร์ด",
    inventory: "คลังสินค้า",
    production: "การผลิต",
    sales: "การขาย",
    hr: "บุคคล & เงินเดือน",
    reports: "รายงาน",
    admin: "ผู้ดูแล & สิทธิ์",
  },
  topbar: {
    search: "ค้นหา",
    searchPlaceholder: "ค้นหาหรือไปยัง…",
    notifications: "การแจ้งเตือน",
    account: "บัญชี",
    signOut: "ออกจากระบบ",
    theme: "ธีม",
    themeToLight: "เปลี่ยนเป็นโหมดสว่าง",
    themeToDark: "เปลี่ยนเป็นโหมดมืด",
    language: "English",
    density: "ความหนาแน่น",
    densityComfortable: "สบายตา",
    densityCompact: "กะทัดรัด",
    openMenu: "เปิดเมนู",
    openNav: "เปิดการนำทาง",
    more: "เพิ่มเติม",
  },
  breadcrumb: {
    home: "หน้าแรก",
  },
  a11y: {
    primaryNav: "การนำทางหลัก",
    adminNav: "การนำทางผู้ดูแล",
    breadcrumb: "เส้นทางนำทาง",
    themeToggle: "สลับโหมดสี",
    densityToggle: "สลับความหนาแน่น",
  },
  palette: {
    placeholder: "ค้นหาโมดูลและการทำงาน…",
    empty: "ไม่พบรายการ",
    groupNavigate: "ไปที่",
  },
  page: {
    comingSoon: "เร็ว ๆ นี้",
    comingSoonBody: "โมดูลนี้จะมาในเฟสถัดไป โครงหน้าจอ การนำทาง และระบบดีไซน์พร้อมรองรับแล้ว",
  },
  dashboard: {
    title: "แดชบอร์ด",
    apiHealth: "สถานะ API",
    healthy: "เชื่อมต่อแล้ว",
    unreachable: "เชื่อมต่อ API ไม่ได้ — เซิร์ฟเวอร์ทำงานอยู่หรือไม่?",
    uptime: "ทำงานมาแล้ว {{seconds}} วินาที",
    invoices: "ใบแจ้งหนี้",
    invoicesEmpty: "ตารางใบแจ้งหนี้จะมาพร้อม Data Table (M0 กลุ่ม 5)",
  },
  login: {
    title: "เข้าสู่ระบบ",
    subtitle: "การเชื่อมต่อระบบยืนยันตัวตนจะมาใน M1 นี่คือเซสชันตัวอย่าง",
    continue: "เข้าสู่แอป",
  },
};
