import React, { useState, useMemo } from 'react';
import {
  X,
  FileText,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  Filter,
  Calendar,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { DayData } from '../types';
import {
  getSchoolId,
  fmtDateVN,
  fmtTime,
  getMaxLateDays,
  getDaysDiffFromToday,
  format24hDateTime,
} from '../utils/storage';

interface AdminExcuseAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  classList: string[];
  onOpenLightbox: (data: any) => void;
}

interface ExcuseRecord {
  lop: string;
  date: string;
  studentId: string;
  studentName: string;
  status: 'excused_pending' | 'excused_approved' | 'excused_rejected' | string;
  reason?: string;
  photo?: string | null;
  photoCaptureTime?: string | null;
  submittedAt?: number;
  decidedAt?: number;
  lastUpdatedByTeacherAt?: number;
  lastUpdatedAction?: string;
  isLateExcuse?: boolean;
  diffDaysFromToday: number;
}

export const AdminExcuseAuditModal: React.FC<AdminExcuseAuditModalProps> = ({
  isOpen,
  onClose,
  classList,
  onOpenLightbox,
}) => {
  const [filterClass, setFilterClass] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL'); // ALL, pending, approved, rejected, late_only
  const [searchQuery, setSearchQuery] = useState<string>('');

  const maxLateDays = getMaxLateDays();

  // Scan all records across all classes
  const allExcuseRecords = useMemo(() => {
    if (!isOpen) return [];
    const list: ExcuseRecord[] = [];
    const schoolId = getSchoolId();
    const prefix = `sc_${schoolId}:day:`;

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

            const lopName =
              classList.find(
                (c) => c.replace(/\s+/g, '').toLowerCase() === slug
              ) || slug.toUpperCase();

            if (dayData.records) {
              Object.keys(dayData.records).forEach((studentId) => {
                const rec = dayData.records[studentId];
                if (
                  rec.status === 'excused_pending' ||
                  rec.status === 'excused_approved' ||
                  rec.status === 'excused_rejected' ||
                  Boolean(rec.excuseReason) ||
                  Boolean(rec.isLateExcuse)
                ) {
                  const diffDays = getDaysDiffFromToday(dateStr);
                  list.push({
                    lop: lopName,
                    date: dateStr,
                    studentId,
                    studentName: rec.name || studentId,
                    status: rec.status,
                    reason: rec.excuseReason,
                    photo: rec.excusePhoto,
                    photoCaptureTime: rec.excusePhotoCaptureTime,
                    submittedAt: rec.excuseSubmittedAt,
                    decidedAt: rec.excuseDecidedAt,
                    lastUpdatedByTeacherAt: rec.lastUpdatedByTeacherAt,
                    lastUpdatedAction: rec.lastUpdatedAction,
                    isLateExcuse: rec.isLateExcuse || diffDays > 0,
                    diffDaysFromToday: diffDays,
                  });
                }
              });
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    // Sort by most recently updated or submitted
    return list.sort((a, b) => {
      const timeA = a.lastUpdatedByTeacherAt || a.submittedAt || 0;
      const timeB = b.lastUpdatedByTeacherAt || b.submittedAt || 0;
      return timeB - timeA;
    });
  }, [isOpen, classList]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return allExcuseRecords.filter((item) => {
      // Class filter
      if (filterClass !== 'ALL' && item.lop !== filterClass) return false;

      // Status filter
      if (filterStatus === 'pending' && item.status !== 'excused_pending') return false;
      if (filterStatus === 'approved' && item.status !== 'excused_approved') return false;
      if (filterStatus === 'rejected' && item.status !== 'excused_rejected') return false;
      if (filterStatus === 'late_only' && !item.isLateExcuse) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = item.studentName.toLowerCase().includes(query);
        const matchId = item.studentId.toLowerCase().includes(query);
        const matchLop = item.lop.toLowerCase().includes(query);
        const matchReason = (item.reason || '').toLowerCase().includes(query);
        if (!matchName && !matchId && !matchLop && !matchReason) return false;
      }

      return true;
    });
  }, [allExcuseRecords, filterClass, filterStatus, searchQuery]);

  // Counters
  const countPending = allExcuseRecords.filter((r) => r.status === 'excused_pending').length;
  const countApproved = allExcuseRecords.filter((r) => r.status === 'excused_approved').length;
  const countRejected = allExcuseRecords.filter((r) => r.status === 'excused_rejected').length;
  const countLate = allExcuseRecords.filter((r) => r.isLateExcuse).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#1B241F]/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#F4F0E4] rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-[#D7DCCB]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 bg-white border-b border-[#D7DCCB]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#3E7C6B]/15 border border-[#3E7C6B]/30 text-[#245346] flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-[#1B241F]">
                  Nhật Ký & Giám Sát Đơn Phép Toàn Trường
                </h2>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-300">
                  Thời gian thực
                </span>
              </div>
              <p className="text-[12px] text-[#5B6A61] font-medium mt-0.5">
                Theo dõi tất cả đơn nghỉ phép, đơn nộp bù trễ và quyết định phê duyệt của giáo viên toàn trường (Quy định duyệt trễ BGH: <b>{maxLateDays} ngày</b>).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-[#EEF1EC] rounded-xl text-[#5B6A61] hover:text-[#1B241F] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* KPI Counter Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-[#FAF8F2] border-b border-[#D7DCCB]">
          <div className="bg-white p-3 rounded-xl border border-[#D7DCCB] shadow-2xs">
            <div className="text-[11px] font-bold text-[#5B6A61] uppercase tracking-wider">
              Tổng số đơn phép
            </div>
            <div className="text-xl font-extrabold text-[#1B241F] mt-0.5">
              {allExcuseRecords.length} <span className="text-xs font-medium text-[#5B6A61]">đơn</span>
            </div>
          </div>
          <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
            <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Đang chờ GV duyệt
            </div>
            <div className="text-xl font-extrabold text-amber-800 mt-0.5">
              {countPending} <span className="text-xs font-medium text-amber-700">đơn</span>
            </div>
          </div>
          <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-2xs">
            <div className="text-[11px] font-bold text-[#245346] uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#3E7C6B]" />
              Đã được duyệt
            </div>
            <div className="text-xl font-extrabold text-[#245346] mt-0.5">
              {countApproved} <span className="text-xs font-medium text-[#3E7C6B]">đơn</span>
            </div>
          </div>
          <div className="bg-white p-3 rounded-xl border border-[#C98A3B]/40 shadow-2xs">
            <div className="text-[11px] font-bold text-[#7A521E] uppercase tracking-wider flex items-center gap-1">
              <span>⏳ Đơn nộp / duyệt trễ</span>
            </div>
            <div className="text-xl font-extrabold text-[#7A521E] mt-0.5">
              {countLate} <span className="text-xs font-medium text-[#7A521E]">đơn</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="p-3 sm:p-4 bg-white border-b border-[#D7DCCB] flex flex-wrap gap-2.5 items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 text-[#5B6A61] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm tên học sinh, mã số, lớp..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#FAF8F2] border border-[#D7DCCB] rounded-xl text-xs text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
              />
            </div>

            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="bg-[#FAF8F2] border border-[#D7DCCB] rounded-xl px-3 py-1.5 text-xs font-bold text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
            >
              <option value="ALL">Tất cả các lớp ({classList.length})</option>
              {classList.map((c) => (
                <option key={c} value={c}>
                  Lớp {c}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-[#FAF8F2] border border-[#D7DCCB] rounded-xl px-3 py-1.5 text-xs font-bold text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="pending">Chờ giáo viên duyệt</option>
              <option value="approved">Giáo viên đã duyệt</option>
              <option value="rejected">Giáo viên từ chối</option>
              <option value="late_only">Chỉ hiển thị đơn nộp/duyệt trễ (N ngày)</option>
            </select>
          </div>

          <div className="text-xs text-[#5B6A61] font-semibold">
            Hiển thị <b>{filteredRecords.length}</b> / {allExcuseRecords.length} đơn
          </div>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredRecords.length === 0 ? (
            <div className="text-center py-16 text-[#5B6A61]">
              <FileText className="w-12 h-12 text-[#5B6A61]/30 mx-auto mb-2" />
              <p className="font-bold text-sm">Không tìm thấy đơn xin phép nào phù hợp</p>
              <p className="text-xs mt-1">Hãy thử đổi điều kiện lọc hoặc từ khóa tìm kiếm.</p>
            </div>
          ) : (
            <div className="border border-[#D7DCCB] rounded-xl overflow-hidden shadow-2xs bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#FAF8F2] border-b border-[#D7DCCB] text-[#5B6A61] font-bold text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Lớp & Ngày nghỉ</th>
                    <th className="py-2.5 px-3">Học sinh</th>
                    <th className="py-2.5 px-3">Lý do & Minh chứng</th>
                    <th className="py-2.5 px-3">Phân loại</th>
                    <th className="py-2.5 px-3">Trạng thái</th>
                    <th className="py-2.5 px-3 text-right">Nhật ký xử lý của GV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D7DCCB]">
                  {filteredRecords.map((item, idx) => {
                    let statusBadge = (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                        <Clock className="w-3 h-3" /> Chờ duyệt
                      </span>
                    );

                    if (item.status === 'excused_approved') {
                      statusBadge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-[#245346] border border-[#3E7C6B]/30">
                          <CheckCircle2 className="w-3 h-3 text-[#3E7C6B]" /> Đã duyệt
                        </span>
                      );
                    } else if (item.status === 'excused_rejected') {
                      statusBadge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                          <XCircle className="w-3 h-3" /> Từ chối
                        </span>
                      );
                    }

                    return (
                      <tr key={`${item.lop}-${item.date}-${item.studentId}-${idx}`} className="hover:bg-[#FDFBF7] transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-[#1B241F] flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 bg-[#1F3B32] text-[#F4F0E4] rounded text-[10px] font-extrabold">
                              {item.lop}
                            </span>
                            <span>{fmtDateVN(item.date)}</span>
                          </div>
                          <div className="text-[10px] text-[#5B6A61] mt-0.5">
                            {item.date}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="font-bold text-[#1B241F]">{item.studentName}</div>
                          <div className="text-[10px] text-[#5B6A61] font-mono">{item.studentId}</div>
                        </td>

                        <td className="py-2.5 px-3 max-w-[280px]">
                          <div className="text-xs text-[#1B241F] line-clamp-2">
                            {item.reason || '—'}
                          </div>
                          {item.photo && (
                            <div className="space-y-1 mt-1 p-2 bg-amber-50/60 border border-amber-200/80 rounded-xl">
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenLightbox({
                                    src: item.photo!,
                                    captureTime: item.photoCaptureTime,
                                    submitTime: item.submittedAt,
                                    title: `Đơn xin phép - Lớp ${item.lop} (${item.studentName})`,
                                  })
                                }
                                className="inline-flex items-center gap-1 text-[11px] text-[#3E7C6B] hover:underline font-bold cursor-pointer"
                              >
                                <Eye className="w-3 h-3" /> Xem ảnh đơn (Phóng to)
                              </button>
                              <div className="text-[10px] text-amber-900 font-mono font-bold leading-tight">
                                1. Giờ chụp ảnh: {format24hDateTime(item.photoCaptureTime)}
                              </div>
                              <div className="text-[10px] text-[#245346] font-mono font-bold leading-tight">
                                2. Giờ gửi hệ thống: {format24hDateTime(item.submittedAt)}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3">
                          {item.isLateExcuse ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF7EC] text-[#8C5E14] border border-[#C98A3B]/40">
                              ⏳ Bổ sung trễ
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EEF1EC] text-[#5B6A61]">
                              Đúng hạn
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3">
                          {statusBadge}
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          {item.lastUpdatedAction ? (
                            <div>
                              <div className="font-bold text-[#1B241F] text-[11px]">
                                {item.lastUpdatedAction}
                              </div>
                              <div className="text-[10px] text-[#5B6A61] mt-0.5 font-mono">
                                {item.lastUpdatedByTeacherAt ? fmtTime(item.lastUpdatedByTeacherAt) : ''}
                              </div>
                            </div>
                          ) : item.submittedAt ? (
                            <div className="text-[10px] text-[#5B6A61]">
                              Nộp lúc: {fmtTime(item.submittedAt)}
                            </div>
                          ) : (
                            <span className="text-[#5B6A61]/50 text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-white border-t border-[#D7DCCB] flex justify-between items-center text-xs">
          <div className="text-[#5B6A61] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#3E7C6B]" />
            <span>Mọi thao tác điểm danh và duyệt phép đều được lưu trữ và đồng bộ hóa tức thì.</span>
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
