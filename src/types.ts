export interface Student {
  id: string;
  name: string;
  isMonitor?: boolean;
}

export interface ClassConfig {
  lat: number;
  lng: number;
  radius: number; // in meters
  startTime: string; // "06:30"
  endTime: string; // "07:15"
  excuseDeadline?: string; // "17:00" - Hạn chót duyệt/xử lý đơn nghỉ phép
}

export interface TeacherAuthState {
  isAuthenticated: boolean;
  activeClass: string; // The single class this teacher is authorized to view/manage
  isMaster?: boolean;
}

export interface AdminAuthState {
  isAuthenticated: boolean;
}

export interface UnionAuthState {
  isAuthenticated: boolean;
}

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'proxy_pending'
  | 'excused_pending'
  | 'excused_approved'
  | 'excused_rejected'
  | 'absent'
  | 'none';

export interface SystemSettings {
  masterPin?: string;
  maxLateDays: number; // Số ngày cho phép nộp & duyệt đơn trễ do BGH cấu hình
}

export interface AttendanceRecord {
  name: string;
  status: AttendanceStatus;
  checkinSource?: 'gps' | 'manual' | 'monitor_proxy';
  checkinTime?: number;
  distance?: number;
  flagged?: boolean;
  flagReason?: string;
  excuseReason?: string;
  excusePhoto?: string | null;
  excusePhotoCaptureTime?: string | null;
  proxyPhoto?: string | null;
  proxyPhotoCaptureTime?: string | null;
  excuseSubmittedAt?: number;
  excuseDecidedAt?: number;
  lastUpdatedByTeacherAt?: number;
  lastUpdatedAction?: string;
  isLateExcuse?: boolean;
  excuseDebtType?: 'has_paper' | 'owing_paper';
  debtSupplementDeadline?: string;
  note?: string;
  isLockedAbsent?: boolean;
  lockedPenaltyReason?: string;
}

export interface DayData {
  status: 'open' | 'closed';
  closedAt?: number;
  records: Record<string, AttendanceRecord>; // key is studentId
}

export type UserRole = 'teacher' | 'student' | 'admin' | 'union';

export type ReportMode = 'day' | 'week' | 'month' | 'semester';

export interface StudentReportStats {
  studentId: string;
  name: string;
  totalSessions: number;
  presentCount: number;
  excusedCount: number;
  absentCount: number;
  rate: number;
}

export interface ClassAttendanceReport {
  lop: string;
  totalDaysRecorded: number;
  students: StudentReportStats[];
}

export interface ClassSummaryReport {
  lop: string;
  totalStudents: number;
  totalDaysRecorded: number;
  presentCount: number;
  excusedCount: number;
  absentCount: number;
  rate: number;
}

export interface SchoolAttendanceReport {
  mode: ReportMode;
  targetValue: string;
  totalClasses: number;
  totalStudents: number;
  totalSessionsRecorded: number;
  totalPresent: number;
  totalExcused: number;
  totalAbsent: number;
  schoolRate: number;
  classes: ClassSummaryReport[];
}

export interface DetailedAbsenceRecord {
  lop?: string;
  date: string;
  studentId: string;
  name: string;
  status: AttendanceStatus;
  excuseReason?: string;
  excusePhoto?: string | null;
  excuseDebtType?: 'has_paper' | 'owing_paper';
  note?: string;
}

export interface ClassOperationLog {
  id: string;
  lop: string;
  date: string;
  timestamp: number;
  actorRole: 'gvcn' | 'student' | 'bcs';
  actorName: string;
  actorId?: string;
  actionTitle: string;
  details: string;
  photo?: string | null;
  photoCaptureTime?: string | null;
}


export interface TimeSlot {
  startTime: string; // "08:30"
  endTime: string;   // "09:15"
}

export interface SpecialCheckinRule {
  studentId: string;
  studentName: string;
  timeSlots: TimeSlot[];
  forceGps: boolean;
  forcePhoto: boolean;
  isActive: boolean;
}

export interface PendingDeviceRequest {
  id: string; // studentId + "_" + fp
  studentId: string;
  studentName: string;
  fingerprint: string;
  requestedAt: number;
}
