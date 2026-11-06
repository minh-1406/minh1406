import React, { useState, useEffect, useRef } from 'react';
import {
  UserCheck,
  MapPin,
  FileText,
  Upload,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Navigation,
  History,
  ShieldAlert,
  Lock,
} from 'lucide-react';
import {
  getLopList,
  getRoster,
  getClassConfig,
  getDayData,
  setDayData,
  sGet,
  sSet,
  haversine,
  getDeviceFingerprint,
  fileToCompressedDataURL,
  fmtTime,
  fmtDateVN,
  localDateKey,
  localTimeKey,
  addMinutesToTime,
  lopSlug,
  getMaxLateDays,
  isDateWithinLateWindow,
  calculateSupplementDeadline,
  getSchoolId,
  format24hDateTime,
} from '../utils/storage';
import { Student, DayData, AttendanceStatus } from '../types';
import { syncSaveDayData, syncAppendClassLog } from '../utils/firestoreSync';
import { getSafePhotoCaptureTime, verifyPhotoExifDateSafe, checkDuplicatePhotoInClass } from '../utils/exifHelper';

interface StudentViewProps {
  selectedLop: string;
  setSelectedLop: (lop: string) => void;
}

export const StudentView: React.FC<StudentViewProps> = ({
  selectedLop,
  setSelectedLop,
}) => {
  const [lopList, setLopList] = useState<string[]>([]);
  const [studentId, setStudentId] = useState<string>('');
  const [studentName, setStudentName] = useState<string>('');

  // Status message for check-in
  const [checkinStatus, setCheckinStatus] = useState<{
    type: 'wait' | 'ok' | 'flag' | 'err';
    msg: string;
  }>({
    type: 'wait',
    msg: 'Sẵn sàng. Ứng dụng sẽ xin quyền truy cập vị trí khi bạn bấm điểm danh.',
  });
  const [isCheckingIn, setIsCheckingIn] = useState<boolean>(false);

  // Excuse state
  const [excuseDate, setExcuseDate] = useState<string>(localDateKey());
  const [excuseDebtType, setExcuseDebtType] = useState<'has_paper' | 'owing_paper'>('has_paper');
  const [excuseReason, setExcuseReason] = useState<string>('');
  const [excusePhotoFile, setExcusePhotoFile] = useState<File | null>(null);
  const [excusePhotoPreview, setExcusePhotoPreview] = useState<string>('');
  const [excusePhotoCaptureTime, setExcusePhotoCaptureTime] = useState<string>('');
  const [excusePhotoSubmitTime, setExcusePhotoSubmitTime] = useState<string>('');
  const [isSendingExcuse, setIsSendingExcuse] = useState<boolean>(false);
  const [excuseStatus, setExcuseStatus] = useState<{
    type: 'wait' | 'ok' | 'err';
    msg: string;
  }>({
    type: 'wait',
    msg: 'Chưa gửi đơn nào.',
  });
  const excusePhotoInputRef = useRef<HTMLInputElement>(null);

  // Modal / action state for supplementing debt photo
  const [supplementModalDate, setSupplementModalDate] = useState<string | null>(null);
  const [supplementFile, setSupplementFile] = useState<File | null>(null);
  const [supplementPreview, setSupplementPreview] = useState<string>('');
  const [supplementCaptureTime, setSupplementCaptureTime] = useState<string>('');
  const [isSubmittingSupplement, setIsSubmittingSupplement] = useState<boolean>(false);
  const supplementInputRef = useRef<HTMLInputElement>(null);

  // Excuse History
  const [excuseHistory, setExcuseHistory] = useState<any[]>([]);

  // EXIF Date Verification Helper for Anti-Cheat Photo
  const verifyPhotoExifDate = verifyPhotoExifDateSafe;

  // Monitor proxy attendance state (1 photo = 1 student)
  const [selectedProxyStudentId, setSelectedProxyStudentId] = useState<string>('');
  const [monitorPhotoFile, setMonitorPhotoFile] = useState<File | null>(null);
  const [monitorPhotoPreview, setMonitorPhotoPreview] = useState<string>('');
  const [monitorPhotoCaptureTime, setMonitorPhotoCaptureTime] = useState<string>('');
  const [monitorPhotoSubmitTime, setMonitorPhotoSubmitTime] = useState<string>('');
  const [monitorStatus, setMonitorStatus] = useState<{ type: 'wait' | 'ok' | 'err'; msg: string }>({
    type: 'wait',
    msg: 'Chưa chọn học sinh điểm danh hộ.',
  });
  const [isSubmittingMonitor, setIsSubmittingMonitor] = useState<boolean>(false);
  const monitorPhotoInputRef = useRef<HTMLInputElement>(null);

  const rosterForMonitor = selectedLop ? getRoster(selectedLop) : [];
  const currentStudentRecord = rosterForMonitor.find(s => s.id.toLowerCase() === studentId.trim().toLowerCase());
  const isCurrentStudentMonitor = Boolean(currentStudentRecord?.isMonitor);

  const handleMonitorPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMonitorStatus({ type: 'wait', msg: 'Đang phân tích thời gian chụp ảnh (EXIF Metadata)...' });

    try {
      const exifCheck = await verifyPhotoExifDate(file);
      if (!exifCheck.isValid) {
        setMonitorStatus({ type: 'err', msg: exifCheck.errorMsg || 'Ảnh không hợp lệ!' });
        setMonitorPhotoFile(null);
        setMonitorPhotoPreview('');
        setMonitorPhotoCaptureTime('');
        setMonitorPhotoSubmitTime('');
        return;
      }

      const compressed = await fileToCompressedDataURL(file);
      const capTime = exifCheck.captureDateTime || format24hDateTime(file.lastModified);
      const subTime = format24hDateTime(Date.now());

      setMonitorPhotoFile(file);
      setMonitorPhotoPreview(compressed);
      setMonitorPhotoCaptureTime(capTime);
      setMonitorPhotoSubmitTime(subTime);
      setMonitorStatus({
        type: 'ok',
        msg: `Ảnh hợp lệ! 1. Giờ chụp: ${capTime} | 2. Giờ gửi hệ thống: ${subTime}`
      });
    } catch (err: any) {
      setMonitorStatus({ type: 'err', msg: `Lỗi đọc EXIF ảnh: ${err?.message || err}` });
    } finally {
      if (monitorPhotoInputRef.current) monitorPhotoInputRef.current.value = '';
    }
  };

  const handleSubmitMonitorAttendance = async () => {
    if (!selectedLop || !studentId) return;
    if (!selectedProxyStudentId) {
      setMonitorStatus({ type: 'err', msg: 'Vui lòng chọn 1 học sinh cần điểm danh hộ trong danh sách.' });
      return;
    }
    if (!monitorPhotoFile || !monitorPhotoPreview) {
      setMonitorStatus({ type: 'err', msg: 'Vui lòng chụp và tải lên ảnh minh chứng thực tế riêng cho học sinh này.' });
      return;
    }

    const cfg = getClassConfig(selectedLop);
    if (!cfg || cfg.lat === 0) {
      setMonitorStatus({ type: 'err', msg: 'Lớp này chưa được giáo viên cấu hình vị trí GPS. Không thể điểm danh hộ!' });
      return;
    }

    if (!navigator.geolocation) {
      setMonitorStatus({ type: 'err', msg: 'Trình duyệt của bạn không hỗ trợ định vị GPS.' });
      return;
    }

    const exifCheck = await verifyPhotoExifDate(monitorPhotoFile);
    if (!exifCheck.isValid) {
      setMonitorStatus({ type: 'err', msg: exifCheck.errorMsg || 'Ảnh không hợp lệ để chống điểm danh giả!' });
      return;
    }

    setIsSubmittingMonitor(true);
    setMonitorStatus({ type: 'wait', msg: 'Đang xác định vị trí GPS của Ban Cán Sự để xác thực phạm vi lớp học...' });

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const distance = haversine(lat, lng, cfg.lat, cfg.lng);

          if (distance > cfg.radius) {
            setMonitorStatus({
              type: 'err',
              msg: `BCS đang ở cách vị trí lớp ${Math.round(distance)}m, nằm ngoài phạm vi cho phép (${cfg.radius}m). Điểm danh hộ bị từ chối!`,
            });
            setIsSubmittingMonitor(false);
            return;
          }

          const today = localDateKey();
          const freshDay = getDayData(selectedLop, today);
          const targetStudent = rosterForMonitor.find(s => s.id === selectedProxyStudentId);
          const currentRec = freshDay.records[selectedProxyStudentId];

          if (currentRec && (currentRec.checkinSource === 'manual' || currentRec.lastUpdatedAction?.includes('GVCN'))) {
            setMonitorStatus({
              type: 'err',
              msg: `Giáo viên chủ nhiệm (GVCN) đã điểm danh cho học sinh ${targetStudent?.name} rồi. Ban Cán Sự không thể gửi ảnh điểm danh hộ nữa!`,
            });
            setIsSubmittingMonitor(false);
            return;
          }

          if (currentRec?.status === 'present' || currentRec?.status === 'late') {
            if (currentRec.checkinSource === 'gps') {
              setMonitorStatus({ type: 'err', msg: `Học sinh ${targetStudent?.name} đã tự điểm danh GPS có mặt hôm nay!` });
              setIsSubmittingMonitor(false);
              return;
            }
            setMonitorStatus({
              type: 'err',
              msg: `Học sinh ${targetStudent?.name} đã được điểm danh rồi. Ban Cán Sự không thể gửi thêm ảnh điểm danh hộ!`,
            });
            setIsSubmittingMonitor(false);
            return;
          }

          if (
            currentRec &&
            (currentRec.status === 'excused_pending' ||
              currentRec.status === 'excused_approved' ||
              currentRec.status === 'excused_rejected' ||
              currentRec.excuseReason)
          ) {
            setMonitorStatus({
              type: 'err',
              msg: `Học sinh ${targetStudent?.name} đã xin phép nghỉ học hôm nay. Chỉ có trạng thái Vắng có phép hoặc Vắng không phép theo duyệt của GVCN, không thể điểm danh có mặt!`,
            });
            setIsSubmittingMonitor(false);
            return;
          }

          const dupCheck = checkDuplicatePhotoInClass(selectedLop, today, selectedProxyStudentId, monitorPhotoPreview);
          if (dupCheck.isDuplicate) {
            setMonitorStatus({
              type: 'err',
              msg: `Cảnh báo gian lận ảnh: Ảnh này đã được sử dụng cho học sinh ${dupCheck.usedByStudentName} (${dupCheck.usedByStudentId})! Mỗi ảnh chụp chỉ được dùng cho 1 học sinh duy nhất. Vui lòng chụp ảnh mới riêng cho học sinh này!`,
            });
            setIsSubmittingMonitor(false);
            return;
          }

          const submitNow = Date.now();
          const capTime = monitorPhotoCaptureTime || format24hDateTime(exifCheck.captureDateTime || monitorPhotoFile.lastModified);

          freshDay.records[selectedProxyStudentId] = {
            name: targetStudent?.name || selectedProxyStudentId,
            status: 'proxy_pending',
            checkinSource: 'monitor_proxy',
            checkinTime: submitNow,
            distance,
            proxyPhoto: monitorPhotoPreview,
            proxyPhotoCaptureTime: capTime,
            excusePhoto: monitorPhotoPreview,
            excusePhotoCaptureTime: capTime,
            excuseSubmittedAt: submitNow,
            lastUpdatedByTeacherAt: submitNow,
            lastUpdatedAction: `BCS điểm danh hộ (${targetStudent?.name}) - Có mặt tạm thời (Cách lớp ~${Math.round(distance)}m, Chờ GVCN duyệt)`,
          };

          setDayData(selectedLop, today, freshDay);
          await syncSaveDayData(selectedLop, today, freshDay);

          setMonitorStatus({
            type: 'ok',
            msg: `Đã gửi điểm danh hộ thành công cho ${targetStudent?.name} (${selectedProxyStudentId}) kèm ảnh (Vị trí hợp lệ cách lớp ~${Math.round(distance)}m)! Vui lòng chờ GVCN duyệt.`
          });

          setMonitorPhotoFile(null);
          setMonitorPhotoPreview('');
          setMonitorPhotoCaptureTime('');
          setMonitorPhotoSubmitTime('');
          setSelectedProxyStudentId('');
        } catch (err: any) {
          setMonitorStatus({ type: 'err', msg: `Lỗi khi lưu: ${err?.message || err}` });
        } finally {
          setIsSubmittingMonitor(false);
        }
      },
      (err) => {
        setMonitorStatus({
          type: 'err',
          msg: `Không lấy được vị trí GPS của BCS: ${err.message}. Hãy cấp quyền vị trí cho trình duyệt và thử lại.`,
        });
        setIsSubmittingMonitor(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  // Class window info
  const [windowInfo, setWindowInfo] = useState<string>(
    'Chọn lớp và mã số học sinh ở trên để xem khung giờ điểm danh.'
  );

  useEffect(() => {
    const list = getLopList();
    setLopList(list);
    if (list.length > 0 && (!selectedLop || !list.includes(selectedLop))) {
      setSelectedLop(list[0]);
    }

    const handleStorageUpdate = () => {
      const freshList = getLopList();
      setLopList(freshList);
      if (freshList.length > 0 && (!selectedLop || !freshList.includes(selectedLop))) {
        setSelectedLop(freshList[0]);
      }
      updateInfoAndMatchStudent();
    };

    window.addEventListener('app_storage_updated', handleStorageUpdate);
    return () => {
      window.removeEventListener('app_storage_updated', handleStorageUpdate);
    };
  }, [selectedLop, studentId]);

  // Update window info & auto-match student name
  const updateInfoAndMatchStudent = () => {
    if (!selectedLop) {
      setWindowInfo(
        'Chọn lớp và mã số học sinh ở trên để xem khung giờ điểm danh.'
      );
      setExcuseHistory([]);
      return;
    }

    const cfg = getClassConfig(selectedLop);
    if (!cfg || cfg.lat === 0) {
      setWindowInfo(
        'Lớp này chưa được giáo viên cấu hình vị trí & khung giờ điểm danh.'
      );
    } else {
      const lateEndTime = addMinutesToTime(cfg.endTime, 10);
      setWindowInfo(
        `Khung giờ điểm danh đúng giờ: ${cfg.startTime} – ${cfg.endTime}. Điểm danh muộn: ${cfg.endTime} – ${lateEndTime} (+10 phút). Quá ${lateEndTime} tự động xác nhận Vắng không phép. Bán kính GPS ${cfg.radius}m áp dụng khi Học sinh tự điểm danh.`
      );
    }

    if (studentId.trim()) {
      const roster = getRoster(selectedLop);
      const match = roster.find(
        (s) => s.id.toLowerCase() === studentId.trim().toLowerCase()
      );
      if (match) {
        setStudentName(match.name);
      }
      loadExcuseHistory();
    } else {
      setExcuseHistory([]);
    }
  };

  const loadExcuseHistory = () => {
    const cleanId = studentId.trim();
    if (!selectedLop || !cleanId) {
      setExcuseHistory([]);
      return;
    }
    
    const slug = lopSlug(selectedLop);
    const prefix = `sc_${getSchoolId()}:day:${slug}:`;
    const history = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const dateStr = k.replace(prefix, '');
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            const dayData = JSON.parse(raw);
            const record = dayData.records[cleanId];
            if (record && ['excused_pending', 'excused_approved', 'excused_rejected'].includes(record.status)) {
              history.push({
                date: dateStr,
                status: record.status,
                reason: record.excuseReason || '',
                submittedAt: record.excuseSubmittedAt || 0,
                excuseDebtType: record.excuseDebtType || (record.excusePhoto ? 'has_paper' : 'owing_paper'),
                debtSupplementDeadline: record.debtSupplementDeadline || calculateSupplementDeadline(dateStr, getMaxLateDays()),
                excusePhoto: record.excusePhoto || null,
                excusePhotoCaptureTime: record.excusePhotoCaptureTime || null,
                lastUpdatedAction: record.lastUpdatedAction || '',
              });
            }
          } catch (e) {}
        }
      }
    }
    
    history.sort((a, b) => b.date.localeCompare(a.date));
    setExcuseHistory(history);
  };

  useEffect(() => {
    updateInfoAndMatchStudent();
  }, [selectedLop, studentId]);

  // Handle Check-in
  const handleCheckin = () => {
    const cleanId = studentId.trim();
    const cleanName = studentName.trim();

    if (!selectedLop || !cleanId) {
      setCheckinStatus({
        type: 'err',
        msg: 'Vui lòng chọn lớp và nhập mã số học sinh.',
      });
      return;
    }

    const cfg = getClassConfig(selectedLop);
    if (!cfg || cfg.lat === 0) {
      setCheckinStatus({
        type: 'err',
        msg: 'Lớp này chưa được giáo viên cấu hình điểm danh.',
      });
      return;
    }

    const today = localDateKey();
    const nowTime = localTimeKey();
    const lateEndTime = addMinutesToTime(cfg.endTime, 10);

    if (nowTime < cfg.startTime) {
      setCheckinStatus({
        type: 'err',
        msg: `Chưa đến giờ điểm danh — bắt đầu lúc ${cfg.startTime}.`,
      });
      return;
    }

    if (nowTime > lateEndTime) {
      setCheckinStatus({
        type: 'err',
        msg: `Đã quá 10 phút sau giờ kết thúc điểm danh (${cfg.endTime}, hạn cuối điểm danh muộn: ${lateEndTime}). Hệ thống tự động xác nhận Vắng không phép. Học sinh không thể điểm danh tự động được nữa.`,
      });
      return;
    }

    const day = getDayData(selectedLop, today);
    if (day.status === 'closed') {
      setCheckinStatus({
        type: 'err',
        msg: 'Giáo viên đã đóng điểm danh cho hôm nay.',
      });
      return;
    }

    if (day.records[cleanId]?.isLockedAbsent) {
      setCheckinStatus({
        type: 'err',
        msg: 'Bạn đã bị hệ thống KHÓA CỨNG VẮNG KHÔNG PHÉP do vi phạm gian lận điểm danh hộ! Trạng thái này là vĩnh viễn, không ai (kể cả GVCN hay BGH) có thể thay đổi được.',
      });
      return;
    }

    if (day.records[cleanId] && (day.records[cleanId].status === 'present' || day.records[cleanId].status === 'late')) {
      setCheckinStatus({
        type: 'err',
        msg: 'Bạn đã điểm danh thành công hôm nay rồi.',
      });
      return;
    }

    if (
      day.records[cleanId] &&
      (day.records[cleanId].status === 'excused_pending' ||
        day.records[cleanId].status === 'excused_approved' ||
        day.records[cleanId].status === 'excused_rejected' ||
        day.records[cleanId].excuseReason)
    ) {
      setCheckinStatus({
        type: 'err',
        msg: 'Bạn đã xin phép nghỉ học hôm nay. Trạng thái của bạn là Vắng (có phép hoặc không phép) do GVCN duyệt, không thể điểm danh có mặt.',
      });
      return;
    }

    if (!navigator.geolocation) {
      setCheckinStatus({
        type: 'err',
        msg: 'Trình duyệt của bạn không hỗ trợ định vị GPS.',
      });
      return;
    }

    setIsCheckingIn(true);

    setCheckinStatus({
      type: 'wait',
      msg: 'Đang xác định vị trí chính xác của bạn...',
    });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const distance = haversine(lat, lng, cfg.lat, cfg.lng);

          if (distance > cfg.radius) {
            setCheckinStatus({
              type: 'err',
              msg: `Bạn đang cách vị trí lớp ${Math.round(
                distance
              )}m, ngoài phạm vi cho phép (${cfg.radius}m).`,
            });
            setIsCheckingIn(false);
            return;
          }

          // Device fingerprint detection
          const fp = getDeviceFingerprint();
          const deviceUsageKey = `deviceUsage:${lopSlug(selectedLop)}:${today}`;
          const deviceUsage = sGet<Record<string, string>>(deviceUsageKey, {});

          // SEVERE FRAUD PENALTY: 1 device checking in for multiple students
          const prevStudentId = deviceUsage[fp];
          if (prevStudentId && prevStudentId.trim().toLowerCase() !== cleanId.toLowerCase()) {
            const freshDay = getDayData(selectedLop, today);
            const penaltyMsg = `Vi phạm nghiêm trọng: Dùng thiết bị vừa điểm danh cho học sinh ${prevStudentId} để điểm danh hộ gian lận`;

            freshDay.records[cleanId] = {
              name: cleanName || cleanId,
              status: 'absent',
              checkinSource: 'gps',
              checkinTime: Date.now(),
              distance,
              flagged: true,
              flagReason: `Thiết bị này vừa dùng để điểm danh cho học sinh ${prevStudentId} hôm nay — Gian lận điểm danh hộ`,
              isLockedAbsent: true,
              lockedPenaltyReason: penaltyMsg,
              lastUpdatedByTeacherAt: Date.now(),
              lastUpdatedAction: 'Hệ thống tự động KHÓA VẮNG KHÔNG PHÉP (Vi phạm: Trùng thiết bị điểm danh hộ)',
            };
            setDayData(selectedLop, today, freshDay);
            syncSaveDayData(selectedLop, today, freshDay);
            syncAppendClassLog(selectedLop, {
              actorRole: 'student',
              actorName: cleanName || cleanId,
              actorId: cleanId,
              actionTitle: `HỆ THỐNG KHÓA VẮNG KHÔNG PHÉP: ${cleanName} (${cleanId})`,
              details: `Phát hiện dùng 1 máy điểm danh nhiều bạn (máy vừa điểm danh cho ${prevStudentId}). Khóa cứng VẮNG KHÔNG PHÉP theo quy chế răn đe, không ai có thể thay đổi.`,
            });

            setCheckinStatus({
              type: 'err',
              msg: `CẢNH BÁO VI PHẠM GIAN LẬN: Thiết bị này vừa dùng để điểm danh cho học sinh ${prevStudentId} hôm nay! Theo quy chế răn đe gian lận điểm danh, hệ thống tự động xử phạt VẮNG KHÔNG PHÉP và KHÓA CỨNG hôm nay. Không ai (kể cả GVCN hay BGH) có thể thay đổi trạng thái này!`,
            });
            setIsCheckingIn(false);
            return;
          }

          let flagged = false;
          let flagReason = '';

          const historyKey = `deviceHistory:${cleanId}`;
          const history = sGet<string[]>(historyKey, []);
          if (history.length > 0 && !history.includes(fp)) {
            flagged = true;
            flagReason =
              'Học sinh điểm danh từ một thiết bị khác với các lần trước.';
          }
          if (!history.includes(fp)) {
            history.push(fp);
            sSet(historyKey, history.slice(-5));
          }

          deviceUsage[fp] = cleanId;
          sSet(deviceUsageKey, deviceUsage);

          const freshDay = getDayData(selectedLop, today);
          const isLate = nowTime > cfg.endTime;
          const attStatus: AttendanceStatus = isLate ? 'late' : 'present';

          freshDay.records[cleanId] = {
            name: cleanName || cleanId,
            status: attStatus,
            checkinSource: 'gps',
            checkinTime: Date.now(),
            distance,
            flagged,
            flagReason,
          };
          setDayData(selectedLop, today, freshDay);
          syncSaveDayData(selectedLop, today, freshDay);

          if (flagged) {
            setCheckinStatus({
              type: 'flag',
              msg: isLate
                ? `Đã ghi nhận ĐI MUỘN (quá giờ ${cfg.endTime}), cần giáo viên xác minh: ${flagReason}`
                : `Đã ghi nhận điểm danh CÓ MẶT ĐÚNG GIỜ, cần giáo viên xác minh: ${flagReason}`,
            });
          } else {
            setCheckinStatus({
              type: 'ok',
              msg: isLate
                ? `Điểm danh thành công lúc ${fmtTime(Date.now())}. Do quá giờ kết thúc (${cfg.endTime}), bạn bị ghi nhận ĐI MUỘN (khung giờ cho phép +10 phút đến ${lateEndTime}). Cách lớp ${Math.round(distance)}m.`
                : `Điểm danh CÓ MẶT ĐÚNG GIỜ thành công lúc ${fmtTime(Date.now())}. Cách lớp ${Math.round(distance)}m.`,
            });
          }
        } catch (e: any) {
          setCheckinStatus({
            type: 'err',
            msg: `Có lỗi khi ghi nhận điểm danh: ${e?.message || e}`,
          });
        } finally {
          setIsCheckingIn(false);
        }
      },
      (err) => {
        setCheckinStatus({
          type: 'err',
          msg: `Không lấy được vị trí GPS: ${err.message}. Hãy cấp quyền vị trí cho trình duyệt và thử lại.`,
        });
        setIsCheckingIn(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  // Handle Sending Excuse
  const handleSendExcuse = async () => {
    const cleanId = studentId.trim();
    const cleanName = studentName.trim();
    const cleanReason = excuseReason.trim();

    if (!selectedLop || !cleanId || !excuseDate || !cleanReason) {
      setExcuseStatus({
        type: 'err',
        msg: 'Vui lòng điền đủ thông tin: Lớp, Mã số học sinh, Ngày nghỉ và Lý do.',
      });
      return;
    }

    if (excuseDebtType === 'has_paper' && !excusePhotoFile) {
      setExcuseStatus({
        type: 'err',
        msg: 'Bạn đang chọn diện "Có đơn". Vui lòng chụp hoặc tải ảnh minh chứng đơn xin phép!',
      });
      return;
    }

    // Check if excuse date is in the past or if today's attendance window has passed
    const today = localDateKey();
    const nowTime = localTimeKey();
    const cfg = getClassConfig(selectedLop);

    if (excuseDate < today) {
      setExcuseStatus({
        type: 'err',
        msg: `Ngày ${fmtDateVN(excuseDate)} đã qua. Hệ thống đã tự động chốt Vắng không phép. Học sinh không thể tự gửi đơn hoặc nợ đơn sau ngày nghỉ để tránh ngụy tạo chuyển từ Vắng không phép sang Có phép.`,
      });
      return;
    }

    if (excuseDate === today && cfg?.endTime && nowTime > cfg.endTime) {
      setExcuseStatus({
        type: 'err',
        msg: `Đã hết khung giờ điểm danh hôm nay (kết thúc lúc ${cfg.endTime}). Hệ thống đã tự động chuyển trạng thái sang Vắng không phép. Học sinh không thể tự gửi đơn hoặc nợ đơn sau giờ điểm danh để tránh ngụy tạo chuyển từ Vắng không phép sang Có phép.`,
      });
      return;
    }

    const day = getDayData(selectedLop, excuseDate);
    if (day.records[cleanId]?.isLockedAbsent) {
      setExcuseStatus({
        type: 'err',
        msg: 'Bạn đã bị hệ thống KHÓA CỨNG VẮNG KHÔNG PHÉP do vi phạm gian lận điểm danh! Không thể nộp đơn xin phép để thay đổi trạng thái này.',
      });
      return;
    }

    if (day.records[cleanId] && day.records[cleanId].status === 'present') {
      setExcuseStatus({
        type: 'err',
        msg: 'Bạn đã có mặt vào ngày này, không cần gửi đơn xin phép.',
      });
      return;
    }

    setIsSendingExcuse(true);
    setExcuseStatus({
      type: 'wait',
      msg: 'Đang xử lý và gửi đơn...',
    });

    try {
      let photoDataUrl: string | null = null;
      let photoCaptureTime: string | null = null;
      if (excusePhotoFile) {
        photoDataUrl = await fileToCompressedDataURL(excusePhotoFile);
        photoCaptureTime = await getSafePhotoCaptureTime(excusePhotoFile);

        const dupCheck = checkDuplicatePhotoInClass(selectedLop, excuseDate, cleanId, photoDataUrl);
        if (dupCheck.isDuplicate) {
          setExcuseStatus({
            type: 'err',
            msg: `Cảnh báo gian lận ảnh: Ảnh xin phép này đã được sử dụng cho học sinh ${dupCheck.usedByStudentName} (${dupCheck.usedByStudentId})! Mỗi ảnh chụp chỉ được dùng cho 1 học sinh duy nhất. Vui lòng chụp/tải ảnh đơn riêng của bạn!`,
          });
          setIsSendingExcuse(false);
          return;
        }
      }

      const maxDays = getMaxLateDays();
      const supplementDeadline = calculateSupplementDeadline(excuseDate, maxDays);
      const freshDay = getDayData(selectedLop, excuseDate);
      freshDay.records[cleanId] = {
        name: cleanName || cleanId,
        status: 'excused_pending',
        excuseReason: cleanReason,
        excusePhoto: photoDataUrl,
        excusePhotoCaptureTime: photoCaptureTime,
        excuseSubmittedAt: Date.now(),
        isLateExcuse: false,
        excuseDebtType: excuseDebtType,
        debtSupplementDeadline: supplementDeadline,
        lastUpdatedAction: excuseDebtType === 'owing_paper'
          ? `Học sinh gửi đơn diện Nợ đơn (Hạn BGH: ${supplementDeadline})`
          : `Học sinh gửi đơn kèm ảnh minh chứng`,
      };
      setDayData(selectedLop, excuseDate, freshDay);
      await syncSaveDayData(selectedLop, excuseDate, freshDay);

      setExcuseStatus({
        type: 'ok',
        msg: excuseDebtType === 'owing_paper'
          ? `Đã gửi đơn xin nghỉ theo diện [NỢ ĐƠN] thành công cho ngày ${fmtDateVN(excuseDate)}. Hạn chót bổ sung ảnh đơn theo quy định BGH: ${supplementDeadline}. Bạn có thể bổ sung ảnh sau ở mục Lịch sử đơn.`
          : 'Đã gửi đơn xin phép nghỉ thành công kèm ảnh minh chứng. Vui lòng chờ giáo viên xem và duyệt.',
      });
      setExcuseReason('');
      setExcusePhotoFile(null);
      setExcusePhotoPreview('');
      setExcusePhotoCaptureTime('');
      setExcusePhotoSubmitTime('');
      if (excusePhotoInputRef.current) excusePhotoInputRef.current.value = '';
      loadExcuseHistory();
    } catch (e: any) {
      setExcuseStatus({
        type: 'err',
        msg: `Không gửi được đơn: ${e?.message || e}`,
      });
    } finally {
      setIsSendingExcuse(false);
    }
  };

  // Open supplement modal or trigger upload for specific date
  const handleOpenSupplementModal = (targetDate: string) => {
    setSupplementModalDate(targetDate);
    setSupplementFile(null);
    setSupplementPreview('');
    setSupplementCaptureTime('');
  };

  const handleSupplementFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSupplementFile(file);
    try {
      const compressed = await fileToCompressedDataURL(file);
      setSupplementPreview(compressed);
      const cap = await getSafePhotoCaptureTime(file);
      setSupplementCaptureTime(cap);
    } catch (err) {
      setSupplementCaptureTime(format24hDateTime(file.lastModified));
    }
  };

  const handleConfirmSupplementPhoto = async () => {
    if (!supplementModalDate || !selectedLop || !studentId.trim() || !supplementFile) {
      alert('Vui lòng chọn ảnh đơn minh chứng để tải lên!');
      return;
    }
    const cleanId = studentId.trim();
    setIsSubmittingSupplement(true);

    try {
      const captureTime = supplementCaptureTime || format24hDateTime(supplementFile.lastModified);
      const compressedDataUrl = supplementPreview || (await fileToCompressedDataURL(supplementFile));

      const dupCheck = checkDuplicatePhotoInClass(selectedLop, supplementModalDate, cleanId, compressedDataUrl);
      if (dupCheck.isDuplicate) {
        alert(`Cảnh báo gian lận ảnh: Ảnh này đã được sử dụng cho học sinh ${dupCheck.usedByStudentName} (${dupCheck.usedByStudentId})! Mỗi ảnh chụp chỉ được dùng cho 1 học sinh duy nhất. Vui lòng tải ảnh chụp đơn riêng!`);
        setIsSubmittingSupplement(false);
        return;
      }

      const freshDay = getDayData(selectedLop, supplementModalDate);
      const rec = freshDay.records[cleanId];
      if (rec?.isLockedAbsent) {
        alert('Học sinh đang bị kỷ luật Khóa Vắng không phép do gian lận điểm danh thiết bị. Không thể gửi hoặc bổ sung đơn nghỉ!');
        setIsSubmittingSupplement(false);
        return;
      }
      if (rec) {
        rec.excusePhoto = compressedDataUrl;
        rec.excusePhotoCaptureTime = captureTime;
        rec.excuseDebtType = 'has_paper';
        rec.lastUpdatedByTeacherAt = Date.now();
        rec.lastUpdatedAction = `Học sinh đã bổ sung ảnh đơn nợ cho ngày ${fmtDateVN(supplementModalDate)} (Chụp: ${captureTime})`;

        setDayData(selectedLop, supplementModalDate, freshDay);
        await syncSaveDayData(selectedLop, supplementModalDate, freshDay);
        syncAppendClassLog(selectedLop, {
          actorRole: 'student',
          actorName: rec.name,
          actorId: cleanId,
          actionTitle: `Bổ sung ảnh đơn nợ: ${rec.name} (${fmtDateVN(supplementModalDate)})`,
          details: `Học sinh đã tải ảnh chụp đơn lên hệ thống hoàn tất nợ đơn (Giờ chụp EXIF 24h: ${captureTime})`,
          photo: compressedDataUrl,
          photoCaptureTime: captureTime,
        });
      }

      const completedDate = supplementModalDate;
      setSupplementModalDate(null);
      setSupplementFile(null);
      setSupplementPreview('');
      setSupplementCaptureTime('');
      loadExcuseHistory();
      setExcuseStatus({
        type: 'ok',
        msg: `Đã bổ sung ảnh đơn thành công cho ngày ${fmtDateVN(completedDate)}! Hệ thống đã ghi nhận đầy đủ minh chứng.`,
      });
    } catch (err: any) {
      alert(`Lỗi khi tải ảnh bổ sung: ${err?.message || err}`);
    } finally {
      setIsSubmittingSupplement(false);
    }
  };

  // Handle student directly supplementing debt photo
  const handleStudentSupplementDebtPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedLop || !studentId.trim()) return;
    const cleanId = studentId.trim();
    const today = localDateKey();

    try {
      setCheckinStatus({ type: 'wait', msg: 'Đang xử lý và trích xuất EXIF ảnh đơn bổ sung...' });
      const captureTime = await getSafePhotoCaptureTime(file);

      const compressedDataUrl = await fileToCompressedDataURL(file);

      const dupCheck = checkDuplicatePhotoInClass(selectedLop, today, cleanId, compressedDataUrl);
      if (dupCheck.isDuplicate) {
        setCheckinStatus({
          type: 'err',
          msg: `Cảnh báo gian lận ảnh: Ảnh này đã được sử dụng cho học sinh ${dupCheck.usedByStudentName} (${dupCheck.usedByStudentId})! Mỗi ảnh chụp chỉ được dùng cho 1 học sinh duy nhất. Vui lòng chụp/tải ảnh đơn riêng của bạn!`,
        });
        return;
      }

      const freshDay = getDayData(selectedLop, today);
      const rec = freshDay.records[cleanId];
      if (!rec) return;
      if (rec.isLockedAbsent) {
        setCheckinStatus({
          type: 'err',
          msg: 'Bạn đang bị kỷ luật Khóa Vắng không phép do gian lận thiết bị điểm danh. Không thể bổ sung đơn hoặc thay đổi trạng thái!',
        });
        return;
      }

      rec.excusePhoto = compressedDataUrl;
      rec.excusePhotoCaptureTime = captureTime;
      rec.excuseDebtType = 'has_paper';
      rec.status = 'excused_approved';
      rec.lastUpdatedByTeacherAt = Date.now();
      rec.lastUpdatedAction = 'Học sinh đã tự tải ảnh bổ sung đơn xin nghỉ (Hoàn tất nợ đơn)';

      setDayData(selectedLop, today, freshDay);
      await syncSaveDayData(selectedLop, today, freshDay);
      syncAppendClassLog(selectedLop, {
        actorRole: 'student',
        actorName: rec.name,
        actorId: cleanId,
        actionTitle: `Bổ sung ảnh đơn xin nghỉ: Đã có đơn (${rec.name})`,
        details: `Học sinh đã tải ảnh chụp đơn lên hệ thống hoàn thành nợ đơn (Giờ chụp EXIF: ${captureTime})`,
      });

      setCheckinStatus({
        type: 'ok',
        msg: `Đã bổ sung ảnh đơn thành công! Hệ thống xác nhận bạn "Vắng có phép (Đã có đơn)".`
      });
      loadExcuseHistory();
    } catch (err: any) {
      setCheckinStatus({ type: 'err', msg: 'Lỗi tải ảnh đơn bổ sung: ' + (err?.message || err) });
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Card 1: Thông tin học sinh */}
      <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-5 sm:p-6 shadow-xs">
        <h2 className="text-base font-bold text-[#1B241F] mb-4 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-[#3E7C6B]" />
          Thông tin của bạn
        </h2>

        <div className="space-y-3.5">
          <div>
            <label
              htmlFor="studentLopSelect"
              className="block text-xs font-semibold text-[#1B241F] uppercase tracking-wider mb-1"
            >
              Lớp của bạn
            </label>
            <select
              id="studentLopSelect"
              value={selectedLop}
              onChange={(e) => setSelectedLop(e.target.value)}
              className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-lg px-3 py-2 text-sm text-[#1B241F] font-medium focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
            >
              {lopList.length === 0 ? (
                <option value="">-- Chưa có lớp nào --</option>
              ) : (
                lopList.map((l) => (
                  <option key={l} value={l}>
                    Lớp {l}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label
              htmlFor="studentIdInput"
              className="block text-xs font-semibold text-[#1B241F] uppercase tracking-wider mb-1"
            >
              Mã số học sinh (MSHS)
            </label>
            <input
              id="studentIdInput"
              type="text"
              placeholder="Vd: 1001"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-lg px-3 py-2 text-sm text-[#1B241F] font-medium focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
            />
          </div>

          <div>
            <label
              htmlFor="studentNameInput"
              className="block text-xs font-semibold text-[#1B241F] uppercase tracking-wider mb-1"
            >
              Họ tên học sinh
            </label>
            <input
              id="studentNameInput"
              type="text"
              placeholder="Họ và tên (sẽ tự điền khi nhập MSHS đúng)"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-lg px-3 py-2 text-sm text-[#1B241F] font-medium focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
            />
          </div>
        </div>
      </div>

      {/* Card 2: Điểm danh hôm nay */}
      <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-5 sm:p-6 shadow-xs">
        <h2 className="text-base font-bold text-[#1B241F] mb-1 flex items-center gap-2">
          <Navigation className="w-4 h-4 text-[#3E7C6B]" />
          Điểm danh hôm nay
        </h2>
        <div
          id="studentWindowInfo"
          className="text-xs sm:text-sm text-[#5B6A61] mb-4 leading-relaxed"
        >
          {windowInfo}
        </div>

        {/* Kiểm tra các trạng thái đặc biệt: Khóa Vắng KP gian lận / Đã có đơn phép / Có mặt tạm thời (BCS) / Nợ đơn */}
        {(() => {
          const todayK = localDateKey();
          const todayD = selectedLop && studentId.trim() ? getDayData(selectedLop, todayK) : null;
          const todayR = todayD && studentId.trim() ? todayD.records[studentId.trim()] : null;

          // TH0: KỶ LUẬT KHÓA CỨNG VẮNG KHÔNG PHÉP DO DÙNG CHUNG THIẾT BỊ ĐIỂM DANH HỘ
          if (todayR?.isLockedAbsent) {
            return (
              <div className="p-4 bg-red-100 border-2 border-red-600 rounded-xl space-y-3 text-center shadow-xs">
                <div className="flex items-center justify-center gap-2 text-red-950 font-black text-sm">
                  <ShieldAlert className="w-5 h-5 text-red-600 animate-pulse" />
                  <span>KỶ LUẬT: KHÓA VẮNG KHÔNG PHÉP DO GIAN LẬN THIẾT BỊ</span>
                </div>
                <p className="text-xs text-red-900 leading-relaxed font-semibold">
                  Hệ thống phát hiện thiết bị này đã được sử dụng để điểm danh cho học sinh khác hôm nay.
                  <br />
                  Theo quy chế răn đe gian lận điểm danh: <b>Bạn bị mặc định VẮNG KHÔNG PHÉP hôm nay</b>.
                </p>
                <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-left text-[11px] text-red-900 space-y-1.5">
                  <div><b>• Lý do kỷ luật:</b> {todayR.lockedPenaltyReason || 'Dùng chung thiết bị điểm danh nhiều học sinh (Gian lận điểm danh hộ)'}</div>
                  <div><b>• Mức phạt:</b> Khóa cứng trạng thái Vắng không phép, gửi báo cáo vi phạm trực tiếp lên BGH & GVCN.</div>
                  <div className="pt-1 border-t border-red-200 text-red-700 font-bold">
                    ⚖️ <u>Quy chế răn đe nghiêm ngặt:</u> Trạng thái này <b>KHÔNG AI CÓ THỂ THAY ĐỔI ĐƯỢC</b> (kể cả Ban Giám Hiệu hay Giáo viên chủ nhiệm).
                  </div>
                </div>
              </div>
            );
          }

          // TH1: Ban Cán Sự đã điểm danh xác nhận có mặt hộ kèm ảnh -> Có mặt (BCS xác nhận)
          if (todayR?.status === 'proxy_pending') {
            return (
              <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl space-y-2 text-center">
                <div className="flex items-center justify-center gap-2 text-emerald-950 font-extrabold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>✓ Có mặt (Ban Cán Sự xác nhận có mặt hộ)</span>
                </div>
                <p className="text-xs text-emerald-900 leading-relaxed font-medium">
                  Bạn đã được Ban Cán Sự lớp xác nhận <b>CÓ MẶT</b> kèm ảnh chụp trực tiếp tại lớp lúc <b>{fmtTime(todayR.checkinTime || Date.now())}</b> (dành cho học sinh không mang điện thoại).
                  <br />
                  Hệ thống ghi nhận bạn <b>Có mặt (BCS xác nhận)</b> và chờ GVCN xem ảnh để xác nhận duyệt lần cuối.
                </p>
                {todayR.proxyPhoto && (
                  <div className="pt-1">
                    <span className="text-[11px] font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                      Giờ chụp EXIF: {todayR.proxyPhotoCaptureTime || 'Đã ghi nhận'}
                    </span>
                  </div>
                )}
              </div>
            );
          }

          // TH2: Vắng có phép diện NỢ ĐƠN -> Hiện thông báo và nút tải ảnh bổ sung
          if (todayR?.excuseDebtType === 'owing_paper') {
            return (
              <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-2.5 text-center">
                <div className="flex items-center justify-center gap-2 text-amber-900 font-extrabold text-sm">
                  <FileText className="w-4 h-4 text-amber-700" />
                  <span>Bạn đang trong diện Vắng có phép (NỢ ĐƠN)</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  Hạn chót bổ sung ảnh đơn theo quy định của BGH: <b>{todayR.debtSupplementDeadline || calculateSupplementDeadline(todayK, getMaxLateDays())}</b>.
                  <br />
                  Vui lòng chụp và tải ảnh đơn xin nghỉ phép lên đây để hoàn tất nghĩa vụ nợ đơn:
                </p>
                <div className="pt-1">
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors">
                    <Upload className="w-4 h-4" />
                    <span>📤 Chụp / Tải ảnh bổ sung đơn ngay</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleStudentSupplementDebtPhoto}
                    />
                  </label>
                </div>
              </div>
            );
          }

          // TH3: Đã xin phép nghỉ học
          const hasExcuse = Boolean(
            todayR && (
              todayR.excuseReason ||
              todayR.status === 'excused_pending' ||
              todayR.status === 'excused_approved' ||
              todayR.status === 'excused_rejected'
            )
          );

          if (hasExcuse) {
            return (
              <div className="p-4 bg-[#F5E6D0]/80 border border-[#C98A3B]/40 rounded-xl space-y-1.5 text-center">
                <div className="flex items-center justify-center gap-2 text-[#7A521E] font-extrabold text-sm">
                  <FileText className="w-4 h-4 text-[#7A521E]" />
                  <span>Bạn đã xin phép nghỉ học hôm nay</span>
                </div>
                <p className="text-xs text-[#5B6A61] leading-relaxed">
                  Hệ thống không mở nút điểm danh có mặt cho bạn nữa. Trạng thái hôm nay được quản lý giữa <b>Vắng có phép</b> hoặc <b>Vắng không phép</b> theo phê duyệt của GVCN.
                </p>
              </div>
            );
          }

          // TH4: Đã qua giờ điểm danh hôm nay mà chưa điểm danh và chưa có đơn xin phép
          const cfg = selectedLop ? getClassConfig(selectedLop) : null;
          const nowK = localTimeKey();
          if (cfg?.endTime) {
            const lateEndTime = addMinutesToTime(cfg.endTime, 10);
            if (nowK > lateEndTime && (!todayR || todayR.status === 'none' || todayR.status === 'absent')) {
              return (
                <div className="p-4 bg-red-50 border-2 border-red-300 rounded-xl space-y-1.5 text-center">
                  <div className="flex items-center justify-center gap-2 text-red-900 font-extrabold text-sm">
                    <XCircle className="w-4 h-4 text-red-600" />
                    <span>Vắng không phép (Tự động xác nhận do quá 10 phút sau khi kết thúc điểm danh)</span>
                  </div>
                  <p className="text-xs text-red-800 leading-relaxed font-medium">
                    Khung giờ điểm danh đúng giờ kết thúc lúc <b>{cfg.endTime}</b> và khung đi muộn kết thúc lúc <b>{lateEndTime}</b> (+10 phút). Hệ thống đã tự động ghi nhận trạng thái <b>Vắng không phép</b>. Học sinh không thể tự điểm danh hay gửi đơn nữa, nhưng GVCN có thể trực tiếp điều chỉnh sang Vắng có phép / Nợ đơn nếu có lý do chính đáng.
                  </p>
                </div>
              );
            }
          }

          return (
            <button
              id="btnStudentCheckin"
              type="button"
              disabled={isCheckingIn}
              onClick={handleCheckin}
              className="w-full inline-flex items-center justify-center gap-2 bg-[#1F3B32] text-[#F4F0E4] hover:bg-[#274A3E] py-3 px-6 rounded-xl font-bold text-sm sm:text-base shadow-sm transition-all duration-150 cursor-pointer disabled:opacity-50"
            >
              <MapPin
                className={`w-5 h-5 ${isCheckingIn ? 'animate-bounce' : ''}`}
              />
              {isCheckingIn ? 'Đang kiểm tra vị trí GPS...' : 'Điểm danh ngay'}
            </button>
          );
        })()}

        <div
          id="studentCheckinStatus"
          className={`mt-4 p-3.5 rounded-xl text-xs sm:text-sm font-semibold leading-relaxed transition-all ${
            checkinStatus.type === 'ok'
              ? 'bg-[#E1EEE8] text-[#245346] border border-[#3E7C6B]/20'
              : checkinStatus.type === 'flag'
              ? 'bg-[#F5E6D0] text-[#7A521E] border border-[#C98A3B]/30'
              : checkinStatus.type === 'err'
              ? 'bg-[#F5DED5] text-[#7A3115] border border-[#B3492F]/30'
              : 'bg-[#EEF1EC] text-[#5B6A61]'
          }`}
        >
          <div className="flex items-start gap-2">
            {checkinStatus.type === 'ok' && (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            {checkinStatus.type === 'flag' && (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            {checkinStatus.type === 'err' && (
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            {checkinStatus.type === 'wait' && (
              <Clock className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{checkinStatus.msg}</span>
          </div>
        </div>
      </div>

      {/* Cảnh báo nợ đơn (nếu học sinh có đơn nợ chưa bổ sung ảnh) */}
      {selectedLop && studentId.trim() && (() => {
        const owingList = excuseHistory.filter((h) => h.excuseDebtType === 'owing_paper' && !h.excusePhoto);
        if (owingList.length === 0) return null;
        return (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-xs">
                ⏳
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-extrabold text-amber-950 flex items-center gap-2">
                  <span>Thông báo: Bạn đang có {owingList.length} ngày NỢ ĐƠN cần bổ sung ảnh!</span>
                </h3>
                <p className="text-xs text-amber-800 mt-1">
                  Theo quy định của Ban Giám Hiệu, học sinh xin phép diện <b>Nợ đơn</b> cần nộp bổ sung ảnh chụp đơn/giấy khám trong thời hạn cho phép. Vui lòng bấm vào nút dưới đây để tải ảnh bổ sung:
                </p>
              </div>
            </div>
            <div className="space-y-2 pt-1">
              {owingList.map((item) => (
                <div
                  key={item.date}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-amber-300 shadow-2xs"
                >
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-[#1B241F] flex items-center gap-2">
                      <span>📅 Ngày nghỉ: {fmtDateVN(item.date)}</span>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                        ⏳ Nợ đơn
                      </span>
                    </div>
                    <div className="text-[11px] text-[#5B6A61]">
                      Lý do: <span className="italic">{item.reason}</span>
                    </div>
                    <div className="text-[11px] text-amber-900 font-medium">
                      ⏰ Hạn chót BGH: <b className="text-amber-950 font-bold">{item.debtSupplementDeadline}</b>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenSupplementModal(item.date)}
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer shadow-xs"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>📤 Bổ sung ảnh đơn ngay</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Card 3: Xin phép nghỉ */}
      <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-5 sm:p-6 shadow-xs">
        <h2 className="text-base font-bold text-[#1B241F] mb-1 flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#3E7C6B]" />
          Xin phép nghỉ
        </h2>
        <p className="text-xs sm:text-sm text-[#5B6A61] mb-2">
          Dùng mục này nếu bạn vắng mặt và có lý do — hỗ trợ gửi kèm ảnh chụp đơn ngay hoặc chọn diện <b>Nợ đơn</b> để bổ sung ảnh sau theo quy định BGH.
        </p>

        {selectedLop && (
          <div className="mb-4 space-y-1.5">
            {getClassConfig(selectedLop)?.excuseDeadline && (
              <div className="text-[11px] bg-[#E1EEE8] text-[#245346] px-3 py-1.5 rounded-lg border border-[#3E7C6B]/20 font-medium">
                ⏰ <span className="font-bold">Duyệt trong ngày:</span> Trước {getClassConfig(selectedLop)?.excuseDeadline || '17:00'}.
              </div>
            )}
            <div className="text-[11px] bg-[#F7F6F0] text-[#5B6A61] px-3 py-1.5 rounded-lg border border-[#D7DCCB] font-medium">
              ℹ️ <span className="font-bold text-[#1B241F]">Quy định nộp bù của BGH:</span> Cho phép nộp đơn bổ sung trong vòng <b className="text-[#245346]">{getMaxLateDays()} ngày</b> kể từ ngày nghỉ (kèm ảnh minh chứng).
            </div>
          </div>
        )}

        <div className="space-y-3.5">
          {/* Lựa chọn diện Có đơn vs Nợ đơn */}
          <div>
            <label className="block text-xs font-bold text-[#1B241F] uppercase tracking-wider mb-1.5">
              Hình thức gửi đơn:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1.5 bg-[#EEF1EC] rounded-xl border border-[#D7DCCB]">
              <button
                type="button"
                onClick={() => setExcuseDebtType('has_paper')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  excuseDebtType === 'has_paper'
                    ? 'bg-[#1F3B32] text-white shadow-xs'
                    : 'text-[#5B6A61] hover:text-[#1B241F]'
                }`}
              >
                <span>📄 Có đơn</span>
                <span className="text-[10px] font-normal opacity-90">(Tải ảnh minh chứng ngay)</span>
              </button>
              <button
                type="button"
                onClick={() => setExcuseDebtType('owing_paper')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  excuseDebtType === 'owing_paper'
                    ? 'bg-amber-700 text-white shadow-xs'
                    : 'text-[#5B6A61] hover:text-[#1B241F]'
                }`}
              >
                <span>⏳ Nợ đơn</span>
                <span className="text-[10px] font-normal opacity-90">(Bổ sung ảnh đơn sau)</span>
              </button>
            </div>
          </div>

          {excuseDebtType === 'owing_paper' && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl space-y-1.5 text-xs text-amber-950">
              <div className="font-extrabold flex items-center gap-1.5 text-amber-900">
                <span>⏳ Bạn đang chọn diện NỢ ĐƠN XIN NGHỈ:</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Ban Giám Hiệu cho phép học sinh nợ đơn và cần bổ sung ảnh chụp minh chứng trong vòng <b>{getMaxLateDays()} ngày</b>.
              </p>
              <div className="bg-amber-100/90 text-amber-950 p-2.5 rounded-lg border border-amber-300 font-semibold text-[11px]">
                📅 Hạn chót bổ sung ảnh đơn cho ngày <b>{fmtDateVN(excuseDate)}</b>: <b className="underline text-amber-900">{calculateSupplementDeadline(excuseDate, getMaxLateDays())}</b>
              </div>
              <p className="text-[10px] text-amber-700 italic">
                * Không bắt buộc phải tải ảnh ngay. Sau khi gửi, bạn có thể tải bổ sung ảnh trong phần "Kết quả duyệt đơn" hoặc khung thông báo nợ đơn.
              </p>
            </div>
          )}

          <div>
            <label
              htmlFor="excuseDateInput"
              className="block text-xs font-semibold text-[#1B241F] uppercase tracking-wider mb-1"
            >
              Ngày xin nghỉ
            </label>
            <input
              id="excuseDateInput"
              type="date"
              value={excuseDate}
              onChange={(e) => setExcuseDate(e.target.value)}
              className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-lg px-3 py-2 text-sm text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
            />
          </div>

          {/* Cảnh báo hết giờ điểm danh/khóa gửi đơn sau giờ */}
          {(() => {
            const todayK = localDateKey();
            const nowK = localTimeKey();
            const cfg = selectedLop ? getClassConfig(selectedLop) : null;
            const isExpiredExcuseDate = excuseDate < todayK || (excuseDate === todayK && cfg?.endTime && nowK > cfg.endTime);

            if (isExpiredExcuseDate) {
              return (
                <div className="p-3.5 bg-red-50 border-2 border-red-300 rounded-xl space-y-1 text-xs text-red-900">
                  <div className="font-extrabold flex items-center gap-1.5 text-red-800">
                    <XCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>Khung giờ điểm danh cho ngày {fmtDateVN(excuseDate)} đã kết thúc ({excuseDate === todayK ? `lúc ${cfg?.endTime}` : 'ngày đã qua'}).</span>
                  </div>
                  <p className="text-[11px] text-red-800 leading-relaxed">
                    Hệ thống đã tự động chuyển trạng thái sang <b>Vắng không phép</b>. Học sinh không thể tự gửi đơn hoặc nợ đơn sau khung giờ này nhằm chống ngụy tạo chuyển từ Vắng không phép sang Có phép.
                  </p>
                </div>
              );
            }
            return null;
          })()}

          <div>
            <label
              htmlFor="excuseReasonInput"
              className="block text-xs font-semibold text-[#1B241F] uppercase tracking-wider mb-1"
            >
              Lý do xin nghỉ
            </label>
            <textarea
              id="excuseReasonInput"
              rows={3}
              placeholder="Vd: Bị ốm sốt cao, có giấy khám của bác sĩ..."
              value={excuseReason}
              onChange={(e) => setExcuseReason(e.target.value)}
              className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-lg p-3 text-sm text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
            />
          </div>

          <div>
            <label
              htmlFor="excusePhotoInput"
              className="block text-xs font-semibold text-[#1B241F] uppercase tracking-wider mb-1"
            >
              {excuseDebtType === 'has_paper' ? (
                <span>Ảnh chụp đơn xin phép / Giấy tờ <b className="text-red-600">(Bắt buộc kèm ảnh)</b></span>
              ) : (
                <span>Ảnh chụp đơn xin phép / Giấy tờ <span className="text-amber-700 font-normal">(Không bắt buộc ngay - có thể bổ sung sau)</span></span>
              )}
            </label>
            <input
              ref={excusePhotoInputRef}
              id="excusePhotoInput"
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0] || null;
                setExcusePhotoFile(file);
                if (!file) {
                  setExcusePhotoPreview('');
                  setExcusePhotoCaptureTime('');
                  setExcusePhotoSubmitTime('');
                  return;
                }
                try {
                  const compressed = await fileToCompressedDataURL(file);
                  setExcusePhotoPreview(compressed);
                  const capTime = await getSafePhotoCaptureTime(file);
                  const subTime = format24hDateTime(Date.now());
                  setExcusePhotoCaptureTime(capTime);
                  setExcusePhotoSubmitTime(subTime);
                } catch (err) {
                  setExcusePhotoCaptureTime(format24hDateTime(file.lastModified));
                  setExcusePhotoSubmitTime(format24hDateTime(Date.now()));
                }
              }}
              className="text-xs text-[#5B6A61] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#1F3B32] file:text-[#F4F0E4] hover:file:bg-[#274A3E] cursor-pointer"
            />
            {excusePhotoPreview && (
              <div className="mt-3 p-3 bg-white border border-[#D7DCCB] rounded-xl space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="relative w-28 h-28 rounded-lg overflow-hidden border border-[#3E7C6B] shadow-xs shrink-0">
                    <img src={excusePhotoPreview} alt="Xem trước đơn" className="w-full h-full object-cover" />
                  </div>
                  <div className="space-y-1.5 text-xs font-mono flex-1">
                    <div className="font-bold text-[#1B241F] text-xs font-sans">📷 Trích xuất thời gian từ đơn:</div>
                    <div className="bg-[#E1EEE8]/80 text-[#245346] p-1.5 rounded-lg border border-[#3E7C6B]/20">
                      <span className="font-bold font-sans text-[11px] block">1. Giờ chụp ảnh (EXIF 24h):</span>
                      <span className="text-xs font-mono font-extrabold">{excusePhotoCaptureTime || format24hDateTime(Date.now())}</span>
                    </div>
                    <div className="bg-[#F7F6F0] text-[#5B6A61] p-1.5 rounded-lg border border-[#D7DCCB]">
                      <span className="font-bold font-sans text-[11px] block">2. Giờ gửi hệ thống (24h):</span>
                      <span className="text-xs font-mono font-semibold text-amber-700 italic">⏳ Tự động xác nhận khi bấm "Gửi đơn"</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {(() => {
            const todayK = localDateKey();
            const nowK = localTimeKey();
            const cfg = selectedLop ? getClassConfig(selectedLop) : null;
            const isExpiredExcuseDate = excuseDate < todayK || (excuseDate === todayK && cfg?.endTime && nowK > cfg.endTime);

            return (
              <button
                id="btnSendExcuseBtn"
                type="button"
                disabled={isSendingExcuse || isExpiredExcuseDate}
                onClick={handleSendExcuse}
                className={`w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl font-bold text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50 ${
                  isExpiredExcuseDate
                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                    : excuseDebtType === 'owing_paper'
                    ? 'bg-amber-700 hover:bg-amber-800 text-white'
                    : 'bg-[#1F3B32] text-[#F4F0E4] hover:bg-[#274A3E]'
                }`}
              >
                <Upload className="w-4 h-4" />
                {isSendingExcuse
                  ? 'Đang gửi...'
                  : isExpiredExcuseDate
                  ? 'Đã hết giờ điểm danh (Không thể gửi đơn/nợ đơn)'
                  : excuseDebtType === 'owing_paper'
                  ? 'Gửi đơn xin phép (Diện Nợ đơn)'
                  : 'Gửi đơn xin phép (Có đơn kèm ảnh)'}
              </button>
            );
          })()}

          <div
            id="studentExcuseStatus"
            className={`p-3 rounded-xl text-xs font-semibold ${
              excuseStatus.type === 'ok'
                ? 'bg-[#E1EEE8] text-[#245346] border border-[#3E7C6B]/20'
                : excuseStatus.type === 'err'
                ? 'bg-[#F5DED5] text-[#7A3115] border border-[#B3492F]/30'
                : 'bg-[#EEF1EC] text-[#5B6A61]'
            }`}
          >
            {excuseStatus.msg}
          </div>
        </div>
      </div>

      {/* Ban Can Su Proxy Attendance Card (1 Ảnh = 1 Bạn) */}
      {isCurrentStudentMonitor && selectedLop && studentId.trim() && (
        <div className="bg-[#FBFAF5] border-[2px] border-[#3E7C6B] rounded-2xl p-5 sm:p-6 shadow-md space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#D7DCCB]">
            <div className="w-9 h-9 rounded-xl bg-[#3E7C6B]/20 text-[#245346] flex items-center justify-center font-bold text-lg">
              ⭐
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[#1B241F]">
                Cổng Điểm Danh Ban Cán Sự (1 Ảnh minh chứng = 1 Học sinh)
              </h3>
              <p className="text-[11px] text-[#5B6A61]">
                Quy định hệ thống: Mỗi lượt điểm danh hộ yêu cầu 1 ảnh minh chứng thực tế riêng cho 1 học sinh.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Bước 1: Chọn 1 học sinh */}
            <div>
              <label className="block text-xs font-bold text-[#1B241F] mb-1.5 uppercase tracking-wider">
                1. Chọn 1 học sinh cần điểm danh hộ trong lớp:
              </label>
              <select
                value={selectedProxyStudentId}
                onChange={(e) => setSelectedProxyStudentId(e.target.value)}
                className="w-full bg-white border-2 border-[#D7DCCB] rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#1B241F] focus:outline-none focus:border-[#3E7C6B]"
              >
                <option value="">-- Bấm vào đây để chọn 1 học sinh --</option>
                {rosterForMonitor.map((s) => {
                  const todayKey = localDateKey();
                  const freshDay = getDayData(selectedLop, todayKey);
                  const rec = freshDay?.records?.[s.id];
                  const isGps = rec?.status === 'present' && rec?.checkinSource === 'gps';
                  const isPending = rec?.status === 'proxy_pending';
                  const isApproved = rec?.status === 'present' || rec?.status === 'late';
                  const isExcuse = Boolean(
                    rec?.excuseReason ||
                    rec?.status === 'excused_pending' ||
                    rec?.status === 'excused_approved' ||
                    rec?.status === 'excused_rejected'
                  );

                  let statusText = ' (Chưa điểm danh)';
                  if (isExcuse) statusText = ' (Đã xin phép nghỉ học - Không thể chọn)';
                  else if (isGps) statusText = ' (Đã tự điểm danh GPS - Không thể chọn)';
                  else if (isPending) statusText = ' (⏳ Đã gửi - Chờ GVCN duyệt)';
                  else if (isApproved) statusText = ' (✓ Đã có mặt)';

                  return (
                    <option key={s.id} value={s.id} disabled={isGps || isExcuse}>
                      {s.id} - {s.name} {statusText}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Bước 2: Tải ảnh minh chứng riêng */}
            <div>
              <label className="block text-xs font-bold text-[#1B241F] mb-1.5 uppercase tracking-wider">
                2. Chụp/Tải ảnh minh chứng thực tế tại lớp cho bạn này (Bắt buộc 1 ảnh):
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => monitorPhotoInputRef.current?.click()}
                  className="px-4 py-2.5 bg-[#3E7C6B] hover:bg-[#346a5b] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4" />
                  <span>Chụp / Tải Ảnh Minh Chứng</span>
                </button>
                <input
                  type="file"
                  ref={monitorPhotoInputRef}
                  onChange={handleMonitorPhotoUpload}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                />
                {monitorPhotoFile && (
                  <span className="text-xs text-emerald-700 font-semibold truncate max-w-[200px]">
                    {monitorPhotoFile.name}
                  </span>
                )}
              </div>

              {monitorPhotoPreview && (
                <div className="mt-3 p-3.5 bg-white border-2 border-[#3E7C6B]/40 rounded-xl shadow-xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="relative w-36 h-36 rounded-xl overflow-hidden border-2 border-[#3E7C6B] shadow-xs shrink-0">
                      <img src={monitorPhotoPreview} alt="Minh chứng" className="w-full h-full object-cover" />
                    </div>
                    <div className="space-y-2 text-xs font-mono flex-1">
                      <div className="font-bold text-[#1B241F] text-xs font-sans flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-[#3E7C6B]" />
                        <span>Trích xuất mốc thời gian ảnh điểm danh hộ:</span>
                      </div>
                      <div className="bg-[#E1EEE8]/80 text-[#245346] border border-[#3E7C6B]/30 p-2 rounded-lg">
                        <span className="font-bold font-sans text-[11px] block text-[#1F3B32]">1. Giờ chụp ảnh (EXIF 24h):</span>
                        <span className="text-xs font-mono font-extrabold">{monitorPhotoCaptureTime || format24hDateTime(monitorPhotoFile?.lastModified)}</span>
                      </div>
                      <div className="bg-[#EEF1E7] text-[#1B241F] border border-[#D7DCCB] p-2 rounded-lg">
                        <span className="font-bold font-sans text-[11px] block text-[#5B6A61]">2. Giờ gửi hệ thống (24h):</span>
                        <span className="text-xs font-mono font-semibold text-amber-700 italic">⏳ Tự động xác nhận khi bấm "Gửi điểm danh hộ"</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMonitorPhotoFile(null);
                          setMonitorPhotoPreview('');
                          setMonitorPhotoCaptureTime('');
                          setMonitorPhotoSubmitTime('');
                          setMonitorStatus({ type: 'wait', msg: 'Đã xóa ảnh minh chứng. Vui lòng chọn ảnh mới.' });
                        }}
                        className="mt-1 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-300 rounded-xl text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 font-sans"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Xóa ảnh</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              monitorStatus.type === 'ok' ? 'bg-[#E1EEE8] text-[#245346] border border-[#3E7C6B]/40' :
              monitorStatus.type === 'err' ? 'bg-[#F5DED5] text-[#7A3115] border border-red-300' :
              'bg-[#FEF7EC] text-[#8C5E14] border border-[#C98A3B]/40'
            }`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{monitorStatus.msg}</span>
            </div>

            {/* Bước 3: Nút gửi */}
            <button
              type="button"
              onClick={handleSubmitMonitorAttendance}
              disabled={isSubmittingMonitor || !selectedProxyStudentId || !monitorPhotoPreview}
              className="w-full py-3 bg-[#1F3B32] hover:bg-[#274A3E] text-white rounded-xl text-xs sm:text-sm font-extrabold shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isSubmittingMonitor
                  ? 'Đang gửi...'
                  : selectedProxyStudentId
                  ? `Gửi điểm danh hộ kèm ảnh cho ${rosterForMonitor.find(s => s.id === selectedProxyStudentId)?.name || 'học sinh đã chọn'}`
                  : 'Vui lòng chọn 1 học sinh & chụp ảnh minh chứng'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Card 4: Lịch sử & Kết quả duyệt đơn */}
      {selectedLop && studentId.trim() && (
        <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-5 sm:p-6 shadow-xs">
          <h2 className="text-base font-bold text-[#1B241F] mb-4 flex items-center gap-2">
            <History className="w-4 h-4 text-[#3E7C6B]" />
            Kết quả duyệt đơn
          </h2>
          
          {excuseHistory.length === 0 ? (
            <p className="text-sm text-[#5B6A61] italic">
              Bạn chưa có đơn xin phép nào được ghi nhận.
            </p>
          ) : (
            <div className="space-y-3">
              {excuseHistory.map((req, idx) => {
                const isOwing = req.excuseDebtType === 'owing_paper';
                const hasPhoto = Boolean(req.excusePhoto);
                return (
                  <div key={idx} className="bg-white border border-[#D7DCCB] rounded-xl p-3.5 flex flex-col gap-2.5 shadow-2xs">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="text-xs font-bold text-[#1B241F] flex items-center gap-2">
                          <span>Ngày xin nghỉ: {fmtDateVN(req.date)}</span>
                          {isOwing ? (
                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              ⏳ Nợ đơn
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              📄 Có đơn
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#5B6A61] mt-0.5">Gửi lúc: {fmtTime(req.submittedAt)}</div>
                      </div>
                      <div className="shrink-0">
                        {req.status === 'excused_pending' && (
                          <span className="inline-flex items-center gap-1 bg-[#EEF1EC] text-[#5B6A61] text-[10px] font-bold px-2 py-1 rounded-md">
                            <Clock className="w-3 h-3" /> Đang chờ duyệt
                          </span>
                        )}
                        {req.status === 'excused_approved' && (
                          <span className="inline-flex items-center gap-1 bg-[#E1EEE8] text-[#245346] text-[10px] font-bold px-2 py-1 rounded-md">
                            <CheckCircle2 className="w-3 h-3" /> Đã duyệt
                          </span>
                        )}
                        {req.status === 'excused_rejected' && (
                          <span className="inline-flex items-center gap-1 bg-[#F5DED5] text-[#7A3115] text-[10px] font-bold px-2 py-1 rounded-md">
                            <XCircle className="w-3 h-3" /> Bị từ chối
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-[#5B6A61] bg-[#F7F6F0] p-2.5 rounded-lg border border-[#D7DCCB]/60 space-y-1">
                      <div>
                        <span className="font-semibold text-[#1B241F]">Lý do:</span> {req.reason}
                      </div>
                      {isOwing && (
                        <div className="text-amber-900 font-medium text-[11px] pt-0.5">
                          ⏰ Hạn chót nộp bù BGH: <b className="font-bold underline">{req.debtSupplementDeadline}</b>
                        </div>
                      )}
                    </div>

                    {/* Hiển thị ảnh minh chứng hoặc nút Bổ sung ảnh nếu đang nợ đơn */}
                    {hasPhoto ? (
                      <div className="flex items-center gap-3 bg-[#E1EEE8]/40 p-2 rounded-lg border border-[#3E7C6B]/20">
                        <img
                          src={req.excusePhoto}
                          alt="Ảnh đơn"
                          className="w-12 h-12 object-cover rounded-md border border-[#3E7C6B] shrink-0"
                        />
                        <div className="text-[11px] text-[#245346] space-y-0.5 font-mono">
                          <div className="font-bold font-sans flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#3E7C6B]" />
                            <span>Đã có ảnh minh chứng</span>
                          </div>
                          <div>Giờ chụp EXIF 24h: {req.excusePhotoCaptureTime || 'Đã lưu'}</div>
                        </div>
                      </div>
                    ) : isOwing ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-300">
                        <span className="text-xs text-amber-900 font-semibold">
                          ⚠️ Chưa có ảnh minh chứng đơn xin phép
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenSupplementModal(req.date)}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer shadow-xs"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Bổ sung ảnh đơn ngay</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Bổ sung ảnh đơn nợ */}
      {supplementModalDate && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FBFAF5] border-2 border-[#3E7C6B] rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#D7DCCB]">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-700" />
                <h3 className="text-base font-extrabold text-[#1B241F]">
                  Bổ sung ảnh đơn xin nghỉ (Nợ đơn)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSupplementModalDate(null)}
                className="text-[#5B6A61] hover:text-[#1B241F] font-bold text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-300 p-3 rounded-xl text-xs text-amber-950 space-y-1">
                <div>
                  Học sinh: <b>{studentName}</b> ({studentId}) — Lớp: <b>{selectedLop}</b>
                </div>
                <div>
                  Ngày xin nghỉ nợ đơn: <b>{fmtDateVN(supplementModalDate)}</b>
                </div>
                <div className="font-semibold text-amber-900">
                  ⏰ Hạn chót nộp bù BGH: <b>{calculateSupplementDeadline(supplementModalDate, getMaxLateDays())}</b>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1B241F] mb-1.5 uppercase tracking-wider">
                  Chọn hoặc chụp ảnh đơn xin nghỉ / Giấy khám bệnh:
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => supplementInputRef.current?.click()}
                    className="px-4 py-2.5 bg-[#3E7C6B] hover:bg-[#346a5b] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Chụp / Tải Ảnh Minh Chứng</span>
                  </button>
                  <input
                    type="file"
                    ref={supplementInputRef}
                    onChange={handleSupplementFileChange}
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                  />
                  {supplementFile && (
                    <span className="text-xs text-emerald-700 font-semibold truncate max-w-[200px]">
                      {supplementFile.name}
                    </span>
                  )}
                </div>
              </div>

              {supplementPreview && (
                <div className="p-3 bg-white border border-[#D7DCCB] rounded-xl space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="relative w-28 h-28 rounded-lg overflow-hidden border border-[#3E7C6B] shadow-xs shrink-0">
                      <img src={supplementPreview} alt="Xem trước đơn" className="w-full h-full object-cover" />
                    </div>
                    <div className="space-y-1.5 text-xs font-mono flex-1">
                      <div className="font-bold text-[#1B241F] text-xs font-sans">📷 Trích xuất thời gian từ ảnh:</div>
                      <div className="bg-[#E1EEE8]/80 text-[#245346] p-1.5 rounded-lg border border-[#3E7C6B]/20">
                        <span className="font-bold font-sans text-[11px] block">1. Giờ chụp ảnh (EXIF 24h):</span>
                        <span className="text-xs font-mono font-extrabold">{supplementCaptureTime || format24hDateTime(supplementFile?.lastModified)}</span>
                      </div>
                      <div className="bg-[#F7F6F0] text-[#5B6A61] p-1.5 rounded-lg border border-[#D7DCCB]">
                        <span className="font-bold font-sans text-[11px] block">2. Giờ gửi hệ thống (24h):</span>
                        <span className="text-xs font-mono font-semibold text-amber-700 italic">⏳ Xác nhận khi bấm nút Lưu</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#D7DCCB]">
              <button
                type="button"
                onClick={() => setSupplementModalDate(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isSubmittingSupplement || !supplementPreview}
                onClick={handleConfirmSupplementPhoto}
                className="px-5 py-2 bg-[#1F3B32] hover:bg-[#274A3E] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmittingSupplement ? 'Đang lưu ảnh...' : 'Xác nhận nộp minh chứng'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
