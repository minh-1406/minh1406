import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  Printer,
  Calendar,
  ChevronLeft,
  ChevronRight,
  School,
  Users,
  CheckCircle,
  AlertTriangle,
  FileText,
  Layers,
} from 'lucide-react';
import {
  getAttendanceReport,
  getSchoolAttendanceReport,
  getDetailedAbsenceRecords,
  getAllDetailedAbsenceRecords,
  getReportModeLabel,
  getWeekRange,
  getLopList,
  fmtDateVN,
  getSchoolName,
} from '../utils/storage';
import {
  ReportMode,
  ClassAttendanceReport,
  SchoolAttendanceReport,
  DetailedAbsenceRecord,
} from '../types';

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLop: string; // class name or 'ALL'
  isAdmin?: boolean;
}

export const ReportsModal: React.FC<ReportsModalProps> = ({
  isOpen,
  onClose,
  selectedLop: initialLop,
  isAdmin = false,
}) => {
  const [currentLop, setCurrentLop] = useState<string>(initialLop || (isAdmin ? 'ALL' : ''));
  const [reportMode, setReportMode] = useState<ReportMode>('month');
  
  // Format targetValue depending on mode
  const todayStr = new Date().toISOString().substring(0, 10);
  const currentMonthStr = new Date().toISOString().substring(0, 7);
  const [targetValue, setTargetValue] = useState<string>(currentMonthStr);

  const [classReport, setClassReport] = useState<ClassAttendanceReport | null>(null);
  const [schoolReport, setSchoolReport] = useState<SchoolAttendanceReport | null>(null);
  const [detailedRecords, setDetailedRecords] = useState<DetailedAbsenceRecord[]>([]);
  const [classList, setClassList] = useState<string[]>([]);

  // Update currentLop when modal opens or initialLop changes
  useEffect(() => {
    if (isOpen) {
      const allLop = getLopList();
      setClassList(allLop);
      if (initialLop) {
        setCurrentLop(initialLop);
      } else if (isAdmin) {
        setCurrentLop('ALL');
      } else if (allLop.length > 0) {
        setCurrentLop(allLop[0]);
      }
    }
  }, [isOpen, initialLop, isAdmin]);

  // Handle mode switch and reset default targetValue
  const handleModeChange = (newMode: ReportMode) => {
    setReportMode(newMode);
    if (newMode === 'day' || newMode === 'week') {
      setTargetValue(todayStr);
    } else if (newMode === 'month') {
      setTargetValue(currentMonthStr);
    } else if (newMode === 'semester') {
      const currentMonth = new Date().getMonth() + 1;
      setTargetValue([9, 10, 11, 12, 1].includes(currentMonth) ? 'HK1' : 'HK2');
    }
  };

  // Re-generate report on dependencies change
  useEffect(() => {
    if (!isOpen) return;

    if (currentLop === 'ALL') {
      const sReport = getSchoolAttendanceReport(reportMode, targetValue);
      setSchoolReport(sReport);
      setClassReport(null);
      const absences = getAllDetailedAbsenceRecords(reportMode, targetValue);
      setDetailedRecords(absences);
    } else if (currentLop) {
      const cReport = getAttendanceReport(currentLop, reportMode, targetValue);
      setClassReport(cReport);
      setSchoolReport(null);
      const absences = getDetailedAbsenceRecords(currentLop, reportMode, targetValue);
      setDetailedRecords(absences);
    }
  }, [isOpen, currentLop, reportMode, targetValue]);

  // Shift day/week helper
  const handleShiftDate = (days: number) => {
    if (reportMode !== 'day' && reportMode !== 'week') return;
    try {
      const parts = targetValue.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      d.setDate(d.getDate() + days);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      setTargetValue(`${y}-${m}-${dt}`);
    } catch (e) {
      console.error(e);
    }
  };

  // PDF Export
  const handleExportPDF = () => {
    const schoolName = getSchoolName();
    const periodLabel = getReportModeLabel(reportMode, targetValue);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Vui lòng cho phép trình duyệt mở popup để in hoặc xuất file PDF.');
      return;
    }

    let reportBodyHtml = '';

    if (currentLop === 'ALL' && schoolReport) {
      reportBodyHtml = `
        <div class="header">
          <p class="school-name">TRƯỜNG ${schoolName !== 'DEFAULT' ? schoolName : 'HỌC'}</p>
          <h1>BÁO CÁO TỔNG HỢP ĐIỂM DANH TOÀN TRƯỜNG</h1>
          <p class="meta">Kỳ báo cáo: <strong>${periodLabel}</strong></p>
        </div>

        <div class="stats-overview">
          <div class="stat-box">
            <span class="stat-val">${schoolReport.totalClasses}</span>
            <span class="stat-lbl">Tổng số lớp</span>
          </div>
          <div class="stat-box">
            <span class="stat-val">${schoolReport.totalStudents}</span>
            <span class="stat-lbl">Tổng học sinh</span>
          </div>
          <div class="stat-box">
            <span class="stat-val" style="color: #15803d;">${schoolReport.totalPresent}</span>
            <span class="stat-lbl">Lượt có mặt</span>
          </div>
          <div class="stat-box">
            <span class="stat-val" style="color: #b45309;">${schoolReport.totalExcused}</span>
            <span class="stat-lbl">Lượt có phép</span>
          </div>
          <div class="stat-box">
            <span class="stat-val" style="color: #b91c1c;">${schoolReport.totalAbsent}</span>
            <span class="stat-lbl">Lượt vắng</span>
          </div>
          <div class="stat-box" style="background: #E8F5E9; border-color: #2e7d32;">
            <span class="stat-val" style="color: #1b5e20;">${schoolReport.schoolRate}%</span>
            <span class="stat-lbl">Tỷ lệ chuyên cần</span>
          </div>
        </div>

        <h3>1. Bảng tổng hợp chuyên cần theo từng lớp</h3>
        <table>
          <thead>
            <tr>
              <th style="width: 45px; text-align: center;">STT</th>
              <th>Lớp</th>
              <th style="text-align: center;">Sĩ số</th>
              <th style="text-align: center;">Số buổi đã lưu</th>
              <th style="text-align: center;">Có mặt</th>
              <th style="text-align: center;">Có phép</th>
              <th style="text-align: center;">Vắng mặt</th>
              <th style="text-align: center;">Tỷ lệ (%)</th>
            </tr>
          </thead>
          <tbody>
            ${schoolReport.classes
              .map(
                (c, idx) => `
              <tr>
                <td style="text-align: center;">${idx + 1}</td>
                <td><strong>Lớp ${c.lop}</strong></td>
                <td style="text-align: center;">${c.totalStudents}</td>
                <td style="text-align: center;">${c.totalDaysRecorded}</td>
                <td style="text-align: center; color: #15803d; font-weight: bold;">${c.presentCount}</td>
                <td style="text-align: center; color: #b45309; font-weight: bold;">${c.excusedCount}</td>
                <td style="text-align: center; color: #b91c1c; font-weight: bold;">${c.absentCount}</td>
                <td style="text-align: center;"><strong>${c.rate}%</strong></td>
              </tr>
            `
              )
              .join('')}
            <tr style="background: #EBF3EE; font-weight: bold; border-top: 2px solid #1F3B32;">
              <td colspan="2" style="text-align: center;">TỔNG TOÀN TRƯỜNG</td>
              <td style="text-align: center;">${schoolReport.totalStudents}</td>
              <td style="text-align: center;">-</td>
              <td style="text-align: center; color: #15803d;">${schoolReport.totalPresent}</td>
              <td style="text-align: center; color: #b45309;">${schoolReport.totalExcused}</td>
              <td style="text-align: center; color: #b91c1c;">${schoolReport.totalAbsent}</td>
              <td style="text-align: center; font-size: 14px; color: #1F3B32;">${schoolReport.schoolRate}%</td>
            </tr>
          </tbody>
        </table>

        <h3>2. Danh sách vắng mặt & Minh chứng đơn xin phép toàn trường (${detailedRecords.length} lượt)</h3>
        ${
          detailedRecords.length === 0
            ? '<p style="color: #5B6A61; font-style: italic;">Không có trường hợp vắng mặt nào trong khoảng thời gian này.</p>'
            : ''
        }
        <div class="absence-grid">
          ${detailedRecords
            .map((r) => {
              let statusText = 'Vắng không phép';
              let statusClass = 'status-absent';
              if (r.status === 'excused_approved') {
                statusText = 'Nghỉ có phép (Đã duyệt)';
                statusClass = 'status-excused';
              } else if (r.status === 'excused_pending') {
                statusText = 'Xin phép (Chờ duyệt)';
                statusClass = 'status-excused';
              } else if (r.status === 'excused_rejected') {
                statusText = 'Xin phép (Từ chối)';
                statusClass = 'status-absent';
              }

              return `
              <div class="absence-card">
                <p><strong>Lớp:</strong> <span style="color: #1F3B32; font-weight: bold;">${r.lop || ''}</span> • <strong>Ngày:</strong> ${fmtDateVN(r.date)}</p>
                <p><strong>Học sinh:</strong> ${r.name} <span style="color: #6B7280; font-size: 11px;">(${r.studentId})</span></p>
                <p><strong>Trạng thái:</strong> <span class="status-badge ${statusClass}">${statusText}</span></p>
                ${r.excuseReason ? `<p><strong>Lý do:</strong> ${r.excuseReason}</p>` : ''}
                ${r.excuseDebtType ? `<p><strong>Loại nợ đơn:</strong> ${r.excuseDebtType === 'owing_paper' ? 'Đang nợ' : 'Đã nộp'}</p>` : ''}
                ${r.note ? `<p><strong>Ghi chú:</strong> ${r.note}</p>` : ''}
                <div class="photo-container">
                  ${
                    r.excusePhoto
                      ? `<img src="${r.excusePhoto}" class="photo" />`
                      : '<span class="no-photo">Không có ảnh minh chứng</span>'
                  }
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      `;
    } else if (classReport) {
      reportBodyHtml = `
        <div class="header">
          <p class="school-name">TRƯỜNG ${schoolName !== 'DEFAULT' ? schoolName : 'HỌC'}</p>
          <h1>BÁO CÁO ĐIỂM DANH LỚP ${currentLop}</h1>
          <p class="meta">Kỳ báo cáo: <strong>${periodLabel}</strong> • Sĩ số: <strong>${classReport.students.length}</strong> học sinh</p>
        </div>

        <h3>1. Bảng thống kê chuyên cần học sinh</h3>
        <table>
          <thead>
            <tr>
              <th style="width: 45px; text-align: center;">STT</th>
              <th>Mã HS</th>
              <th>Họ và Tên</th>
              <th style="text-align: center;">Tổng buổi</th>
              <th style="text-align: center;">Có mặt</th>
              <th style="text-align: center;">Có phép</th>
              <th style="text-align: center;">Vắng mặt</th>
              <th style="text-align: center;">Tỷ lệ (%)</th>
            </tr>
          </thead>
          <tbody>
            ${classReport.students
              .map(
                (s, idx) => `
              <tr>
                <td style="text-align: center;">${idx + 1}</td>
                <td style="font-family: monospace;">${s.studentId}</td>
                <td><strong>${s.name}</strong></td>
                <td style="text-align: center;">${s.totalSessions}</td>
                <td style="text-align: center; color: #15803d; font-weight: bold;">${s.presentCount}</td>
                <td style="text-align: center; color: #b45309; font-weight: bold;">${s.excusedCount}</td>
                <td style="text-align: center; color: #b91c1c; font-weight: bold;">${s.absentCount}</td>
                <td style="text-align: center;"><strong>${s.rate}%</strong></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <h3>2. Chi tiết vắng mặt & Minh chứng đơn xin phép (${detailedRecords.length} lượt)</h3>
        ${
          detailedRecords.length === 0
            ? '<p style="color: #5B6A61; font-style: italic;">Lớp không có trường hợp vắng mặt nào trong khoảng thời gian này.</p>'
            : ''
        }
        <div class="absence-grid">
          ${detailedRecords
            .map((r) => {
              let statusText = 'Vắng không phép';
              let statusClass = 'status-absent';
              if (r.status === 'excused_approved') {
                statusText = 'Nghỉ có phép (Đã duyệt)';
                statusClass = 'status-excused';
              } else if (r.status === 'excused_pending') {
                statusText = 'Xin phép (Chờ duyệt)';
                statusClass = 'status-excused';
              } else if (r.status === 'excused_rejected') {
                statusText = 'Xin phép (Từ chối)';
                statusClass = 'status-absent';
              }

              return `
              <div class="absence-card">
                <p><strong>Ngày:</strong> ${fmtDateVN(r.date)}</p>
                <p><strong>Học sinh:</strong> ${r.name} <span style="color: #6B7280; font-size: 11px;">(${r.studentId})</span></p>
                <p><strong>Trạng thái:</strong> <span class="status-badge ${statusClass}">${statusText}</span></p>
                ${r.excuseReason ? `<p><strong>Lý do:</strong> ${r.excuseReason}</p>` : ''}
                ${r.excuseDebtType ? `<p><strong>Loại nợ đơn:</strong> ${r.excuseDebtType === 'owing_paper' ? 'Đang nợ' : 'Đã nộp'}</p>` : ''}
                ${r.note ? `<p><strong>Ghi chú:</strong> ${r.note}</p>` : ''}
                <div class="photo-container">
                  ${
                    r.excusePhoto
                      ? `<img src="${r.excusePhoto}" class="photo" />`
                      : '<span class="no-photo">Không có ảnh minh chứng</span>'
                  }
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Báo cáo điểm danh - ${currentLop === 'ALL' ? 'Toàn trường' : `Lớp ${currentLop}`}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; color: #1B241F; line-height: 1.5; background: #fff; }
          .header { text-align: center; border-bottom: 2px solid #1F3B32; padding-bottom: 15px; margin-bottom: 25px; }
          .school-name { font-size: 15px; font-weight: bold; text-transform: uppercase; color: #5B6A61; margin: 0; }
          h1 { font-size: 22px; font-weight: 800; margin: 8px 0 4px 0; color: #1F3B32; }
          .meta { font-size: 13px; color: #5B6A61; margin: 0; }
          
          .stats-overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 12px; margin-bottom: 25px; }
          .stat-box { border: 1px solid #D7DCCB; border-radius: 8px; padding: 10px; text-align: center; background: #FAF9F5; }
          .stat-val { display: block; font-size: 18px; font-weight: 800; color: #1F3B32; }
          .stat-lbl { font-size: 11px; color: #5B6A61; font-weight: 600; text-transform: uppercase; }

          h3 { font-size: 16px; font-weight: 700; margin-top: 25px; margin-bottom: 12px; color: #1F3B32; border-bottom: 1.5px solid #EEF1E7; padding-bottom: 5px; }
          
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
          th, td { border: 1px solid #D7DCCB; padding: 8px 10px; text-align: left; }
          th { background-color: #F4F0E4; font-weight: 700; color: #1F3B32; }
          tr:nth-child(even) { background-color: #FBFAF5; }
          
          .absence-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 15px; }
          .absence-card { border: 1px solid #D7DCCB; border-radius: 8px; padding: 12px; page-break-inside: avoid; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.04); font-size: 12px; }
          .absence-card p { margin: 4px 0; }
          .status-badge { display: inline-block; padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: bold; }
          .status-excused { background: #FEF3C7; color: #B45309; }
          .status-absent { background: #FEE2E2; color: #B91C1C; }
          
          .photo-container { margin-top: 8px; text-align: center; background: #F9FAFB; padding: 8px; border-radius: 6px; border: 1px dashed #D7DCCB; }
          .photo { max-width: 100%; max-height: 180px; object-fit: contain; border-radius: 4px; }
          .no-photo { font-size: 11px; color: #9CA3AF; font-style: italic; }
          
          .footer-sign { display: flex; justify-content: space-between; margin-top: 40px; page-break-inside: avoid; }
          .sign-col { text-align: center; width: 220px; font-size: 12px; }
          .sign-title { font-weight: bold; text-transform: uppercase; margin-bottom: 50px; }

          @media print {
            body { padding: 0; }
            .absence-card { box-shadow: none; border: 1px solid #ccc; }
          }
        </style>
      </head>
      <body>
        ${reportBodyHtml}

        <div class="footer-sign">
          <div class="sign-col">
            <div class="sign-title">Người lập báo cáo</div>
            <p style="color: #6B7280; font-style: italic;">(Ký và ghi rõ họ tên)</p>
          </div>
          <div class="sign-col">
            <div class="sign-title">Ban Giám Hiệu / Quản Trị</div>
            <p style="color: #6B7280; font-style: italic;">(Ký, đóng dấu)</p>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // CSV Export
  const handleExportCSV = () => {
    const periodLabel = getReportModeLabel(reportMode, targetValue);

    if (currentLop === 'ALL' && schoolReport) {
      const classHeaders = [
        'STT',
        'Lớp',
        'Sĩ số',
        'Số buổi đã lưu',
        'Có mặt',
        'Có phép',
        'Vắng mặt',
        'Tỷ lệ chuyên cần (%)',
      ];
      const classRows = schoolReport.classes.map((c, idx) => [
        idx + 1,
        `"Lớp ${c.lop}"`,
        c.totalStudents,
        c.totalDaysRecorded,
        c.presentCount,
        c.excusedCount,
        c.absentCount,
        `${c.rate}%`,
      ]);

      // School total row
      classRows.push([
        '',
        '"TỔNG TOÀN TRƯỜNG"',
        schoolReport.totalStudents,
        '',
        schoolReport.totalPresent,
        schoolReport.totalExcused,
        schoolReport.totalAbsent,
        `${schoolReport.schoolRate}%`,
      ]);

      const absenceHeaders = ['Lớp', 'Ngày', 'Mã HS', 'Tên HS', 'Trạng thái', 'Lý do vắng', 'Loại nợ đơn', 'Ghi chú'];
      const absenceRows = detailedRecords.map((r) => [
        `"Lớp ${r.lop || ''}"`,
        r.date,
        r.studentId,
        `"${r.name}"`,
        `"${r.status}"`,
        `"${r.excuseReason || ''}"`,
        `"${r.excuseDebtType || ''}"`,
        `"${r.note || ''}"`,
      ]);

      const csvContent =
        '\uFEFF' +
        `"BÁO CÁO TỔNG HỢP ĐIỂM DANH TOÀN TRƯỜNG - ${periodLabel}"\n\n` +
        '1. TỔNG HỢP CÁC LỚP\n' +
        [classHeaders.join(','), ...classRows.map((r) => r.join(','))].join('\n') +
        '\n\n2. CHI TIẾT HỌC SINH VẮNG MẶT TOÀN TRƯỜNG\n' +
        [absenceHeaders.join(','), ...absenceRows.map((r) => r.join(','))].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `baocao_toantruong_${reportMode}_${targetValue}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (classReport) {
      const headers = [
        'Mã HS',
        'Tên HS',
        'Tổng buổi',
        'Có mặt',
        'Có phép',
        'Vắng mặt',
        'Tỷ lệ (%)',
      ];
      const rows = classReport.students.map((s) => [
        s.studentId,
        `"${s.name}"`,
        s.totalSessions,
        s.presentCount,
        s.excusedCount,
        s.absentCount,
        `${s.rate}%`,
      ]);

      const absenceHeaders = ['Ngày', 'Mã HS', 'Tên HS', 'Trạng thái', 'Lý do', 'Loại nợ đơn', 'Ghi chú'];
      const absenceRows = detailedRecords.map((r) => [
        r.date,
        r.studentId,
        `"${r.name}"`,
        `"${r.status}"`,
        `"${r.excuseReason || ''}"`,
        `"${r.excuseDebtType || ''}"`,
        `"${r.note || ''}"`,
      ]);

      const csvContent =
        '\uFEFF' +
        `"BÁO CÁO ĐIỂM DANH LỚP ${currentLop} - ${periodLabel}"\n\n` +
        [headers.join(','), ...rows.map((r) => r.join(','))].join('\n') +
        '\n\nCHI TIẾT VẮNG MẶT\n' +
        [absenceHeaders.join(','), ...absenceRows.map((r) => r.join(','))].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `baocao_${reportMode}_${targetValue}_lop_${currentLop}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100] p-3 sm:p-4">
      <div className="bg-[#F4F0E4] rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col border border-[#D7DCCB]">
        {/* Header */}
        <div className="p-4 bg-[#1F3B32] text-[#F4F0E4] flex justify-between items-center shadow-xs">
          <div className="flex items-center gap-2.5">
            {currentLop === 'ALL' ? (
              <School className="w-5 h-5 text-emerald-300" />
            ) : (
              <FileText className="w-5 h-5 text-amber-300" />
            )}
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                {currentLop === 'ALL'
                  ? 'Tổng Hợp Báo Cáo Chuyên Cần Toàn Trường'
                  : `Báo Cáo Điểm Danh Chuyên Cần - Lớp ${currentLop}`}
              </h2>
              <p className="text-[11px] text-emerald-100/70">
                {getReportModeLabel(reportMode, targetValue)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-xl transition-colors cursor-pointer text-white"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-3.5 bg-white border-b border-[#D7DCCB] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          {/* Scope Selector (Only if Admin or multiple classes available) */}
          {isAdmin && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#5B6A61] flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-[#3E7C6B]" />
                Phạm vi báo cáo
              </label>
              <select
                value={currentLop}
                onChange={(e) => setCurrentLop(e.target.value)}
                className="w-full p-2 border border-[#D7DCCB] rounded-xl text-xs font-semibold bg-[#FBFAF5] focus:bg-white text-[#1B241F]"
              >
                <option value="ALL">🏫 Toàn trường (Tất cả các lớp)</option>
                <optgroup label="Từng lớp cụ thể">
                  {classList.map((lop) => (
                    <option key={lop} value={lop}>
                      Lớp {lop}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}

          {/* Report Mode Selector */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#5B6A61] flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#3E7C6B]" />
              Kỳ báo cáo
            </label>
            <select
              value={reportMode}
              onChange={(e) => handleModeChange(e.target.value as ReportMode)}
              className="w-full p-2 border border-[#D7DCCB] rounded-xl text-xs font-semibold bg-[#FBFAF5] focus:bg-white text-[#1B241F]"
            >
              <option value="day">📅 Theo ngày</option>
              <option value="week">🗓️ Theo tuần</option>
              <option value="month">📆 Theo tháng</option>
              <option value="semester">🏛️ Theo học kỳ</option>
            </select>
          </div>

          {/* Time Picker Controls */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#5B6A61]">
              {reportMode === 'day' && 'Chọn ngày'}
              {reportMode === 'week' && 'Chọn ngày trong tuần'}
              {reportMode === 'month' && 'Chọn tháng'}
              {reportMode === 'semester' && 'Chọn học kỳ'}
            </label>

            {reportMode === 'day' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleShiftDate(-1)}
                  className="p-2 border border-[#D7DCCB] rounded-lg hover:bg-[#EEF1E7] text-[#1B241F]"
                  title="Ngày trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="date"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className="flex-1 p-2 border border-[#D7DCCB] rounded-xl text-xs font-semibold bg-[#FBFAF5] text-[#1B241F]"
                />
                <button
                  type="button"
                  onClick={() => handleShiftDate(1)}
                  className="p-2 border border-[#D7DCCB] rounded-lg hover:bg-[#EEF1E7] text-[#1B241F]"
                  title="Ngày sau"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {reportMode === 'week' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleShiftDate(-7)}
                  className="p-2 border border-[#D7DCCB] rounded-lg hover:bg-[#EEF1E7] text-[#1B241F]"
                  title="Tuần trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="date"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className="flex-1 p-2 border border-[#D7DCCB] rounded-xl text-xs font-semibold bg-[#FBFAF5] text-[#1B241F]"
                  title="Chọn bất kỳ ngày nào trong tuần"
                />
                <button
                  type="button"
                  onClick={() => handleShiftDate(7)}
                  className="p-2 border border-[#D7DCCB] rounded-lg hover:bg-[#EEF1E7] text-[#1B241F]"
                  title="Tuần sau"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {reportMode === 'month' && (
              <input
                type="month"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className="w-full p-2 border border-[#D7DCCB] rounded-xl text-xs font-semibold bg-[#FBFAF5] text-[#1B241F]"
              />
            )}

            {reportMode === 'semester' && (
              <select
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className="w-full p-2 border border-[#D7DCCB] rounded-xl text-xs font-semibold bg-[#FBFAF5] text-[#1B241F]"
              >
                <option value="HK1">Học kỳ 1 (Tháng 9 - Tháng 1)</option>
                <option value="HK2">Học kỳ 2 (Tháng 2 - Tháng 8)</option>
              </select>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 w-full">
            <button
              onClick={handleExportPDF}
              className="flex-1 inline-flex justify-center items-center gap-1.5 px-3.5 py-2 bg-[#1F3B32] hover:bg-[#274A3E] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              In PDF
            </button>
            <button
              onClick={handleExportCSV}
              className="flex-1 inline-flex justify-center items-center gap-1.5 px-3.5 py-2 bg-[#3E7C6B] hover:bg-[#346a5b] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Xuất CSV
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ================= CASE 1: TOÀN TRƯỜNG ================= */}
          {currentLop === 'ALL' && schoolReport && (
            <div className="space-y-4">
              {/* Overview Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="p-3 bg-white border border-[#D7DCCB] rounded-xl text-center shadow-xs">
                  <div className="text-xl font-black text-[#1F3B32]">{schoolReport.totalClasses}</div>
                  <div className="text-[10px] font-bold text-[#5B6A61] uppercase tracking-wider">Tổng số lớp</div>
                </div>
                <div className="p-3 bg-white border border-[#D7DCCB] rounded-xl text-center shadow-xs">
                  <div className="text-xl font-black text-[#1F3B32]">{schoolReport.totalStudents}</div>
                  <div className="text-[10px] font-bold text-[#5B6A61] uppercase tracking-wider">Tổng học sinh</div>
                </div>
                <div className="p-3 bg-white border border-[#D7DCCB] rounded-xl text-center shadow-xs">
                  <div className="text-xl font-black text-[#245346]">{schoolReport.totalPresent}</div>
                  <div className="text-[10px] font-bold text-[#245346] uppercase tracking-wider">Lượt có mặt</div>
                </div>
                <div className="p-3 bg-white border border-[#D7DCCB] rounded-xl text-center shadow-xs">
                  <div className="text-xl font-black text-[#7A521E]">{schoolReport.totalExcused}</div>
                  <div className="text-[10px] font-bold text-[#7A521E] uppercase tracking-wider">Lượt có phép</div>
                </div>
                <div className="p-3 bg-white border border-[#D7DCCB] rounded-xl text-center shadow-xs">
                  <div className="text-xl font-black text-[#B3492F]">{schoolReport.totalAbsent}</div>
                  <div className="text-[10px] font-bold text-[#B3492F] uppercase tracking-wider">Lượt vắng</div>
                </div>
                <div className="p-3 bg-[#E1EEE8] border border-[#3E7C6B]/40 rounded-xl text-center shadow-xs">
                  <div className="text-xl font-black text-[#1F3B32]">{schoolReport.schoolRate}%</div>
                  <div className="text-[10px] font-bold text-[#245346] uppercase tracking-wider">Chuyên cần trường</div>
                </div>
              </div>

              {/* Table of Classes Summary */}
              <div className="bg-white border border-[#D7DCCB] rounded-2xl overflow-hidden shadow-xs">
                <div className="p-3 bg-[#EEF1E7] border-b border-[#D7DCCB] flex justify-between items-center">
                  <h3 className="text-xs font-bold text-[#1F3B32] uppercase tracking-wider flex items-center gap-1.5">
                    <School className="w-3.5 h-3.5 text-[#3E7C6B]" />
                    Bảng tổng hợp chuyên cần các lớp ({schoolReport.classes.length} lớp)
                  </h3>
                  <span className="text-[11px] text-[#5B6A61]">Nhấp vào lớp để xem chi tiết từng học sinh</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAF9F5] border-b border-[#D7DCCB] text-[#5B6A61] uppercase">
                      <tr>
                        <th className="p-2.5 font-bold text-center w-12">STT</th>
                        <th className="p-2.5 font-bold">Lớp</th>
                        <th className="p-2.5 font-bold text-center">Sĩ số</th>
                        <th className="p-2.5 font-bold text-center">Buổi ghi nhận</th>
                        <th className="p-2.5 font-bold text-center text-[#245346]">Có mặt</th>
                        <th className="p-2.5 font-bold text-center text-[#7A521E]">Có phép</th>
                        <th className="p-2.5 font-bold text-center text-[#B3492F]">Vắng</th>
                        <th className="p-2.5 font-bold text-center">Tỷ lệ chuyên cần</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D7DCCB]">
                      {schoolReport.classes.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-[#5B6A61] italic">
                            Chưa có dữ liệu lớp học trong trường
                          </td>
                        </tr>
                      ) : (
                        schoolReport.classes.map((c, idx) => (
                          <tr
                            key={c.lop}
                            onClick={() => setCurrentLop(c.lop)}
                            className="hover:bg-[#F2F7F4] cursor-pointer transition-colors"
                          >
                            <td className="p-2.5 text-center text-[#5B6A61]">{idx + 1}</td>
                            <td className="p-2.5 font-bold text-[#1F3B32]">
                              <span className="text-[#3E7C6B] hover:underline">Lớp {c.lop}</span>
                            </td>
                            <td className="p-2.5 text-center font-semibold text-[#1B241F]">{c.totalStudents}</td>
                            <td className="p-2.5 text-center font-semibold text-[#5B6A61]">{c.totalDaysRecorded}</td>
                            <td className="p-2.5 text-center font-bold text-[#245346]">{c.presentCount}</td>
                            <td className="p-2.5 text-center font-bold text-[#7A521E]">{c.excusedCount}</td>
                            <td className="p-2.5 text-center font-bold text-[#B3492F]">{c.absentCount}</td>
                            <td className="p-2.5 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                                  c.rate < 60
                                    ? 'bg-red-100 text-red-800'
                                    : c.rate < 85
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {c.rate}%
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {schoolReport.classes.length > 0 && (
                      <tfoot className="bg-[#EBF3EE] font-bold border-t-2 border-[#1F3B32] text-[#1F3B32]">
                        <tr>
                          <td colSpan={2} className="p-2.5 text-center">TỔNG TOÀN TRƯỜNG</td>
                          <td className="p-2.5 text-center">{schoolReport.totalStudents}</td>
                          <td className="p-2.5 text-center">-</td>
                          <td className="p-2.5 text-center text-[#245346]">{schoolReport.totalPresent}</td>
                          <td className="p-2.5 text-center text-[#7A521E]">{schoolReport.totalExcused}</td>
                          <td className="p-2.5 text-center text-[#B3492F]">{schoolReport.totalAbsent}</td>
                          <td className="p-2.5 text-center text-sm font-black text-[#1F3B32]">
                            {schoolReport.schoolRate}%
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Detailed Absence List for whole school */}
              <div className="bg-white border border-[#D7DCCB] rounded-2xl p-4 shadow-xs">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold text-[#1F3B32] uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#B3492F]" />
                    Chi tiết học sinh vắng &amp; Đơn xin phép toàn trường ({detailedRecords.length} lượt)
                  </h3>
                </div>

                {detailedRecords.length === 0 ? (
                  <p className="text-xs text-[#5B6A61] italic text-center py-4">
                    Không có dữ liệu vắng mặt trong khoảng thời gian này.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {detailedRecords.map((r, i) => {
                      let statusText = 'Vắng không phép';
                      let statusBg = 'bg-red-50 text-red-700 border-red-200';
                      if (r.status === 'excused_approved') {
                        statusText = 'Có phép (Đã duyệt)';
                        statusBg = 'bg-amber-50 text-amber-700 border-amber-200';
                      } else if (r.status === 'excused_pending') {
                        statusText = 'Chờ duyệt phép';
                        statusBg = 'bg-blue-50 text-blue-700 border-blue-200';
                      } else if (r.status === 'excused_rejected') {
                        statusText = 'Từ chối phép';
                        statusBg = 'bg-red-50 text-red-700 border-red-200';
                      }

                      return (
                        <div
                          key={`${r.lop}_${r.studentId}_${r.date}_${i}`}
                          className="border border-[#D7DCCB] rounded-xl p-3 bg-[#FAF9F5] text-xs space-y-1.5"
                        >
                          <div className="flex justify-between items-start gap-1">
                            <div>
                              <span className="font-bold text-[#1F3B32]">{r.name}</span>
                              <span className="text-[10px] text-[#5B6A61] block">
                                Lớp <b>{r.lop}</b> • Mã: {r.studentId}
                              </span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBg}`}>
                              {statusText}
                            </span>
                          </div>

                          <div className="text-[11px] text-[#5B6A61]">
                            <b>Ngày:</b> {fmtDateVN(r.date)}
                          </div>

                          {r.excuseReason && (
                            <div className="text-[11px] text-[#1B241F] bg-white p-2 rounded-lg border border-[#D7DCCB]">
                              <b>Lý do:</b> {r.excuseReason}
                            </div>
                          )}

                          {r.excusePhoto && (
                            <div className="mt-2 pt-2 border-t border-[#D7DCCB]/60 text-center">
                              <img
                                src={r.excusePhoto}
                                alt="Minh chứng"
                                className="max-h-24 mx-auto rounded-lg object-contain border border-[#D7DCCB]"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= CASE 2: TỪNG LỚP CỤ THỂ ================= */}
          {currentLop !== 'ALL' && classReport && (
            <div className="space-y-4">
              {/* Class overview stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white border border-[#D7DCCB] rounded-xl text-center shadow-xs">
                  <div className="text-xl font-black text-[#1F3B32]">{classReport.students.length}</div>
                  <div className="text-[10px] font-bold text-[#5B6A61] uppercase tracking-wider">Sĩ số lớp</div>
                </div>
                <div className="p-3 bg-white border border-[#D7DCCB] rounded-xl text-center shadow-xs">
                  <div className="text-xl font-black text-[#1F3B32]">{classReport.totalDaysRecorded}</div>
                  <div className="text-[10px] font-bold text-[#5B6A61] uppercase tracking-wider">Buổi ghi nhận</div>
                </div>
                <div className="p-3 bg-white border border-[#D7DCCB] rounded-xl text-center shadow-xs">
                  <div className="text-xl font-black text-[#B3492F]">{detailedRecords.length}</div>
                  <div className="text-[10px] font-bold text-[#B3492F] uppercase tracking-wider">Lượt vắng</div>
                </div>
                <div className="p-3 bg-[#E1EEE8] border border-[#3E7C6B]/40 rounded-xl text-center shadow-xs">
                  <div className="text-xl font-black text-[#1F3B32]">
                    {classReport.students.length > 0
                      ? Math.round(
                          classReport.students.reduce((acc, s) => acc + s.rate, 0) /
                            classReport.students.length
                        )
                      : 0}
                    %
                  </div>
                  <div className="text-[10px] font-bold text-[#245346] uppercase tracking-wider">Chuyên cần lớp</div>
                </div>
              </div>

              {/* Student table */}
              <div className="bg-white border border-[#D7DCCB] rounded-2xl overflow-hidden shadow-xs">
                <div className="p-3 bg-[#EEF1E7] border-b border-[#D7DCCB] flex justify-between items-center">
                  <h3 className="text-xs font-bold text-[#1F3B32] uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#3E7C6B]" />
                    Danh sách học sinh lớp {currentLop} ({classReport.students.length} học sinh)
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAF9F5] border-b border-[#D7DCCB] text-[#5B6A61] uppercase">
                      <tr>
                        <th className="p-2.5 font-bold text-center w-12">STT</th>
                        <th className="p-2.5 font-bold">Mã HS</th>
                        <th className="p-2.5 font-bold">Họ và tên</th>
                        <th className="p-2.5 font-bold text-center">Tổng buổi</th>
                        <th className="p-2.5 font-bold text-center text-[#245346]">Có mặt</th>
                        <th className="p-2.5 font-bold text-center text-[#7A521E]">Có phép</th>
                        <th className="p-2.5 font-bold text-center text-[#B3492F]">Vắng</th>
                        <th className="p-2.5 font-bold text-center">Tỷ lệ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D7DCCB]">
                      {classReport.students.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-[#5B6A61] italic">
                            Chưa có danh sách học sinh trong lớp này
                          </td>
                        </tr>
                      ) : (
                        classReport.students.map((st, idx) => (
                          <tr key={st.studentId} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#FAF9F5]'}>
                            <td className="p-2.5 text-center text-[#5B6A61]">{idx + 1}</td>
                            <td className="p-2.5 font-mono text-[#5B6A61]">{st.studentId}</td>
                            <td className="p-2.5 font-bold text-[#1F3B32]">{st.name}</td>
                            <td className="p-2.5 text-center font-semibold text-[#5B6A61]">{st.totalSessions}</td>
                            <td className="p-2.5 text-center font-bold text-[#245346]">{st.presentCount}</td>
                            <td className="p-2.5 text-center font-bold text-[#7A521E]">{st.excusedCount}</td>
                            <td className="p-2.5 text-center font-bold text-[#B3492F]">{st.absentCount}</td>
                            <td className="p-2.5 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                                  st.rate < 60
                                    ? 'bg-red-100 text-red-800'
                                    : st.rate < 85
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {st.rate}%
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Class Absence Records & Proof Photos */}
              <div className="bg-white border border-[#D7DCCB] rounded-2xl p-4 shadow-xs">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold text-[#1F3B32] uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#B3492F]" />
                    Chi tiết vắng mặt &amp; Minh chứng đơn xin phép ({detailedRecords.length} lượt)
                  </h3>
                </div>

                {detailedRecords.length === 0 ? (
                  <p className="text-xs text-[#5B6A61] italic text-center py-4">
                    Lớp không có lượt vắng mặt nào trong khoảng thời gian này.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {detailedRecords.map((r, i) => {
                      let statusText = 'Vắng không phép';
                      let statusBg = 'bg-red-50 text-red-700 border-red-200';
                      if (r.status === 'excused_approved') {
                        statusText = 'Có phép (Đã duyệt)';
                        statusBg = 'bg-amber-50 text-amber-700 border-amber-200';
                      } else if (r.status === 'excused_pending') {
                        statusText = 'Chờ duyệt phép';
                        statusBg = 'bg-blue-50 text-blue-700 border-blue-200';
                      } else if (r.status === 'excused_rejected') {
                        statusText = 'Từ chối phép';
                        statusBg = 'bg-red-50 text-red-700 border-red-200';
                      }

                      return (
                        <div
                          key={`${r.studentId}_${r.date}_${i}`}
                          className="border border-[#D7DCCB] rounded-xl p-3 bg-[#FAF9F5] text-xs space-y-1.5"
                        >
                          <div className="flex justify-between items-start gap-1">
                            <div>
                              <span className="font-bold text-[#1F3B32]">{r.name}</span>
                              <span className="text-[10px] text-[#5B6A61] block">Mã: {r.studentId}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBg}`}>
                              {statusText}
                            </span>
                          </div>

                          <div className="text-[11px] text-[#5B6A61]">
                            <b>Ngày:</b> {fmtDateVN(r.date)}
                          </div>

                          {r.excuseReason && (
                            <div className="text-[11px] text-[#1B241F] bg-white p-2 rounded-lg border border-[#D7DCCB]">
                              <b>Lý do:</b> {r.excuseReason}
                            </div>
                          )}

                          {r.excusePhoto && (
                            <div className="mt-2 pt-2 border-t border-[#D7DCCB]/60 text-center">
                              <img
                                src={r.excusePhoto}
                                alt="Minh chứng"
                                className="max-h-24 mx-auto rounded-lg object-contain border border-[#D7DCCB]"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
