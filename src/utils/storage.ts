import * as XLSX from 'xlsx';
import {
  Student,
  ClassConfig,
  DayData,
  AttendanceRecord,
  AttendanceStatus,
  ReportMode,
  StudentReportStats,
  ClassAttendanceReport,
  ClassSummaryReport,
  SchoolAttendanceReport,
  DetailedAbsenceRecord,
  ClassOperationLog,
} from '../types';

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function lopSlug(lop: string): string {
  return String(lop || '')
    .trim()
    .replace(/[\/\\"'\s]+/g, '_');
}

export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localTimeKey(d: Date = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  if (!timeStr || !timeStr.includes(':')) return timeStr;
  const [h, m] = timeStr.split(':').map(Number);
  const totalMins = h * 60 + m + minutesToAdd;
  const newH = Math.floor(totalMins / 60) % 24;
  const newM = totalMins % 60;
  return `${pad(newH)}:${pad(newM)}`;
}

export function fmtTime(ts: number | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function fmtDateVN(dateKey: string): string {
  if (!dateKey) return '';
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

/**
 * Format timestamp, Date, or EXIF string to exact 24-hour format "HHhMM, dd/mm/yyyy"
 * e.g., 12h45, 05/11/2026
 */
export function format24hDateTime(val: number | string | Date | undefined | null): string {
  if (!val) return '—';

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return '—';
    // If it's already in "HHhMM, dd/mm/yyyy" or "HHhMM dd/mm/yyyy" format
    if (/^\d{1,2}h\d{2},?\s*\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      return trimmed;
    }
    // Handle EXIF format "YYYY:MM:DD HH:MM:SS" or "YYYY-MM-DD HH:MM:SS"
    const exifMatch = trimmed.match(/^(\d{4})[:/-](\d{2})[:/-](\d{2})\s+(\d{2}):(\d{2})/);
    if (exifMatch) {
      const [_, y, m, d, hh, mm] = exifMatch;
      return `${hh}h${mm}, ${d}/${m}/${y}`;
    }
  }

  let date: Date;
  if (typeof val === 'number') {
    date = new Date(val);
  } else if (val instanceof Date) {
    date = val;
  } else {
    date = new Date(val);
  }

  if (isNaN(date.getTime())) return String(val);

  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const y = date.getFullYear();

  return `${hh}h${mm}, ${d}/${m}/${y}`;
}

// Storage helpers & School Tenant Isolation
export const SCHOOL_DISPLAY_NAME_KEY = 'security:schoolDisplayName';
export const SCHOOL_LOGO_KEY = 'security:schoolLogo';
export const ACTIVE_SCHOOL_STORAGE_KEY = 'app_active_school_id';

export function toSchoolSlug(input: string): string {
  return String(input || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function getSchoolId(): string {
  if (typeof window === 'undefined') return 'default';
  const params = new URLSearchParams(window.location.search);
  const s = params.get('school');
  if (s && s.trim()) {
    const slug = toSchoolSlug(s);
    if (slug) {
      return slug;
    }
  }
  return 'default';
}

export function getSchoolName(): string {
  if (typeof window === 'undefined') return 'DEFAULT';
  const customName = sGet<string>(SCHOOL_DISPLAY_NAME_KEY, '');
  if (customName && customName.trim()) {
    return customName.trim();
  }
  const params = new URLSearchParams(window.location.search);
  const s = params.get('school');
  if (s && s.trim()) {
    return s.trim().replace(/_/g, ' ').toUpperCase();
  }
  const schoolId = getSchoolId();
  if (schoolId !== 'default') {
    return schoolId.replace(/_/g, ' ').toUpperCase();
  }
  return 'DEFAULT';
}

export function setSchoolDisplayName(name: string): boolean {
  const clean = (name || '').trim();
  if (!clean) return false;
  return sSet(SCHOOL_DISPLAY_NAME_KEY, clean);
}

export function getSchoolLogo(): string {
  if (typeof window === 'undefined') return '';
  return sGet<string>(SCHOOL_LOGO_KEY, '') || '';
}

export function setSchoolLogo(logoDataUrl: string): boolean {
  return sSet(SCHOOL_LOGO_KEY, (logoDataUrl || '').trim());
}

export function sGet<T>(key: string, defaultValue: T): T {
  try {
    const schoolId = getSchoolId();
    const scopedKey = `sc_${schoolId}:${key}`;
    const raw = localStorage.getItem(scopedKey);
    if (raw === null) {
      // Strictly isolate non-default schools: never read unscoped legacy keys
      if (schoolId === 'default') {
        const legacyRaw = localStorage.getItem(key);
        if (legacyRaw !== null) return JSON.parse(legacyRaw) as T;
      }
      return defaultValue;
    }
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error('sGet error for key:', key, e);
    return defaultValue;
  }
}

export function sSet<T>(key: string, value: T): boolean {
  try {
    const scopedKey = `sc_${getSchoolId()}:${key}`;
    localStorage.setItem(scopedKey, JSON.stringify(value));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app_storage_updated', { detail: { key } }));
    }
    return true;
  } catch (e) {
    console.error('sSet error for key:', key, e);
    return false;
  }
}

export const ROSTER_LIST_KEY = 'rosters:list';

export function getLopList(): string[] {
  return sGet<string[]>(ROSTER_LIST_KEY, []);
}

export function ensureLopInList(lop: string): void {
  const clean = lop.trim();
  if (!clean) return;
  const list = getLopList();
  if (!list.includes(clean)) {
    list.push(clean);
    sSet(ROSTER_LIST_KEY, list);
  }
}

export function getRoster(lop: string): Student[] {
  if (!lop) return [];
  return sGet<Student[]>('roster:' + lopSlug(lop), []);
}

export function setRoster(lop: string, students: Student[]): boolean {
  const ok = sSet('roster:' + lopSlug(lop), students);
  if (ok) ensureLopInList(lop);
  return ok;
}

export function getClassConfig(lop: string): ClassConfig | null {
  if (!lop) return null;
  return sGet<ClassConfig | null>('classConfig:' + lopSlug(lop), null);
}

export function setClassConfig(lop: string, cfg: ClassConfig): boolean {
  return sSet('classConfig:' + lopSlug(lop), cfg);
}

export function checkAndApplyDebtExpiration(lop: string, date: string, day: DayData): boolean {
  if (!day || !day.records) return false;
  const maxLateDays = getMaxLateDays();
  const windowCheck = isDateWithinLateWindow(date, maxLateDays);

  if (!windowCheck.isExpired) return false;

  let modified = false;
  Object.keys(day.records).forEach((sId) => {
    const rec = day.records[sId];
    if (
      rec &&
      rec.excuseDebtType === 'owing_paper' &&
      !rec.excusePhoto &&
      (rec.status === 'excused_approved' || rec.status === 'excused_pending')
    ) {
      rec.status = 'absent';
      rec.lastUpdatedAction = `Hệ thống tự động chuyển sang Vắng không phép do quá thời hạn ${maxLateDays} ngày quy định của BGH mà chưa bổ sung ảnh đơn`;
      rec.lastUpdatedByTeacherAt = Date.now();
      modified = true;
    }
  });

  return modified;
}

export function getDayData(lop: string, date: string): DayData {
  const key = `day:${lopSlug(lop)}:${date}`;
  let existing = sGet<DayData | null>(key, null);
  if (!existing) {
    existing = { status: 'open', records: {} };
    sSet(key, existing);
  } else {
    if (checkAndApplyDebtExpiration(lop, date, existing)) {
      sSet(key, existing);
    }
  }
  return existing;
}

export function setDayData(lop: string, date: string, day: DayData): boolean {
  const key = `day:${lopSlug(lop)}:${date}`;
  return sSet(key, day);
}

export function getClassLogs(lop: string): ClassOperationLog[] {
  if (!lop) return [];
  return sGet<ClassOperationLog[]>('classLogs:' + lopSlug(lop), []);
}

export function setClassLogs(lop: string, logs: ClassOperationLog[]): boolean {
  if (!lop) return false;
  return sSet('classLogs:' + lopSlug(lop), logs.slice(0, 120));
}

// Distance Calculation (Haversine in meters)
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Device Fingerprint
function hashStr(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) + h + str.charCodeAt(i);
    h = h & h;
  }
  return (h >>> 0).toString(16);
}

export function getDeviceFingerprint(): string {
  const n = navigator;
  const s = screen;
  const parts = [
    n.userAgent,
    n.platform,
    n.language,
    `${s.width}x${s.height}`,
    s.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    n.hardwareConcurrency || 'na',
  ].join('|');
  return hashStr(parts);
}

// Image compression to Data URL (canvas-based)
export function fileToCompressedDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const presets = [
          { w: 700, q: 0.6 },
          { w: 500, q: 0.5 },
          { w: 380, q: 0.4 },
          { w: 260, q: 0.3 },
        ];
        const MAX_LEN = 45000;
        let result = '';
        for (const p of presets) {
          const scale = Math.min(1, p.w / img.width);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', p.q);
            result = dataUrl;
            if (dataUrl.length <= MAX_LEN) break;
          }
        }
        resolve(result || (e.target?.result as string));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// File Parsing for Roster
function looksLikeHeaderCell(v: unknown): boolean {
  const t = String(v || '')
    .trim()
    .toLowerCase();
  return [
    'mshs',
    'ma so',
    'mã số',
    'ma so hs',
    'mã số hs',
    'stt',
    'id',
    'so thu tu',
    'số thứ tự',
    'student id',
    'họ và tên',
    'họ tên',
    'name',
  ].includes(t);
}

export function parseRosterRows(rows: unknown[][]): string {
  return rows
    .map((row) => [String(row[0] || '').trim(), String(row[1] || '').trim()])
    .filter((row) => row[0])
    .filter((row) => !looksLikeHeaderCell(row[0]))
    .map((row) => `${row[0]}, ${row[1]}`)
    .join('\n');
}

export function parseCsvText(text: string): unknown[][] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const delim =
    lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  return lines.map((l) => l.split(delim).map((c) => c.trim()));
}

