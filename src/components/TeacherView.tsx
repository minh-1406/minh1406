import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MapPin,
  Clock,
  Save,
  Lock,
  Unlock,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Users,
  Trash2,
  KeyRound,
  ShieldCheck,
  Plus,
  PlusCircle,
  LogOut,
  X,
  Calendar,
  Printer,
  BarChart3,
  Bell,
  Send,
  Zap,
  Camera,
  FileText,
  Check,
  UserCheck,
} from 'lucide-react';
import { getSafePhotoCaptureTime, checkDuplicatePhotoInClass } from '../utils/exifHelper';
import {
  Student,
  ClassConfig,
  DayData,
  AttendanceRecord,
  AttendanceStatus,
  TeacherAuthState,
} from '../types';
import {
  getRoster,
  setRoster,
  deleteLop,
  getClassConfig,
  setClassConfig,
  getDayData,
  setDayData,
  fmtTime,
  fmtDateVN,
  localTimeKey,
  localDateKey,
  addMinutesToTime,
  parseRosterFile,
  setClassPin,
  getLopList,
  fileToCompressedDataURL,
  getMaxLateDays,
  isDateWithinLateWindow,
  getDaysDiffFromToday,
  format24hDateTime,
  calculateSupplementDeadline,
  clearClassAttendanceData,
} from '../utils/storage';
import {
  syncSaveDayData,
  syncSaveRoster,
  syncSaveClassConfig,
  syncSaveClassPin,
  syncDeleteLop,
  syncClearClassAttendanceData,
  subscribeDayData,
  syncAppendClassLog,
} from '../utils/firestoreSync';

import { ReportsModal } from './ReportsModal';
import { AdminLiveActivityModal } from './AdminLiveActivityModal';

interface TeacherViewProps {
  selectedLop: string;
  setSelectedLop: (lop: string) => void;
  onOpenLightbox: (src: any) => void;
  teacherAuth: TeacherAuthState;
  onLockTeacher: () => void;
  onClassCreated?: (newLop: string) => void;
}

