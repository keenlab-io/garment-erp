import type { shellEn, iamEn } from "./en";

// Same key structure as the English resources (a missing/extra key is a compile error) but with
// widened string values. Group 7 adds the runtime th/en completeness check.
type ShellResources = {
  [Group in keyof typeof shellEn]: Record<keyof (typeof shellEn)[Group], string>;
};

type IamResources = {
  [Group in keyof typeof iamEn]: Record<keyof (typeof iamEn)[Group], string>;
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
    customers: "ลูกค้า",
    customersEmpty: "ยังไม่มีลูกค้า",
    customersLoadError: "โหลดข้อมูลลูกค้าไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง",
    columnName: "ชื่อ",
    columnTaxId: "เลขผู้เสียภาษี",
    columnBranchCode: "สาขา",
    columnCreditTerms: "เครดิต (วัน)",
  },
  login: {
    title: "เข้าสู่ระบบ",
    subtitle: "การเชื่อมต่อระบบยืนยันตัวตนจะมาใน M1 นี่คือเซสชันตัวอย่าง",
    continue: "เข้าสู่แอป",
    noticeReauth: "สิทธิ์การใช้งานของคุณเปลี่ยนแปลง กรุณาเข้าสู่ระบบอีกครั้ง",
    noticeSessionExpired: "เซสชันของคุณหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
  },
};

export const iamTh: IamResources = {
  nav: {
    users: "ผู้ใช้งาน",
    userDetail: "ผู้ใช้งาน",
    roles: "บทบาท",
    roleDetail: "บทบาท",
    audit: "ประวัติการตรวจสอบ",
    import: "นำเข้าข้อมูล",
  },
};