export async function parseRosterFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') {
    const text = await file.text();
    return parseRosterRows(parseCsvText(text));
  } else if (ext === 'xlsx' || ext === 'xls') {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
    });
    return parseRosterRows(rows);
  }
  throw new Error('Định dạng file chưa hỗ trợ. Vui lòng chọn file .csv, .xlsx hoặc .xls');
}

export async function parseSchoolMasterFile(file: File): Promise<Map<string, Student[]>> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  let rawRows: unknown[][] = [];
  if (ext === 'csv') {
    const text = await file.text();
    rawRows = parseCsvText(text);
  } else if (ext === 'xlsx' || ext === 'xls') {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
    });
  } else {
    throw new Error('Định dạng file chưa hỗ trợ. Vui lòng chọn file .csv, .xlsx hoặc .xls');
  }

  if (rawRows.length === 0) return new Map();

  let idCol = 0;
  let nameCol = 1;
  let lopCol = 2;

  let startRow = 0;
  for (let r = 0; r < Math.min(5, rawRows.length); r++) {
    const row = rawRows[r].map(c => String(c || '').trim().toLowerCase());
    for (let c = 0; c < row.length; c++) {
      const val = row[c];
      if (/mã|id|mshs|maso/.test(val)) idCol = c;
      if (/họ.*tên|name|hoten/.test(val)) nameCol = c;
      if (/lớp|class|phòng/.test(val)) lopCol = c;
    }
    if (row.some(val => /mã|id|tên|name|lớp|class/.test(val))) {
      startRow = r + 1;
      break;
    }
  }

  const classMap = new Map<string, Student[]>();

  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;
    const id = String(row[idCol] || '').trim();
    const name = String(row[nameCol] || '').trim();
    const lop = String(row[lopCol] || '').trim().toUpperCase();

    if (!id || !name) continue;
    if (looksLikeHeaderCell(id) || looksLikeHeaderCell(name)) continue;

    const cleanLop = lop || 'CHUA_PHAN_LOP';
    if (!classMap.has(cleanLop)) {
      classMap.set(cleanLop, []);
    }
    classMap.get(cleanLop)!.push({ id, name });
  }

  return classMap;
}