export const TeacherView: React.FC<TeacherViewProps> = ({
  selectedLop,
  setSelectedLop,
  onOpenLightbox,
  teacherAuth,
  onLockTeacher,
  onClassCreated,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(localDateKey());
  const [roster, setRosterState] = useState<Student[]>([]);
  const [dayData, setDayDataState] = useState<DayData>({
    status: 'open',
    records: {},
  });

  // Config form state
  const [config, setConfig] = useState<ClassConfig>({
    lat: 0,
    lng: 0,
    radius: 80,
    startTime: '06:30',
    endTime: '07:15',
    excuseDeadline: '17:00',
  });

  // Manual Excuse Modal state
  const [manualExcuseModal, setManualExcuseModal] = useState<{
    isOpen: boolean;
    studentId: string;
    studentName: string;
    reason: string;
    debtType: 'has_paper' | 'owing_paper';
    method: 'message' | 'call' | 'paper' | 'pending';
    photoBase64: string | null;
    photoCaptureTime?: string | null;
  } | null>(null);

  // All photos gallery modal state
  const [showAllPhotosModal, setShowAllPhotosModal] = useState<boolean>(false);
  const [allPhotosFilter, setAllPhotosFilter] = useState<'all' | 'proxy' | 'excuse'>('all');

  // Quick supplement photo ref & state for owing paper
  const quickSupplementInputRef = useRef<HTMLInputElement>(null);
  const [supplementStudentId, setSupplementStudentId] = useState<string | null>(null);

  const [pendingLat, setPendingLat] = useState<number | null>(null);
  const [pendingLng, setPendingLng] = useState<number | null>(null);
  const [locStatusMsg, setLocStatusMsg] = useState<string>('Chưa lấy vị trí');
  const [isGettingLoc, setIsGettingLoc] = useState<boolean>(false);

  // Security / PIN state for selected class
  const [newPinForCurrentClass, setNewPinForCurrentClass] = useState<string>('');
  const [showCurrentClassPin, setShowCurrentClassPin] = useState<boolean>(false);

  // Roster input state for current class
  const [rosterText, setRosterText] = useState<string>('');
  const [rosterFileStatus, setRosterFileStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create class modal / state
  const [showCreateClassModal, setShowCreateClassModal] = useState<boolean>(false);
  const [createClassName, setCreateClassName] = useState<string>('');
  const [createClassPin, setCreateClassPin] = useState<string>('');
  const [createConfirmPin, setCreateConfirmPin] = useState<string>('');
  const [createRosterText, setCreateRosterText] = useState<string>('');
  const [createFileStatus, setCreateFileStatus] = useState<string>('');
  const [showCreatePin, setShowCreatePin] = useState<boolean>(false);
  const [createErrorMsg, setCreateErrorMsg] = useState<string>('');
  const createFileInputRef = useRef<HTMLInputElement>(null);

  // Delete class confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [attendanceFilter, setAttendanceFilter] = useState<string>('all');
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [showClassActivityModal, setShowClassActivityModal] = useState<boolean>(false);

  // Single Student Management State (Add / Edit / Delete)
  const [showAddSingleStudent, setShowAddSingleStudent] = useState<boolean>(false);
  const [newStudentId, setNewStudentId] = useState<string>('');
  const [newStudentName, setNewStudentName] = useState<string>('');
  const [editingStudent, setEditingStudent] = useState<{
    originalId: string;
    id: string;
    name: string;
  } | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Manual Attendance Modal state (for present/late with note/debt)
  const [manualAttendanceModal, setManualAttendanceModal] = useState<{
    isOpen: boolean;
    studentId: string;
    studentName: string;
    status: 'present' | 'late' | 'absent';
    note: string;
  } | null>(null);

  // Manual Proxy Attendance Modal state
  const [manualProxyModal, setManualProxyModal] = useState<{
    isOpen: boolean;
    studentId: string;
    studentName: string;
  } | null>(null);

  // Auto Notification state
  const [showAutoNotificationModal, setShowAutoNotificationModal] = useState<boolean>(false);
  const [notificationSent, setNotificationSent] = useState<boolean>(false);

  // Computed list of all submitted photos (Proxy attendance + Excuses)
  const submittedPhotos = useMemo(() => {
    const list: Array<{
      id: string;
      studentId: string;
      studentName: string;
      type: 'proxy' | 'excuse';
      typeLabel: string;
      photo: string;
      captureTime: string;
      submittedTime: string;
      status: AttendanceStatus;
      debtType?: 'has_paper' | 'owing_paper';
      reason?: string;
    }> = [];

    roster.forEach((student) => {
      const rec = dayData.records[student.id];
      if (!rec) return;

      // 1. Excuse photo (from student or manual)
      if (rec.excusePhoto && rec.checkinSource !== 'monitor_proxy') {
        list.push({
          id: `excuse_${student.id}`,
          studentId: student.id,
          studentName: student.name,
          type: 'excuse',
          typeLabel: rec.excuseDebtType === 'owing_paper' ? 'Đơn bổ sung (Nợ đơn)' : 'Đơn xin phép',
          photo: rec.excusePhoto,
          captureTime: rec.excusePhotoCaptureTime || (rec.excuseSubmittedAt ? format24hDateTime(rec.excuseSubmittedAt) : 'Chưa có thông tin'),
          submittedTime: rec.excuseSubmittedAt ? format24hDateTime(rec.excuseSubmittedAt) : format24hDateTime(Date.now()),
          status: rec.status,
          debtType: rec.excuseDebtType,
          reason: rec.excuseReason,
        });
      }

      // 2. Proxy checkin photo
      const pPhoto = rec.proxyPhoto || (rec.checkinSource === 'monitor_proxy' ? rec.excusePhoto : null);
      if (pPhoto) {
        list.push({
          id: `proxy_${student.id}`,
          studentId: student.id,
          studentName: student.name,
          type: 'proxy',
          typeLabel: 'Điểm danh hộ (BCS gửi ảnh)',
          photo: pPhoto,
          captureTime: rec.proxyPhotoCaptureTime || rec.excusePhotoCaptureTime || (rec.checkinTime ? format24hDateTime(rec.checkinTime) : 'Chưa có thông tin'),
          submittedTime: rec.checkinTime ? format24hDateTime(rec.checkinTime) : format24hDateTime(Date.now()),
          status: rec.status,
        });
      }
    });

    return list;
  }, [roster, dayData]);

  // Notification / toast feedback
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    msg: string;
  } | null>(null);

  const showFeedback = (
    msg: string,
    type: 'success' | 'error' | 'info' = 'success'
  ) => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4500);
  };

  // Load class data (roster, config, dayData) strictly for selectedLop
  const loadClassData = () => {
    if (!selectedLop) {
      setRosterState([]);
      setDayDataState({ status: 'open', records: {} });
      return;
    }

    const currentRoster = getRoster(selectedLop);
    setRosterState(currentRoster);

    const currentCfg = getClassConfig(selectedLop);
    if (currentCfg) {
      setConfig({
        ...currentCfg,
        excuseDeadline: currentCfg.excuseDeadline || '17:00',
      });
      setPendingLat(currentCfg.lat);
      setPendingLng(currentCfg.lng);
      setLocStatusMsg(
        `Đã lưu: ${currentCfg.lat.toFixed(5)}, ${currentCfg.lng.toFixed(5)}`
      );
    } else {
      setConfig({
        lat: 0,
        lng: 0,
        radius: 80,
        startTime: '06:30',
        endTime: '07:15',
        excuseDeadline: '17:00',
      });
      setPendingLat(null);
      setPendingLng(null);
      setLocStatusMsg('Chưa lấy vị trí');
    }

    const currentDay = getDayData(selectedLop, selectedDate);
    setDayDataState(currentDay);
  };

  useEffect(() => {
    loadClassData();
    if (selectedLop && selectedDate) {
      const unsub = subscribeDayData(selectedLop, selectedDate, (updatedDay) => {
        setDayDataState(updatedDay);
      });
      const handleStorageUpdate = () => {
        loadClassData();
      };
      window.addEventListener('app_storage_updated', handleStorageUpdate);
      return () => {
        unsub();
        window.removeEventListener('app_storage_updated', handleStorageUpdate);
      };
    }
  }, [selectedLop, selectedDate]);

  // Periodic live refresh for student check-ins
  useEffect(() => {
    const timer = setInterval(() => {
      if (selectedLop) {
        const currentDay = getDayData(selectedLop, selectedDate);
        setDayDataState(currentDay);
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [selectedLop, selectedDate]);

  // Geolocation trigger
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocStatusMsg('Trình duyệt không hỗ trợ định vị.');
      return;
    }
    setIsGettingLoc(true);
    setLocStatusMsg('Đang lấy vị trí...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsGettingLoc(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPendingLat(lat);
        setPendingLng(lng);
        setLocStatusMsg(
          `Đã lấy: ${lat.toFixed(5)}, ${lng.toFixed(5)} (độ chính xác ~${Math.round(
            pos.coords.accuracy
          )}m)`
        );
      },
      (err) => {
        setIsGettingLoc(false);
        setLocStatusMsg(`Không lấy được vị trí: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Save class configuration
  const handleSaveConfig = () => {
    if (!selectedLop) {
      showFeedback('Vui lòng tạo lớp học trước.', 'error');
      return;
    }
    if (pendingLat === null || pendingLng === null) {
      showFeedback('Vui lòng lấy vị trí trung tâm GPS trước khi lưu.', 'error');
      return;
    }
    const newCfg: ClassConfig = {
      lat: pendingLat,
      lng: pendingLng,
      radius: config.radius > 0 ? config.radius : 80,
      startTime: config.startTime || '06:30',
      endTime: config.endTime || '07:15',
      excuseDeadline: config.excuseDeadline || '17:00',
    };
    setConfig(newCfg);
    setClassConfig(selectedLop, newCfg);
    syncSaveClassConfig(selectedLop, newCfg);
    syncAppendClassLog(selectedLop, {
      actorRole: 'gvcn',
      actorName: `GVCN Lớp ${selectedLop}`,
      actorId: 'GVCN',
      actionTitle: 'GVCN lưu cấu hình GPS & Khung giờ',
      details: `Bán kính: ${newCfg.radius}m • Giờ mở: ${newCfg.startTime} - ${newCfg.endTime} • Hạn duyệt phép: ${newCfg.excuseDeadline}`,
    });
    showFeedback(`Đã lưu cấu hình vị trí & khung giờ cho lớp ${selectedLop}`);
    loadClassData();
  };

  // Update PIN for current class
  const handleUpdateCurrentClassPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLop) return;
    if (!newPinForCurrentClass || newPinForCurrentClass.length < 4) {
      showFeedback('Mã PIN mới phải có ít nhất 4 ký tự/số.', 'error');
      return;
    }
    setClassPin(selectedLop, newPinForCurrentClass);
    syncSaveClassPin(selectedLop, newPinForCurrentClass);
    syncAppendClassLog(selectedLop, {
      actorRole: 'gvcn',
      actorName: `GVCN Lớp ${selectedLop}`,
      actorId: 'GVCN',
      actionTitle: 'GVCN cập nhật mã PIN bảo mật lớp',
      details: `Đã thay đổi mã PIN truy cập quản lý lớp ${selectedLop}`,
    });
    setNewPinForCurrentClass('');
    showFeedback(`Đã đổi mã PIN bảo mật cho lớp ${selectedLop} thành công!`);
  };

  // Toggle Monitor role for student
  const handleToggleMonitor = (studentId: string) => {
    if (!selectedLop) return;
    let targetStudentName = studentId;
    let granted = false;
    const updated = roster.map((s) => {
      if (s.id === studentId) {
        targetStudentName = s.name;
        granted = !s.isMonitor;
        return { ...s, isMonitor: !s.isMonitor };
      }
      return s;
    });
    setRosterState(updated);
    setRoster(selectedLop, updated);
    syncSaveRoster(selectedLop, updated);
    syncAppendClassLog(selectedLop, {
      actorRole: 'gvcn',
      actorName: `GVCN Lớp ${selectedLop}`,
      actorId: studentId,
      actionTitle: granted ? 'GVCN cấp quyền Ban Cán Sự (BCS)' : 'GVCN thu hồi quyền Ban Cán Sự',
      details: `${granted ? 'Đã bổ nhiệm' : 'Đã hủy quyền'} Ban Cán Sự cho học sinh ${targetStudentName} (${studentId})`,
    });
    showFeedback(`Đã cập nhật quyền Ban Cán Sự cho học sinh ${studentId}`);
  };

  // Close attendance for today
  const handleCloseDay = () => {
    if (!selectedLop || !selectedDate) return;
    const freshDay = getDayData(selectedLop, selectedDate);
    roster.forEach((s) => {
      if (!freshDay.records[s.id]) {
        freshDay.records[s.id] = {
          name: s.name,
          status: 'absent',
        };
      }
    });
    freshDay.status = 'closed';
    freshDay.closedAt = Date.now();
    setDayData(selectedLop, selectedDate, freshDay);
    syncSaveDayData(selectedLop, selectedDate, freshDay);
    setDayDataState({ ...freshDay });
    showFeedback(`Đã đóng điểm danh ngày ${fmtDateVN(selectedDate)}.`);
  };

  // Reopen attendance for today
  const handleReopenDay = () => {
    if (!selectedLop || !selectedDate) return;
    const freshDay = getDayData(selectedLop, selectedDate);
    freshDay.status = 'open';
    setDayData(selectedLop, selectedDate, freshDay);
    syncSaveDayData(selectedLop, selectedDate, freshDay);
    syncAppendClassLog(selectedLop, {
      actorRole: 'gvcn',
      actorName: `GVCN Lớp ${selectedLop}`,
      actorId: 'GVCN',
      actionTitle: 'GVCN mở lại sổ điểm danh',
      details: `Đã mở lại phiên điểm danh ngày ${fmtDateVN(selectedDate)}`,
    });
    setDayDataState({ ...freshDay });
    showFeedback(`Đã mở lại điểm danh ngày ${fmtDateVN(selectedDate)}.`);
  };

  // Export CSV report
  const handleExportCSV = () => {
    if (!selectedLop || roster.length === 0) {
      showFeedback('Không có dữ liệu học sinh để xuất báo cáo.', 'error');
      return;
    }

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += `BÁO CÁO ĐIỂM DANH LỚP ${selectedLop} - NGÀY ${fmtDateVN(selectedDate)}\n`;
    csvContent += 'STT,Mã HS,Họ và tên,Trạng thái,Thời gian,Khoảng cách GPS,Lý do xin nghỉ\n';

    roster.forEach((student, idx) => {
      const rec = dayData.records[student.id];
      const status = rec?.status || 'none';
      let statusText = 'Chưa điểm danh';
      if (status === 'present') statusText = 'Có mặt';
      else if (status === 'absent') statusText = 'Vắng mặt';
      else if (status === 'excused_pending') statusText = 'Đơn chờ duyệt';
      else if (status === 'excused_approved') statusText = 'Đã duyệt nghỉ';
      else if (status === 'excused_rejected') statusText = 'Từ chối nghỉ';

      const timeText = rec?.checkinTime ? fmtTime(rec.checkinTime) : '';
      const distText = rec?.distance !== undefined ? `${Math.round(rec.distance)}m` : '';
      const excuseText = rec?.excuseReason ? `"${rec.excuseReason.replace(/"/g, '""')}"` : '';

      csvContent += `${idx + 1},"${student.id}","${student.name}","${statusText}","${timeText}","${distText}",${excuseText}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `DiemDanh_${selectedLop}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showFeedback(`Đã xuất báo cáo CSV cho lớp ${selectedLop} thành công!`);
  };

  // Export PDF / Print report
  const handleExportPDF = () => {
    if (!selectedLop || roster.length === 0) {
      showFeedback('Không có dữ liệu học sinh để in báo cáo.', 'error');
      return;
    }

    const absentCount = roster.filter(
      (s) => dayData.records[s.id]?.status === 'absent'
    ).length;
    const excusedCount = roster.filter(
      (s) => ['excused_pending', 'excused_approved'].includes(dayData.records[s.id]?.status || '')
    ).length;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showFeedback('Trình duyệt đã chặn cửa sổ bật lên. Vui lòng cho phép popup để in.', 'error');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <title>Báo cáo điểm danh - Lớp ${selectedLop} - ${fmtDateVN(selectedDate)}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #1B241F; margin: 20px; }
          h1 { text-align: center; font-size: 18px; margin-bottom: 4px; text-transform: uppercase; color: #1F3B32; }
          .subtitle { text-align: center; font-size: 13px; color: #5B6A61; margin-bottom: 20px; }
          .summary { display: flex; justify-content: space-around; background: #F7F6F0; border: 1px solid #D7DCCB; padding: 10px; border-radius: 8px; font-size: 13px; margin-bottom: 20px; }
          .summary div { text-align: center; }
          .summary b { display: block; font-size: 16px; color: #1F3B32; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
          th, td { border: 1px solid #D7DCCB; padding: 8px 10px; text-align: left; }
          th { background-color: #EEF1E7; color: #1B241F; font-weight: bold; text-align: center; }
          td.center { text-align: center; }
          .badge-present { color: #245346; font-weight: bold; }
          .badge-absent { color: #B3492F; font-weight: bold; }
          .badge-excused { color: #1d4ed8; font-weight: bold; }
          .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 13px; }
          .footer div { text-align: center; }
          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>BÁO CÁO ĐIỂM DANH HỌC SINH</h1>
        <div class="subtitle">Lớp: <b>${selectedLop}</b> | Ngày: <b>${fmtDateVN(selectedDate)}</b></div>

        <div class="summary">
          <div>Tổng số: <b>${roster.length}</b></div>
          <div>Có mặt: <b style="color: #245346;">${presentCount}</b></div>
          <div>Vắng mặt: <b style="color: #B3492F;">${absentCount}</b></div>
          <div>Có phép: <b style="color: #1d4ed8;">${excusedCount}</b></div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 50px;">STT</th>
              <th style="width: 100px;">Mã HS</th>
              <th>Họ và tên</th>
              <th style="width: 110px;">Trạng thái</th>
              <th style="width: 110px;">Giờ điểm danh</th>
              <th>Lý do nghỉ / Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${roster
              .map((student, idx) => {
                const rec = dayData.records[student.id];
                const status = rec?.status || 'none';
                let statusText = 'Chưa điểm danh';
                let badgeClass = '';
                if (status === 'present') {
                  statusText = 'Có mặt';
                  badgeClass = 'badge-present';
                } else if (status === 'absent') {
                  statusText = 'Vắng mặt';
                  badgeClass = 'badge-absent';
                } else if (status === 'excused_approved' || status === 'excused_pending') {
                  statusText = status === 'excused_approved' ? 'Đã duyệt nghỉ' : 'Đơn chờ duyệt';
                  badgeClass = 'badge-excused';
                } else if (status === 'excused_rejected') {
                  statusText = 'Từ chối nghỉ';
                  badgeClass = 'badge-absent';
                }

                const timeText = rec?.checkinTime ? fmtTime(rec.checkinTime) : '—';
                const excuseText = rec?.excuseReason ? `${rec.excuseReason}` : '—';
                const sourceText = rec?.lastUpdatedAction || (rec?.checkinSource === 'monitor_proxy' ? 'BCS điểm danh hộ' : '—');

                return `
                  <tr>
                    <td class="center">${idx + 1}</td>
                    <td style="font-family: monospace;"><b>${student.id}</b></td>
                    <td>${student.name}</td>
                    <td class="center ${badgeClass}">
                      ${statusText}
                      <div style="font-size: 10px; color: #666;">${sourceText}</div>
                    </td>
                    <td class="center">${timeText}</td>
                    <td>${excuseText}</td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>

        <div class="footer">
          <div>
            <p><b>Giáo viên bộ môn / Chủ nhiệm</b></p>
            <br><br><br>
            <p>(Ký và ghi rõ họ tên)</p>
          </div>
          <div>
            <p><i>Ngày ..... tháng ..... năm 20...</i></p>
            <p><b>Xác nhận của nhà trường</b></p>
            <br><br><br>
            <p>(Ký tên và đóng dấu)</p>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Manual Attendance
  const handleManualAttendance = (
    studentId: string,
    studentName: string,
    status: 'present' | 'absent' | 'late'
  ) => {
    if (!selectedLop || !selectedDate) return;
    setManualAttendanceModal({
      isOpen: true,
      studentId,
      studentName,
      status,
      note: ''
    });
  };

  const submitManualAttendance = () => {
    if (!manualAttendanceModal || !selectedLop || !selectedDate) return;
    
    const { studentId, studentName, status, note } = manualAttendanceModal;

    // Check attendance window
    const currentCfg = getClassConfig(selectedLop);
    const excuseDeadline = currentCfg?.excuseDeadline || '17:00';
    const nowKey = localTimeKey();
    const todayKey = localDateKey();
    const maxDays = getMaxLateDays();
    const windowCheck = isDateWithinLateWindow(selectedDate, maxDays);

    if (selectedDate > todayKey) {
      showFeedback('Không thể điểm danh cho ngày trong tương lai.', 'error');
      return;
    }

    // Cho phép đánh dấu "Vắng không phép" (absent) trong suốt thời hạn duyệt phép (trong ngày trước hạn chót hoặc trong số ngày cho phép của BGH)
    if (status === 'absent') {
      const isTodayAllowed = selectedDate === todayKey && nowKey <= excuseDeadline;
      const isLateAllowed = selectedDate < todayKey && windowCheck.isAllowed;
      if (!isTodayAllowed && !isLateAllowed && dayData.status === 'closed') {
        showFeedback('Đã khóa sổ điểm danh và quá hạn xử lý vắng phép cho ngày này.', 'error');
        return;
      }
    } else {
      if (selectedDate < todayKey) {
        showFeedback('Ngày này đã qua và đã khóa sổ điểm danh trực tiếp.', 'error');
        return;
      }

      if (currentCfg && currentCfg.startTime && nowKey < currentCfg.startTime) {
        showFeedback(`Chưa đến giờ điểm danh! Khung giờ điểm danh mở lúc ${currentCfg.startTime}.`, 'error');
        return;
      }

      if (currentCfg && currentCfg.endTime && nowKey > currentCfg.endTime) {
        showFeedback(`Đã hết giờ điểm danh! Khung giờ điểm danh đã đóng lúc ${currentCfg.endTime}.`, 'error');
        return;
      }

      if (dayData.status === 'closed') {
        showFeedback('Sổ điểm danh ngày này đã được bấm khóa.', 'error');
        return;
      }
    }

    const freshDay = getDayData(selectedLop, selectedDate);
    const existingRec = freshDay.records[studentId];

    if (
      status === 'present' &&
      existingRec &&
      (existingRec.excuseReason ||
        existingRec.status === 'excused_pending' ||
        existingRec.status === 'excused_approved' ||
        existingRec.status === 'excused_rejected')
    ) {
      showFeedback('Học sinh này đã xin phép nghỉ học. Chỉ có thể chọn Vắng có phép hoặc Vắng không phép.', 'error');
      return;
    }

    if (!freshDay.records[studentId]) {
      freshDay.records[studentId] = {
        name: studentName,
        status: 'none'
      };
    }
    freshDay.records[studentId].status = status;
    freshDay.records[studentId].note = note.trim();
    freshDay.records[studentId].lastUpdatedByTeacherAt = Date.now();
    freshDay.records[studentId].lastUpdatedAction = 
      status === 'present' ? 'GVCN điểm danh: Có mặt' :
      status === 'late' ? 'GVCN điểm danh: Đi muộn' : 'GVCN chốt: Vắng không phép';
    
    if (status === 'present' || status === 'late') {
      freshDay.records[studentId].checkinSource = 'manual';
      freshDay.records[studentId].checkinTime = Date.now();
    } else {
      delete freshDay.records[studentId].checkinSource;
      delete freshDay.records[studentId].checkinTime;
    }
    setDayData(selectedLop, selectedDate, freshDay);
    syncSaveDayData(selectedLop, selectedDate, freshDay);
    syncAppendClassLog(selectedLop, {
      actorRole: 'gvcn',
      actorName: `GVCN Lớp ${selectedLop}`,
      actorId: 'GVCN',
      actionTitle:
        status === 'present'
          ? `Điểm danh thủ công: Có mặt (${studentName})`
          : status === 'late'
          ? `Điểm danh thủ công: Đi muộn (${studentName})`
          : `Chốt trạng thái: Vắng không phép (${studentName})`,
      details: `Mã HS: ${studentId} • Ngày điểm danh: ${selectedDate} • Ghi chú: ${note.trim()}`,
    });
    setDayDataState({ ...freshDay });
    setManualAttendanceModal(null);
    showFeedback(
      status === 'present'
        ? `Đã đánh dấu Có mặt cho học sinh ${studentName}.`
        : `Đã ghi nhận Vắng không phép cho học sinh ${studentName}.`
    );
  };

  const handleManualProxy = (studentId: string, studentName: string) => {
    setManualProxyModal({ isOpen: true, studentId, studentName });
  };

  const submitManualProxy = () => {
    if (!manualProxyModal || !selectedLop || !selectedDate) return;
    const { studentId, studentName } = manualProxyModal;
    
    const freshDay = getDayData(selectedLop, selectedDate);
    const currentCfg = getClassConfig(selectedLop);
    const nowKey = localTimeKey();
    const isLate = Boolean(currentCfg?.endTime && nowKey > currentCfg.endTime);
    const attStatus: AttendanceStatus = isLate ? 'late' : 'present';
    
    freshDay.records[studentId] = {
      name: studentName,
      status: attStatus,
      checkinSource: 'manual',
      checkinTime: Date.now(),
      lastUpdatedByTeacherAt: Date.now(),
      lastUpdatedAction: isLate
        ? 'GVCN điểm danh hộ (Ghi nhận Đi muộn)'
        : 'GVCN điểm danh hộ (Xác nhận Có mặt đúng giờ)',
    };

    setDayData(selectedLop, selectedDate, freshDay);
    syncSaveDayData(selectedLop, selectedDate, freshDay);
    syncAppendClassLog(selectedLop, {
      actorRole: 'gvcn',
      actorName: `GVCN Lớp ${selectedLop}`,
      actorId: 'GVCN',
      actionTitle: `GVCN điểm danh hộ: Có mặt (${studentName})`,
      details: `Mã HS: ${studentId} • Ngày điểm danh: ${selectedDate}`,
    });
    setDayDataState({ ...freshDay });
    setManualProxyModal(null);
    showFeedback(`Đã ghi nhận điểm danh hộ (Có mặt) cho học sinh ${studentName}.`);
  };

  // Manual Excuse Modal Handlers
  const handleManualExcuse = (studentId: string, studentName: string) => {
    if (!selectedLop || !selectedDate) return;
    
    // GVCN luôn có quyền ghi nhận Vắng có phép, bỏ check deadline cho GVCN.
    
    const freshDay = getDayData(selectedLop, selectedDate);
    const rec = freshDay.records[studentId];
    
    let defaultReason = '';
    let defaultMethod: 'call' | 'message' | 'paper' | 'pending' = 'call';
    let defaultPhoto = rec?.excusePhoto || null;
    let defaultDebtType: 'has_paper' | 'owing_paper' = rec?.excuseDebtType || (rec?.excusePhoto ? 'has_paper' : 'owing_paper');

    if (rec?.excuseReason) {
      const match = rec.excuseReason.match(/^\[(.*?)\] (.*)$/);
      if (match) {
        const methodText = match[1];
        defaultReason = match[2];
        if (methodText === 'Gọi điện') defaultMethod = 'call';
        else if (methodText === 'Tin nhắn') defaultMethod = 'message';
        else if (methodText === 'Đơn giấy') defaultMethod = 'paper';
        else if (methodText === 'Nợ đơn') {
          defaultMethod = 'pending';
          defaultDebtType = 'owing_paper';
        }
      } else {
        defaultReason = rec.excuseReason;
      }
    }

    setManualExcuseModal({
      isOpen: true,
      studentId,
      studentName,
      reason: defaultReason,
      debtType: defaultDebtType,
      method: defaultMethod,
      photoBase64: defaultPhoto,
      photoCaptureTime: rec?.excusePhotoCaptureTime || null,
    });
  };

  const handleManualExcusePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const captureTime = await getSafePhotoCaptureTime(file);
      const compressedDataUrl = await fileToCompressedDataURL(file);
      const studentId = manualExcuseModal?.studentId || '';
      if (selectedLop && selectedDate && studentId) {
        const dupCheck = checkDuplicatePhotoInClass(selectedLop, selectedDate, studentId, compressedDataUrl);
        if (dupCheck.isDuplicate) {
          showFeedback(`Cảnh báo gian lận ảnh: Ảnh này đã được sử dụng cho học sinh ${dupCheck.usedByStudentName} (${dupCheck.usedByStudentId})! Mỗi ảnh chụp chỉ được dùng cho 1 học sinh duy nhất.`, 'error');
          return;
        }
      }
      setManualExcuseModal(prev => prev ? { ...prev, photoBase64: compressedDataUrl, photoCaptureTime: captureTime } : null);
    } catch (error) {
      showFeedback('Lỗi khi nén ảnh hoặc đọc EXIF. Vui lòng thử lại.');
    }
  };

  const submitManualExcuse = () => {
    if (!manualExcuseModal || !selectedLop || !selectedDate) return;

    const { studentId, studentName, reason, debtType, method, photoBase64, photoCaptureTime } = manualExcuseModal;

    const cleanReason = reason.trim() || (debtType === 'owing_paper' ? 'Nợ đơn xin phép (Chờ bổ sung)' : 'GVCN ghi nhận vắng có phép');

    if (debtType === 'has_paper' && !photoBase64) {
      showFeedback('Mục "Có đơn" yêu cầu phải tải ảnh đơn lên để hệ thống xác nhận có phép ngay. Nếu chưa có ảnh, vui lòng chuyển sang mục "Nợ đơn".', 'error');
      return;
    }

    // Check BGH late window
    const todayKey = localDateKey();
    const maxDays = getMaxLateDays();
    const windowCheck = isDateWithinLateWindow(selectedDate, maxDays);

    const isToday = selectedDate === todayKey;
    const isFuture = selectedDate > todayKey;
    const isLateExcuseActive = selectedDate < todayKey && windowCheck.isAllowed;

    // GVCN is teacher in charge — GVCN can ALWAYS record excuse for today or past days within BGH window
    const canProcessExcuse = isToday || isLateExcuseActive;

    if (!canProcessExcuse) {
      if (isFuture) {
        showFeedback('Không thể thêm đơn phép cho ngày trong tương lai.', 'error');
        return;
      }
      showFeedback(`Đã quá thời hạn ${maxDays} ngày cho phép nộp & duyệt phép trễ theo quy định của Ban Giám Hiệu.`, 'error');
      return;
    }

    const freshDay = getDayData(selectedLop, selectedDate);

    if (!freshDay.records[studentId]) {
      freshDay.records[studentId] = {
        name: studentName || roster.find(s => s.id === studentId)?.name || 'Unknown',
        status: 'none'
      };
    }
    freshDay.records[studentId].status = 'excused_approved';
    freshDay.records[studentId].excuseDebtType = debtType;
    if (debtType === 'owing_paper') {
      freshDay.records[studentId].debtSupplementDeadline = calculateSupplementDeadline(selectedDate, maxDays);
    } else {
      delete freshDay.records[studentId].debtSupplementDeadline;
    }
    
    // Format the reason with the method
    let methodText = '';
    if (debtType === 'owing_paper') {
      methodText = 'Nợ đơn';
    } else {
      if (method === 'call') methodText = 'Gọi điện';
      else if (method === 'message') methodText = 'Tin nhắn';
      else if (method === 'paper') methodText = 'Đơn giấy';
      else methodText = 'Có đơn';
    }
    
    freshDay.records[studentId].excuseReason = `[${methodText}] ${cleanReason}`;
    if (photoBase64) {
      freshDay.records[studentId].excusePhoto = photoBase64;
      if (photoCaptureTime) {
        freshDay.records[studentId].excusePhotoCaptureTime = photoCaptureTime;
      }
    } else {
      delete freshDay.records[studentId].excusePhoto;
      delete freshDay.records[studentId].excusePhotoCaptureTime;
    }
    
    freshDay.records[studentId].excuseSubmittedAt = Date.now();
    freshDay.records[studentId].excuseDecidedAt = Date.now();
    freshDay.records[studentId].lastUpdatedByTeacherAt = Date.now();
    freshDay.records[studentId].isLateExcuse = isLateExcuseActive;
    freshDay.records[studentId].lastUpdatedAction = debtType === 'has_paper'
      ? 'GVCN ghi nhận: Vắng có phép (Đã có đơn)'
      : `GVCN ghi nhận: Vắng có phép (Nợ đơn - Hạn nộp ${calculateSupplementDeadline(selectedDate, maxDays)})`;
    delete freshDay.records[studentId].checkinSource;
    delete freshDay.records[studentId].checkinTime;
    
    setDayData(selectedLop, selectedDate, freshDay);
    syncSaveDayData(selectedLop, selectedDate, freshDay);
    syncAppendClassLog(selectedLop, {
      actorRole: 'gvcn',
      actorName: `GVCN Lớp ${selectedLop}`,
      actorId: 'GVCN',
      actionTitle: debtType === 'has_paper'
        ? `Ghi nhận Vắng có phép - Đã có đơn (${studentName})`
        : `Ghi nhận Vắng có phép - Nợ đơn (${studentName})`,
      details: debtType === 'has_paper'
        ? `Lý do: ${cleanReason} • Đã tải minh chứng ảnh EXIF`
        : `Lý do: ${cleanReason} • Nợ đơn bổ sung trong ${maxDays} ngày quy định của BGH (Hạn chót: ${calculateSupplementDeadline(selectedDate, maxDays)})`,
    });
    setDayDataState({ ...freshDay });
    
    setManualExcuseModal(null); // close modal
    showFeedback(
      debtType === 'has_paper'
        ? `Đã ghi nhận Vắng có phép (Đã có đơn) cho học sinh ${studentName}.`
        : `Đã ghi nhận Vắng có phép (Nợ đơn) cho học sinh ${studentName}. Hạn nộp bổ sung: ${calculateSupplementDeadline(selectedDate, maxDays)}.`
    );
  };

  // Quick Trigger for Supplementing Debt Photo
  const handleTriggerSupplement = (studentId: string) => {
    setSupplementStudentId(studentId);
    if (quickSupplementInputRef.current) {
      quickSupplementInputRef.current.value = '';
      quickSupplementInputRef.current.click();
    }
  };

  const handleQuickSupplementFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supplementStudentId || !selectedLop || !selectedDate) return;

    try {
      showFeedback('Đang xử lý và đọc EXIF ảnh đơn bổ sung...');
      const captureTime = await getSafePhotoCaptureTime(file);

      const compressedDataUrl = await fileToCompressedDataURL(file);
      const dupCheck = checkDuplicatePhotoInClass(selectedLop, selectedDate, supplementStudentId, compressedDataUrl);
      if (dupCheck.isDuplicate) {
        showFeedback(`Cảnh báo gian lận ảnh: Ảnh này đã được sử dụng cho học sinh ${dupCheck.usedByStudentName} (${dupCheck.usedByStudentId})! Mỗi ảnh chụp chỉ được dùng cho 1 học sinh duy nhất.`, 'error');
        setSupplementStudentId(null);
        return;
      }
      const freshDay = getDayData(selectedLop, selectedDate);
      const rec = freshDay.records[supplementStudentId];
      if (!rec) return;

      rec.excusePhoto = compressedDataUrl;
      rec.excusePhotoCaptureTime = captureTime;
      rec.excuseDebtType = 'has_paper';
      rec.status = 'excused_approved';
      rec.lastUpdatedByTeacherAt = Date.now();
      rec.lastUpdatedAction = 'Đã bổ sung ảnh đơn xin nghỉ (Hoàn tất nợ đơn)';

      setDayData(selectedLop, selectedDate, freshDay);
      syncSaveDayData(selectedLop, selectedDate, freshDay);
      syncAppendClassLog(selectedLop, {
        actorRole: 'gvcn',
        actorName: `GVCN Lớp ${selectedLop}`,
        actorId: 'GVCN',
        actionTitle: `Bổ sung ảnh đơn xin nghỉ: Đã có đơn (${rec.name})`,
        details: `Học sinh ${rec.name} (${supplementStudentId}) đã bổ sung ảnh chụp đơn, hoàn thành nghĩa vụ nợ đơn`,
      });
      setDayDataState({ ...freshDay });
      showFeedback(`Đã bổ sung ảnh đơn thành công cho ${rec.name}! Trạng thái chuyển thành "Vắng có phép (Đã có đơn)".`);
    } catch (err: any) {
      showFeedback('Lỗi khi xử lý ảnh đơn: ' + (err?.message || err), 'error');
    } finally {
      setSupplementStudentId(null);
    }
  };

  // Adjust any student to absent (Vắng không phép)
  const handleAdjustToAbsent = (studentId: string, customNote?: string) => {
    if (!selectedLop || !selectedDate) return;
    const freshDay = getDayData(selectedLop, selectedDate);
    const rec = freshDay.records[studentId];
    const sName = rec?.name || roster.find(s => s.id === studentId)?.name || studentId;

    if (!freshDay.records[studentId]) {
      freshDay.records[studentId] = {
        name: sName,
        status: 'absent'
      };
    } else {
      freshDay.records[studentId].status = 'absent';
    }

    freshDay.records[studentId].lastUpdatedByTeacherAt = Date.now();
    freshDay.records[studentId].lastUpdatedAction = customNote || 'GVCN điều chỉnh: Vắng không phép (Hủy có mặt / Ảnh không hợp lệ)';
    delete freshDay.records[studentId].checkinSource;
    delete freshDay.records[studentId].checkinTime;

    setDayData(selectedLop, selectedDate, freshDay);
    syncSaveDayData(selectedLop, selectedDate, freshDay);
    syncAppendClassLog(selectedLop, {
      actorRole: 'gvcn',
      actorName: `GVCN Lớp ${selectedLop}`,
      actorId: 'GVCN',
      actionTitle: `Điều chỉnh trạng thái: Vắng không phép (${sName})`,
      details: customNote || `Hủy có mặt / minh chứng không hợp lệ cho ${sName} (${studentId}) -> Chuyển thành Vắng không phép`,
    });
    setDayDataState({ ...freshDay });
    showFeedback(`Đã điều chỉnh học sinh ${sName} sang trạng thái Vắng không phép.`);
  };

  // Delete invalid photo / excuse request so GVCN can remove fake/invalid proofs
  const handleDeleteInvalidPhotoAndExcuse = (
    studentId: string,
    mode: 'photo_only' | 'all_excuse_and_photo'
  ) => {
    if (!selectedLop || !selectedDate) return;
    const freshDay = getDayData(selectedLop, selectedDate);
    const rec = freshDay.records[studentId];
    if (!rec) return;
    const sName = rec.name || roster.find((s) => s.id === studentId)?.name || studentId;

    if (mode === 'photo_only') {
      // Xóa ảnh minh chứng không hợp lệ (chuyển về Nợ đơn nếu là đơn phép, hoặc hủy ảnh điểm danh hộ)
      delete rec.excusePhoto;
      delete rec.excusePhotoCaptureTime;
      delete rec.proxyPhoto;
      delete rec.proxyPhotoCaptureTime;

      if (rec.checkinSource === 'monitor_proxy' || rec.status === 'proxy_pending') {
        delete rec.checkinSource;
        delete rec.checkinTime;
        rec.status = 'absent';
        rec.lastUpdatedAction = 'GVCN đã xóa ảnh điểm danh hộ không hợp lệ -> Chuyển Vắng không phép';
      } else if (
        rec.excuseReason ||
        rec.status === 'excused_pending' ||
        rec.status === 'excused_approved'
      ) {
        rec.excuseDebtType = 'owing_paper';
        rec.debtSupplementDeadline = calculateSupplementDeadline(selectedDate, getMaxLateDays());
        rec.lastUpdatedAction = `GVCN đã xóa ảnh đơn không hợp lệ -> Chuyển sang Nợ đơn (Cần bổ sung ảnh mới trước ${rec.debtSupplementDeadline})`;
      }
      rec.lastUpdatedByTeacherAt = Date.now();

      setDayData(selectedLop, selectedDate, freshDay);
      syncSaveDayData(selectedLop, selectedDate, freshDay);
      syncAppendClassLog(selectedLop, {
        actorRole: 'gvcn',
        actorName: `GVCN Lớp ${selectedLop}`,
        actorId: 'GVCN',
        actionTitle: `Xóa ảnh minh chứng không hợp lệ (${sName})`,
        details: `GVCN đã xóa ảnh minh chứng không hợp lệ của học sinh ${sName} (${studentId}). Yêu cầu bổ sung lại minh chứng hợp lệ.`,
      });
      setDayDataState({ ...freshDay });
      showFeedback(`Đã xóa ảnh không hợp lệ của học sinh ${sName}.`);
    } else {
      // Xóa toàn bộ đơn & ảnh không hợp lệ -> Đưa về Vắng không phép (hoặc xóa sạch đơn)
      delete rec.excuseReason;
      delete rec.excusePhoto;
      delete rec.excusePhotoCaptureTime;
      delete rec.proxyPhoto;
      delete rec.proxyPhotoCaptureTime;
      delete rec.excuseDebtType;
      delete rec.debtSupplementDeadline;
      delete rec.excuseSubmittedAt;
      delete rec.excuseDecidedAt;
      delete rec.checkinSource;
      delete rec.checkinTime;

      rec.status = 'absent';
      rec.lastUpdatedByTeacherAt = Date.now();
      rec.lastUpdatedAction = 'GVCN đã xóa toàn bộ đơn/ảnh không hợp lệ -> Ghi nhận Vắng không phép';

      setDayData(selectedLop, selectedDate, freshDay);
      syncSaveDayData(selectedLop, selectedDate, freshDay);
      syncAppendClassLog(selectedLop, {
        actorRole: 'gvcn',
        actorName: `GVCN Lớp ${selectedLop}`,
        actorId: 'GVCN',
        actionTitle: `Xóa đơn & ảnh không hợp lệ (${sName})`,
        details: `GVCN đã xóa toàn bộ đơn xin phép và ảnh minh chứng không hợp lệ của ${sName} (${studentId}) -> Chuyển thành Vắng không phép.`,
      });
      setDayDataState({ ...freshDay });
      showFeedback(`Đã xóa toàn bộ đơn và ảnh không hợp lệ của ${sName} (Chuyển sang Vắng không phép).`);
    }
  };

  // Decide proxy attendance submitted by monitor
  const handleDecideProxy = (studentId: string, decision: 'approve' | 'reject') => {
    if (!selectedLop || !selectedDate) return;
    const freshDay = getDayData(selectedLop, selectedDate);
    const rec = freshDay.records[studentId];
    if (!rec) return;

    if (decision === 'approve') {
      const currentCfg = getClassConfig(selectedLop);
      const checkinTimeKey = rec.checkinTime ? localTimeKey(new Date(rec.checkinTime)) : localTimeKey();
      const isLate = Boolean(currentCfg?.endTime && checkinTimeKey > currentCfg.endTime);
      
      rec.status = isLate ? 'late' : 'present';
      rec.checkinSource = 'monitor_proxy';
      rec.lastUpdatedByTeacherAt = Date.now();
      rec.lastUpdatedAction = isLate ? 'GVCN đã duyệt điểm danh hộ (Đi muộn)' : 'GVCN đã duyệt điểm danh hộ (Có mặt chính thức)';
      syncAppendClassLog(selectedLop, {
        actorRole: 'gvcn',
        actorName: `GVCN Lớp ${selectedLop}`,
        actorId: 'GVCN',
        actionTitle: `Duyệt điểm danh hộ: Có mặt chính thức (${rec.name})`,
        details: `Đã duyệt minh chứng ảnh điểm danh hộ cho ${rec.name} (${studentId}) -> Có mặt chính thức`,
      });
    } else {
      rec.status = 'absent';
      rec.lastUpdatedByTeacherAt = Date.now();
      rec.lastUpdatedAction = 'GVCN từ chối điểm danh hộ (Ảnh không hợp lệ -> Vắng không phép)';
      delete rec.checkinSource;
      delete rec.checkinTime;
      syncAppendClassLog(selectedLop, {
        actorRole: 'gvcn',
        actorName: `GVCN Lớp ${selectedLop}`,
        actorId: 'GVCN',
        actionTitle: `Từ chối điểm danh hộ: Vắng không phép (${rec.name})`,
        details: `Ảnh điểm danh hộ không hợp lệ cho ${rec.name} (${studentId}) -> Chuyển thành Vắng không phép`,
      });
    }

    setDayData(selectedLop, selectedDate, freshDay);
    syncSaveDayData(selectedLop, selectedDate, freshDay);
    setDayDataState({ ...freshDay });
    showFeedback(decision === 'approve' ? 'Đã duyệt điểm danh hộ: Tính là Có mặt chính thức!' : 'Đã từ chối điểm danh hộ: Chuyển sang Vắng không phép.');
  };

  // Decide excuse
  const handleDecideExcuse = (
    studentId: string,
    decision: 'excused_approved' | 'excused_rejected'
  ) => {
    if (!selectedLop || !selectedDate) return;

    // Check excuse deadline & BGH late window
    const currentCfg = getClassConfig(selectedLop);
    const excuseDeadline = currentCfg?.excuseDeadline || '17:00';
    const nowKey = localTimeKey();
    const todayKey = localDateKey();
    const maxDays = getMaxLateDays();
    const windowCheck = isDateWithinLateWindow(selectedDate, maxDays);

    const isToday = selectedDate === todayKey;
    const isFuture = selectedDate > todayKey;
    const isSameDayExcuseActive = isToday && nowKey <= excuseDeadline;
    const isLateExcuseActive = selectedDate < todayKey && windowCheck.isAllowed;
    const canProcessExcuse = isSameDayExcuseActive || isLateExcuseActive;

    if (!canProcessExcuse) {
      if (isFuture) {
        showFeedback('Không thể duyệt đơn phép cho ngày trong tương lai.', 'error');
        return;
      }
      if (isToday) {
        showFeedback(`Đã quá hạn chót duyệt đơn nghỉ (${excuseDeadline}) cho ngày hôm nay.`, 'error');
        return;
      }
      showFeedback(`Đã quá thời hạn ${maxDays} ngày cho phép nộp & duyệt phép trễ theo quy định của Ban Giám Hiệu.`, 'error');
      return;
    }

    const freshDay = getDayData(selectedLop, selectedDate);
    if (freshDay.records[studentId]) {
      freshDay.records[studentId].status = decision;
      freshDay.records[studentId].excuseDecidedAt = Date.now();
      freshDay.records[studentId].lastUpdatedByTeacherAt = Date.now();
      freshDay.records[studentId].isLateExcuse = isLateExcuseActive;
      freshDay.records[studentId].lastUpdatedAction = isLateExcuseActive
        ? (decision === 'excused_approved' ? `GV duyệt phép bổ sung trễ (${windowCheck.diffDays} ngày trước)` : `GV từ chối phép bổ sung trễ (${windowCheck.diffDays} ngày trước)`)
        : (decision === 'excused_approved' ? 'GV duyệt phép' : 'GV từ chối phép');
      setDayData(selectedLop, selectedDate, freshDay);
      syncSaveDayData(selectedLop, selectedDate, freshDay);
      setDayDataState({ ...freshDay });
      showFeedback(
        decision === 'excused_approved'
          ? (isLateExcuseActive ? `Đã duyệt đơn nghỉ phép bổ sung trễ (${windowCheck.diffDays} ngày trước).` : `Đã duyệt đơn nghỉ phép của học sinh.`)
          : `Đã từ chối đơn nghỉ phép.`
      );
    }
  };

  // File parsing for update roster
  const handleRosterFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRosterFileStatus('Đang đọc file...');
    try {
      const parsedText = await parseRosterFile(file);
      if (!parsedText) {
        setRosterFileStatus('Không đọc được dữ liệu học sinh nào từ file này.');
        return;
      }
      setRosterText((prev) =>
        prev.trim() ? `${prev.trim()}\n${parsedText}` : parsedText
      );
      const count = parsedText.split('\n').length;
      setRosterFileStatus(
        `Đã đọc ${count} học sinh từ file "${file.name}". Bấm "Lưu danh sách học sinh" để áp dụng.`
      );
    } catch (err: any) {
      setRosterFileStatus(`Lỗi khi đọc file: ${err?.message || err}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // File parsing for Create Class Modal
  const handleCreateFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCreateFileStatus('Đang đọc file...');
    try {
      const parsedText = await parseRosterFile(file);
      if (!parsedText) {
        setCreateFileStatus('Không đọc được dữ liệu học sinh nào từ file này.');
        return;
      }
      setCreateRosterText((prev) =>
        prev.trim() ? `${prev.trim()}\n${parsedText}` : parsedText
      );
      const count = parsedText.split('\n').length;
      setCreateFileStatus(`Đã đọc ${count} học sinh từ file "${file.name}".`);
    } catch (err: any) {
      setCreateFileStatus(`Lỗi khi đọc file: ${err?.message || err}`);
    } finally {
      if (createFileInputRef.current) createFileInputRef.current.value = '';
    }
  };

  // Save Roster for current class
  const handleSaveCurrentClassRoster = () => {
    if (!selectedLop) {
      showFeedback('Vui lòng chọn lớp học trước.', 'error');
      return;
    }

    const lines = rosterText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const parsedStudents: Student[] = lines
      .map((line) => {
        const parts = line.split(',');
        return {
          id: (parts[0] || '').trim(),
          name: (parts.slice(1).join(',') || '').trim(),
        };
      })
      .filter((s) => s.id);

    if (parsedStudents.length === 0) {
      showFeedback('Vui lòng nhập hoặc tải file danh sách học sinh.', 'error');
      return;
    }

    setRoster(selectedLop, parsedStudents);
    syncSaveRoster(selectedLop, parsedStudents);

    const resetHistory = window.confirm(
      `Bạn vừa nạp danh sách mới (${parsedStudents.length} học sinh) cho lớp ${selectedLop}.\n\n` +
      `Bạn có muốn XÓA SẠCH toàn bộ điểm danh, đơn xin nghỉ và ảnh minh chứng cũ trước đây của lớp này không?\n` +
      `- Bấm OK: Xóa sạch toàn bộ điểm danh & ảnh cũ (Bắt đầu mới 100%)\n` +
      `- Bấm Cancel: Giữ lại lịch sử điểm danh cũ`
    );

    if (resetHistory) {
      clearClassAttendanceData(selectedLop);
      syncClearClassAttendanceData(selectedLop);
    }

    syncAppendClassLog(selectedLop, {
      actorRole: 'gvcn',
      actorName: `GVCN Lớp ${selectedLop}`,
      actorId: 'GVCN',
      actionTitle: 'GVCN nạp / cập nhật danh sách học sinh',
      details: `Đã cập nhật danh sách gồm ${parsedStudents.length} học sinh cho lớp ${selectedLop}${resetHistory ? ' (Đã làm sạch lịch sử điểm danh cũ)' : ''}`,
    });
    setRosterState(parsedStudents);
    setRosterText('');
    setRosterFileStatus('');
    showFeedback(
      `Đã cập nhật ${parsedStudents.length} học sinh cho lớp ${selectedLop} thành công!${resetHistory ? ' (Đã xóa sạch ảnh & đơn cũ)' : ''}`
    );
  };

  // Add single student to current class roster
  const handleQuickAddSingleStudent = () => {
    if (!selectedLop) {
      showFeedback('Vui lòng chọn lớp học trước.', 'error');
      return;
    }
    const cleanId = newStudentId.trim();
    const cleanName = newStudentName.trim();
    if (!cleanId || !cleanName) {
      showFeedback('Vui lòng nhập đầy đủ Mã HS và Họ tên học sinh.', 'error');
      return;
    }

    if (roster.some((s) => s.id.toLowerCase() === cleanId.toLowerCase())) {
      showFeedback(`Mã học sinh "${cleanId}" đã tồn tại trong danh sách lớp!`, 'error');
      return;
    }

    const updatedRoster = [...roster, { id: cleanId, name: cleanName, isMonitor: false }];
    setRoster(selectedLop, updatedRoster);
    syncSaveRoster(selectedLop, updatedRoster);
    syncAppendClassLog(selectedLop, {
      actorRole: 'gvcn',
      actorName: `GVCN Lớp ${selectedLop}`,
      actorId: cleanId,
      actionTitle: 'GVCN bổ sung học sinh mới vào lớp',
      details: `Đã thêm học sinh ${cleanName} (Mã HS: ${cleanId}) vào danh sách lớp ${selectedLop}`,
    });
    setRosterState(updatedRoster);

    setNewStudentId('');
    setNewStudentName('');
    setShowAddSingleStudent(false);
    showFeedback(`Đã thêm học sinh ${cleanName} (${cleanId}) vào lớp ${selectedLop}!`);
  };

  // Delete student from current class roster
  const handleConfirmDeleteStudent = () => {
    if (!deletingStudent || !selectedLop) return;
    const sId = deletingStudent.id;
    const updatedRoster = roster.filter((s) => s.id !== sId);
    setRoster(selectedLop, updatedRoster);
    syncSaveRoster(selectedLop, updatedRoster);

    // Remove deleted student from day records
    const freshDay = getDayData(selectedLop, selectedDate);
    if (freshDay.records && freshDay.records[sId]) {
      delete freshDay.records[sId];
      setDayData(selectedLop, selectedDate, freshDay);
      syncSaveDayData(selectedLop, selectedDate, freshDay);
      setDayDataState({ ...freshDay });
    }

    syncAppendClassLog(selectedLop, {
      actorRole: 'gvcn',
      actorName: `GVCN Lớp ${selectedLop}`,
      actorId: sId,
      actionTitle: 'GVCN xóa học sinh khỏi danh sách lớp',
      details: `Đã xóa học sinh ${deletingStudent.name} (Mã HS: ${sId}) khỏi lớp ${selectedLop}`,
    });
    setRosterState(updatedRoster);
    showFeedback(`Đã xóa học sinh ${deletingStudent.name} (${sId}) khỏi danh sách lớp ${selectedLop}.`);
    setDeletingStudent(null);
  };

  // Clear all students and attendance history for current class
  const handleClearRosterAndData = async () => {
    if (!selectedLop) return;
    if (!window.confirm(`Bạn có chắc chắn muốn XÓA SẠCH toàn bộ danh sách học sinh và tất cả dữ liệu điểm danh, đơn xin phép của lớp "${selectedLop}"?`)) return;

    setRoster(selectedLop, []);
    await syncSaveRoster(selectedLop, []);
    clearClassAttendanceData(selectedLop);
    await syncClearClassAttendanceData(selectedLop);

    setRosterState([]);
    setDayDataState({ status: 'open', records: {} });
    setRosterText('');
    setRosterFileStatus('');
    showFeedback(`Đã xóa sạch toàn bộ danh sách học sinh và điểm danh của lớp ${selectedLop}!`);
  };

  // Save edited student info
  const handleSaveEditStudent = () => {
    if (!editingStudent || !selectedLop) return;
    const cleanId = editingStudent.id.trim();
    const cleanName = editingStudent.name.trim();

    if (!cleanId || !cleanName) {
      showFeedback('Mã số học sinh và họ tên không được để trống.', 'error');
      return;
    }

    if (
      cleanId.toLowerCase() !== editingStudent.originalId.toLowerCase() &&
      roster.some((s) => s.id.toLowerCase() === cleanId.toLowerCase())
    ) {
      showFeedback(`Mã học sinh "${cleanId}" bị trùng với học sinh khác trong lớp!`, 'error');
      return;
    }

    const updatedRoster = roster.map((s) =>
      s.id === editingStudent.originalId ? { ...s, id: cleanId, name: cleanName } : s
    );

    setRoster(selectedLop, updatedRoster);
    syncSaveRoster(selectedLop, updatedRoster);
    syncAppendClassLog(selectedLop, {
      actorRole: 'gvcn',
      actorName: `GVCN Lớp ${selectedLop}`,
      actorId: cleanId,
      actionTitle: 'GVCN chỉnh sửa thông tin học sinh',
      details: `Đã cập nhật học sinh mã ${editingStudent.originalId} thành ${cleanName} (Mã HS: ${cleanId})`,
    });
    setRosterState(updatedRoster);
    showFeedback(`Đã cập nhật thông tin học sinh thành công!`);
    setEditingStudent(null);
  };

  // Handle Create New Class
  const handleConfirmCreateClass = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateErrorMsg('');

    const cleanName = createClassName.trim();
    if (!cleanName) {
      setCreateErrorMsg('Vui lòng nhập tên lớp học (vd: 10A1, 11B2).');
      return;
    }

    const existingList = getLopList();
    if (
      existingList.map((l) => l.toLowerCase()).includes(cleanName.toLowerCase())
    ) {
      setCreateErrorMsg(
        `Lớp "${cleanName}" đã tồn tại. Nếu muốn tạo lại lớp này, bạn hãy xóa lớp cũ trước rồi tạo lại.`
      );
      return;
    }

    if (!createClassPin || createClassPin.length < 4) {
      setCreateErrorMsg('Mã PIN bảo mật của lớp phải có ít nhất 4 ký tự/số.');
      return;
    }

    if (createClassPin !== createConfirmPin) {
      setCreateErrorMsg('Xác nhận mã PIN không trùng khớp.');
      return;
    }

    // Parse students if provided
    let parsedStudents: Student[] = [];
    if (createRosterText.trim()) {
      const lines = createRosterText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      parsedStudents = lines
        .map((line) => {
          const parts = line.split(',');
          return {
            id: (parts[0] || '').trim(),
            name: (parts.slice(1).join(',') || '').trim(),
          };
        })
        .filter((s) => s.id);
    }

    // Save class roster and PIN
    setRoster(cleanName, parsedStudents);
    syncSaveRoster(cleanName, parsedStudents);
    setClassPin(cleanName, createClassPin);
    syncSaveClassPin(cleanName, createClassPin);
    syncAppendClassLog(cleanName, {
      actorRole: 'gvcn',
      actorName: `GVCN Lớp ${cleanName}`,
      actorId: 'GVCN',
      actionTitle: 'GVCN khởi tạo lớp học mới',
      details: `Đã tạo lớp ${cleanName} với ${parsedStudents.length} học sinh`,
    });

    // Switch exclusively to newly created class
    setSelectedLop(cleanName);
    if (onClassCreated) {
      onClassCreated(cleanName);
    }

    // Reset modal
    setShowCreateClassModal(false);
    setCreateClassName('');
    setCreateClassPin('');
    setCreateConfirmPin('');
    setCreateRosterText('');
    setCreateFileStatus('');
    setCreateErrorMsg('');

    showFeedback(
      `Đã tạo lớp ${cleanName} thành công! Bạn hiện đang quản lý độc quyền lớp ${cleanName}.`
    );
  };

  // Perform Class Deletion for current class
  const handleConfirmDeleteClass = () => {
    if (!selectedLop) return;
    const target = selectedLop;

    deleteLop(target);
    syncDeleteLop(target);
    setShowDeleteConfirm(false);
    setSelectedLop('');
    showFeedback(
      `Đã xóa vĩnh viễn lớp "${target}". Bạn có thể tạo lại lớp này bất cứ lúc nào.`
    );
  };

  // Status banner logic
  const nowKey = localTimeKey();
  const todayKey = localDateKey();
  const currentCfg = getClassConfig(selectedLop);
  const maxLateDays = getMaxLateDays();
  const windowCheck = isDateWithinLateWindow(selectedDate, maxLateDays);

  const lateEndTime = addMinutesToTime(currentCfg?.endTime || '07:15', 10);
  const isAutoLocked =
    selectedDate !== todayKey ||
    (selectedDate === todayKey && currentCfg && nowKey > lateEndTime);

  const isEffectivelyClosed = dayData.status === 'closed' || isAutoLocked;

  // Computed unexcused absents after time window closes
  const unexcusedAbsents = roster.filter((s) => {
    const rec = dayData.records[s.id];
    const st = rec?.status || 'none';
    const hasExcuse = ['excused_pending', 'excused_approved'].includes(st);
    const isAbsentStatus = st === 'absent' || (st === 'none' && isEffectivelyClosed);
    return isAbsentStatus && !hasExcuse;
  });

  const isBeforeStartTime =
    selectedDate === todayKey &&
    currentCfg &&
    Boolean(currentCfg.startTime) &&
    nowKey < currentCfg.startTime;

  const isFutureDate = selectedDate > todayKey;

  const isAttendanceActive =
    selectedDate === todayKey &&
    !isEffectivelyClosed &&
    !isBeforeStartTime &&
    !isFutureDate;

  const excuseDeadline = currentCfg?.excuseDeadline || '17:00';
  const isSameDayExcuseActive =
    selectedDate === todayKey &&
    nowKey <= excuseDeadline;

  const isLateExcuseActive =
    selectedDate < todayKey &&
    windowCheck.isAllowed; // within N days allowed by BGH

  const canProcessExcuse = isSameDayExcuseActive || isLateExcuseActive;
  const isExcusePastDeadline = !canProcessExcuse;

  let bannerClass = 'bg-[#EAE7DD] text-[#5B6A61]';
  let bannerText = 'Đã khóa sổ điểm danh cho ngày này.';

  if (!isEffectivelyClosed) {
    if (!currentCfg || currentCfg.lat === 0) {
      bannerClass = 'bg-[#F5E6D0] text-[#7A521E]';
      bannerText = 'Lớp chưa được cấu hình vị trí & khung giờ.';
    } else if (nowKey < currentCfg.startTime) {
      bannerClass = 'bg-[#F5E6D0] text-[#7A521E]';
      bannerText = `Chưa đến giờ — điểm danh tự động mở lúc ${currentCfg.startTime}.`;
    } else if (nowKey <= currentCfg.endTime) {
      bannerClass = 'bg-[#E1EEE8] text-[#245346] border border-[#3E7C6B]/20';
      bannerText = `Đang mở điểm danh ĐÚNG GIỜ (${currentCfg.startTime} - ${currentCfg.endTime}). Điểm danh sau ${currentCfg.endTime} đến ${lateEndTime} sẽ tính ĐI MUỘN (+10 phút).`;
    } else {
      bannerClass = 'bg-[#FEF7EC] text-[#8C5E14] border border-[#C98A3B]/30';
      bannerText = `Đã hết giờ điểm danh đúng giờ (${currentCfg.endTime}). Đang trong khung giờ ĐI MUỘN (+10 phút đến ${lateEndTime}). Quá ${lateEndTime} tự động chốt Vắng không phép.`;
    }
  } else {
    if (isLateExcuseActive) {
      bannerClass = 'bg-[#FEF7EC] text-[#8C5E14] border border-[#C98A3B]/30';
      bannerText = `Sổ điểm danh trực tiếp đã khóa (đã quá ${lateEndTime}). Cho phép tiếp nhận & duyệt đơn xin phép bổ sung trễ (${windowCheck.diffDays}/${maxLateDays} ngày) theo quy định Ban Giám Hiệu.`;
    } else if (selectedDate < todayKey) {
      if (windowCheck.isExpired) {
        bannerClass = 'bg-[#EAE7DD] text-[#5B6A61] border border-[#D7DCCB]';
        bannerText = `Đã khóa sổ hoàn toàn (Đã quá thời hạn ${maxLateDays} ngày cho phép nộp & duyệt phép trễ theo quy định của Ban Giám Hiệu).`;
      } else {
        bannerText = 'Đã khóa sổ điểm danh (Ngày cũ).';
      }
    } else if (dayData.status === 'closed') {
      bannerText = 'Đã khóa sổ điểm danh (Đóng thủ công).';
    } else {
      bannerText = `Đã hết giờ điểm danh tự động (kết thúc lúc ${lateEndTime}). Tự động chốt Vắng không phép cho các HS chưa điểm danh.` + (isSameDayExcuseActive ? ` GVCN vẫn có toàn quyền duyệt chuyển sang Vắng có phép/Nợ đơn trước ${excuseDeadline}.` : '');
    }
  }

  // Count present & late
  const presentCount = roster.filter(
    (s) => {
      const st = dayData.records[s.id]?.status;
      return st === 'present' || st === 'late';
    }
  ).length;
  const lateCount = roster.filter(
    (s) => dayData.records[s.id]?.status === 'late'
  ).length;

  return (
    <div className="space-y-5">
      {/* Teacher Session Top Bar - STRICT CLASS ISOLATION */}
      <div className="flex justify-between items-center bg-[#1F3B32] text-[#F4F0E4] p-3.5 sm:p-4 rounded-2xl shadow-xs flex-wrap gap-2.5">
        <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>
            {selectedLop ? (
              <>
                Giáo viên phụ trách: <b className="text-emerald-300 text-sm sm:text-base ml-1">Lớp {selectedLop}</b>
              </>
            ) : (
              <>Chưa có lớp nào được chọn</>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {selectedLop && (
            <button
              type="button"
              onClick={() => setShowClassActivityModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs border border-emerald-400/40"
              title="Xem toàn bộ nhật ký hoạt động & thao tác của GVCN và Học sinh lớp mình theo thời gian thực"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
              <span>Nhật ký hoạt động Lớp {selectedLop}</span>
            </button>
          )}

          <button
            id="btnTopCreateClass"
            type="button"
            onClick={() => {
              setShowCreateClassModal(true);
              setCreateErrorMsg('');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3E7C6B] hover:bg-[#346a5b] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
            title="Tạo lớp học mới"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tạo lớp mới</span>
          </button>

          {selectedLop && (
            <button
              id="btnTopDeleteCurrentClass"
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#8C341F] hover:bg-[#722917] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              title={`Xóa lớp ${selectedLop} để tạo lại`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa lớp {selectedLop}</span>
            </button>
          )}

          <button
            id="btnLockTeacherSession"
            type="button"
            onClick={onLockTeacher}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2A4D42] hover:bg-[#1E3B32] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer border border-emerald-600/30"
            title="Đăng xuất hoặc đổi lớp phụ trách"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Đổi lớp / Đăng xuất</span>
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-sm font-medium flex items-center gap-2.5 shadow-sm transition-all ${
            feedback.type === 'success'
              ? 'bg-[#E1EEE8] text-[#245346] border border-[#3E7C6B]/30'
              : feedback.type === 'error'
              ? 'bg-[#F5DED5] text-[#7A3115] border border-[#B3492F]/30'
              : 'bg-[#F5E6D0] text-[#7A521E]'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : feedback.type === 'error' ? (
            <XCircle className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Modal: Create New Class */}
      {showCreateClassModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#FBFAF5] border-[1.5px] border-[#1F3B32] rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-[#3E7C6B]" />
                <h3 className="text-base font-bold text-[#1B241F]">
                  Tạo Lớp Học Mới
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateClassModal(false)}
                className="text-[#5B6A61] hover:text-[#1B241F] p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#5B6A61] mb-4">
              Đặt tên lớp và mã PIN bảo mật riêng cho lớp này. Mỗi giáo viên chỉ có quyền xem và quản lý lớp do mình phụ trách.
            </p>

            {createErrorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-[#F5DED5] text-[#7A3115] text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleConfirmCreateClass} className="space-y-4">
              <div>
                <label
                  htmlFor="modalCreateClassName"
                  className="block text-xs font-bold text-[#1B241F] uppercase tracking-wider mb-1"
                >
                  Tên lớp học *
                </label>
                <input
                  id="modalCreateClassName"
                  type="text"
                  placeholder="Vd: 10A1, 10A2, 11B1..."
                  value={createClassName}
                  onChange={(e) => setCreateClassName(e.target.value)}
                  className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-xl px-3.5 py-2.5 text-sm text-[#1B241F] font-semibold focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                  autoFocus
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="modalCreateClassPin"
                    className="block text-xs font-bold text-[#1B241F] uppercase tracking-wider mb-1"
                  >
                    Mã PIN bảo mật riêng *
                  </label>
                  <div className="relative">
                    <input
                      id="modalCreateClassPin"
                      type={showCreatePin ? 'text' : 'password'}
                      placeholder="Tối thiểu 4 ký tự/số"
                      value={createClassPin}
                      onChange={(e) => setCreateClassPin(e.target.value)}
                      className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-xl pl-3.5 pr-9 py-2 text-sm text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreatePin(!showCreatePin)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5B6A61] p-1 cursor-pointer"
                    >
                      {showCreatePin ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="modalCreateConfirmPin"
                    className="block text-xs font-bold text-[#1B241F] uppercase tracking-wider mb-1"
                  >
                    Xác nhận mã PIN *
                  </label>
                  <input
                    id="modalCreateConfirmPin"
                    type={showCreatePin ? 'text' : 'password'}
                    placeholder="Nhập lại mã PIN"
                    value={createConfirmPin}
                    onChange={(e) => setCreateConfirmPin(e.target.value)}
                    className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-xl px-3.5 py-2 text-sm text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                    required
                  />
                </div>
              </div>

              {/* Roster option */}
              <div className="pt-2 border-t border-[#D7DCCB] space-y-2">
                <label className="block text-xs font-bold text-[#1B241F] uppercase tracking-wider">
                  Danh sách học sinh (Tùy chọn - có thể thêm sau)
                </label>

                <div className="p-3 bg-white border border-dashed border-[#1F3B32]/30 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      ref={createFileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleCreateFileUpload}
                      className="text-xs text-[#5B6A61] file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#1F3B32] file:text-[#F4F0E4] hover:file:bg-[#274A3E] cursor-pointer"
                    />
                  </div>
                  {createFileStatus && (
                    <div className="text-xs font-medium text-[#3E7C6B] bg-[#E1EEE8] p-1.5 rounded-lg">
                      {createFileStatus}
                    </div>
                  )}
                </div>

                <textarea
                  rows={3}
                  placeholder="Hoặc dán: 1001, Nguyễn Văn A&#10;1002, Trần Thị B"
                  value={createRosterText}
                  onChange={(e) => setCreateRosterText(e.target.value)}
                  className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-xl p-2.5 text-xs font-mono text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateClassModal(false)}
                  className="flex-1 py-2.5 border border-[#D7DCCB] text-[#5B6A61] hover:bg-[#EEF1E7] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  id="btnSubmitCreateClassModal"
                  type="submit"
                  className="flex-1 py-2.5 bg-[#1F3B32] text-[#F4F0E4] hover:bg-[#274A3E] rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  Tạo lớp &amp; Bắt đầu quản lý
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Class */}
      {showDeleteConfirm && selectedLop && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#FBFAF5] border-[1.5px] border-[#B3492F] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-3 text-[#B3492F]">
              <div className="w-10 h-10 rounded-xl bg-[#F5DED5] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#1B241F]">
                Xác nhận xóa lớp "{selectedLop}"
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-[#5B6A61] mb-4 leading-relaxed">
              Bạn có chắc chắn muốn xóa lớp <b>{selectedLop}</b>? Thao tác này sẽ xóa sạch:
              <br />• Danh sách học sinh của lớp
              <br />• Toàn bộ lịch sử điểm danh và đơn xin nghỉ
              <br />• Cấu hình GPS, khung giờ và mã PIN của lớp
              <br />
              <span className="text-[#B3492F] font-semibold mt-1 block">
                Sau khi xóa, bạn có thể tạo lại lớp này bất cứ lúc nào với danh sách học sinh mới.
              </span>
            </p>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 border border-[#D7DCCB] text-[#5B6A61] hover:bg-[#EEF1E7] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                id="btnConfirmDeleteClassAction"
                type="button"
                onClick={handleConfirmDeleteClass}
                className="flex-1 py-2.5 bg-[#B3492F] hover:bg-[#963720] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Xác nhận xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State when no class is selected */}
      {!selectedLop ? (
        <div className="bg-[#FBFAF5] border-[1.5px] border-[#1F3B32] rounded-2xl p-6 sm:p-8 shadow-xs text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#E1EEE8] text-[#1F3B32] flex items-center justify-center mb-3">
            <Users className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-[#1B241F] mb-1">
            Chưa có lớp học nào đang được quản lý
          </h2>
          <p className="text-xs sm:text-sm text-[#5B6A61] max-w-md mx-auto mb-5 leading-relaxed">
            Bạn có thể tạo lớp học mới ngay bây giờ, hoặc đăng xuất để chọn mở khóa một lớp khác nếu đã được cấp mã PIN.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setShowCreateClassModal(true)}
              className="inline-flex items-center gap-2 bg-[#1F3B32] text-[#F4F0E4] hover:bg-[#274A3E] px-5 py-2.5 rounded-xl font-bold text-sm shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo Lớp Học Mới Ngay</span>
            </button>
            <button
              type="button"
              onClick={onLockTeacher}
              className="inline-flex items-center gap-2 border border-[#D7DCCB] text-[#1B241F] hover:bg-[#EEF1E7] px-5 py-2.5 rounded-xl font-bold text-sm transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng nhập lớp khác</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Card 1: Thông tin Lớp & Ngày xem */}
          <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-5 sm:p-6 shadow-xs">
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#E1EEE8] text-[#1F3B32] flex items-center justify-center font-bold text-sm">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-[#1B241F]">
                    Lớp phụ trách: <span className="text-[#3E7C6B]">{selectedLop}</span>
                  </h2>
                  <p className="text-[11px] text-[#5B6A61]">
                    Chế độ riêng tư: Bạn chỉ xem và quản lý dữ liệu của lớp {selectedLop}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="btnCreateNewClassInline"
                  type="button"
                  onClick={() => setShowCreateClassModal(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-[#3E7C6B] hover:bg-[#E1EEE8] border border-[#3E7C6B]/40 rounded-lg transition-colors cursor-pointer"
                  title="Tạo lớp mới"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tạo lớp mới</span>
                </button>

                <button
                  id="btnDeleteCurrentClass"
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-[#B3492F] hover:bg-[#F5DED5] border border-[#B3492F]/40 rounded-lg transition-colors cursor-pointer"
                  title={`Xóa lớp ${selectedLop} để tạo lại`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa lớp này</span>
                </button>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#D7DCCB] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#5B6A61]" />
                <label
                  htmlFor="teacherDateInput"
                  className="text-xs font-bold text-[#1B241F] uppercase tracking-wider"
                >
                  Ngày xem điểm danh:
                </label>
              </div>
              <input
                id="teacherDateInput"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-white border-[1.5px] border-[#D7DCCB] rounded-lg px-3.5 py-1.5 text-sm text-[#1B241F] font-semibold focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
              />
            </div>
          </div>

          {/* Card 2: Cấu hình lớp */}
          <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-5 sm:p-6 shadow-xs">
            <h2 className="text-base font-bold text-[#1B241F] mb-1 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#3E7C6B]" />
              Cấu hình vị trí &amp; Khung giờ điểm danh của lớp {selectedLop}
            </h2>
            <p className="text-xs sm:text-sm text-[#5B6A61] mb-4">
              Thiết lập một lần — Bán kính GPS này chỉ áp dụng cho <span className="font-bold text-[#1B241F]">Học sinh tự điểm danh</span>. Giáo viên (GVCN), Đoàn trường và Quản trị viên có thể thao tác quản lý, điểm danh và duyệt đơn ở <span className="font-bold text-[#3E7C6B]">bất kỳ đâu</span> không bị giới hạn vị trí hay bán kính.
            </p>

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-white border border-[#D7DCCB] rounded-xl">
                <div>
                  <span className="block text-xs font-bold text-[#5B6A61] uppercase tracking-wider">
                    Vị trí trung tâm lớp học (GPS)
                  </span>
                  <div
                    id="teacherLocStatus"
                    className="text-sm font-medium text-[#1B241F] mt-0.5"
                  >
                    {locStatusMsg}
                  </div>
                </div>
                <button
                  id="btnTeacherGetLoc"
                  type="button"
                  onClick={handleGetCurrentLocation}
                  disabled={isGettingLoc}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 border-[1.5px] border-[#1F3B32] text-[#1F3B32] hover:bg-[#1F3B32]/10 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isGettingLoc ? 'animate-spin' : ''}`}
                  />
                  {isGettingLoc ? 'Đang lấy...' : 'Lấy vị trí hiện tại'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label
                    htmlFor="radiusInput"
                    className="block text-xs font-semibold text-[#1B241F] mb-1"
                  >
                    Bán kính cho phép (mét)
                  </label>
                  <input
                    id="radiusInput"
                    type="number"
                    min="10"
                    max="1000"
                    value={config.radius}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        radius: parseInt(e.target.value, 10) || 80,
                      })
                    }
                    className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-lg px-3 py-2 text-sm text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="startTimeInput"
                    className="block text-xs font-semibold text-[#1B241F] mb-1"
                  >
                    Bắt đầu điểm danh
                  </label>
                  <input
                    id="startTimeInput"
                    type="time"
                    value={config.startTime}
                    onChange={(e) =>
                      setConfig({ ...config, startTime: e.target.value })
                    }
                    className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-lg px-3 py-2 text-sm text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="endTimeInput"
                    className="block text-xs font-semibold text-[#1B241F] mb-1"
                  >
                    Khóa sổ điểm danh
                  </label>
                  <input
                    id="endTimeInput"
                    type="time"
                    value={config.endTime}
                    onChange={(e) =>
                      setConfig({ ...config, endTime: e.target.value })
                    }
                    className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-lg px-3 py-2 text-sm text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="excuseDeadlineInput"
                    className="block text-xs font-semibold text-[#1B241F] mb-1"
                    title="Hạn chót giáo viên được duyệt đơn nghỉ hoặc thêm phép cho học sinh trong ngày"
                  >
                    Hạn chót duyệt phép
                  </label>
                  <input
                    id="excuseDeadlineInput"
                    type="time"
                    value={config.excuseDeadline || '17:00'}
                    onChange={(e) =>
                      setConfig({ ...config, excuseDeadline: e.target.value })
                    }
                    className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-lg px-3 py-2 text-sm text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                  />
                </div>
              </div>
              <p className="text-[11px] text-[#5B6A61] mt-1">
                💡 <span className="font-semibold">Hạn chót duyệt phép:</span> Sau giờ này, giáo viên không thể bấm duyệt đơn hay sửa phép cho ngày đó nữa (nhằm đảm bảo tính minh bạch và tránh chạy điểm chuyên cần).
              </p>

              <div className="flex items-center gap-3 pt-1">
                <button
                  id="btnSaveClassConfig"
                  type="button"
                  onClick={handleSaveConfig}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#1F3B32] text-[#F4F0E4] hover:bg-[#274A3E] px-5 py-2.5 rounded-lg text-sm font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Lưu cấu hình lớp
                </button>
              </div>

              {/* Sub-section: Change Class PIN */}
              <div className="pt-4 border-t border-[#D7DCCB]">
                <form
                  onSubmit={handleUpdateCurrentClassPin}
                  className="bg-[#F7F6F0] p-3.5 rounded-xl border border-[#D7DCCB] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5">
                    <KeyRound className="w-4 h-4 text-[#3E7C6B] shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-[#1B241F]">
                        Đổi mã PIN bảo mật của lớp {selectedLop}
                      </div>
                      <div className="text-[11px] text-[#5B6A61]">
                        Mã PIN này chỉ mở khóa lớp {selectedLop}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <input
                        type={showCurrentClassPin ? 'text' : 'password'}
                        placeholder="Mã PIN mới (≥4 ký tự)"
                        value={newPinForCurrentClass}
                        onChange={(e) => setNewPinForCurrentClass(e.target.value)}
                        className="bg-white border-[1.5px] border-[#D7DCCB] rounded-lg pl-2.5 pr-8 py-1.5 text-xs text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentClassPin(!showCurrentClassPin)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#5B6A61] p-0.5 cursor-pointer"
                      >
                        {showCurrentClassPin ? (
                          <EyeOff className="w-3 h-3" />
                        ) : (
                          <Eye className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <button
                      id="btnUpdateClassPin"
                      type="submit"
                      className="px-3 py-1.5 bg-[#1F3B32] hover:bg-[#274A3E] text-[#F4F0E4] rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      Đổi PIN
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          {/* Card 3: Danh sách Học sinh */}
          <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-5 sm:p-6 shadow-xs">
            <h2 className="text-base font-bold text-[#1B241F] mb-1 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#3E7C6B]" />
              Danh sách học sinh lớp {selectedLop} ({roster.length} học sinh)
            </h2>
            <p className="text-xs sm:text-sm text-[#5B6A61] mb-4">
              Bạn có thể tải file Excel/CSV hoặc dán danh sách theo cú pháp: <code className="bg-[#EEF1E7] px-1 py-0.5 rounded text-[#1B241F] font-mono text-xs">MãHS, Họ và tên</code>
            </p>

            <div className="space-y-4">
              {/* File upload box */}
              <div className="p-4 bg-white border-2 border-dashed border-[#1F3B32]/30 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-[#1F3B32] font-semibold text-xs sm:text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-[#3E7C6B]" />
                  <span>Tải lên file danh sách học sinh (.xlsx, .xls, .csv)</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleRosterFileUpload}
                    className="text-xs text-[#5B6A61] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#1F3B32] file:text-[#F4F0E4] hover:file:bg-[#274A3E] cursor-pointer"
                  />
                </div>
                {rosterFileStatus && (
                  <div className="text-xs font-medium text-[#3E7C6B] bg-[#E1EEE8] p-2 rounded-lg">
                    {rosterFileStatus}
                  </div>
                )}
              </div>

              {/* Textarea */}
              <div>
                <textarea
                  rows={4}
                  placeholder="Hoặc dán trực tiếp:&#10;1001, Nguyễn Văn A&#10;1002, Trần Thị B&#10;1003, Lê Hoàng C"
                  value={rosterText}
                  onChange={(e) => setRosterText(e.target.value)}
                  className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-xl p-3 text-xs sm:text-sm font-mono text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                />
              </div>

              {/* Quick Add 1 Student Box */}
              <div className="p-3.5 bg-white border border-[#3E7C6B]/40 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1B241F] flex items-center gap-1.5">
                    <PlusCircle className="w-4 h-4 text-[#3E7C6B]" />
                    Thêm Nhanh 1 Học Sinh Mới Vào Lớp {selectedLop}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddSingleStudent(!showAddSingleStudent)}
                    className="text-xs font-bold text-[#3E7C6B] hover:underline cursor-pointer"
                  >
                    {showAddSingleStudent ? 'Thu gọn' : '+ Thêm 1 học sinh'}
                  </button>
                </div>

                {showAddSingleStudent && (
                  <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      placeholder="Mã số HS (vd: 10A101)"
                      value={newStudentId}
                      onChange={(e) => setNewStudentId(e.target.value)}
                      className="flex-1 bg-[#F7F6F0] border border-[#D7DCCB] rounded-lg px-3 py-2 text-xs font-mono font-bold text-[#1B241F] focus:outline-none focus:border-[#3E7C6B]"
                    />
                    <input
                      type="text"
                      placeholder="Họ và tên học sinh (vd: Nguyễn Văn A)"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      className="flex-2 bg-[#F7F6F0] border border-[#D7DCCB] rounded-lg px-3 py-2 text-xs font-semibold text-[#1B241F] focus:outline-none focus:border-[#3E7C6B]"
                    />
                    <button
                      type="button"
                      onClick={handleQuickAddSingleStudent}
                      className="px-4 py-2 bg-[#3E7C6B] hover:bg-[#346a5b] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 inline-flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm vào lớp</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  id="btnSaveRoster"
                  type="button"
                  onClick={handleSaveCurrentClassRoster}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-[#1F3B32] text-[#F4F0E4] hover:bg-[#274A3E] px-5 py-2.5 rounded-lg text-sm font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Lưu danh sách học sinh hàng loạt
                </button>
                {roster.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearRosterAndData}
                    className="inline-flex items-center justify-center gap-2 bg-[#B3492F] hover:bg-[#963720] text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-xs transition-colors cursor-pointer shrink-0"
                    title="Xóa toàn bộ danh sách học sinh và lịch sử điểm danh của lớp này"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Xóa toàn bộ danh sách ({roster.length})</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Card 4: Bảng Điểm Danh Hôm Nay */}
          <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-5 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-[#1B241F] flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#3E7C6B]" />
                  Điểm danh lớp {selectedLop} ngày {fmtDateVN(selectedDate)}
                </h2>
                <div className="text-xs text-[#5B6A61] mt-0.5">
                  Đã có mặt:{' '}
                  <span className="font-bold text-[#245346]">
                    {presentCount}/{roster.length}
                  </span>{' '}
                  học sinh
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  id="btnExportCSV"
                  type="button"
                  onClick={handleExportCSV}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#3E7C6B] hover:bg-[#346a5b] text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                  title="Xuất danh sách điểm danh dạng CSV/Excel"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Xuất CSV</span>
                </button>
                <button
                  id="btnExportPDF"
                  type="button"
                  onClick={handleExportPDF}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#1F3B32] hover:bg-[#274A3E] text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                  title="In báo cáo hoặc lưu dạng PDF"
                >
                  <Printer className="w-4 h-4" />
                  <span>In / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReportModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#7A521E] hover:bg-[#634217] text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                  title="Tổng hợp báo cáo chuyên cần theo Ngày / Tuần / Tháng / Học kỳ"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Báo cáo</span>
                </button>
                {!isAutoLocked && (
                  dayData.status === 'open' ? (
                    <button
                      id="btnCloseDay"
                      type="button"
                      onClick={handleCloseDay}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#B3492F] text-white hover:bg-[#963720] rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Đóng điểm danh
                    </button>
                  ) : (
                    <button
                      id="btnReopenDay"
                      type="button"
                      onClick={handleReopenDay}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3E7C6B] text-white hover:bg-[#346a5b] rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Mở lại điểm danh
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Status Banner */}
            <div
              className={`p-3 rounded-xl text-xs sm:text-sm font-semibold mb-4 flex items-center gap-2.5 ${bannerClass}`}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{bannerText}</span>
            </div>

            {/* Auto Notification Alert Banner for Unexcused Absents after time window */}
            {isEffectivelyClosed && unexcusedAbsents.length > 0 && (
              <div className="mb-4 p-4 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500 text-white rounded-xl shrink-0">
                    <Bell className="w-5 h-5 animate-bounce" />
                  </div>
                  <div>
                    <div className="text-sm font-bold flex items-center gap-2">
                      <span>Cảnh báo tự động: Có {unexcusedAbsents.length} học sinh vắng không có lý do!</span>
                      {notificationSent && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                          ✓ Đã gửi thông báo
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-amber-800 mt-0.5">
                      Đã kết thúc khung giờ điểm danh ngày {fmtDateVN(selectedDate)}. Hệ thống đã tự động tổng hợp danh sách gửi thông báo cho GVCN & Phụ huynh.
                    </div>
                  </div>
                </div>
                <button
                  id="btnOpenAutoNotification"
                  type="button"
                  onClick={() => setShowAutoNotificationModal(true)}
                  className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" />
                  <span>Xem & Gửi thông báo tự động</span>
                </button>
              </div>
            )}

            {/* Thống kê chuyên cần trực quan (Giống Quản trị) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-white border-[1.5px] border-[#D7DCCB] rounded-xl p-3.5 shadow-2xs">
                <div className="text-[11px] font-bold text-[#5B6A61] uppercase tracking-wider">
                  Tổng học sinh
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-[#1B241F] mt-0.5">
                  {roster.length} <span className="text-xs font-normal text-[#5B6A61]">em</span>
                </div>
              </div>

              <div className="bg-white border-[1.5px] border-[#D7DCCB] rounded-xl p-3.5 shadow-2xs">
                <div className="text-[11px] font-bold text-[#245346] uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#3E7C6B]" />
                  Có mặt
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-[#245346] mt-0.5">
                  {presentCount} <span className="text-xs font-bold text-[#3E7C6B]">({roster.length > 0 ? Math.round((presentCount / roster.length) * 100) : 0}%)</span>
                </div>
              </div>

              <div className="bg-white border-[1.5px] border-[#D7DCCB] rounded-xl p-3.5 shadow-2xs">
                <div className="text-[11px] font-bold text-[#7A521E] uppercase tracking-wider flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-[#C98A3B]" />
                  Xin nghỉ phép
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-[#7A521E] mt-0.5">
                  {roster.filter((s) => ['excused_pending', 'excused_approved', 'excused_rejected'].includes(dayData.records[s.id]?.status || '')).length}{' '}
                  <span className="text-xs font-normal text-[#5B6A61]">đơn</span>
                </div>
              </div>

              <div className="bg-white border-[1.5px] border-[#D7DCCB] rounded-xl p-3.5 shadow-2xs">
                <div className="text-[11px] font-bold text-[#7A3115] uppercase tracking-wider flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5 text-[#B3492F]" />
                  Vắng mặt
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-[#7A3115] mt-0.5">
                  {roster.filter((s) => {
                    const rec = dayData.records[s.id];
                    if (!rec || rec.status === 'none') return isEffectivelyClosed;
                    return rec.status === 'absent';
                  }).length}{' '}
                  <span className="text-xs font-normal text-[#5B6A61]">em</span>
                </div>
              </div>
            </div>

            {/* Attendance Filter Tabs */}
            <div className="flex items-center gap-1.5 mb-3 flex-wrap bg-[#EEF1E7] p-1.5 rounded-xl border border-[#D7DCCB]">
              <span className="text-xs font-bold text-[#1B241F] px-2">Lọc hiển thị:</span>
              <button
                type="button"
                onClick={() => setAttendanceFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  attendanceFilter === 'all'
                    ? 'bg-[#1F3B32] text-[#F4F0E4]'
                    : 'text-[#5B6A61] hover:bg-white/60'
                }`}
              >
                Tất cả ({roster.length})
              </button>
              <button
                type="button"
                onClick={() => setAttendanceFilter('present')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  attendanceFilter === 'present'
                    ? 'bg-[#245346] text-white'
                    : 'text-[#245346] hover:bg-white/60'
                }`}
              >
                Có mặt ({presentCount})
              </button>
              <button
                type="button"
                onClick={() => setAttendanceFilter('late')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  attendanceFilter === 'late'
                    ? 'bg-amber-700 text-white'
                    : 'text-amber-800 hover:bg-white/60'
                }`}
              >
                Đi muộn ({roster.filter((s) => dayData.records[s.id]?.status === 'late').length})
              </button>
              <button
                type="button"
                onClick={() => setAttendanceFilter('proxy_pending')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  attendanceFilter === 'proxy_pending'
                    ? 'bg-indigo-700 text-white'
                    : 'text-indigo-800 hover:bg-white/60'
                }`}
              >
                Chờ duyệt điểm danh hộ ({roster.filter((s) => dayData.records[s.id]?.status === 'proxy_pending').length})
              </button>
              <button
                type="button"
                onClick={() => setAttendanceFilter('excused')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  attendanceFilter === 'excused'
                    ? 'bg-[#7A521E] text-white'
                    : 'text-[#7A521E] hover:bg-white/60'
                }`}
              >
                Có đơn phép ({roster.filter((s) => ['excused_pending', 'excused_approved', 'excused_rejected'].includes(dayData.records[s.id]?.status || '')).length})
              </button>
              <button
                type="button"
                onClick={() => setAttendanceFilter('absent')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  attendanceFilter === 'absent'
                    ? 'bg-[#7A3115] text-white'
                    : 'text-[#7A3115] hover:bg-white/60'
                }`}
              >
                Vắng ({roster.filter((s) => {
                  const rec = dayData.records[s.id];
                  if (!rec || rec.status === 'none') return isEffectivelyClosed;
                  return rec.status === 'absent';
                }).length})
              </button>

              <button
                id="btnOpenAllPhotosModal"
                type="button"
                onClick={() => setShowAllPhotosModal(true)}
                className="ml-auto px-3.5 py-1.5 bg-[#1F3B32] hover:bg-[#152a23] text-[#F4F0E4] rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 shrink-0"
                title="Xem tất cả ảnh điểm danh hộ và đơn xin phép đã gửi hôm nay"
              >
                <Camera className="w-3.5 h-3.5 text-emerald-400" />
                <span>📷 Xem tất cả ảnh đã gửi ({submittedPhotos.length})</span>
              </button>
            </div>

            {/* Attendance Table */}
            <div className="border border-[#D7DCCB] rounded-xl overflow-hidden bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-[#EEF1E7] text-[#1B241F] font-bold border-b border-[#D7DCCB]">
                    <tr className="divide-x divide-[#D7DCCB]/60">
                      <th className="py-3 px-2 w-10 text-center uppercase tracking-wider text-[11px]">STT</th>
                      <th className="py-3 px-3 min-w-[150px] uppercase tracking-wider text-[11px]">Học sinh</th>
                      <th className="py-3 px-3 min-w-[160px] uppercase tracking-wider text-[11px]">Trạng thái &amp; Nguồn</th>
                      <th className="py-3 px-3 min-w-[110px] uppercase tracking-wider text-[11px]">Giờ &amp; GPS</th>
                      <th className="py-3 px-3 min-w-[200px] uppercase tracking-wider text-[11px]">Đơn &amp; Minh chứng</th>
                      <th className="py-3 px-3 min-w-[240px] text-right uppercase tracking-wider text-[11px]">Thao tác (GVCN)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D7DCCB]/60 font-medium">
                    {roster.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-10 text-center text-xs text-[#5B6A61] italic"
                        >
                          Lớp chưa có danh sách học sinh. Vui lòng nhập hoặc tải file danh sách ở trên.
                        </td>
                      </tr>
                    ) : roster.filter((s) => {
                        const rec = dayData.records[s.id];
                        const st = rec?.status || 'none';
                        if (attendanceFilter === 'present') return st === 'present';
                        if (attendanceFilter === 'late') return st === 'late';
                        if (attendanceFilter === 'proxy_pending') return st === 'proxy_pending';
                        if (attendanceFilter === 'excused') return ['excused_pending', 'excused_approved', 'excused_rejected'].includes(st);
                        if (attendanceFilter === 'absent') return st === 'absent' || (!rec || st === 'none');
                        return true;
                      }).length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-10 text-center text-xs text-[#5B6A61] italic"
                        >
                          Không có học sinh nào phù hợp với bộ lọc này.
                        </td>
                      </tr>
                    ) : (
                      roster
                        .filter((s) => {
                          const rec = dayData.records[s.id];
                          const st = rec?.status || 'none';
                          if (attendanceFilter === 'present') return st === 'present';
                          if (attendanceFilter === 'late') return st === 'late';
                          if (attendanceFilter === 'proxy_pending') return st === 'proxy_pending';
                          if (attendanceFilter === 'excused') return ['excused_pending', 'excused_approved', 'excused_rejected'].includes(st);
                          if (attendanceFilter === 'absent') return st === 'absent' || (!rec || st === 'none');
                          return true;
                        })
                        .map((student, idx) => {
                        const rec = dayData.records[student.id];
                        const status = rec?.status || 'none';
                        const hasExcuseRequested = Boolean(
                          rec?.excuseReason ||
                          status === 'excused_pending' ||
                          status === 'excused_approved' ||
                          status === 'excused_rejected'
                        );
                        const proxyPhoto = rec?.proxyPhoto || (rec?.checkinSource === 'monitor_proxy' ? rec?.excusePhoto : null);
                        const proxyCaptureTime = rec?.proxyPhotoCaptureTime || rec?.excusePhotoCaptureTime || (rec?.checkinTime ? format24hDateTime(rec.checkinTime) : null);
                        const excusePhoto = rec?.checkinSource !== 'monitor_proxy' ? rec?.excusePhoto : null;
                        const excuseCaptureTime = rec?.excusePhotoCaptureTime || (rec?.excuseSubmittedAt ? format24hDateTime(rec.excuseSubmittedAt) : null);

                        let statusBadge = (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                            Chưa điểm danh
                          </span>
                        );

                        if (status === 'present') {
                          statusBadge = (
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-[#E1EEE8] text-[#245346] border border-[#3E7C6B]/20">
                                ✓ Có mặt
                              </span>
                              <div className="flex flex-col gap-0.5 mt-0.5">
                                {rec?.checkinSource === 'monitor_proxy' && (
                                  <span className="text-[10px] text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                                    BCS điểm danh
                                  </span>
                                )}
                                {rec?.checkinSource === 'manual' && (
                                  <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    GVCN điểm danh
                                  </span>
                                )}
                                {rec?.checkinSource === 'gps' && (
                                  <span className="text-[10px] text-[#5B6A61] font-semibold bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                    Tự động (GPS)
                                  </span>
                                )}
                                {rec?.checkinSource === 'monitor_proxy' && rec?.lastUpdatedAction?.includes('GVCN') && (
                                  <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                    GVCN xác nhận
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        } else if (status === 'late') {
                          statusBadge = (
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                ⏰ Đi muộn
                              </span>
                              <div className="flex flex-col gap-0.5 mt-0.5">
                                {rec?.checkinSource === 'monitor_proxy' && (
                                  <span className="text-[10px] text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                                    BCS điểm danh
                                  </span>
                                )}
                                {rec?.checkinSource === 'manual' && (
                                  <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    GVCN điểm danh muộn
                                  </span>
                                )}
                                {rec?.checkinSource === 'gps' && (
                                  <span className="text-[10px] text-amber-800 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    GPS (Muộn)
                                  </span>
                                )}
                                {rec?.checkinSource === 'monitor_proxy' && rec?.lastUpdatedAction?.includes('GVCN') && (
                                  <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                    GVCN xác nhận
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        } else if (status === 'proxy_pending') {
                          statusBadge = (
                            <div className="flex flex-col items-start gap-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                                ✓ Có mặt (BCS xác nhận)
                              </span>
                              <div className="flex flex-col gap-0.5 mt-0.5">
                                <span className="text-[10px] text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                                  BCS điểm danh
                                </span>
                                <span className="text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  Chờ GVCN xem ảnh duyệt
                                </span>
                              </div>
                            </div>
                          );
                        } else if (status === 'absent') {
                          statusBadge = (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-[#F5DED5] text-[#7A3115] border border-[#B3492F]/20">
                              ✗ Vắng không phép
                            </span>
                          );
                        } else if (status === 'excused_pending') {
                          statusBadge = (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 animate-pulse border border-amber-300">
                              ⏳ Đơn chờ duyệt
                            </span>
                          );
                        } else if (status === 'excused_approved') {
                          statusBadge = (
                            <div className="flex flex-col items-start gap-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200">
                                ✓ Vắng có phép
                              </span>
                              {rec?.excuseDebtType === 'owing_paper' ? (
                                <span className="text-[10px] text-amber-900 font-semibold bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                                  ⏳ Nợ đơn (Hạn: {rec.debtSupplementDeadline || calculateSupplementDeadline(selectedDate, getMaxLateDays())})
                                </span>
                              ) : (
                                <span className="text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  📄 Đã có đơn
                                </span>
                              )}
                            </div>
                          );
                        } else if (status === 'excused_rejected') {
                          statusBadge = (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                              ✗ Vắng KP (Từ chối đơn)
                            </span>
                          );
                        }

                        return (
                          <tr key={student.id} className="hover:bg-[#F7F6F0]/80 transition-colors border-b border-[#D7DCCB]/60 align-top">
                            {/* Col 1: STT */}
                            <td className="py-3 px-2 text-center text-[#5B6A61] font-semibold text-xs">
                              {idx + 1}
                            </td>

                            {/* Col 2: Học sinh */}
                            <td className="py-3 px-3">
                              <div className="space-y-1">
                                <div className="font-bold text-[#1B241F] text-sm">
                                  {student.name}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                    {student.id}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleMonitor(student.id)}
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer border ${
                                      student.isMonitor
                                        ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
                                    }`}
                                    title="Phân quyền Ban Cán Sự lớp"
                                  >
                                    {student.isMonitor ? '⭐ Ban Cán Sự' : '+ BCS'}
                                  </button>
                                </div>
                              </div>
                            </td>

                            {/* Col 3: Trạng thái & Nguồn */}
                            <td className="py-3 px-3 space-y-1.5">
                              {statusBadge}
                              <select
                                value={status}
                                onChange={(e) => {
                                  const newStatus = e.target.value;
                                  if (newStatus === 'present') handleManualAttendance(student.id, student.name, 'present');
                                  else if (newStatus === 'late') handleManualAttendance(student.id, student.name, 'late');
                                  else if (newStatus === 'absent') handleAdjustToAbsent(student.id, 'GVCN điều chỉnh: Vắng không phép');
                                  else if (newStatus === 'excused_pending') handleManualExcuse(student.id, student.name);
                                }}
                                className="w-full text-xs font-bold bg-[#F7F6F0] border border-[#D7DCCB] rounded-lg px-2 py-1 cursor-pointer hover:border-[#3E7C6B] focus:outline-none"
                              >
                                <option value="none">Chưa ĐD</option>
                                <option value="present">Có mặt</option>
                                <option value="late">Đi muộn</option>
                                <option value="excused_pending">Vắng có phép</option>
                                <option value="absent">Vắng không phép</option>
                              </select>
                            </td>

                            {/* Col 4: Giờ & GPS */}
                            <td className="py-3 px-3 text-xs text-[#5B6A61]">
                              {rec?.checkinTime ? (
                                <div className="space-y-0.5">
                                  <div className="font-bold text-[#1B241F]">
                                    ⏰ {fmtTime(rec.checkinTime)}
                                  </div>
                                  {rec.distance !== undefined && (
                                    <div className="text-[11px] text-emerald-800 font-medium">
                                      📍 ~{Math.round(rec.distance)}m
                                    </div>
                                  )}
                                  {rec.flagged && (
                                    <div className="text-[10px] text-amber-800 font-bold bg-amber-50 p-1 rounded border border-amber-200 mt-1">
                                      ⚠️ {rec.flagReason || 'Trùng thiết bị'}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400 italic">—</span>
                              )}
                            </td>

                            {/* Col 5: Đơn & Minh chứng */}
                            <td className="py-3 px-3 text-xs">
                              {proxyPhoto ? (
                                <div className="space-y-1.5 bg-indigo-50/70 p-2.5 rounded-xl border border-indigo-200">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-[10px] font-extrabold text-indigo-900 bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-300">
                                      📷 Ảnh ĐD hộ (BCS gửi)
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => onOpenLightbox(proxyPhoto)}
                                      className="text-[10px] text-indigo-700 hover:underline font-bold cursor-pointer"
                                    >
                                      Phóng to
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <img
                                      src={proxyPhoto}
                                      alt="Ảnh điểm danh hộ"
                                      onClick={() => onOpenLightbox(proxyPhoto)}
                                      className="w-12 h-12 object-cover rounded-lg border border-indigo-300 cursor-pointer shadow-2xs shrink-0 hover:opacity-90 transition-opacity"
                                    />
                                    <div className="text-[10px] font-mono space-y-0.5 text-slate-700">
                                      <div><b>Chụp:</b> {proxyCaptureTime || '—'}</div>
                                      <div><b>Gửi:</b> {rec?.checkinTime ? format24hDateTime(rec.checkinTime) : format24hDateTime(Date.now())}</div>
                                    </div>
                                  </div>
                                  {rec?.excuseReason && (
                                    <div className="text-[10px] text-indigo-950 bg-indigo-100/70 p-1 rounded border border-indigo-200">
                                      <b>📝 Lý do:</b> {rec.excuseReason}
                                    </div>
                                  )}
                                </div>
                              ) : hasExcuseRequested ? (
                                <div className="space-y-1.5 bg-amber-50/70 p-2.5 rounded-xl border border-amber-200">
                                  <div className="flex items-center justify-between gap-1 flex-wrap">
                                    {rec?.excuseDebtType === 'owing_paper' ? (
                                      <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                                        ⏳ Nợ đơn (Hạn: {rec.debtSupplementDeadline || calculateSupplementDeadline(selectedDate, getMaxLateDays())})
                                      </span>
                                    ) : excusePhoto ? (
                                      <span className="text-[10px] font-bold text-emerald-900 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                                        📄 Đã có ảnh đơn
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300">
                                        📝 Đơn xin nghỉ
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-800 font-semibold">
                                    {rec?.excuseReason || 'Chưa có lý do'}
                                  </div>
                                  {excusePhoto && (
                                    <div className="flex items-center gap-2 pt-1 border-t border-amber-200/60">
                                      <img
                                        src={excusePhoto}
                                        alt="Ảnh đơn"
                                        onClick={() => onOpenLightbox(excusePhoto)}
                                        className="w-10 h-10 object-cover rounded-lg border border-amber-300 cursor-pointer shrink-0 hover:opacity-90"
                                      />
                                      <div className="text-[10px] font-mono text-slate-700">
                                        <b>Chụp EXIF:</b> {excuseCaptureTime || '—'}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400 italic">—</span>
                              )}
                            </td>

                            {/* Col 6: Thao tác (GVCN) */}
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {status === 'proxy_pending' && (
                                  <button
                                    type="button"
                                    onClick={() => handleDecideProxy(student.id, 'approve')}
                                    className="px-2.5 py-1 bg-[#245346] hover:bg-[#1a3d34] text-white rounded-lg text-[11px] font-bold transition-colors cursor-pointer shadow-2xs inline-flex items-center gap-1"
                                    title="Duyệt ảnh: Xác nhận Có mặt chính thức"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Duyệt có mặt</span>
                                  </button>
                                )}

                                {status === 'excused_pending' && (
                                  <button
                                    type="button"
                                    onClick={() => handleDecideExcuse(student.id, 'excused_approved')}
                                    className="px-2.5 py-1 bg-[#3E7C6B] hover:bg-[#346a5b] text-white rounded-lg text-[11px] font-bold transition-colors cursor-pointer shadow-2xs inline-flex items-center gap-1"
                                    title="Duyệt đơn Vắng có phép"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Duyệt phép</span>
                                  </button>
                                )}

                                 {status !== 'proxy_pending' && rec?.checkinSource !== 'monitor_proxy' && (
                                   <button
                                     type="button"
                                     onClick={() => handleManualProxy(student.id, student.name)}
                                     className="px-2.5 py-1 bg-[#4f46e5] hover:bg-[#4338ca] text-white rounded-lg text-[11px] font-bold transition-colors cursor-pointer shadow-2xs inline-flex items-center gap-1"
                                     title="Điểm danh hộ: Xác nhận có mặt cho học sinh"
                                   >
                                     <UserCheck className="w-3.5 h-3.5" />
                                     <span>Điểm danh hộ</span>
                                   </button>
                                 )}

                                <button
                                  type="button"
                                  onClick={() => handleManualExcuse(student.id, student.name)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs ${
                                    status === 'excused_approved'
                                      ? 'bg-[#245346] text-white border border-[#1b3d33]'
                                      : 'bg-[#F5E6D0] hover:bg-[#e8d1af] text-[#7A521E] border border-[#D4A96A]/60'
                                  }`}
                                  title="Ghi nhận Vắng có phép (Có đơn hoặc Nợ đơn)"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{status === 'excused_approved' ? '✓ Vắng có phép' : 'Vắng có phép'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (status === 'proxy_pending') {
                                      handleDecideProxy(student.id, 'reject');
                                    } else if (status === 'excused_pending') {
                                      handleDecideExcuse(student.id, 'excused_rejected');
                                    } else {
                                      handleAdjustToAbsent(student.id, 'GVCN xác nhận: Vắng không phép');
                                    }
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs ${
                                    status === 'absent' || status === 'excused_rejected'
                                      ? 'bg-[#B3492F] text-white border border-[#912d17]'
                                      : 'bg-[#F5DED5] hover:bg-[#eacbc0] text-[#7A3115] border border-[#B3492F]/40'
                                  }`}
                                  title="Xác nhận thành Vắng không phép"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>{status === 'absent' || status === 'excused_rejected' ? '✗ Vắng KP' : 'Vắng KP'}</span>
                                </button>

                                {(proxyPhoto || excusePhoto || hasExcuseRequested) && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteInvalidPhotoAndExcuse(student.id, 'all_excuse_and_photo')}
                                    className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 rounded-lg text-[11px] font-bold transition-colors cursor-pointer shadow-2xs inline-flex items-center gap-1"
                                    title="Xóa ảnh/đơn không hợp lệ"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Xóa ảnh/đơn</span>
                                  </button>
                                )}

                                {rec?.excuseDebtType === 'owing_paper' && (
                                  <button
                                    type="button"
                                    onClick={() => handleTriggerSupplement(student.id)}
                                    className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition-colors cursor-pointer shadow-2xs inline-flex items-center gap-1"
                                    title="Bổ sung ảnh đơn nợ"
                                  >
                                    <Upload className="w-3 h-3" />
                                    <span>Bổ sung đơn</span>
                                  </button>
                                )}

                                {/* Student Roster Edit / Delete Buttons */}
                                <div className="inline-flex items-center gap-1 ml-1 pl-1 border-l border-slate-300">
                                  <button
                                    type="button"
                                    onClick={() => setEditingStudent({ originalId: student.id, id: student.id, name: student.name })}
                                    className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded cursor-pointer"
                                    title="Sửa tên / Mã số học sinh"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingStudent({ id: student.id, name: student.name })}
                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer"
                                    title="Xóa học sinh khỏi danh sách lớp"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      <ReportsModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        selectedLop={selectedLop}
      />

      {/* Auto Notification Modal */}
      {showAutoNotificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#FBFAF5] rounded-3xl p-6 w-full max-w-lg shadow-2xl relative border-2 border-[#1F3B32]/10 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowAutoNotificationModal(false)}
              className="absolute top-4 right-4 p-2 text-[#5B6A61] hover:bg-[#E1EEE8] hover:text-[#1F3B32] rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-2.5 bg-[#1F3B32] text-white rounded-xl">
                <Bell className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-[#1B241F]">
                  Thông Báo Tự Động Vắng Không Lý Do
                </h3>
                <p className="text-xs text-[#5B6A61]">
                  Lớp: <b className="text-[#1F3B32]">{selectedLop}</b> | Ngày: <b>{fmtDateVN(selectedDate)}</b>
                </p>
              </div>
            </div>

            <div className="space-y-4 mt-4">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <p className="font-bold mb-1">📋 Nội dung thông báo tự động (Gửi GVCN & Phụ huynh):</p>
                <div className="p-3 bg-white border border-amber-200 rounded-lg font-mono text-[11px] text-[#1B241F] space-y-1">
                  <p><b>[THÔNG BÁO CHUYÊN CẦN TỰ ĐỘNG]</b></p>
                  <p>Kính gửi Phụ huynh và GVCN lớp {selectedLop},</p>
                  <p>Hệ thống ghi nhận các học sinh sau vắng mặt không có lý do trong buổi học ngày {fmtDateVN(selectedDate)} (Khung giờ điểm danh đã kết thúc lúc {currentCfg?.endTime || '07:15'}):</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-red-800 font-semibold my-1">
                    {unexcusedAbsents.map(s => (
                      <li key={s.id}>{s.id} - {s.name}</li>
                    ))}
                  </ul>
                  <p>Đề nghị Phụ huynh liên hệ GVCN để xác nhận lý do hoặc nộp đơn phép trước hạn chót.</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1F3B32] uppercase tracking-wider mb-2">
                  Kênh gửi thông báo (Mô phỏng đẩy tin)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 bg-[#E1EEE8] border border-[#3E7C6B]/40 rounded-xl text-center">
                    <span className="block text-xs font-bold text-[#245346]">📱 App Push</span>
                    <span className="text-[10px] text-[#3E7C6B]">Đã bật (GVCN)</span>
                  </div>
                  <div className="p-3 bg-[#E1EEE8] border border-[#3E7C6B]/40 rounded-xl text-center">
                    <span className="block text-xs font-bold text-[#245346]">💬 Zalo ZNS</span>
                    <span className="text-[10px] text-[#3E7C6B]">Tự động gửi PH</span>
                  </div>
                  <div className="p-3 bg-[#E1EEE8] border border-[#3E7C6B]/40 rounded-xl text-center">
                    <span className="block text-xs font-bold text-[#245346]">✉️ SMS</span>
                    <span className="text-[10px] text-[#3E7C6B]">Đã kích hoạt</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAutoNotificationModal(false)}
                  className="flex-1 py-2.5 px-4 bg-white border-2 border-[#D7DCCB] text-[#5B6A61] hover:bg-[#F7F6F0] rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotificationSent(true);
                    setShowAutoNotificationModal(false);
                    showFeedback(`Đã gửi thành công thông báo tự động cho ${unexcusedAbsents.length} học sinh vắng không phép đến GVCN và Phụ huynh!`);
                  }}
                  className="flex-1 py-2.5 px-4 bg-[#1F3B32] hover:bg-[#152a23] text-[#F4F0E4] rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>Xác nhận gửi thông báo ngay</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for quick supplement of excuse debt */}
      <input
        ref={quickSupplementInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleQuickSupplementFileChange}
      />

      {manualProxyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#FBFAF5] rounded-3xl p-6 w-full max-w-sm shadow-2xl relative border-2 border-[#1F3B32]/10">
            <button
              type="button"
              onClick={() => setManualProxyModal(null)}
              className="absolute top-4 right-4 p-2 text-[#5B6A61] hover:bg-[#E1EEE8] hover:text-[#1F3B32] rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-extrabold text-[#1F3B32] mb-4">Điểm danh hộ</h3>
            <p className="text-sm text-[#5B6A61] mb-6">Xác nhận điểm danh có mặt hộ cho <b>{manualProxyModal.studentName}</b>?</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setManualProxyModal(null)}
                className="flex-1 py-2.5 bg-white border border-[#D7DCCB] text-[#5B6A61] rounded-xl text-sm font-bold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={submitManualProxy}
                className="flex-1 py-2.5 bg-[#1F3B32] text-white rounded-xl text-sm font-bold cursor-pointer"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Excuse Modal: Ghi nhận Vắng có phép (Có đơn vs Nợ đơn) */}
      {manualExcuseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#FBFAF5] rounded-3xl p-6 w-full max-w-lg shadow-2xl relative border-2 border-[#1F3B32]/10 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setManualExcuseModal(null)}
              className="absolute top-4 right-4 p-2 text-[#5B6A61] hover:bg-[#E1EEE8] hover:text-[#1F3B32] rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-2 bg-[#1F3B32] text-white rounded-xl">
                <FileText className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-[#1B241F]">
                  Xác Nhận Vắng Có Phép
                </h3>
                <p className="text-xs text-[#5B6A61]">
                  Học sinh: <b className="text-[#245346]">{manualExcuseModal.studentName}</b> ({manualExcuseModal.studentId})
                </p>
              </div>
            </div>

            <div className="space-y-4 mt-4">
              {/* Lựa chọn 1: Có đơn vs Nợ đơn */}
              <div>
                <label className="block text-xs font-bold text-[#1F3B32] uppercase tracking-wider mb-2">
                  1. Chọn phân loại giấy phép xin nghỉ:
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setManualExcuseModal({ ...manualExcuseModal, debtType: 'has_paper', method: 'paper' })}
                    className={`p-3 rounded-2xl text-left border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      manualExcuseModal.debtType === 'has_paper'
                        ? 'border-[#245346] bg-[#E1EEE8] shadow-xs'
                        : 'border-[#D7DCCB] bg-white text-[#5B6A61] hover:bg-[#F7F6F0]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm text-[#245346] flex items-center gap-1.5">
                        📄 Có đơn
                      </span>
                      {manualExcuseModal.debtType === 'has_paper' && (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#245346]" />
                      )}
                    </div>
                    <p className="text-[11px] text-[#5B6A61] mt-1 font-medium leading-tight">
                      Có đơn giấy hoặc ảnh chụp minh chứng nộp ngay.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setManualExcuseModal({ ...manualExcuseModal, debtType: 'owing_paper', method: 'pending' })}
                    className={`p-3 rounded-2xl text-left border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      manualExcuseModal.debtType === 'owing_paper'
                        ? 'border-amber-600 bg-amber-50 shadow-xs'
                        : 'border-[#D7DCCB] bg-white text-[#5B6A61] hover:bg-[#F7F6F0]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm text-amber-900 flex items-center gap-1.5">
                        ⏳ Nợ đơn
                      </span>
                      {manualExcuseModal.debtType === 'owing_paper' && (
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
                      )}
                    </div>
                    <p className="text-[11px] text-amber-800 mt-1 font-medium leading-tight">
                      Nộp bù đơn sau theo quy định {getMaxLateDays()} ngày của BGH.
                    </p>
                  </button>
                </div>
              </div>

              {/* Hình thức thông báo */}
              <div>
                <label className="block text-xs font-bold text-[#1F3B32] uppercase tracking-wider mb-1.5">
                  2. Hình thức báo:
                </label>
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setManualExcuseModal({ ...manualExcuseModal, method: 'paper' })}
                    className={`py-2 px-1 rounded-xl font-bold border transition-colors cursor-pointer text-center ${
                      manualExcuseModal.method === 'paper'
                        ? 'border-[#3E7C6B] bg-[#E1EEE8] text-[#245346]'
                        : 'border-[#D7DCCB] text-[#5B6A61] bg-white hover:bg-[#F7F6F0]'
                    }`}
                  >
                    📝 Đơn giấy
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualExcuseModal({ ...manualExcuseModal, method: 'message' })}
                    className={`py-2 px-1 rounded-xl font-bold border transition-colors cursor-pointer text-center ${
                      manualExcuseModal.method === 'message'
                        ? 'border-[#3E7C6B] bg-[#E1EEE8] text-[#245346]'
                        : 'border-[#D7DCCB] text-[#5B6A61] bg-white hover:bg-[#F7F6F0]'
                    }`}
                  >
                    💬 Tin nhắn
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualExcuseModal({ ...manualExcuseModal, method: 'call' })}
                    className={`py-2 px-1 rounded-xl font-bold border transition-colors cursor-pointer text-center ${
                      manualExcuseModal.method === 'call'
                        ? 'border-[#3E7C6B] bg-[#E1EEE8] text-[#245346]'
                        : 'border-[#D7DCCB] text-[#5B6A61] bg-white hover:bg-[#F7F6F0]'
                    }`}
                  >
                    📞 Gọi điện
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualExcuseModal({ ...manualExcuseModal, method: 'pending' })}
                    className={`py-2 px-1 rounded-xl font-bold border transition-colors cursor-pointer text-center ${
                      manualExcuseModal.method === 'pending'
                        ? 'border-amber-600 bg-amber-50 text-amber-900'
                        : 'border-[#D7DCCB] text-[#5B6A61] bg-white hover:bg-[#F7F6F0]'
                    }`}
                  >
                    ⏳ Nợ đơn
                  </button>
                </div>
              </div>

              {/* Thông báo quy định nếu Nợ đơn */}
              {manualExcuseModal.debtType === 'owing_paper' && (
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>⚠️ Quy định hạn nộp đơn bù của BGH:</span>
                  </div>
                  <p>
                    Học sinh được ghi nhận <b>Vắng có phép (Nợ đơn)</b>. Phụ huynh/Học sinh có thời hạn <b>{getMaxLateDays()} ngày</b> để bổ sung ảnh chụp đơn trên app (Hạn chót: <b>{calculateSupplementDeadline(selectedDate, getMaxLateDays())}</b>).
                  </p>
                </div>
              )}

              {/* Lý do xin nghỉ */}
              <div>
                <label className="block text-xs font-bold text-[#1F3B32] uppercase tracking-wider mb-1.5">
                  3. Lý do xin nghỉ:
                </label>
                <input
                  type="text"
                  value={manualExcuseModal.reason}
                  onChange={(e) => setManualExcuseModal({ ...manualExcuseModal, reason: e.target.value })}
                  placeholder="Ví dụ: Bệnh sốt cao, đi khám viện, có việc gia đình..."
                  className="w-full bg-white border-2 border-[#D7DCCB] rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-[#3E7C6B]"
                />
              </div>

              {/* Ảnh minh chứng */}
              <div>
                <label className="block text-xs font-bold text-[#1F3B32] uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>4. Minh chứng ảnh chụp {manualExcuseModal.debtType === 'has_paper' ? <b className="text-[#B3492F]">(Bắt buộc khi Có đơn)</b> : <span className="text-[#5B6A61] font-normal">(Tùy chọn)</span>}:</span>
                </label>
                {!manualExcuseModal.photoBase64 ? (
                  <label className="flex flex-col items-center justify-center w-full h-24 bg-white border-2 border-dashed border-[#D7DCCB] hover:border-[#3E7C6B] hover:bg-[#F7F6F0] rounded-xl cursor-pointer transition-colors">
                    <div className="flex flex-col items-center justify-center pt-3 pb-3">
                      <Upload className="w-5 h-5 text-[#5B6A61] mb-1" />
                      <p className="text-xs font-semibold text-[#5B6A61]">
                        Chọn ảnh đơn xin phép hoặc tin nhắn
                      </p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleManualExcusePhoto}
                    />
                  </label>
                ) : (
                  <div className="space-y-2 p-2.5 bg-white rounded-xl border-2 border-[#D7DCCB]">
                    <div className="relative rounded-lg overflow-hidden border border-[#D7DCCB] h-32">
                      <img
                        src={manualExcuseModal.photoBase64}
                        alt="Minh chứng"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setManualExcuseModal({ ...manualExcuseModal, photoBase64: null, photoCaptureTime: null })}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-[11px] font-mono space-y-1 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <div><span className="font-bold font-sans text-slate-700">1. Giờ chụp ảnh (EXIF 24h):</span> {manualExcuseModal.photoCaptureTime || format24hDateTime(Date.now())}</div>
                      <div><span className="font-bold font-sans text-slate-700">2. Giờ gửi hệ thống (24h):</span> <span className="italic text-amber-700 font-sans">⏳ Ghi nhận khi bấm xác nhận</span></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setManualExcuseModal(null)}
                    className="flex-1 py-2.5 px-4 bg-white border-2 border-[#D7DCCB] text-[#5B6A61] hover:bg-[#F7F6F0] rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={submitManualExcuse}
                    className="flex-1 py-2.5 px-4 bg-[#1F3B32] hover:bg-[#152a23] text-[#F4F0E4] rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg cursor-pointer inline-flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Xác nhận Vắng có phép</span>
                  </button>
                </div>
                {(dayData.records[manualExcuseModal.studentId]?.excuseReason ||
                  dayData.records[manualExcuseModal.studentId]?.excusePhoto ||
                  dayData.records[manualExcuseModal.studentId]?.proxyPhoto) && (
                  <button
                    type="button"
                    onClick={() => {
                      const sId = manualExcuseModal.studentId;
                      setManualExcuseModal(null);
                      handleDeleteInvalidPhotoAndExcuse(sId, 'all_excuse_and_photo');
                    }}
                    className="w-full py-2 px-4 bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 rounded-xl text-xs font-bold transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Xóa toàn bộ đơn & ảnh không hợp lệ (Chuyển Vắng không phép)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem tất cả các ảnh đã gửi lên (Điểm danh hộ + Đơn xin phép) */}
      {showAllPhotosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#FBFAF5] rounded-3xl p-6 w-full max-w-4xl shadow-2xl relative border-2 border-[#1F3B32]/10 max-h-[90vh] flex flex-col">
            <button
              type="button"
              onClick={() => setShowAllPhotosModal(false)}
              className="absolute top-4 right-4 p-2 text-[#5B6A61] hover:bg-[#E1EEE8] hover:text-[#1F3B32] rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-[#1F3B32] text-white rounded-xl">
                <Camera className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-[#1B241F]">
                  Tất Cả Ảnh Đã Gửi Lên Hệ Thống
                </h3>
                <p className="text-xs text-[#5B6A61]">
                  Lớp: <b className="text-[#1F3B32]">{selectedLop}</b> • Ngày: <b>{fmtDateVN(selectedDate)}</b> • Tổng cộng: <b>{submittedPhotos.length} ảnh</b>
                </p>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-2 mb-4 bg-[#EEF1E7] p-1.5 rounded-xl border border-[#D7DCCB] shrink-0">
              <button
                type="button"
                onClick={() => setAllPhotosFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  allPhotosFilter === 'all'
                    ? 'bg-[#1F3B32] text-white shadow-2xs'
                    : 'text-[#5B6A61] hover:bg-white/60'
                }`}
              >
                Tất cả ({submittedPhotos.length})
              </button>
              <button
                type="button"
                onClick={() => setAllPhotosFilter('proxy')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  allPhotosFilter === 'proxy'
                    ? 'bg-indigo-700 text-white shadow-2xs'
                    : 'text-indigo-800 hover:bg-white/60'
                }`}
              >
                Điểm danh hộ ({submittedPhotos.filter((p) => p.type === 'proxy').length})
              </button>
              <button
                type="button"
                onClick={() => setAllPhotosFilter('excuse')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  allPhotosFilter === 'excuse'
                    ? 'bg-[#7A521E] text-white shadow-2xs'
                    : 'text-[#7A521E] hover:bg-white/60'
                }`}
              >
                Đơn xin nghỉ phép ({submittedPhotos.filter((p) => p.type === 'excuse').length})
              </button>
            </div>

            {/* Photos Grid */}
            <div className="flex-1 overflow-y-auto pr-1">
              {submittedPhotos.filter((p) => allPhotosFilter === 'all' || p.type === allPhotosFilter).length === 0 ? (
                <div className="text-center py-16 text-slate-500 italic text-sm">
                  Chưa có ảnh nào được gửi lên cho danh mục này trong ngày {fmtDateVN(selectedDate)}.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {submittedPhotos
                    .filter((p) => allPhotosFilter === 'all' || p.type === allPhotosFilter)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="bg-white border-2 border-[#D7DCCB] rounded-2xl p-3 shadow-2xs flex flex-col justify-between hover:border-[#3E7C6B] transition-colors"
                      >
                        <div className="space-y-2">
                          <div className="relative rounded-xl overflow-hidden border border-[#D7DCCB] aspect-video bg-slate-100 group">
                            <img
                              src={item.photo}
                              alt={item.studentName}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 cursor-pointer"
                              onClick={() => onOpenLightbox(item.photo)}
                            />
                            <div className="absolute top-2 left-2">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold shadow-sm ${
                                  item.type === 'proxy'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-amber-600 text-white'
                                }`}
                              >
                                {item.typeLabel}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => onOpenLightbox(item.photo)}
                              className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 hover:bg-black text-white text-[10px] font-bold rounded-lg cursor-pointer"
                            >
                              🔍 Phóng to
                            </button>
                          </div>

                          <div>
                            <div className="text-sm font-extrabold text-[#1B241F]">
                              {item.studentName}
                            </div>
                            <div className="text-xs font-mono font-semibold text-[#5B6A61]">
                              Mã HS: {item.studentId}
                            </div>
                            {item.reason && (
                              <div className="text-xs text-amber-900 mt-1 bg-amber-50 p-1.5 rounded-lg border border-amber-200">
                                <b>Lý do:</b> {item.reason}
                              </div>
                            )}
                          </div>

                          {/* Dual Timestamps 24h */}
                          <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-mono space-y-1 text-slate-700">
                            <div>
                              <b className="font-sans text-slate-900">1. Giờ chụp (EXIF):</b> {item.captureTime}
                            </div>
                            <div>
                              <b className="font-sans text-slate-900">2. Giờ gửi hệ thống:</b> {item.submittedTime}
                            </div>
                          </div>
                        </div>

                        {/* Thao tác duyệt / đổi trực tiếp ngay trên card ảnh */}
                        <div className="mt-3 pt-2.5 border-t border-slate-200 flex flex-wrap gap-1.5">
                          {item.type === 'proxy' ? (
                            item.status === 'proxy_pending' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleDecideProxy(item.studentId, 'approve')}
                                  className="flex-1 py-1.5 px-2 bg-[#245346] hover:bg-[#1a3d34] text-white rounded-lg text-xs font-bold cursor-pointer text-center"
                                >
                                  ✓ Duyệt có mặt
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDecideProxy(item.studentId, 'reject')}
                                  className="flex-1 py-1.5 px-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold cursor-pointer text-center"
                                >
                                  ✗ Hủy (Vắng KP)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowAllPhotosModal(false);
                                    handleManualExcuse(item.studentId, item.studentName);
                                  }}
                                  className="w-full py-1 px-2 bg-[#F5E6D0] text-[#7A521E] hover:bg-[#e8d1af] border border-[#D4A96A]/50 rounded-lg text-[11px] font-bold cursor-pointer text-center"
                                >
                                  📝 Chuyển: Vắng có phép
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustToAbsent(item.studentId, 'GVCN/BGH xem ảnh thấy không hợp lệ -> Điều chỉnh Vắng không phép')}
                                  className="flex-1 py-1 px-2 bg-[#F5DED5] text-[#7A3115] hover:bg-[#eacbc0] border border-[#B3492F]/30 rounded-lg text-[11px] font-bold cursor-pointer text-center"
                                >
                                  ✗ Đổi: Vắng không phép
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowAllPhotosModal(false);
                                    handleManualExcuse(item.studentId, item.studentName);
                                  }}
                                  className="flex-1 py-1 px-2 bg-[#F5E6D0] text-[#7A521E] hover:bg-[#e8d1af] border border-[#D4A96A]/50 rounded-lg text-[11px] font-bold cursor-pointer text-center"
                                >
                                  ✓ Đổi: Vắng có phép
                                </button>
                              </>
                            )
                          ) : (
                            /* Excuse photo */
                            item.status === 'excused_pending' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleDecideExcuse(item.studentId, 'excused_approved')}
                                  className="flex-1 py-1.5 px-2 bg-[#3E7C6B] hover:bg-[#346a5b] text-white rounded-lg text-xs font-bold cursor-pointer text-center"
                                >
                                  ✓ Duyệt đơn (Có phép)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDecideExcuse(item.studentId, 'excused_rejected')}
                                  className="flex-1 py-1.5 px-2 bg-[#B3492F] hover:bg-[#963720] text-white rounded-lg text-xs font-bold cursor-pointer text-center"
                                >
                                  ✗ Từ chối (Vắng KP)
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustToAbsent(item.studentId, 'GVCN/BGH xem ảnh đơn thấy không hợp lệ -> Hủy phép thành Vắng không phép')}
                                  className="flex-1 py-1 px-2 bg-[#F5DED5] text-[#7A3115] hover:bg-[#eacbc0] border border-[#B3492F]/30 rounded-lg text-[11px] font-bold cursor-pointer text-center"
                                >
                                  ✗ Đổi: Vắng không phép
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowAllPhotosModal(false);
                                    handleManualExcuse(item.studentId, item.studentName);
                                  }}
                                  className="flex-1 py-1 px-2 bg-[#E1EEE8] text-[#3E7C6B] hover:bg-[#cde0d7] rounded-lg text-[11px] font-bold cursor-pointer text-center"
                                >
                                  📝 Sửa đơn phép
                                </button>
                              </>
                            )
                          )}

                          {/* Nút Xóa ảnh / Xóa đơn & ảnh không hợp lệ trực tiếp từ Thư viện ảnh */}
                          <div className="w-full flex items-center gap-1.5 pt-1 border-t border-slate-100">
                            {item.type === 'excuse' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteInvalidPhotoAndExcuse(item.studentId, 'photo_only')}
                                className="flex-1 py-1 px-2 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-[11px] font-bold cursor-pointer text-center"
                                title="Chỉ xóa ảnh không hợp lệ, chuyển học sinh sang Nợ đơn để nộp lại ảnh"
                              >
                                🗑️ Chỉ xóa ảnh (Nợ đơn)
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteInvalidPhotoAndExcuse(item.studentId, 'all_excuse_and_photo')}
                              className="flex-1 py-1 px-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[11px] font-bold cursor-pointer text-center"
                              title="Xóa toàn bộ ảnh và đơn không hợp lệ (Chuyển Vắng không phép)"
                            >
                              🗑️ Xóa ảnh/đơn
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-[#D7DCCB] flex justify-end">
              <button
                type="button"
                onClick={() => setShowAllPhotosModal(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Đóng thư viện ảnh
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Modal Sửa thông tin học sinh */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-extrabold text-[#1B241F] flex items-center gap-2">
                ✏️ Chỉnh sửa thông tin học sinh
              </h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="p-1 hover:bg-slate-100 rounded-full cursor-pointer text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#1B241F] uppercase mb-1">
                  Mã số học sinh (Mã HS):
                </label>
                <input
                  type="text"
                  value={editingStudent.id}
                  onChange={(e) => setEditingStudent({ ...editingStudent, id: e.target.value })}
                  className="w-full bg-[#F7F6F0] border-2 border-[#D7DCCB] rounded-xl px-3.5 py-2 text-sm font-mono font-bold text-[#1B241F] focus:outline-none focus:border-[#3E7C6B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1B241F] uppercase mb-1">
                  Họ và tên học sinh:
                </label>
                <input
                  type="text"
                  value={editingStudent.name}
                  onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                  className="w-full bg-[#F7F6F0] border-2 border-[#D7DCCB] rounded-xl px-3.5 py-2 text-sm font-bold text-[#1B241F] focus:outline-none focus:border-[#3E7C6B]"
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveEditStudent}
                className="flex-1 py-2.5 bg-[#3E7C6B] hover:bg-[#346a5b] text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xác nhận Xóa học sinh */}
      {deletingStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Xác nhận xóa học sinh?
                </h3>
                <p className="text-xs text-slate-500">
                  Hành động này sẽ xóa học sinh khỏi danh sách lớp {selectedLop}.
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs font-semibold text-red-900 space-y-1">
              <div><b>Mã HS:</b> {deletingStudent.id}</div>
              <div><b>Họ tên:</b> {deletingStudent.name}</div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingStudent(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStudent}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-sm"
              >
                Xác nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Điểm danh thủ công (Có mặt / Đi muộn / Vắng không phép với ghi chú) */}
      {manualAttendanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#FBFAF5] rounded-3xl p-6 w-full max-w-sm shadow-2xl relative border-2 border-[#1F3B32]/10">
            <button
              type="button"
              onClick={() => setManualAttendanceModal(null)}
              className="absolute top-4 right-4 p-2 text-[#5B6A61] hover:bg-[#E1EEE8] hover:text-[#1F3B32] rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-extrabold text-[#1B241F] mb-4">
              Điểm danh: {manualAttendanceModal.studentName} ({manualAttendanceModal.studentId})
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#1F3B32] uppercase tracking-wider mb-1.5">
                  Ghi chú / Lý do (Tùy chọn):
                </label>
                <input
                  type="text"
                  value={manualAttendanceModal.note}
                  onChange={(e) => setManualAttendanceModal({ ...manualAttendanceModal, note: e.target.value })}
                  placeholder="Vd: Đi thi muộn, đi tập thể dục..."
                  className="w-full bg-white border-2 border-[#D7DCCB] rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-[#3E7C6B]"
                />
              </div>
              
              <button
                type="button"
                onClick={submitManualAttendance}
                className="w-full py-2.5 px-4 bg-[#1F3B32] hover:bg-[#152a23] text-[#F4F0E4] rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg cursor-pointer"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nhật ký toàn bộ hoạt động & thao tác của GVCN và Học sinh lớp mình */}
      <AdminLiveActivityModal
        isOpen={showClassActivityModal}
        onClose={() => setShowClassActivityModal(false)}
        classList={selectedLop ? [selectedLop] : []}
        lockedClass={selectedLop}
        onOpenLightbox={onOpenLightbox}
      />
    </div>
  );
};
