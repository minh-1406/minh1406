import React, { useState, useMemo } from 'react';
import {
  X,
  Clock,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  ShieldCheck,
  Zap,
  Users,
  Calendar,
  Camera,
  FileText,
  KeyRound,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { DayData, AttendanceRecord } from '../types';
import {
  getSchoolId,
  fmtDateVN,
  fmtTime,
  format24hDateTime,
  getClassLogs,
  lopSlug,
} from '../utils/storage';

interface AdminLiveActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  classList: string[];
  onOpenLightbox: (data: any) => void;
  lockedClass?: string;
}

export interface ActivityLogItem {
  id: string;
  lop: string;
  date: string;
  studentId: string;
  studentName: string;
  timestamp: number;
  type: 'gps' | 'bcs_proxy' | 'gvcn_manual' | 'excuse_sub' | 'excuse_dec' | 'proxy_dec' | 'gvcn_system';
  actionTitle: string;
  details: string;
  photo?: string | null;
  photoCaptureTime?: string | null;
  status?: string;
  record?: AttendanceRecord;
}

export const AdminLiveActivityModal: React.FC<AdminLiveActivityModalProps> = ({
  isOpen,
  onClose,
  classList,
  onOpenLightbox,
  lockedClass,
}) => {
  const [filterClass, setFilterClass] = useState<string>(lockedClass || 'ALL');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Extract all real-time activities across classes (or lockedClass for GVCN) from localStorage / Firestore cache
  const allActivities = useMemo(() => {
    if (!isOpen) return [];
    const list: ActivityLogItem[] = [];
    const schoolId = getSchoolId();
    const prefix = `sc_${schoolId}:day:`;
    const targetClasses = lockedClass ? [lockedClass] : classList;
    const lockedSlug = lockedClass ? lopSlug(lockedClass) : null;

    // 1. Extract attendance & excuse events from day records
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const dayData = JSON.parse(raw) as DayData;
            const parts = key.split(':');
            const dateStr = parts[parts.length - 1]; // YYYY-MM-DD
            const slug = parts[parts.length - 2];

            if (lockedSlug && slug.toLowerCase() !== lockedSlug.toLowerCase()) {
              continue;
            }

            const lopName =
              targetClasses.find(
                (c) => lopSlug(c).toLowerCase() === slug.toLowerCase()
              ) || lockedClass || slug.toUpperCase();

            // Check if day was manually closed by teacher
            if (dayData.status === 'closed' && dayData.closedAt) {
              list.push({
                id: `${slug}-${dateStr}-dayclosed`,
                lop: lopName,
                date: dateStr,
                studentId: 'GVCN',
                studentName: `GVCN Lớp ${lopName}`,
                timestamp: dayData.closedAt,
                type: 'gvcn_system',
                actionTitle: 'GVCN đóng / khóa sổ điểm danh',
                details: `Đã khóa sổ điểm danh ngày ${fmtDateVN(dateStr)}`,
              });
            }

            if (dayData.records) {
              Object.keys(dayData.records).forEach((studentId) => {
                const rec = dayData.records[studentId];
                const studentName = rec.name || studentId;

                // 1a. Checkin time (GPS / BCS proxy / Manual)
                if (rec.checkinTime) {
                  let type: ActivityLogItem['type'] = 'gps';
                  let actionTitle = 'Học sinh tự điểm danh (GPS)';
                  let details =
                    rec.status === 'late'
                      ? `Điểm danh GPS (Đi muộn) • Khoảng cách: ${rec.distance ?? 0}m`
                      : `Điểm danh GPS đúng giờ • Khoảng cách: ${rec.distance ?? 0}m`;

                  if (rec.checkinSource === 'monitor_proxy') {
                    type = 'bcs_proxy';
                    actionTitle = 'Ban cán sự điểm danh hộ qua ảnh';
                    details = rec.lastUpdatedAction || 'Chờ GVCN phê duyệt';
                  } else if (rec.checkinSource === 'manual') {
                    type = 'gvcn_manual';
                    actionTitle = 'GVCN điểm danh trực tiếp';
                    details = rec.lastUpdatedAction || 'GVCN đánh dấu thủ công';
                  }

                  if (rec.flagged) {
                    details += ` • ⚠️ CẢNH BÁO GIAN LẬN: ${rec.flagReason || 'Thiết bị này vừa dùng để điểm danh cho học sinh khác hôm nay'}`;
                  }

                  list.push({
                    id: `${slug}-${dateStr}-${studentId}-checkin`,
                    lop: lopName,
                    date: dateStr,
                    studentId,
                    studentName,
                    timestamp: rec.checkinTime,
                    type,
                    actionTitle,
                    details,
                    photo: rec.excusePhoto,
                    photoCaptureTime: rec.excusePhotoCaptureTime,
                    status: rec.status,
                    record: rec,
                  });
                }

                // 1b. Excuse Submitted
                if (rec.excuseSubmittedAt && rec.excuseSubmittedAt !== rec.checkinTime) {
                  list.push({
                    id: `${slug}-${dateStr}-${studentId}-excusesub`,
                    lop: lopName,
                    date: dateStr,
                    studentId,
                    studentName,
                    timestamp: rec.excuseSubmittedAt,
                    type: 'excuse_sub',
                    actionTitle: 'Học sinh / PH nộp đơn xin phép',
                    details: `Lý do: ${rec.excuseReason || 'Nghỉ phép'}`,
                    photo: rec.excusePhoto,
                    photoCaptureTime: rec.excusePhotoCaptureTime,
                    status: rec.status,
                    record: rec,
                  });
                }

                // 1c. Teacher decision on excuse, proxy, or manual status change
                if (rec.lastUpdatedByTeacherAt && rec.lastUpdatedAction) {
                  const isProxyDec =
                    rec.lastUpdatedAction.includes('GVCN đã duyệt điểm danh hộ') ||
                    rec.lastUpdatedAction.includes('GVCN đã từ chối điểm danh hộ');
                  const isExcuseDec =
                    rec.lastUpdatedAction.includes('GV') &&
                    (rec.lastUpdatedAction.includes('phép') || rec.lastUpdatedAction.includes('duyệt'));

                  if (isProxyDec || isExcuseDec) {
                    list.push({
                      id: `${slug}-${dateStr}-${studentId}-teacheract`,
                      lop: lopName,
                      date: dateStr,
                      studentId,
                      studentName,
                      timestamp: rec.lastUpdatedByTeacherAt,
                      type: isProxyDec ? 'proxy_dec' : 'excuse_dec',
                      actionTitle: isProxyDec
                        ? 'GVCN xử lý điểm danh hộ BCS'
                        : 'GVCN xử lý đơn xin phép',
                      details: rec.lastUpdatedAction,
                      photo: rec.excusePhoto,
                      photoCaptureTime: rec.excusePhotoCaptureTime,
                      status: rec.status,
                      record: rec,
                    });
                  } else if (rec.checkinSource !== 'manual') {
                    list.push({
                      id: `${slug}-${dateStr}-${studentId}-teachermanual`,
                      lop: lopName,
                      date: dateStr,
                      studentId,
                      studentName,
                      timestamp: rec.lastUpdatedByTeacherAt,
                      type: 'gvcn_manual',
                      actionTitle: 'GVCN cập nhật trạng thái điểm danh',
                      details: rec.lastUpdatedAction,
                      photo: rec.excusePhoto,
                      photoCaptureTime: rec.excusePhotoCaptureTime,
                      status: rec.status,
                      record: rec,
                    });
                  }
                }
              });
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }

    // 2. Merge class operation logs (GVCN system/roster/config/PIN/BCS actions)
    targetClasses.forEach((lopName) => {
      const logs = getClassLogs(lopName);
      logs.forEach((log) => {
        list.push({
          id: log.id,
          lop: log.lop || lopName,
          date: log.date,
          studentId: log.actorId || (log.actorRole === 'gvcn' ? 'GVCN' : 'HS'),
          studentName: log.actorName,
          timestamp: log.timestamp,
          type:
            log.actorRole === 'gvcn'
              ? 'gvcn_system'
              : log.actorRole === 'bcs'
              ? 'bcs_proxy'
              : 'gps',
          actionTitle: log.actionTitle,
          details: log.details,
          photo: log.photo,
          photoCaptureTime: log.photoCaptureTime,
        });
      });
    });

    // Sort by timestamp descending (most recent first)
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [isOpen, classList, lockedClass]);

  // Filtered Activities
  const filteredActivities = useMemo(() => {
    return allActivities.filter((item) => {
      if (lockedClass && item.lop.toLowerCase() !== lockedClass.toLowerCase()) return false;
      if (!lockedClass && filterClass !== 'ALL' && item.lop !== filterClass) return false;

      if (filterType !== 'ALL') {
        if (filterType === 'gps' && item.type !== 'gps') return false;
        if (filterType === 'bcs' && item.type !== 'bcs_proxy') return false;
        if (
          filterType === 'gvcn' &&
          item.type !== 'gvcn_manual' &&
          item.type !== 'proxy_dec' &&
          item.type !== 'excuse_dec' &&
          item.type !== 'gvcn_system'
        )
          return false;
        if (filterType === 'excuse' && item.type !== 'excuse_sub' && item.type !== 'excuse_dec')
          return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.studentName.toLowerCase().includes(q);
        const matchId = item.studentId.toLowerCase().includes(q);
        const matchLop = item.lop.toLowerCase().includes(q);
        const matchAction =
          item.actionTitle.toLowerCase().includes(q) || item.details.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchLop && !matchAction) return false;
      }

      return true;
    });
  }, [allActivities, filterClass, filterType, searchQuery, lockedClass]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#1B241F]/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#F4F0E4] rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-[#D7DCCB]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 bg-[#1F3B32] text-[#F4F0E4]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 flex items-center justify-center shrink-0 font-bold">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold text-[#F4F0E4]">
                  {lockedClass
                    ? `Nhật Ký Mọi Hoạt Động & Thao Tác — Lớp ${lockedClass}`
                    : 'Nhật Ký & Giám Sát Hoạt Động Thời Gian Thực Toàn Trường'}
                </h2>
                <span className="px-2 py-0.5 bg-emerald-400/20 text-emerald-300 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-400/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  Real-time Sync 24/7
                </span>
              </div>
              <p className="text-[11px] text-emerald-200/80 font-medium mt-0.5">
                {lockedClass
                  ? `GVCN nắm toàn bộ lịch sử thao tác của chính mình (duyệt phép, điểm danh, thêm/xóa HS, cấu hình GPS) và mọi hoạt động của học sinh, Ban Cán Sự lớp ${lockedClass}.`
                  : 'Mọi thao tác điểm danh GPS, chụp ảnh của Ban Cán Sự, cập nhật và phê duyệt của GVCN toàn trường đều được Firestore đồng bộ tức thì lên Ban Giám Hiệu.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-[#2A4D42] rounded-xl text-emerald-200 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Counter Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-[#FAF8F2] border-b border-[#D7DCCB]">
          <div className="bg-white p-3 rounded-xl border border-[#D7DCCB] shadow-2xs">
            <div className="text-[11px] font-bold text-[#5B6A61] uppercase tracking-wider">
              Tổng số nhật ký thao tác
            </div>
            <div className="text-xl font-extrabold text-[#1B241F] mt-0.5">
              {allActivities.length} <span className="text-xs font-medium text-[#5B6A61]">thao tác</span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-indigo-200 shadow-2xs">
            <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
              <Camera className="w-3.5 h-3.5 text-indigo-600" />
              BCS điểm danh hộ
            </div>
            <div className="text-xl font-extrabold text-indigo-800 mt-0.5">
              {allActivities.filter((a) => a.type === 'bcs_proxy').length}{' '}
              <span className="text-xs font-medium text-indigo-700">lượt</span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
            <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-amber-600" />
              Đơn xin phép nghỉ
            </div>
            <div className="text-xl font-extrabold text-amber-800 mt-0.5">
              {allActivities.filter((a) => a.type === 'excuse_sub' || a.type === 'excuse_dec').length}{' '}
              <span className="text-xs font-medium text-amber-700">lượt</span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-2xs">
            <div className="text-[11px] font-bold text-[#245346] uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#3E7C6B]" />
              Thao tác của GVCN
            </div>
            <div className="text-xl font-extrabold text-[#245346] mt-0.5">
              {
                allActivities.filter(
                  (a) =>
                    a.type === 'gvcn_manual' ||
                    a.type === 'proxy_dec' ||
                    a.type === 'excuse_dec' ||
                    a.type === 'gvcn_system'
                ).length
              }{' '}
              <span className="text-xs font-medium text-[#3E7C6B]">thao tác</span>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="p-3 sm:p-4 bg-white border-b border-[#D7DCCB] flex flex-wrap gap-2.5 items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 text-[#5B6A61] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm học sinh, thao tác GVCN, nội dung..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#FAF8F2] border border-[#D7DCCB] rounded-xl text-xs text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
              />
            </div>

            {!lockedClass && (
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="bg-[#FAF8F2] border border-[#D7DCCB] rounded-xl px-3 py-1.5 text-xs font-bold text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
              >
                <option value="ALL">Tất cả lớp học ({classList.length})</option>
                {classList.map((c) => (
                  <option key={c} value={c}>
                    Lớp {c}
                  </option>
                ))}
              </select>
            )}

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-[#FAF8F2] border border-[#D7DCCB] rounded-xl px-3 py-1.5 text-xs font-bold text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
            >
              <option value="ALL">Tất cả loại hoạt động &amp; thao tác</option>
              <option value="gps">Học sinh tự điểm danh GPS</option>
              <option value="bcs">Ban Cán Sự điểm danh hộ qua ảnh</option>
              <option value="gvcn">Mọi thao tác của GVCN (Duyệt, Điểm danh, Quản lý lớp)</option>
              <option value="excuse">Đơn xin phép &amp; Kết quả duyệt</option>
            </select>
          </div>

          <div className="text-xs text-[#5B6A61] font-semibold">
            Hiển thị <b>{filteredActivities.length}</b> / {allActivities.length} nhật ký
          </div>
        </div>

        {/* Activity Stream Feed */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredActivities.length === 0 ? (
            <div className="text-center py-16 text-[#5B6A61]">
              <Zap className="w-12 h-12 text-[#5B6A61]/30 mx-auto mb-2" />
              <p className="font-bold text-sm">Chưa phát hiện hoạt động mới nào khớp với bộ lọc</p>
              <p className="text-xs mt-1">
                Khi học sinh hoặc GVCN thao tác, dữ liệu sẽ ngay lập tức xuất hiện tại đây.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredActivities.map((item) => {
                let badgeClass = 'bg-gray-100 text-gray-800 border-gray-200';
                let icon = <Clock className="w-4 h-4 text-gray-600" />;

                if (item.type === 'gps') {
                  badgeClass = 'bg-[#E1EEE8] text-[#245346] border-[#3E7C6B]/30';
                  icon = <MapPin className="w-4 h-4 text-[#3E7C6B]" />;
                } else if (item.type === 'bcs_proxy') {
                  badgeClass = 'bg-indigo-50 text-indigo-900 border-indigo-300';
                  icon = <Camera className="w-4 h-4 text-indigo-600" />;
                } else if (
                  item.type === 'gvcn_manual' ||
                  item.type === 'proxy_dec' ||
                  item.type === 'excuse_dec' ||
                  item.type === 'gvcn_system'
                ) {
                  badgeClass = 'bg-emerald-50 text-[#1F3B32] border-emerald-300';
                  icon = <CheckCircle2 className="w-4 h-4 text-[#3E7C6B]" />;
                } else if (item.type === 'excuse_sub') {
                  badgeClass = 'bg-amber-50 text-amber-900 border-amber-300';
                  icon = <FileText className="w-4 h-4 text-amber-700" />;
                }

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border transition-all bg-white shadow-2xs hover:shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${badgeClass}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-xl bg-white border border-[#D7DCCB] shadow-2xs shrink-0 mt-0.5">
                        {icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 bg-[#1F3B32] text-[#F4F0E4] rounded text-[10px] font-extrabold">
                            Lớp {item.lop}
                          </span>
                          <span className="font-extrabold text-xs sm:text-sm text-[#1B241F]">
                            {item.studentName}{' '}
                            <span className="text-[11px] font-mono text-[#5B6A61]">
                              ({item.studentId})
                            </span>
                          </span>
                          <span className="text-[11px] font-bold text-[#3E7C6B] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            {item.actionTitle}
                          </span>
                        </div>
                        <p className="text-xs text-[#5B6A61] mt-1 font-medium">{item.details}</p>

                        {/* Dual Timestamp Verification Details (Mục 1 & Mục 2) */}
                        <div className="flex items-center gap-2.5 mt-1.5 text-[10px] font-mono flex-wrap">
                          {item.photoCaptureTime && (
                            <span className="text-amber-900 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                              1. Giờ chụp ảnh: {format24hDateTime(item.photoCaptureTime)}
                            </span>
                          )}
                          <span className="text-[#245346] font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            {item.photoCaptureTime ? '2. Giờ gửi hệ thống:' : 'Thời điểm thao tác:'}{' '}
                            {format24hDateTime(item.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {item.photo && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenLightbox({
                            src: item.photo!,
                            captureTime: item.photoCaptureTime,
                            submitTime: item.timestamp,
                            title: `Nhật ký minh chứng - Lớp ${item.lop} (${item.studentName})`,
                          })
                        }
                        className="px-3 py-1.5 bg-[#3E7C6B] hover:bg-[#346a5b] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1.5 shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Xem minh chứng ảnh</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-white border-t border-[#D7DCCB] flex justify-between items-center text-xs">
          <div className="text-[#5B6A61] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#3E7C6B]" />
            <span>
              {lockedClass
                ? `Mọi thao tác của GVCN và Học sinh lớp ${lockedClass} đều được ghi nhận đầy đủ theo thời gian thực.`
                : 'Mọi thao tác của học sinh và GVCN đều được lưu vết thời gian thực, đồng bộ đến BGH ngay lập tức.'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1F3B32] text-[#F4F0E4] hover:bg-[#274A3E] rounded-xl font-bold cursor-pointer transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