// PIN & Security Management & System Settings
export const MASTER_PIN_KEY = 'security:masterPin';
export const DEFAULT_MASTER_PIN = 'Admin@2026!';

export const UNION_PIN_KEY = 'security:unionPin';
export const DEFAULT_UNION_PIN = 'DoanTruong@2026!';

export const MAX_LATE_DAYS_KEY = 'security:maxLateDays';
export const DEFAULT_MAX_LATE_DAYS = 2; // Mặc định BGH cho phép duyệt trễ trong vòng 2 ngày

export function getMasterPin(): string {
  return sGet<string>(MASTER_PIN_KEY, DEFAULT_MASTER_PIN);
}

export function setMasterPin(pin: string): boolean {
  if (!pin || pin.trim().length < 4) return false;
  return sSet(MASTER_PIN_KEY, pin.trim());
}

export function getUnionPin(): string {
  return sGet<string>(UNION_PIN_KEY, DEFAULT_UNION_PIN);
}

export function setUnionPin(pin: string): boolean {
  if (!pin || pin.trim().length < 4) return false;
  return sSet(UNION_PIN_KEY, pin.trim());
}

export function getMaxLateDays(): number {
  const val = sGet<number>(MAX_LATE_DAYS_KEY, DEFAULT_MAX_LATE_DAYS);
  return typeof val === 'number' && val >= 0 ? val : DEFAULT_MAX_LATE_DAYS;
}

