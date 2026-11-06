import React, { useMemo } from 'react';
import { X, AlertTriangle, Search, Clock, ShieldAlert } from 'lucide-react';
import { DayData } from '../types';
import { getSchoolId, fmtDateVN, fmtTime } from '../utils/storage';

interface AdminFlaggedModalProps {
  isOpen: boolean;
  onClose: () => void;
  classList: string[];
}

interface FlaggedRecord {
  lop: string;
  date: string;
  studentId: string;
  studentName: string;
  action: string;
  updatedAt: number;
  timeDiffHours: number;
}

export const AdminFlaggedModal: React.FC<AdminFlaggedModalProps> = ({ isOpen, onClose, classList }) => {
  const flaggedRecords = useMemo(() => {
    if (!isOpen) return [];
    const flags: FlaggedRecord[] = [];
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
            
            // Find proper class name from slug
            const lopName = classList.find(c => c.replace(/\s+/g, '').toLowerCase() === slug) || slug.toUpperCase();

            const targetDateObj = new Date(`${dateStr}T00:00:00`);
            // Target date end: 23:59:59
            const targetDateEnd = new Date(targetDateObj);
            targetDateEnd.setHours(23, 59, 59, 999);

            if (dayData.records) {
              Object.keys(dayData.records).forEach((studentId) => {
                const rec = dayData.records[studentId];
                if (rec.lastUpdatedByTeacherAt && rec.lastUpdatedAction) {
                  const diffMs = rec.lastUpdatedByTeacherAt - targetDateEnd.getTime();
                  // Flag if updated more than 24 hours after the END of the target date
                  if (diffMs > 24 * 60 * 60 * 1000) {
                    flags.push({
                      lop: lopName,
                      date: dateStr,
                      studentId,
                      studentName: rec.name,
                      action: rec.lastUpdatedAction,
                      updatedAt: rec.lastUpdatedByTeacherAt,
                      timeDiffHours: Math.floor(diffMs / (1000 * 60 * 60))
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

    // Sort by most recently updated
    return flags.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [isOpen, classList]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#1B241F]/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#F4F0E4] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-[#D7DCCB]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 bg-white border-b border-[#D7DCCB]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-[#1B241F]">
                Cảnh báo Bổ sung trễ (Cờ đỏ)
              </h2>
              <p className="text-[12px] text-[#5B6A61] font-medium mt-0.5">
                Danh sách các học sinh được giáo viên cập nhật điểm danh/phép sau hơn 24 giờ kể từ ngày nghỉ.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#5B6A61] hover:bg-[#EEF1E7] hover:text-[#1B241F] rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-[#F7F6F0]">
          {flaggedRecords.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldAlert className="w-8 h-8 opacity-50" />
              </div>
              <h3 className="text-[#1B241F] font-bold mb-1">Không có vi phạm nào</h3>
              <p className="text-[#5B6A61] text-sm">Hệ thống chưa ghi nhận trường hợp cập nhật điểm danh trễ hạn.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#D7DCCB] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#EEF1E7] text-[#1B241F] border-b border-[#D7DCCB] font-bold">
                    <tr>
                      <th className="py-3 px-4">Lớp</th>
                      <th className="py-3 px-4">Học sinh</th>
                      <th className="py-3 px-4">Ngày điểm danh gốc</th>
                      <th className="py-3 px-4">Thao tác của GV</th>
                      <th className="py-3 px-4">Thời gian cập nhật (Thực tế)</th>
                      <th className="py-3 px-4 text-right">Mức độ trễ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D7DCCB]/60">
                    {flaggedRecords.map((rec, idx) => (
                      <tr key={idx} className="hover:bg-[#FDF8F3] transition-colors group">
                        <td className="py-3 px-4 font-bold text-[#1B241F]">
                          {rec.lop}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#1B241F]">{rec.studentName}</div>
                          <div className="text-[11px] text-[#5B6A61] font-mono mt-0.5">{rec.studentId}</div>
                        </td>
                        <td className="py-3 px-4 font-medium text-[#1B241F]">
                          {fmtDateVN(rec.date)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/50">
                            {rec.action}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-red-600">
                            {fmtTime(rec.updatedAt)}
                          </div>
                          <div className="text-[11px] text-red-600/70 mt-0.5">
                            {fmtDateVN(new Date(rec.updatedAt).toISOString().split('T')[0])}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1 text-red-600 font-bold bg-red-50 px-2 py-1 rounded-md text-xs border border-red-100">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Trễ {rec.timeDiffHours} giờ
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