export function setMaxLateDays(days: number): boolean {
  const cleanDays = Math.max(0, Math.floor(days));
  return sSet(MAX_LATE_DAYS_KEY, cleanDays);
}

/**
 * Tính số ngày cách hôm nay (dương: quá khứ, 0: hôm nay, âm: tương lai)
 */
export function getDaysDiffFromToday(dateStr: string): number {
  if (!dateStr) return 0;
  const todayStr = localDateKey();
  if (dateStr === todayStr) return 0;

  const parts1 = dateStr.split('-').map(Number);
  const parts2 = todayStr.split('-').map(Number);
  if (parts1.length !== 3 || parts2.length !== 3) return 0;

  const dt1 = new Date(parts1[0], parts1[1] - 1, parts1[2]);
  const dt2 = new Date(parts2[0], parts2[1] - 1, parts2[2]);

  const diffTime = dt2.getTime() - dt1.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Kiểm tra xem ngày có nằm trong phạm vi cho phép nộp/duyệt đơn trễ không
 */
export function isDateWithinLateWindow(dateStr: string, maxDays: number = getMaxLateDays()): {
  isAllowed: boolean;
  diffDays: number;
  isToday: boolean;
  isFuture: boolean;
  isExpired: boolean;
} {
  const diffDays = getDaysDiffFromToday(dateStr);
  const isToday = diffDays === 0;
  const isFuture = diffDays < 0;
  const isExpired = diffDays > maxDays;
  const isAllowed = !isFuture && diffDays <= maxDays;

  return { isAllowed, diffDays, isToday, isFuture, isExpired };
}

export function calculateSupplementDeadline(dateStr: string, maxDays: number = getMaxLateDays()): string {
  try {
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3) return dateStr;
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    dt.setDate(dt.getDate() + maxDays);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

export function getClassPin(lop: string): string | null {
  if (!lop) return null;
  return sGet<string | null>('classPin:' + lopSlug(lop), null);
}

export function setClassPin(lop: string, pin: string): boolean {
  if (!lop || !pin) return false;
  return sSet('classPin:' + lopSlug(lop), pin.trim());
}

export function hasClassPin(lop: string): boolean {
  return getClassPin(lop) !== null;
}

export function checkClassPin(lop: string, inputPin: string): { valid: boolean; isMaster: boolean } {
  const cleanPin = (inputPin || '').trim();
  if (!cleanPin) return { valid: false, isMaster: false };

  // Check Master PIN
  if (cleanPin === getMasterPin()) {
    return { valid: true, isMaster: true };
  }

  // Check Class-specific PIN
  const classPin = getClassPin(lop);
  if (classPin && classPin === cleanPin) {
    return { valid: true, isMaster: false };
  }

  return { valid: false, isMaster: false };
}

export function clearClassAttendanceData(lop: string): boolean {
  const clean = lop.trim();
  if (!clean) return false;
  const slug = lopSlug(clean);
  try {
    const prefix = `sc_${getSchoolId()}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        k.startsWith(prefix) &&
        (k.includes(`day:${slug}:`) ||
          k.includes(`deviceUsage:${slug}:`) ||
          k.includes(`classLogs:${slug}`))
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    console.error('Error clearing class attendance data', e);
  }
  return true;
}

export function deleteLop(lop: string): boolean {
  const clean = lop.trim();
  if (!clean) return false;
  const list = getLopList();
  const filtered = list.filter((l) => l.toLowerCase() !== clean.toLowerCase());
  sSet(ROSTER_LIST_KEY, filtered);

  const slug = lopSlug(clean);
  try {
    const prefix = `sc_${getSchoolId()}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        k.startsWith(prefix) &&
        (k.includes(`day:${slug}:`) ||
          k.includes(`deviceUsage:${slug}:`) ||
          k.includes(`classPin:${slug}`) ||
          k.includes(`roster:${slug}`) ||
          k.includes(`classLogs:${slug}`) ||
          k.includes(`classConfig:${slug}`))
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    console.error('Error deleting class keys', e);
  }
  return true;
}

// Seed sample class if first time and not initialized before
export function initializeSampleDataIfEmpty() {
  const isInitialized = sGet<boolean>('app_initialized', false);
  if (!isInitialized) {
    sSet('app_initialized', true);
  }
}

export function getWeekRange(dateStr: string): { start: string; end: string; label: string } {
  if (!dateStr || !dateStr.includes('-')) {
    const today = new Date();
    dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  }
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(y, m, day);

  const dayOfWeek = d.getDay(); // 0 is Sun, 1 is Mon...
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const start = fmt(monday);
  const end = fmt(sunday);
  const label = `Tuần: ${pad(monday.getDate())}/${pad(monday.getMonth() + 1)} - ${pad(sunday.getDate())}/${pad(sunday.getMonth() + 1)}/${sunday.getFullYear()}`;
  return { start, end, label };
}

export function isDateInReportRange(dateStr: string, mode: ReportMode, targetValue: string): boolean {
  if (!dateStr) return false;
  if (mode === 'day') {
    return dateStr === targetValue;
  }
  if (mode === 'week') {
    const { start, end } = getWeekRange(targetValue);
    return dateStr >= start && dateStr <= end;
  }
  if (mode === 'month') {
    return dateStr.startsWith(targetValue);
  }
  if (mode === 'semester') {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const m = parseInt(parts[1], 10);
      if (targetValue === 'HK1') {
        return [9, 10, 11, 12, 1].includes(m);
      } else if (targetValue === 'HK2') {
        return [2, 3, 4, 5, 6, 7, 8].includes(m);
      }
    }
  }
  return false;
}

export function getReportModeLabel(mode: ReportMode, targetValue: string): string {
  if (mode === 'day') {
    return `Ngày ${fmtDateVN(targetValue)}`;
  }
  if (mode === 'week') {
    const { label } = getWeekRange(targetValue);
    return label;
  }
  if (mode === 'month') {
    const parts = targetValue.split('-');
    if (parts.length >= 2) return `Tháng ${parts[1]}/${parts[0]}`;
    return `Tháng ${targetValue}`;
  }
  if (mode === 'semester') {
    return targetValue === 'HK1' ? 'Học kỳ 1 (Tháng 9 - Tháng 1)' : 'Học kỳ 2 (Tháng 2 - Tháng 8)';
  }
  return targetValue;
}

export function getAttendanceReport(
  lop: string,
  mode: ReportMode,
  targetValue: string
): ClassAttendanceReport {
  const roster = getRoster(lop);
  const slug = lopSlug(lop);
  const prefix = `sc_${getSchoolId()}:day:${slug}:`;

  const dayRecordsList: { date: string; records: Record<string, { status: string }> }[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const dateStr = k.replace(prefix, '');
        if (isDateInReportRange(dateStr, mode, targetValue)) {
          const dayData = sGet<DayData | null>(k.replace(`sc_${getSchoolId()}:`, ''), null);
          if (dayData && dayData.records) {
            dayRecordsList.push({ date: dateStr, records: dayData.records });
          }
        }
      }
    }
  } catch (e) {
    console.error('Error computing attendance report', e);
  }

  const totalDays = dayRecordsList.length;

  const statsMap: Record<string, { present: number; excused: number; absent: number }> = {};
  roster.forEach((s) => {
    statsMap[s.id] = { present: 0, excused: 0, absent: 0 };
  });

  dayRecordsList.forEach((d) => {
    roster.forEach((s) => {
      const rec = d.records[s.id];
      const st = rec?.status || 'none';
      if (st === 'present') {
        statsMap[s.id].present++;
      } else if (['excused_pending', 'excused_approved', 'excused_rejected'].includes(st)) {
        statsMap[s.id].excused++;
      } else if (st === 'absent') {
        statsMap[s.id].absent++;
      }
    });
  });

  const studentsStats: StudentReportStats[] = roster.map((s) => {
    const st = statsMap[s.id] || { present: 0, excused: 0, absent: 0 };
    const recordedCount = totalDays;
    const rate = recordedCount > 0 ? Math.round((st.present / recordedCount) * 100) : 0;
    return {
      studentId: s.id,
      name: s.name,
      totalSessions: recordedCount,
      presentCount: st.present,
      excusedCount: st.excused,
      absentCount: st.absent,
      rate,
    };
  });

  return {
    lop,
    totalDaysRecorded: totalDays,
    students: studentsStats,
  };
}

export function getDetailedAbsenceRecords(
  lop: string,
  mode: ReportMode,
  targetValue: string
): DetailedAbsenceRecord[] {
  const roster = getRoster(lop);
  const slug = lopSlug(lop);
  const prefix = `sc_${getSchoolId()}:day:${slug}:`;
  const result: DetailedAbsenceRecord[] = [];

  const studentNameMap: Record<string, string> = {};
  roster.forEach((s) => {
    studentNameMap[s.id] = s.name;
  });

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const dateStr = k.replace(prefix, '');
        if (isDateInReportRange(dateStr, mode, targetValue)) {
          const dayData = sGet<DayData | null>(k.replace(`sc_${getSchoolId()}:`, ''), null);
          if (dayData && dayData.records) {
            Object.entries(dayData.records).forEach(([studentId, record]) => {
              if (record.status !== 'present' && record.status !== 'none') {
                result.push({
                  lop,
                  date: dateStr,
                  studentId: studentId,
                  name: studentNameMap[studentId] || record.name || 'Unknown',
                  status: record.status,
                  excuseReason: record.excuseReason,
                  excusePhoto: record.excusePhoto,
                  excuseDebtType: record.excuseDebtType,
                  note: record.note,
                });
              }
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('Error computing detailed absence records', e);
  }

  // Sort by date descending
  return result.sort((a, b) => b.date.localeCompare(a.date));
}

export function getSchoolAttendanceReport(
  mode: ReportMode,
  targetValue: string
): SchoolAttendanceReport {
  const classList = getLopList();
  const classes: ClassSummaryReport[] = [];
  let totalStudents = 0;
  let totalPresent = 0;
  let totalExcused = 0;
  let totalAbsent = 0;
  let totalSessionsSum = 0;

  classList.forEach((lop) => {
    const classReport = getAttendanceReport(lop, mode, targetValue);
    const roster = getRoster(lop);
    const numStudents = roster.length;
    totalStudents += numStudents;

    let classPresent = 0;
    let classExcused = 0;
    let classAbsent = 0;

    classReport.students.forEach((s) => {
      classPresent += s.presentCount;
      classExcused += s.excusedCount;
      classAbsent += s.absentCount;
    });

    const totalPossibleSlots = numStudents * classReport.totalDaysRecorded;
    const rate = totalPossibleSlots > 0 ? Math.round((classPresent / totalPossibleSlots) * 100) : 0;

    totalPresent += classPresent;
    totalExcused += classExcused;
    totalAbsent += classAbsent;
    totalSessionsSum += classReport.totalDaysRecorded;

    classes.push({
      lop,
      totalStudents: numStudents,
      totalDaysRecorded: classReport.totalDaysRecorded,
      presentCount: classPresent,
      excusedCount: classExcused,
      absentCount: classAbsent,
      rate,
    });
  });

  const totalPossibleAllSchool = classes.reduce(
    (acc, c) => acc + c.totalStudents * c.totalDaysRecorded,
    0
  );
  const schoolRate =
    totalPossibleAllSchool > 0 ? Math.round((totalPresent / totalPossibleAllSchool) * 100) : 0;

  return {
    mode,
    targetValue,
    totalClasses: classList.length,
    totalStudents,
    totalSessionsRecorded: totalSessionsSum,
    totalPresent,
    totalExcused,
    totalAbsent,
    schoolRate,
    classes,
  };
}

export function getAllDetailedAbsenceRecords(
  mode: ReportMode,
  targetValue: string
): DetailedAbsenceRecord[] {
  const classList = getLopList();
  let allAbsences: DetailedAbsenceRecord[] = [];
  classList.forEach((lop) => {
    const recs = getDetailedAbsenceRecords(lop, mode, targetValue);
    allAbsences = allAbsences.concat(recs);
  });
  return allAbsences.sort((a, b) => b.date.localeCompare(a.date));
}

