import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  MapPin,
  Search,
  Calendar,
  Eye,
  LogOut,
  ShieldCheck,
  KeyRound,
  FileSpreadsheet,
  HelpCircle,
  BarChart3,
  ChevronRight,
  ArrowLeft,
  Check,
  ExternalLink,
  Lock,
  RefreshCw,
  Zap,
  Sliders,
  FileText,
  Settings,
  Plus,
  Trash2,
  X,
  Camera,
} from 'lucide-react';
import {
  Student,
  ClassConfig,
  DayData,
  AttendanceRecord,
} from '../types';
import {
  getLopList,
  getRoster,
  getClassConfig,
  getDayData,
  setDayData,
  fmtTime,
  fmtDateVN,
  localDateKey,
  localTimeKey,
  getMasterPin,
  setMasterPin,
  getMaxLateDays,
  setMaxLateDays,
  parseRosterFile,
  parseSchoolMasterFile,
  setRoster,
  setClassPin,
  getClassPin,
  deleteLop,
  format24hDateTime,
  getSchoolId,
  getSchoolName,
  setSchoolDisplayName,
  getSchoolLogo,
  setSchoolLogo,
  toSchoolSlug,
  ACTIVE_SCHOOL_STORAGE_KEY,
} from '../utils/storage';
import {
  subscribeAllSchoolData,
  syncFromFirestore,
  syncSaveMasterPin,
  syncSaveMaxLateDays,
  syncSaveRoster,
  syncSaveClassPin,
  syncDeleteLop,
  syncSaveSchoolDisplayName,
  syncSaveSchoolLogo,
  syncSaveDayData,
  syncAppendClassLog,
} from '../utils/firestoreSync';
import { ReportsModal } from './ReportsModal';
import { AdminFlaggedModal } from './AdminFlaggedModal';
import { AdminExcuseAuditModal } from './AdminExcuseAuditModal';
import { AdminLiveActivityModal } from './AdminLiveActivityModal';

interface AdminViewProps {
  onOpenLightbox: (data: any) => void;
  onLockAdmin: () => void;
  isUnion?: boolean;
}

export const AdminView: React.FC<AdminViewProps> = ({
  onOpenLightbox,
  onLockAdmin,
  isUnion = false,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(localDateKey());
  const [classList, setClassList] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeClassDetail, setActiveClassDetail] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [showFlaggedModal, setShowFlaggedModal] = useState<boolean>(false);
  const [showExcuseAuditModal, setShowExcuseAuditModal] = useState<boolean>(false);
  const [showLiveActivityModal, setShowLiveActivityModal] = useState<boolean>(false);
  const [reportModalClass, setReportModalClass] = useState<string>('ALL');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [tick, setTick] = useState<number>(0);
  const [lateClasses, setLateClasses] = useState<string[]>([]);

  // School Name, Logo & Multi-tenant Workspace Isolation state (BGH)
  const [activeSchoolId, setActiveSchoolId] = useState<string>(getSchoolId());
  const [currentSchoolDisplayName, setCurrentSchoolDisplayName] = useState<string>(getSchoolName());
  const [currentSchoolLogo, setCurrentSchoolLogo] = useState<string>(getSchoolLogo());
  const [schoolNameInput, setSchoolNameInput] = useState<string>(() => {
    const name = getSchoolName();
    return name === 'DEFAULT' ? '' : name;
  });
  const [copiedSchoolLink, setCopiedSchoolLink] = useState<boolean>(false);
  const [isSavingSchool, setIsSavingSchool] = useState<boolean>(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState<boolean>(false);
  const schoolLogoInputRef = React.useRef<HTMLInputElement | null>(null);
  const [schoolBannerFeedback, setSchoolBannerFeedback] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  // System Settings state (BGH)
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [lateDaysInput, setLateDaysInput] = useState<number>(getMaxLateDays());
  const [newMasterPin, setNewMasterPin] = useState<string>('');
  const [confirmMasterPin, setConfirmMasterPin] = useState<string>('');
  const [settingsFeedback, setSettingsFeedback] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  // School-wide Class & Roster Management state (BGH)
  const [showClassMgmtModal, setShowClassMgmtModal] = useState<boolean>(false);
  const [newClassName, setNewClassName] = useState<string>('');
  const [newClassPin, setNewClassPin] = useState<string>('1234');
  const [newRosterText, setNewRosterText] = useState<string>('');
  const [newFileStatus, setNewFileStatus] = useState<string>('');
  const [mgmtErrorMsg, setMgmtErrorMsg] = useState<string | null>(null);
  const [mgmtSuccessMsg, setMgmtSuccessMsg] = useState<string | null>(null);
  const fileInputMgmtRef = React.useRef<HTMLInputElement | null>(null);

  // Edit class state
  const [editingClass, setEditingClass] = useState<string | null>(null);
  const [editClassPin, setEditClassPin] = useState<string>('');
  const [editRosterText, setEditRosterText] = useState<string>('');
  const [editFileStatus, setEditFileStatus] = useState<string>('');
  const fileInputEditRef = React.useRef<HTMLInputElement | null>(null);

  // Admin Single Student Management state
  const [showAdminAddStudentForm, setShowAdminAddStudentForm] = useState<boolean>(false);
  const [adminAddStudentId, setAdminAddStudentId] = useState<string>('');
  const [adminAddStudentName, setAdminAddStudentName] = useState<string>('');
  const [adminEditingStudent, setAdminEditingStudent] = useState<{
    originalId: string;
    id: string;
    name: string;
  } | null>(null);
  const [adminDeletingStudent, setAdminDeletingStudent] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Admin Add Single Student to Class
  const handleAdminAddStudent = () => {
    if (!activeClassDetail) return;
    const cleanId = adminAddStudentId.trim();
    const cleanName = adminAddStudentName.trim();
    if (!cleanId || !cleanName) return;

    const currentRoster = getRoster(activeClassDetail);
    if (currentRoster.some(s => s.id.toLowerCase() === cleanId.toLowerCase())) {
      alert(`Mã học sinh "${cleanId}" đã tồn tại trong lớp ${activeClassDetail}!`);
      return;
    }

    const updatedRoster = [...currentRoster, { id: cleanId, name: cleanName, isMonitor: false }];
    setRoster(activeClassDetail, updatedRoster);
    syncSaveRoster(activeClassDetail, updatedRoster);

    setAdminAddStudentId('');
    setAdminAddStudentName('');
    setShowAdminAddStudentForm(false);
    setTick(t => t + 1);
  };

  // Admin Delete Student from Class
  const handleAdminDeleteStudent = () => {
    if (!activeClassDetail || !adminDeletingStudent) return;
    const currentRoster = getRoster(activeClassDetail);
    const updatedRoster = currentRoster.filter(s => s.id !== adminDeletingStudent.id);
    setRoster(activeClassDetail, updatedRoster);
    syncSaveRoster(activeClassDetail, updatedRoster);

    setAdminDeletingStudent(null);
    setTick(t => t + 1);
  };

  // Admin Save Edit Student in Class
  const handleAdminSaveEditStudent = () => {
    if (!activeClassDetail || !adminEditingStudent) return;
    const cleanId = adminEditingStudent.id.trim();
    const cleanName = adminEditingStudent.name.trim();
    if (!cleanId || !cleanName) return;

    const currentRoster = getRoster(activeClassDetail);
    if (
      cleanId.toLowerCase() !== adminEditingStudent.originalId.toLowerCase() &&
      currentRoster.some(s => s.id.toLowerCase() === cleanId.toLowerCase())
    ) {
      alert(`Mã học sinh "${cleanId}" bị trùng với học sinh khác trong lớp!`);
      return;
    }

    const updatedRoster = currentRoster.map(s =>
      s.id === adminEditingStudent.originalId ? { ...s, id: cleanId, name: cleanName } : s
    );

    setRoster(activeClassDetail, updatedRoster);
    syncSaveRoster(activeClassDetail, updatedRoster);

    setAdminEditingStudent(null);
    setTick(t => t + 1);
  };

  // Master School-wide File Upload state (Auto-split classes)
  const [masterFileStatus, setMasterFileStatus] = useState<string>('');
  const [masterDefaultPin, setMasterDefaultPin] = useState<string>('1234');
  const [parsedMasterClasses, setParsedMasterClasses] = useState<{ lop: string; students: Student[] }[] | null>(null);
  const fileInputMasterRef = React.useRef<HTMLInputElement | null>(null);

  const handleMasterFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMasterFileStatus('Đang đọc file tổng toàn trường...');
    try {
      const classMap = await parseSchoolMasterFile(file);
      if (classMap.size === 0) {
        setMasterFileStatus('Không phát hiện được dữ liệu lớp hoặc học sinh nào trong file.');
        setParsedMasterClasses(null);
        return;
      }
      const list: { lop: string; students: Student[] }[] = [];
      classMap.forEach((students, lop) => {
        list.push({ lop, students });
      });
      setParsedMasterClasses(list);
      setMasterFileStatus(`Đã quét thành công ${list.length} lớp với tổng số ${list.reduce((acc, c) => acc + c.students.length, 0)} học sinh từ file "${file.name}".`);
    } catch (err: any) {
      setMasterFileStatus(`Lỗi đọc file tổng: ${err?.message || err}`);
      setParsedMasterClasses(null);
    } finally {
      if (fileInputMasterRef.current) fileInputMasterRef.current.value = '';
    }
  };

  const handleConfirmImportMasterClasses = async () => {
    if (!parsedMasterClasses || parsedMasterClasses.length === 0) return;
    setMgmtErrorMsg(null);
    setMgmtSuccessMsg(null);

    const pin = masterDefaultPin.trim() || '1234';
    let countClasses = 0;
    let countStudents = 0;

    for (const item of parsedMasterClasses) {
      const cleanLop = item.lop.trim();
      if (!cleanLop) continue;
      const students = item.students;

      setRoster(cleanLop, students);
      await syncSaveRoster(cleanLop, students);
      if (!getClassPin(cleanLop)) {
        setClassPin(cleanLop, pin);
        await syncSaveClassPin(cleanLop, pin);
      }
      countClasses++;
      countStudents += students.length;
    }

    setMgmtSuccessMsg(`Đã tự động tạo và nạp thành công ${countClasses} lớp với tổng số ${countStudents} học sinh toàn trường!`);
    setParsedMasterClasses(null);
    setMasterFileStatus('');
    refreshData();
  };

  const handleCreateClassByAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMgmtErrorMsg(null);
    setMgmtSuccessMsg(null);

    const clean = newClassName.trim();
    if (!clean) {
      setMgmtErrorMsg('Vui lòng nhập tên lớp (vd: 10A1, 11A2).');
      return;
    }
    if (!newClassPin || newClassPin.length < 4) {
      setMgmtErrorMsg('Mã PIN bảo mật lớp phải có ít nhất 4 ký tự/số.');
      return;
    }

    let parsedStudents: Student[] = [];
    if (newRosterText.trim()) {
      const lines = newRosterText.split('\n').map(l => l.trim()).filter(Boolean);
      parsedStudents = lines.map(line => {
        const parts = line.split(',');
        return {
          id: (parts[0] || '').trim(),
          name: (parts.slice(1).join(',') || '').trim(),
        };
      }).filter(s => s.id);
    }

    setRoster(clean, parsedStudents);
    await syncSaveRoster(clean, parsedStudents);
    setClassPin(clean, newClassPin);
    await syncSaveClassPin(clean, newClassPin);

    setMgmtSuccessMsg(`Đã tạo lớp ${clean} và nạp ${parsedStudents.length} học sinh thành công! Giáo viên chủ nhiệm có thể đăng nhập ngay.`);
    setNewClassName('');
    setNewClassPin('1234');
    setNewRosterText('');
    setNewFileStatus('');
    refreshData();
  };

  const handleFileUploadMgmt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewFileStatus('Đang đọc file...');
    try {
      const parsedText = await parseRosterFile(file);
      if (!parsedText) {
        setNewFileStatus('Không đọc được dữ liệu học sinh từ file.');
        return;
      }
      setNewRosterText(prev => prev.trim() ? `${prev.trim()}\n${parsedText}` : parsedText);
      const count = parsedText.split('\n').length;
      setNewFileStatus(`Đã đọc ${count} học sinh từ file "${file.name}".`);
    } catch (err: any) {
      setNewFileStatus(`Lỗi đọc file: ${err?.message || err}`);
    } finally {
      if (fileInputMgmtRef.current) fileInputMgmtRef.current.value = '';
    }
  };

  const handleFileUploadEdit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditFileStatus('Đang đọc file...');
    try {
      const parsedText = await parseRosterFile(file);
      if (!parsedText) {
        setEditFileStatus('Không đọc được dữ liệu học sinh từ file.');
        return;
      }
      setEditRosterText(prev => prev.trim() ? `${prev.trim()}\n${parsedText}` : parsedText);
      const count = parsedText.split('\n').length;
      setEditFileStatus(`Đã đọc ${count} học sinh từ file "${file.name}".`);
    } catch (err: any) {
      setEditFileStatus(`Lỗi đọc file: ${err?.message || err}`);
    } finally {
      if (fileInputEditRef.current) fileInputEditRef.current.value = '';
    }
  };

  const handleSaveEditedClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;

    if (editClassPin && editClassPin.length >= 4) {
      setClassPin(editingClass, editClassPin);
      await syncSaveClassPin(editingClass, editClassPin);
    }

    const lines = editRosterText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      const parsedStudents: Student[] = lines.map(line => {
        const parts = line.split(',');
        return {
          id: (parts[0] || '').trim(),
          name: (parts.slice(1).join(',') || '').trim(),
        };
      }).filter(s => s.id);

      setRoster(editingClass, parsedStudents);
      await syncSaveRoster(editingClass, parsedStudents);
    }

    setMgmtSuccessMsg(`Đã cập nhật thông tin lớp ${editingClass} thành công!`);
    setEditingClass(null);
    setEditRosterText('');
    setEditClassPin('');
    setEditFileStatus('');
    refreshData();
  };

  const handleDeleteClassByAdmin = async (lop: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn lớp "${lop}"?`)) return;
    deleteLop(lop);
    await syncDeleteLop(lop);
    setMgmtSuccessMsg(`Đã xóa lớp ${lop} khỏi hệ thống.`);
    refreshData();
  };

  // Load and refresh all classes & stats
  const refreshData = () => {
    const currentId = getSchoolId();
    const currentName = getSchoolName();
    const currentLogo = getSchoolLogo();
    setActiveSchoolId(currentId);
    setCurrentSchoolDisplayName(currentName);
    setCurrentSchoolLogo(currentLogo);
    const list = getLopList();
    setClassList(list);
    setActiveClassDetail((prev) => {
      if (prev && list.includes(prev)) return prev;
      return list.length > 0 ? list[0] : null;
    });
    setLateDaysInput(getMaxLateDays());
    setTick((t) => t + 1);
    setLastSyncTime(new Date());
  };

  // Upload & compress school logo for the active school workspace (BGH)
  const handleUploadSchoolLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSchoolBannerFeedback(null);

    if (!file.type.startsWith('image/')) {
      setSchoolBannerFeedback({
        type: 'error',
        msg: 'Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP, SVG).',
      });
      return;
    }

    setIsUploadingLogo(true);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        try {
          const MAX_DIM = 240;
          let w = img.width || 200;
          let h = img.height || 200;
          if (w > MAX_DIM || h > MAX_DIM) {
            const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
          }
          // Preserve transparency with PNG for crisp school emblems/logos
          const dataUrl = canvas.toDataURL('image/png');
          setCurrentSchoolLogo(dataUrl);

          if (activeSchoolId !== 'default') {
            setSchoolLogo(dataUrl);
            await syncSaveSchoolLogo(dataUrl, activeSchoolId);
            setSchoolBannerFeedback({
              type: 'success',
              msg: `Đã tải lên và đồng bộ Logo đơn vị thành công! Logo đã hiển thị trên tiêu đề điểm danh của trường.`,
            });
          } else {
            setSchoolBannerFeedback({
              type: 'success',
              msg: `Đã chọn Logo đơn vị! Hãy nhập Tên trường và bấm "Lưu Tên Trường & Kích Hoạt" để xuất Link riêng cho trường của bạn.`,
            });
          }
        } catch (err) {
          setSchoolBannerFeedback({
            type: 'error',
            msg: 'Không thể xử lý ảnh logo. Vui lòng thử ảnh khác.',
          });
        } finally {
          setIsUploadingLogo(false);
          if (schoolLogoInputRef.current) schoolLogoInputRef.current.value = '';
        }
      };
      img.onerror = () => {
        setIsUploadingLogo(false);
        setSchoolBannerFeedback({
          type: 'error',
          msg: 'Không thể đọc tệp hình ảnh đã chọn.',
        });
      };
      img.src = String(reader.result);
    };
    reader.onerror = () => {
      setIsUploadingLogo(false);
      setSchoolBannerFeedback({
        type: 'error',
        msg: 'Lỗi đọc tệp từ thiết bị.',
      });
    };
    reader.readAsDataURL(file);
  };

  // Remove custom school logo and revert to default logo
  const handleRemoveSchoolLogo = async () => {
    setCurrentSchoolLogo('');
    if (activeSchoolId !== 'default') {
      setSchoolLogo('');
      await syncSaveSchoolLogo('', activeSchoolId);
    }
    setSchoolBannerFeedback({
      type: 'success',
      msg: 'Đã xóa logo riêng và khôi phục biểu tượng mặc định cho đơn vị.',
    });
  };

  // Save School Name & switch to isolated school workspace (BGH)
  const handleSaveSchoolWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setSchoolBannerFeedback(null);
    setSettingsFeedback(null);

    const cleanName = schoolNameInput.trim();
    if (!cleanName) {
      const err = {
        type: 'error' as const,
        msg: 'Vui lòng nhập tên trường (ví dụ: Trường THPT Nguyễn Du).',
      };
      setSchoolBannerFeedback(err);
      setSettingsFeedback(err);
      return;
    }

    const newSlug = toSchoolSlug(cleanName);
    if (!newSlug || newSlug === 'default') {
      const err = {
        type: 'error' as const,
        msg: 'Tên trường không hợp lệ. Vui lòng nhập tên trường cụ thể.',
      };
      setSchoolBannerFeedback(err);
      setSettingsFeedback(err);
      return;
    }

    setIsSavingSchool(true);
    try {
      const pendingLogo = currentSchoolLogo;

      // 1. Update URL query parameter (?school=<slug>) so getSchoolId() switches to the isolated school
      localStorage.setItem(ACTIVE_SCHOOL_STORAGE_KEY, newSlug);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('school', newSlug);
        window.history.replaceState({}, '', url.toString());
      } catch {
        // Ignore URL replace errors
      }

      // 2. Save full Vietnamese display name into the isolated school namespace (local + Firestore)
      setSchoolDisplayName(cleanName);
      await syncSaveSchoolDisplayName(cleanName, newSlug);

      // 3. If BGH selected/uploaded a logo, save it into this school's isolated namespace
      if (pendingLogo) {
        setSchoolLogo(pendingLogo);
        await syncSaveSchoolLogo(pendingLogo, newSlug);
      }

      // 4. Sync data strictly from this school's isolated Firestore namespace
      await syncFromFirestore();

      setActiveSchoolId(newSlug);
      setCurrentSchoolDisplayName(cleanName);
      setSchoolNameInput(cleanName);
      refreshData();

      const successObj = {
        type: 'success' as const,
        msg: `Đã kích hoạt "${cleanName}" và xuất Link riêng bên dưới! Hãy bấm "Sao chép Link gửi GVCN & Học sinh" để gửi cho toàn trường — mọi dữ liệu trên Link này chỉ thuộc về riêng trường của bạn.`,
      };
      setSchoolBannerFeedback(successObj);
      setSettingsFeedback(successObj);
    } finally {
      setIsSavingSchool(false);
    }
  };

  const getDedicatedSchoolUrl = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('school', activeSchoolId);
      return url.toString();
    } catch {
      return `${window.location.origin}${window.location.pathname}?school=${activeSchoolId}`;
    }
  };

  const handleCopySchoolLink = () => {
    const link = getDedicatedSchoolUrl();
    navigator.clipboard.writeText(link).then(() => {
      setCopiedSchoolLink(true);
      setTimeout(() => setCopiedSchoolLink(false), 2500);
    });
  };

  // BGH adjust student attendance status
  const handleAdminAdjustStatus = async (
    lop: string,
    studentId: string,
    newStatus: 'absent' | 'excused_approved' | 'present',
    note?: string
  ) => {
    const freshDay = getDayData(lop, selectedDate);
    const rec = freshDay.records[studentId];
    const roster = getRoster(lop);
    const sName = rec?.name || roster.find((s) => s.id === studentId)?.name || studentId;

    if (!freshDay.records[studentId]) {
      freshDay.records[studentId] = {
        name: sName,
        status: newStatus,
      };
    } else {
      freshDay.records[studentId].status = newStatus;
    }

    freshDay.records[studentId].lastUpdatedByTeacherAt = Date.now();
    freshDay.records[studentId].lastUpdatedAction =
      note || `BGH điều chỉnh: ${newStatus === 'absent' ? 'Vắng không phép' : newStatus === 'excused_approved' ? 'Vắng có phép' : 'Có mặt'}`;

    if (newStatus === 'absent') {
      delete freshDay.records[studentId].checkinSource;
      delete freshDay.records[studentId].checkinTime;
    } else if (newStatus === 'excused_approved') {
      freshDay.records[studentId].excuseDebtType = freshDay.records[studentId].excusePhoto ? 'has_paper' : 'owing_paper';
    }

    setDayData(lop, selectedDate, freshDay);
    await syncSaveDayData(lop, selectedDate, freshDay);
    syncAppendClassLog(lop, {
      actorRole: 'gvcn',
      actorName: 'Ban Giám Hiệu',
      actorId: 'BGH',
      actionTitle: `BGH điều chỉnh trạng thái: ${sName} -> ${newStatus === 'absent' ? 'Vắng không phép' : newStatus === 'excused_approved' ? 'Vắng có phép' : 'Có mặt'}`,
      details: note || `BGH kiểm tra minh chứng và điều chỉnh trạng thái cho ${sName} (${studentId})`,
    });
    setTick((t) => t + 1);
  };

  // Manual force-sync from Firestore
  const handleManualSync = async () => {
    setIsSyncing(true);
    await syncFromFirestore();
    refreshData();
    setTimeout(() => {
      setIsSyncing(false);
    }, 400);
  };

  // Real-time synchronization lifecycle (re-subscribes automatically when activeSchoolId changes)
  useEffect(() => {
    refreshData();
    syncFromFirestore().then(() => refreshData());

    // 1. Real-time Firestore snapshot listeners for classes, rosters, configs, and days of activeSchoolId
    const unsubFirestore = subscribeAllSchoolData(() => {
      refreshData();
    });

    // 2. React to local storage updates within the same browser / tabs
    const handleStorageUpdate = () => {
      refreshData();
    };

    window.addEventListener('app_storage_updated', handleStorageUpdate);
    window.addEventListener('storage', handleStorageUpdate);

    // 3. Fallback periodic heartbeat
    const timer = setInterval(() => {
      refreshData();
    }, 3000);

    return () => {
      unsubFirestore();
      window.removeEventListener('app_storage_updated', handleStorageUpdate);
      window.removeEventListener('storage', handleStorageUpdate);
      clearInterval(timer);
    };
  }, [selectedDate, activeSchoolId]);

  // Compute school-wide stats
  const todayKey = localDateKey();
  const nowKey = localTimeKey();

  const allClassStats = classList.map((lop) => {
    const roster = getRoster(lop);
    const cfg = getClassConfig(lop);
    const day = getDayData(lop, selectedDate);
    const records = day.records || {};

    const isAutoLocked =
      selectedDate !== todayKey ||
      (selectedDate === todayKey && cfg && nowKey > cfg.endTime);
    const isEffectivelyClosed = day.status === 'closed' || isAutoLocked;

    let present = 0;
    let excused = 0;
    let absent = 0;
    let unchecked = 0;

    roster.forEach((s) => {
      const rec = records[s.id];
      if (!rec || rec.status === 'none') {
        if (isEffectivelyClosed) absent++;
        else unchecked++;
      } else if (rec.status === 'present') {
        present++;
      } else if (
        rec.status === 'excused_pending' ||
        rec.status === 'excused_approved' ||
        rec.status === 'excused_rejected'
      ) {
        excused++;
      } else if (rec.status === 'absent') {
        absent++;
      }
    });

    return {
      lop,
      roster,
      cfg,
      day,
      records,
      total: roster.length,
      present,
      excused,
      absent,
      unchecked,
      rate: roster.length > 0 ? Math.round((present / roster.length) * 100) : 0,
      isLate: isEffectivelyClosed && unchecked > 0,
    };
  });

  useEffect(() => {
    const late = allClassStats.filter(s => s.isLate).map(s => s.lop);
    setLateClasses(late);
  }, [tick, selectedDate]);

  const totalSchoolStudents = allClassStats.reduce(
    (acc, c) => acc + c.total,
    0
  );
  const totalSchoolPresent = allClassStats.reduce(
    (acc, c) => acc + c.present,
    0
  );
  const totalSchoolExcused = allClassStats.reduce(
    (acc, c) => acc + c.excused,
    0
  );
  const totalSchoolAbsent = allClassStats.reduce(
    (acc, c) => acc + c.absent,
    0
  );
  const schoolAttendanceRate =
    totalSchoolStudents > 0
      ? Math.round((totalSchoolPresent / totalSchoolStudents) * 100)
      : 0;

  // Filtered classes
  const filteredStats = allClassStats.filter((c) =>
    c.lop.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  // Selected class data for detailed view
  const currentDetailClass = allClassStats.find(
    (c) => c.lop === activeClassDetail
  );

  // Save N-day late policy (BGH)
  const handleSaveLateDays = (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsFeedback(null);
    const parsed = Math.max(0, Math.min(30, Math.floor(Number(lateDaysInput) || 0)));
    const success = setMaxLateDays(parsed);
    syncSaveMaxLateDays(parsed);

    if (success) {
      setLateDaysInput(parsed);
      setSettingsFeedback({
        type: 'success',
        msg: `Đã lưu thành công quy định: Cho phép nộp & duyệt phép trễ tối đa ${parsed} ngày. Hệ thống đã đồng bộ tức thì đến tất cả giáo viên và học sinh!`,
      });
      refreshData();
    } else {
      setSettingsFeedback({
        type: 'error',
        msg: 'Không thể cập nhật số ngày nộp & duyệt trễ.',
      });
    }
  };

  // Handle master PIN change
  const handleChangeMasterPin = (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsFeedback(null);

    const cleanPin = newMasterPin.trim();
    if (cleanPin.length < 4) {
      setSettingsFeedback({
        type: 'error',
        msg: 'Mã PIN quản trị mới phải có ít nhất 4 ký tự/số.',
      });
      return;
    }

    if (cleanPin !== confirmMasterPin.trim()) {
      setSettingsFeedback({
        type: 'error',
        msg: 'Xác nhận mã PIN không trùng khớp.',
      });
      return;
    }

    const success = setMasterPin(cleanPin);
    syncSaveMasterPin(cleanPin);
    if (success) {
      setSettingsFeedback({
        type: 'success',
        msg: 'Đã cập nhật Mã PIN Quản trị hệ thống thành công!',
      });
      setNewMasterPin('');
      setConfirmMasterPin('');
    } else {
      setSettingsFeedback({
        type: 'error',
        msg: 'Không thể cập nhật mã PIN.',
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Admin Control Bar */}
      <div className="flex justify-between items-center bg-[#1F3B32] text-[#F4F0E4] p-3.5 sm:p-4 rounded-2xl shadow-xs flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-white border border-emerald-400/40 text-emerald-300 flex items-center justify-center font-bold shrink-0">
            {currentSchoolLogo ? (
              <img
                src={currentSchoolLogo}
                alt="Logo trường"
                className="w-full h-full object-contain p-0.5"
              />
            ) : (
              <Building2 className="w-5 h-5 text-[#1F3B32]" />
            )}
          </div>
          <div>
            <div className="text-sm sm:text-base font-extrabold flex items-center gap-2 flex-wrap">
              <span>{isUnion ? 'Bảng Giám Sát Đoàn Trường' : 'Bảng Điều Khiển Quản Trị Toàn Trường'}</span>
              {currentSchoolDisplayName !== 'DEFAULT' && (
                <span className="px-2.5 py-0.5 bg-[#C98A3B] text-[#1B241F] rounded-lg text-xs font-extrabold shadow-2xs">
                  🏫 {currentSchoolDisplayName}
                </span>
              )}
              <span className="px-2 py-0.5 bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 rounded-full text-[10px] uppercase font-bold tracking-wider">
                {isUnion ? 'Đoàn Trường' : 'Ban Giám Hiệu'}
              </span>
            </div>
            <p className="text-[11px] text-emerald-200/80">
              {isUnion 
                ? 'Giám sát chuyên cần • Theo dõi đơn phép & báo cáo • Không có quyền xóa dữ liệu hoặc thay đổi cài đặt BGH'
                : 'Giám sát chuyên cần • Quản trị quy định duyệt trễ • Dữ liệu trường hoàn toàn độc lập & bảo mật'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowClassMgmtModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3E7C6B] hover:bg-[#346a5b] text-[#F4F0E4] rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs border border-emerald-400/30"
            title="BGH tạo lớp và nạp danh sách học sinh, cài đặt mã PIN cho toàn trường để GVCN không cần tạo"
          >
            <Users className="w-3.5 h-3.5 text-emerald-300" />
            <span>Quản lý Lớp & DS ({classList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLiveActivityModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs border border-emerald-400/40"
            title="Xem nhật ký giám sát hoạt động thời gian thực 24/7 của tất cả GVCN và Học sinh toàn trường"
          >
            <Zap className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
            <span>Nhật Ký Real-time</span>
          </button>

          <button
            type="button"
            onClick={() => setShowExcuseAuditModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3E7C6B] hover:bg-[#346a5b] text-[#F4F0E4] rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs border border-emerald-400/30"
            title="Xem nhật ký và giám sát toàn bộ đơn xin phép của học sinh toàn trường trong thời gian thực"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-300" />
            <span>Giám Sát Đơn Phép</span>
          </button>

          <button
            type="button"
            onClick={() => setShowFlaggedModal(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs border ${
              lateClasses.length > 0
                ? 'bg-red-500 hover:bg-red-600 text-white border-red-600 animate-bounce'
                : 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border-red-500/30'
            }`}
            title="Xem danh sách cảnh báo giáo viên cập nhật trễ"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Cờ báo bất thường ({lateClasses.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setReportModalClass('ALL');
              setShowReportModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#C98A3B] hover:bg-[#b07730] text-[#1B241F] rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
            title="Xem tổng hợp báo cáo chuyên cần toàn trường theo Ngày, Tuần, Tháng, Học kỳ"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Báo cáo Toàn Trường</span>
          </button>

          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2A4D42] hover:bg-[#345c50] text-[#F4F0E4] rounded-xl text-xs font-bold transition-colors cursor-pointer border border-emerald-500/30 disabled:opacity-60"
            title="Đồng bộ dữ liệu mới nhất từ giáo viên ngay lập tức"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-300 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ'}</span>
          </button>

          {!isUnion && (
            <button
              type="button"
              onClick={() => {
                setShowSettings(!showSettings);
                setSettingsFeedback(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2A4D42] hover:bg-[#345c50] text-[#F4F0E4] rounded-xl text-xs font-bold transition-colors cursor-pointer border border-emerald-500/30"
              title="Cài đặt hệ thống Quản Trị (BGH): Tên trường, Số ngày cho phép nộp & duyệt trễ (N ngày), Mã PIN Quản trị"
            >
              <Settings className="w-3.5 h-3.5 text-emerald-300" />
              <span>Cài đặt BGH</span>
              <span className="px-1.5 py-0.2 bg-emerald-400/20 text-emerald-300 rounded text-[10px] font-mono">
                Trễ: {getMaxLateDays()}d
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onLockAdmin}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#8C341F] hover:bg-[#722917] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            title="Khóa phiên làm việc Quản trị"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>

      {/* BGH School Name, Logo & Multi-Tenant Workspace Isolation Card */}
      {!isUnion && (
        <div className="bg-[#FBFAF5] border-[1.5px] border-[#3E7C6B] rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5 flex-1">
              {/* School Logo Upload / Preview Box */}
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div
                  onClick={() => schoolLogoInputRef.current?.click()}
                  title="Bấm để tải lên Logo riêng của trường"
                  className="w-16 h-16 rounded-2xl bg-white border-2 border-dashed border-[#3E7C6B] hover:border-[#1F3B32] flex flex-col items-center justify-center overflow-hidden cursor-pointer shadow-2xs transition-colors group relative"
                >
                  {currentSchoolLogo ? (
                    <img
                      src={currentSchoolLogo}
                      alt="Logo đơn vị"
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-[#3E7C6B] group-hover:text-[#1F3B32] p-1 text-center">
                      <Plus className="w-5 h-5" />
                      <span className="text-[9px] font-extrabold leading-tight mt-0.5">
                        Logo Trường
                      </span>
                    </div>
                  )}
                </div>
                <input
                  ref={schoolLogoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadSchoolLogo}
                  className="hidden"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={isUploadingLogo}
                    onClick={() => schoolLogoInputRef.current?.click()}
                    className="px-2 py-0.5 bg-[#E1EEE8] hover:bg-[#cfe3da] text-[#245346] border border-[#3E7C6B]/40 rounded-md text-[10px] font-extrabold cursor-pointer transition-colors"
                  >
                    {isUploadingLogo ? 'Đang tải...' : currentSchoolLogo ? 'Đổi Logo' : 'Tải Logo'}
                  </button>
                  {currentSchoolLogo && (
                    <button
                      type="button"
                      onClick={handleRemoveSchoolLogo}
                      title="Xóa logo riêng và dùng mặc định"
                      className="p-0.5 text-[#8C341F] hover:bg-red-100 rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[#1F3B32] text-[#F4F0E4]">
                    <Building2 className="w-3.5 h-3.5 text-emerald-300" />
                    Đơn vị Trường Học &amp; Logo Độc Lập
                  </span>
                  {currentSchoolDisplayName !== 'DEFAULT' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[#E1EEE8] text-[#245346] border border-[#3E7C6B]/40">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#3E7C6B]" />
                      Đang hoạt động: {currentSchoolDisplayName} (Mã trường: {activeSchoolId})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FEF7EC] text-[#8C5E14] border border-[#C98A3B]/40">
                      Chưa đặt tên trường riêng — Nhập tên trường và tải Logo bên dưới
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#5B6A61] leading-relaxed">
                  <b>Tên trường &amp; Logo riêng cho từng đơn vị:</b> BGH mỗi trường tự nhập tên trường và bấm <b>"Tải Logo"</b> để đưa biểu trưng của trường mình lên hệ thống. Logo và tên trường sẽ hiển thị trực tiếp trên tiêu đề điểm danh của trường đó; mọi dữ liệu hoàn toàn tách biệt với các trường khác.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleSaveSchoolWorkspace}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0"
            >
              <input
                type="text"
                placeholder="Nhập tên trường (VD: Trường THPT Nguyễn Du)..."
                value={schoolNameInput}
                onChange={(e) => setSchoolNameInput(e.target.value)}
                className="w-full sm:w-72 bg-white border-[1.5px] border-[#D7DCCB] rounded-xl px-3.5 py-2 text-xs sm:text-sm font-extrabold text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
              />
              <button
                type="submit"
                disabled={isSavingSchool}
                className="px-4 py-2 bg-[#1F3B32] hover:bg-[#274A3E] text-[#F4F0E4] rounded-xl text-xs font-extrabold transition-colors cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
              >
                {isSavingSchool ? 'Đang thiết lập...' : 'Lưu Tên Trường & Kích Hoạt'}
              </button>
            </form>
          </div>

          {/* Dedicated School Link for sharing with Teachers & Students of this school */}
          {currentSchoolDisplayName !== 'DEFAULT' && (
            <div className="mt-3 pt-3 border-t border-[#D7DCCB] flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#F4F1E6] px-3.5 py-2.5 rounded-xl">
              <div className="text-xs text-[#1B241F] flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-[#245346]">
                  🔗 Link điểm danh riêng của {currentSchoolDisplayName}:
                </span>
                <code className="px-2 py-0.5 bg-white border border-[#D7DCCB] rounded text-[11px] font-mono text-[#1F3B32] break-all">
                  {getDedicatedSchoolUrl()}
                </code>
              </div>
              <button
                type="button"
                onClick={handleCopySchoolLink}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#3E7C6B] hover:bg-[#346a5b] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
              >
                {copiedSchoolLink ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Đã sao chép Link Trường!</span>
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Sao chép Link gửi GVCN & Học sinh</span>
                  </>
                )}
              </button>
            </div>
          )}

          {schoolBannerFeedback && (
            <div
              className={`mt-3 p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 ${
                schoolBannerFeedback.type === 'success'
                  ? 'bg-[#E1EEE8] text-[#245346] border border-[#3E7C6B]/40'
                  : 'bg-[#F5DED5] text-[#7A3115] border border-red-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{schoolBannerFeedback.msg}</span>
              </div>
              <button
                type="button"
                onClick={() => setSchoolBannerFeedback(null)}
                className="text-xs font-bold px-2 py-0.5 rounded hover:bg-black/5 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* Security notice banner */}
      <div className="bg-[#E1EEE8] text-[#245346] border border-[#3E7C6B]/30 rounded-xl p-3 sm:p-3.5 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 shadow-2xs flex-wrap">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-[#3E7C6B] shrink-0" />
          <span>
            {isUnion ? (
              <>
                <b>Quyền hạn Đoàn trường ({currentSchoolDisplayName !== 'DEFAULT' ? currentSchoolDisplayName : 'Trường hiện tại'}):</b> Bạn có thể theo dõi số liệu điểm danh, danh sách học sinh, vị trí GPS và giám sát đơn nghỉ phép của <b>tất cả {classList.length} lớp</b>. Theo phân cấp, Đoàn trường có quyền giám sát và xem báo cáo đầy đủ nhưng không có quyền xóa dữ liệu hay thay đổi cài đặt hệ thống của BGH.
              </>
            ) : (
              <>
                <b>Quyền hạn Quản trị hệ thống BGH ({currentSchoolDisplayName !== 'DEFAULT' ? currentSchoolDisplayName : 'Trường hiện tại'}):</b> Bạn có thể theo dõi số liệu điểm danh, danh sách học sinh, vị trí GPS và đơn nghỉ phép của <b>tất cả {classList.length} lớp</b> trong phạm vi riêng của trường.
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#245346] bg-[#D1E6DC] px-2.5 py-1 rounded-lg border border-[#3E7C6B]/30">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse shrink-0"></span>
            Đồng bộ thời gian thực ({fmtTime(lastSyncTime.getTime())})
          </span>
          <Calendar className="w-4 h-4 text-[#3E7C6B] ml-1" />
          <span className="text-xs font-bold text-[#1B241F]">Ngày xem:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-white border-[1.5px] border-[#D7DCCB] rounded-lg px-2.5 py-1 text-xs font-bold text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
          />
        </div>
      </div>

      {/* System Settings Panel (BGH) */}
      {!isUnion && showSettings && (
        <div className="bg-[#FBFAF5] border-[1.5px] border-[#1F3B32] rounded-2xl p-5 sm:p-6 shadow-sm space-y-5 animate-in fade-in duration-200">
          <div className="flex justify-between items-center pb-3 border-b border-[#D7DCCB]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#3E7C6B]/20 text-[#245346] flex items-center justify-center font-bold">
                <Sliders className="w-4 h-4 text-[#3E7C6B]" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1B241F]">
                  Cài Đặt Quản Trị Hệ Thống (Ban Giám Hiệu)
                </h3>
                <p className="text-[11px] text-[#5B6A61]">
                  Cấu hình Tên trường độc lập, chính sách nộp & duyệt đơn trễ toàn trường và bảo mật mã PIN quản trị
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="text-xs text-[#5B6A61] hover:text-[#1B241F] px-2.5 py-1 rounded-lg hover:bg-[#EEF1EC] transition-colors cursor-pointer font-bold"
            >
              Đóng ✕
            </button>
          </div>

          {settingsFeedback && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                settingsFeedback.type === 'success'
                  ? 'bg-[#E1EEE8] text-[#245346] border border-[#3E7C6B]/40'
                  : 'bg-[#F5DED5] text-[#7A3115] border border-red-300'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{settingsFeedback.msg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Setting 1: N-Day Late Excuse Policy */}
            <div className="bg-white border border-[#D7DCCB] rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#1B241F] flex items-center gap-1.5 uppercase tracking-wide">
                    <Clock className="w-4 h-4 text-[#C98A3B]" />
                    Số ngày cho phép nộp & duyệt trễ (N ngày)
                  </span>
                  <span className="px-2 py-0.5 bg-[#FEF7EC] text-[#8C5E14] border border-[#C98A3B]/40 rounded-full text-[10px] font-bold">
                    Hiện tại: {getMaxLateDays()} ngày
                  </span>
                </div>
                <p className="text-[11px] text-[#5B6A61] mt-1.5 leading-relaxed">
                  Quy định số ngày tối đa kể từ ngày học sinh vắng mặt để học sinh có thể gửi đơn xin phép bổ sung và <b>Giáo viên chủ nhiệm là người sẽ trực tiếp xem xét duyệt đơn</b>. Mọi thao tác phê duyệt của giáo viên được ghi vết thời gian thực chuyển về Quản trị BGH để đảm bảo tính minh bạch.
                </p>

                <form onSubmit={handleSaveLateDays} className="mt-3.5 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#1B241F] mb-1">
                      Số ngày cho phép (từ 0 đến 30 ngày):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="30"
                        step="1"
                        value={lateDaysInput}
                        onChange={(e) => setLateDaysInput(Number(e.target.value))}
                        className="w-24 bg-[#FAF8F2] border-[1.5px] border-[#D7DCCB] rounded-xl px-3 py-1.5 text-sm font-extrabold text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                        required
                      />
                      <span className="text-xs font-semibold text-[#5B6A61]">ngày sau ngày nghỉ</span>
                    </div>
                  </div>

                  {/* Quick select pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {[0, 1, 2, 3, 5, 7, 14].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setLateDaysInput(d)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          lateDaysInput === d
                            ? 'bg-[#1F3B32] text-[#F4F0E4]'
                            : 'bg-[#EEF1EC] text-[#5B6A61] hover:bg-[#DCE1D8]'
                        }`}
                      >
                        {d === 0 ? '0 ngày (Chỉ trong ngày)' : `${d} ngày`}
                      </button>
                    ))}
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#3E7C6B] hover:bg-[#346a5b] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs w-full sm:w-auto"
                    >
                      Lưu quy định duyệt trễ ({lateDaysInput} ngày)
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Setting 2: Change Master PIN */}
            <div className="bg-white border border-[#D7DCCB] rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <span className="text-xs font-extrabold text-[#1B241F] flex items-center gap-1.5 uppercase tracking-wide">
                  <KeyRound className="w-4 h-4 text-[#3E7C6B]" />
                  Đổi Mã PIN Quản Trị Hệ Thống (Master PIN)
                </span>
                <p className="text-[11px] text-[#5B6A61] mt-1.5 leading-relaxed">
                  Mã PIN quản trị dùng để truy cập vào Bảng điều khiển BGH toàn trường ({currentSchoolDisplayName !== 'DEFAULT' ? currentSchoolDisplayName : 'Trường hiện tại'}). Hãy bảo mật mã PIN và không chia sẻ cho học sinh.
                </p>

                <form onSubmit={handleChangeMasterPin} className="mt-3.5 space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-[#1B241F] mb-1">
                      Mã PIN mới (≥ 4 ký tự)
                    </label>
                    <input
                      type="password"
                      placeholder="Nhập mã PIN mới..."
                      value={newMasterPin}
                      onChange={(e) => setNewMasterPin(e.target.value)}
                      className="w-full bg-[#FAF8F2] border border-[#D7DCCB] rounded-xl px-3 py-1.5 text-xs text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#1B241F] mb-1">
                      Xác nhận mã PIN mới
                    </label>
                    <input
                      type="password"
                      placeholder="Nhập lại mã PIN mới..."
                      value={confirmMasterPin}
                      onChange={(e) => setConfirmMasterPin(e.target.value)}
                      className="w-full bg-[#FAF8F2] border border-[#D7DCCB] rounded-xl px-3 py-1.5 text-xs text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                    />
                  </div>
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={!newMasterPin}
                      className="px-4 py-2 bg-[#1F3B32] hover:bg-[#274A3E] text-[#F4F0E4] rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50 w-full sm:w-auto"
                    >
                      Cập nhật Mã PIN Quản trị
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-4 shadow-xs">
          <div className="text-xs font-bold text-[#5B6A61] uppercase tracking-wider">
            Tổng số lớp
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#1B241F] mt-1">
            {classList.length} <span className="text-xs font-medium text-[#5B6A61]">lớp</span>
          </div>
          <div className="text-[11px] text-[#5B6A61] mt-1">
            {totalSchoolStudents} học sinh toàn trường
          </div>
        </div>

        <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-4 shadow-xs">
          <div className="text-xs font-bold text-[#245346] uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#3E7C6B]" />
            Có mặt hôm nay
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#245346] mt-1">
            {totalSchoolPresent}{' '}
            <span className="text-xs font-bold text-[#3E7C6B]">
              ({schoolAttendanceRate}%)
            </span>
          </div>
          <div className="text-[11px] text-[#5B6A61] mt-1">
            Ngày {fmtDateVN(selectedDate)}
          </div>
        </div>

        <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-4 shadow-xs">
          <div className="text-xs font-bold text-[#7A521E] uppercase tracking-wider flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-[#C98A3B]" />
            Đơn xin phép
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#7A521E] mt-1">
            {totalSchoolExcused}{' '}
            <span className="text-xs font-medium text-[#5B6A61]">đơn</span>
          </div>
          <div className="text-[11px] text-[#5B6A61] mt-1">
            Đã nộp kèm lý do/ảnh
          </div>
        </div>

        <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-4 shadow-xs">
          <div className="text-xs font-bold text-[#7A3115] uppercase tracking-wider flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-[#B3492F]" />
            Vắng mặt
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#7A3115] mt-1">
            {totalSchoolAbsent}{' '}
            <span className="text-xs font-medium text-[#5B6A61]">học sinh</span>
          </div>
          <div className="text-[11px] text-[#5B6A61] mt-1">
            Chưa điểm danh / Đã chốt
          </div>
        </div>
      </div>

      {/* Main Container: Split View (Classes List & Class Detail) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: All Classes List (5 cols on lg) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm sm:text-base font-bold text-[#1B241F] flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#3E7C6B]" />
                Danh Sách Tất Cả Các Lớp ({filteredStats.length})
              </h2>
            </div>

            {/* Search Input */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5B6A61]" />
              <input
                type="text"
                placeholder="Tìm kiếm lớp học (vd: 10A1, 11B2)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
              />
            </div>

            {/* List of Class Cards */}
            {filteredStats.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#5B6A61] bg-white rounded-xl border border-[#D7DCCB]">
                {classList.length === 0
                  ? 'Chưa có lớp học nào được tạo trên hệ thống.'
                  : 'Không tìm thấy lớp học nào phù hợp với từ khóa tìm kiếm.'}
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
                {filteredStats.map((c) => {
                  const isSelected = activeClassDetail === c.lop;
                  return (
                    <div
                      key={c.lop}
                      onClick={() => setActiveClassDetail(c.lop)}
                      className={`p-3.5 rounded-xl border-[1.5px] transition-all cursor-pointer text-left ${
                        isSelected
                          ? 'bg-[#E1EEE8] border-[#3E7C6B] shadow-xs'
                          : 'bg-white border-[#D7DCCB] hover:border-[#1F3B32]/40 hover:bg-[#F7F6F0]'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                              isSelected
                                ? 'bg-[#1F3B32] text-[#F4F0E4]'
                                : 'bg-[#EEF1E7] text-[#1B241F]'
                            }`}
                          >
                            {c.lop.slice(0, 3)}
                          </div>
                          <div>
                            <div className="text-sm font-extrabold text-[#1B241F]">
                              Lớp {c.lop}
                            </div>
                            <div className="text-[11px] text-[#5B6A61]">
                              Sĩ số: <b>{c.total}</b> học sinh
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs font-extrabold text-[#245346]">
                            {c.present}/{c.total}{' '}
                            <span className="text-[10px] font-normal text-[#5B6A61]">
                              ({c.rate}%)
                            </span>
                          </div>
                          <span
                            className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-bold mt-0.5 ${
                              c.day.status === 'open'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-stone-200 text-stone-700'
                            }`}
                          >
                            {c.day.status === 'open' ? 'Đang mở' : 'Đã đóng'}
                          </span>
                        </div>
                      </div>

                      {/* Mini stats bar */}
                      <div className="mt-2.5 pt-2 border-t border-[#D7DCCB]/60 flex items-center justify-between text-[11px] text-[#5B6A61]">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-[#3E7C6B]" />
                          {c.cfg && c.cfg.lat !== 0 ? (
                            <span>
                              {c.cfg.startTime}–{c.cfg.endTime} ({c.cfg.radius}m)
                            </span>
                          ) : (
                            <span className="text-amber-700 font-medium">
                              Chưa cài GPS
                            </span>
                          )}
                        </span>

                        <span className="text-[#3E7C6B] font-bold flex items-center gap-0.5">
                          Xem chi tiết <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Detailed Class Inspector (7 cols on lg) */}
        <div className="lg:col-span-7 space-y-4">
          {currentDetailClass ? (
            <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
              {/* Header of selected class */}
              <div className="flex justify-between items-start flex-wrap gap-2 pb-3 border-b border-[#D7DCCB]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-[#1F3B32] text-[#F4F0E4] text-xs font-extrabold rounded-lg">
                      Chi tiết lớp
                    </span>
                    <h3 className="text-lg font-extrabold text-[#1B241F]">
                      Lớp {currentDetailClass.lop}
                    </h3>
                  </div>
                  <p className="text-xs text-[#5B6A61] mt-1">
                    Ngày điểm danh: <b>{fmtDateVN(selectedDate)}</b> • Sĩ số: <b>{currentDetailClass.total}</b> học sinh
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="bg-[#E1EEE8] text-[#245346] px-3 py-1.5 rounded-xl text-xs font-bold border border-[#3E7C6B]/20">
                    Có mặt: {currentDetailClass.present}/{currentDetailClass.total} ({currentDetailClass.rate}%)
                  </div>
                </div>
              </div>

              {/* Class GPS & Schedule Info (Read-only) */}
              <div className="p-3.5 bg-white border border-[#D7DCCB] rounded-xl">
                <div className="text-xs font-bold text-[#1B241F] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#3E7C6B]" />
                  Thông tin Cấu hình Điểm danh &amp; GPS (Chỉ xem)
                </div>
                {currentDetailClass.cfg && currentDetailClass.cfg.lat !== 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs text-[#1B241F] mt-2">
                    <div>
                      <span className="text-[#5B6A61]">Vị trí GPS:</span>{' '}
                      <b>
                        {currentDetailClass.cfg.lat.toFixed(4)},{' '}
                        {currentDetailClass.cfg.lng.toFixed(4)}
                      </b>
                    </div>
                    <div>
                      <span className="text-[#5B6A61]">Bán kính:</span>{' '}
                      <b>{currentDetailClass.cfg.radius} mét</b>
                    </div>
                    <div>
                      <span className="text-[#5B6A61]">Khung giờ:</span>{' '}
                      <b>
                        {currentDetailClass.cfg.startTime} –{' '}
                        {currentDetailClass.cfg.endTime}
                      </b>
                    </div>
                    <div>
                      <span className="text-[#5B6A61]">Hạn duyệt phép:</span>{' '}
                      <b className="text-[#245346]">
                        {currentDetailClass.cfg.excuseDeadline || '17:00'}
                      </b>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[#7A521E] mt-1">
                    Giáo viên phụ trách chưa thiết lập vị trí GPS và khung giờ cho lớp này.
                  </div>
                )}
              </div>

              {/* Attendance Records Table */}
              <div>
                <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                  <h4 className="text-xs font-bold text-[#1B241F] uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#3E7C6B]" />
                    Bảng Điểm Danh Chi Tiết
                  </h4>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const classPhotos = currentDetailClass.roster.flatMap((s) => {
                        const rec = currentDetailClass.records[s.id];
                        if (!rec) return [];
                        const list = [];
                        if (rec.proxyPhoto || (rec.checkinSource === 'monitor_proxy' && rec.excusePhoto)) {
                          list.push({
                            src: rec.proxyPhoto || rec.excusePhoto,
                            captureTime: rec.proxyPhotoCaptureTime || rec.excusePhotoCaptureTime || (rec.checkinTime ? format24hDateTime(rec.checkinTime) : '—'),
                            submitTime: rec.checkinTime ? format24hDateTime(rec.checkinTime) : format24hDateTime(Date.now()),
                            title: `Điểm danh hộ BCS - ${s.name} (${currentDetailClass.className})`
                          });
                        }
                        if (rec.excusePhoto && rec.checkinSource !== 'monitor_proxy') {
                          list.push({
                            src: rec.excusePhoto,
                            captureTime: rec.excusePhotoCaptureTime || (rec.excuseSubmittedAt ? format24hDateTime(rec.excuseSubmittedAt) : '—'),
                            submitTime: rec.excuseSubmittedAt ? format24hDateTime(rec.excuseSubmittedAt) : format24hDateTime(Date.now()),
                            title: `Đơn xin phép - ${s.name} (${currentDetailClass.className})`
                          });
                        }
                        return list;
                      });

                      if (classPhotos.length === 0) return null;

                      return (
                        <button
                          type="button"
                          onClick={() => onOpenLightbox(classPhotos[0])}
                          className="px-2.5 py-1 bg-[#1F3B32] hover:bg-[#152a23] text-[#F4F0E4] rounded-lg text-xs font-bold shadow-xs cursor-pointer inline-flex items-center gap-1"
                          title="Xem minh chứng ảnh của lớp"
                        >
                          <Camera className="w-3.5 h-3.5 text-emerald-400" />
                          <span>📷 Xem ảnh lớp ({classPhotos.length})</span>
                        </button>
                      );
                    })()}
                    <span className="text-[11px] text-[#5B6A61]">
                      Cập nhật tự động
                    </span>
                  </div>
                </div>

                <div className="border border-[#D7DCCB] rounded-xl overflow-hidden bg-white">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#EEF1E7] text-[#1B241F] sticky top-0 font-bold border-b border-[#D7DCCB]">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">STT</th>
                          <th className="py-2.5 px-3">Mã HS</th>
                          <th className="py-2.5 px-3">Họ và tên</th>
                          <th className="py-2.5 px-3 text-center">Trạng thái</th>
                          <th className="py-2.5 px-3">Giờ ĐD</th>
                          <th className="py-2.5 px-3">Khoảng cách</th>
                          <th className="py-2.5 px-3">Minh chứng / Ảnh</th>
                          <th className="py-2.5 px-3">Lịch sử cập nhật</th>
                          <th className="py-2.5 px-3 min-w-[140px] text-right">Điều chỉnh (BGH)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D7DCCB]/60 font-medium">
                        {currentDetailClass.roster.length === 0 ? (
                          <tr>
                            <td
                              colSpan={9}
                              className="py-5 text-center text-[#5B6A61] italic"
                            >
                              Lớp chưa có danh sách học sinh.
                            </td>
                          </tr>
                        ) : (
                          currentDetailClass.roster.map((s, idx) => {
                            const rec: AttendanceRecord | undefined =
                              currentDetailClass.records[s.id];
                            
                            const cfg = getClassConfig(currentDetailClass.className);
                            const todayKey = localDateKey();
                            const nowKey = localTimeKey();
                            const isAutoLocked =
                              selectedDate !== todayKey ||
                              (selectedDate === todayKey && cfg && nowKey > cfg.endTime);
                            const isEffectivelyClosed = currentDetailClass.day.status === 'closed' || isAutoLocked;

                            const status = rec?.status || (isEffectivelyClosed ? 'absent' : 'none');
                            const proxyPhoto = rec?.proxyPhoto || (rec?.checkinSource === 'monitor_proxy' ? rec?.excusePhoto : null);
                            const proxyCaptureTime = rec?.proxyPhotoCaptureTime || rec?.excusePhotoCaptureTime || (rec?.checkinTime ? format24hDateTime(rec.checkinTime) : null);
                            const excusePhoto = rec?.checkinSource !== 'monitor_proxy' ? rec?.excusePhoto : null;
                            const excuseCaptureTime = rec?.excusePhotoCaptureTime || (rec?.excuseSubmittedAt ? format24hDateTime(rec.excuseSubmittedAt) : null);

                            return (
                              <tr key={s.id} className="hover:bg-[#F7F6F0]">
                                <td className="py-2 px-3 text-center text-[#5B6A61]">
                                  {idx + 1}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-[#1B241F]">
                                  {s.id}
                                </td>
                                <td className="py-2 px-3 text-[#1B241F] font-bold">
                                  {s.name}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  {status === 'present' && (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E1EEE8] text-[#245346]">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Có mặt
                                      </span>
                                      {rec?.checkinSource === 'manual' ? (
                                        <span className="text-[9px] text-amber-700 font-bold bg-amber-50 px-1 rounded">
                                          GV điểm danh
                                        </span>
                                      ) : rec?.checkinSource === 'monitor_proxy' ? (
                                        <span className="text-[9px] text-indigo-700 font-bold bg-indigo-50 px-1 rounded">
                                          BCS điểm danh
                                        </span>
                                      ) : (
                                        <span className="text-[9px] text-[#5B6A61] font-bold bg-gray-100 px-1 rounded">
                                          GPS
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {status === 'proxy_pending' && (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300 animate-pulse">
                                        <Clock className="w-3 h-3" />
                                        Có mặt tạm thời
                                      </span>
                                      <span className="text-[9px] text-indigo-700 font-semibold bg-indigo-50 px-1 rounded">
                                        BCS gửi ảnh
                                      </span>
                                    </div>
                                  )}
                                  {status === 'excused_approved' && (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900">
                                        <Check className="w-3 h-3" />
                                        Có phép
                                      </span>
                                      {rec?.excuseDebtType === 'owing_paper' ? (
                                        <span className="text-[9px] text-amber-900 font-bold bg-amber-100 px-1 rounded">
                                          Nợ đơn
                                        </span>
                                      ) : (
                                        <span className="text-[9px] text-emerald-800 font-bold bg-emerald-50 px-1 rounded">
                                          Có đơn
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {status === 'excused_pending' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F5E6D0] text-[#7A521E]">
                                      <Clock className="w-3 h-3" />
                                      Chờ duyệt đơn
                                    </span>
                                  )}
                                  {status === 'excused_rejected' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F5DED5] text-[#7A3115]">
                                      <XCircle className="w-3 h-3" />
                                      Từ chối phép
                                    </span>
                                  )}
                                  {status === 'absent' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F5DED5] text-[#7A3115]">
                                      <XCircle className="w-3 h-3" />
                                      Vắng mặt
                                    </span>
                                  )}
                                  {status === 'none' && (
                                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#EAE7DD] text-[#5B6A61]">
                                      Chưa điểm danh
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-[#5B6A61] font-mono text-[11px]">
                                  {fmtTime(rec?.checkinTime)}
                                </td>
                                <td className="py-2 px-3 text-[#5B6A61] text-[11px]">
                                  {rec?.distance !== undefined
                                    ? `~${rec.distance}m`
                                    : '—'}
                                </td>
                                <td className="py-2 px-3 text-[11px]">
                                  {proxyPhoto ? (
                                    <div className="flex flex-col gap-1 bg-indigo-50/70 p-1.5 rounded-lg border border-indigo-200">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onOpenLightbox({
                                            src: proxyPhoto,
                                            captureTime: proxyCaptureTime,
                                            submitTime: format24hDateTime(rec?.checkinTime || Date.now()),
                                            title: `Ảnh điểm danh hộ BCS - ${s.name} (${currentDetailClass.className})`
                                          })
                                        }
                                        className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-900 font-bold underline cursor-pointer text-left"
                                      >
                                        <Eye className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span>Xem ảnh BCS gửi</span>
                                      </button>
                                      <div className="text-[10px] text-slate-700 space-y-0.5 font-mono">
                                        <div><b className="font-sans">1. EXIF:</b> {proxyCaptureTime || '—'}</div>
                                        <div><b className="font-sans">2. Gửi:</b> {rec?.checkinTime ? format24hDateTime(rec.checkinTime) : '—'}</div>
                                      </div>
                                    </div>
                                  ) : excusePhoto ? (
                                    <div className="flex flex-col gap-1 bg-amber-50/70 p-1.5 rounded-lg border border-amber-200">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onOpenLightbox({
                                            src: excusePhoto,
                                            captureTime: excuseCaptureTime,
                                            submitTime: format24hDateTime(rec?.excuseSubmittedAt || Date.now()),
                                            title: `Đơn xin phép - ${s.name} (${currentDetailClass.className})`
                                          })
                                        }
                                        className="inline-flex items-center gap-1 text-[#3E7C6B] hover:text-[#1F3B32] font-bold underline cursor-pointer text-left"
                                      >
                                        <Eye className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span>Xem ảnh đơn</span>
                                      </button>
                                      <div className="text-[10px] text-slate-700 space-y-0.5 font-mono">
                                        <div><b className="font-sans">1. EXIF:</b> {excuseCaptureTime || '—'}</div>
                                        <div><b className="font-sans">2. Gửi:</b> {rec?.excuseSubmittedAt ? format24hDateTime(rec.excuseSubmittedAt) : '—'}</div>
                                      </div>
                                    </div>
                                  ) : rec?.excuseReason ? (
                                    <span
                                      className="text-[#5B6A61] truncate max-w-[120px] inline-block font-medium"
                                      title={rec.excuseReason}
                                    >
                                      {rec.excuseReason}
                                    </span>
                                  ) : (
                                    <span className="text-[#5B6A61]">—</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-[#5B6A61] text-[10px]">
                                  {rec?.lastUpdatedByTeacherAt ? (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="font-semibold text-amber-700">{rec.lastUpdatedAction}</span>
                                      <span className="text-amber-600/80">{fmtTime(rec.lastUpdatedByTeacherAt)} - {fmtDateVN(new Date(rec.lastUpdatedByTeacherAt).toISOString().slice(0, 10))}</span>
                                    </div>
                                  ) : (
                                    <span className="text-[#5B6A61]/50">—</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {status === 'proxy_pending' ? (
                                    <div className="flex items-center justify-end gap-1 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => handleAdminAdjustStatus(currentDetailClass.className, s.id, 'present', 'BGH duyệt điểm danh hộ: Có mặt chính thức')}
                                        className="px-2 py-0.5 bg-[#245346] hover:bg-[#1a3d34] text-white rounded text-[10px] font-bold cursor-pointer"
                                        title="BGH duyệt ảnh: Tính là Có mặt chính thức"
                                      >
                                        ✓ Duyệt có mặt
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleAdminAdjustStatus(currentDetailClass.className, s.id, 'absent', 'BGH từ chối điểm danh hộ: Ảnh không hợp lệ -> Vắng không phép')}
                                        className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold cursor-pointer"
                                        title="BGH từ chối: Ảnh không hợp lệ -> Vắng KP"
                                      >
                                        ✗ Hủy (Vắng KP)
                                      </button>
                                    </div>
                                  ) : status === 'present' || status === 'late' ? (
                                    <div className="flex items-center justify-end gap-1 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => handleAdminAdjustStatus(currentDetailClass.className, s.id, 'absent', 'BGH điều chỉnh: Ảnh/GPS không hợp lệ -> Vắng không phép')}
                                        className="px-2 py-0.5 bg-[#F5DED5] text-[#7A3115] hover:bg-[#eacbc0] rounded text-[10px] font-bold cursor-pointer border border-[#B3492F]/30"
                                        title="Ảnh hoặc GPS không hợp lệ: Đổi sang Vắng không phép"
                                      >
                                        ✗ Đổi: Vắng KP
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleAdminAdjustStatus(currentDetailClass.className, s.id, 'excused_approved', 'BGH điều chỉnh: Vắng có phép')}
                                        className="px-2 py-0.5 bg-[#F5E6D0] text-[#7A521E] hover:bg-[#e8d1af] rounded text-[10px] font-bold cursor-pointer border border-[#D4A96A]/50"
                                        title="Đổi sang Vắng có phép"
                                      >
                                        ✓ Đổi: Vắng CP
                                      </button>
                                    </div>
                                  ) : status === 'excused_approved' ? (
                                    <div className="flex items-center justify-end gap-1 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => handleAdminAdjustStatus(currentDetailClass.className, s.id, 'absent', 'BGH hủy phép: Chuyển sang Vắng không phép')}
                                        className="px-2 py-0.5 bg-[#F5DED5] text-[#7A3115] hover:bg-[#eacbc0] rounded text-[10px] font-bold cursor-pointer border border-[#B3492F]/30"
                                        title="Hủy phép: Chuyển sang Vắng không phép"
                                      >
                                        ✗ Đổi: Vắng KP
                                      </button>
                                    </div>
                                  ) : status === 'absent' || status === 'excused_rejected' ? (
                                    <div className="flex items-center justify-end gap-1 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => handleAdminAdjustStatus(currentDetailClass.className, s.id, 'excused_approved', 'BGH chuyển sang Vắng có phép')}
                                        className="px-2 py-0.5 bg-[#F5E6D0] text-[#7A521E] hover:bg-[#e8d1af] rounded text-[10px] font-bold cursor-pointer border border-[#D4A96A]/50"
                                        title="Chuyển sang Vắng có phép"
                                      >
                                        ✓ Chuyển: Vắng CP
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-[#5B6A61]/50 text-[10px]">—</span>
                                  )}
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

              {/* Student Roster Management */}
              <div className="pt-2 border-t border-[#D7DCCB]">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-xs font-bold text-[#1B241F] uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#3E7C6B]" />
                    Danh Sách Học Sinh Lớp {currentDetailClass.lop} ({currentDetailClass.roster.length} HS)
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowAdminAddStudentForm(!showAdminAddStudentForm)}
                    className="px-2.5 py-1 bg-[#3E7C6B] hover:bg-[#346a5b] text-white rounded-lg text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm học sinh</span>
                  </button>
                </div>

                {showAdminAddStudentForm && (
                  <div className="mb-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Mã HS (vd: 10A101)"
                      value={adminAddStudentId}
                      onChange={(e) => setAdminAddStudentId(e.target.value)}
                      className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-[#3E7C6B]"
                    />
                    <input
                      type="text"
                      placeholder="Họ và tên học sinh"
                      value={adminAddStudentName}
                      onChange={(e) => setAdminAddStudentName(e.target.value)}
                      className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#3E7C6B]"
                    />
                    <button
                      type="button"
                      onClick={handleAdminAddStudent}
                      className="px-3 py-1.5 bg-[#1F3B32] hover:bg-[#274A3E] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      Lưu
                    </button>
                  </div>
                )}

                <div className="border border-[#D7DCCB] rounded-xl overflow-hidden bg-white">
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#EEF1E7] text-[#1B241F] sticky top-0 font-bold border-b border-[#D7DCCB]">
                        <tr>
                          <th className="py-2 px-3 w-10 text-center">STT</th>
                          <th className="py-2 px-3 w-28">Mã HS</th>
                          <th className="py-2 px-3">Họ và tên</th>
                          <th className="py-2 px-3 w-20 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D7DCCB]/60 font-medium">
                        {currentDetailClass.roster.map((s, idx) => (
                          <tr key={s.id} className="hover:bg-[#F7F6F0]">
                            <td className="py-1.5 px-3 text-center text-[#5B6A61]">
                              {idx + 1}
                            </td>
                            <td className="py-1.5 px-3 font-mono font-bold text-[#1B241F]">
                              {s.id}
                            </td>
                            <td className="py-1.5 px-3 text-[#1B241F]">
                              {s.name}
                            </td>
                            <td className="py-1.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => setAdminEditingStudent({ originalId: s.id, id: s.id, name: s.name })}
                                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded cursor-pointer"
                                  title="Sửa học sinh"
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAdminDeletingStudent({ id: s.id, name: s.name })}
                                  className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer"
                                  title="Xóa học sinh"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#FBFAF5] border-[1.5px] border-[#D7DCCB] rounded-2xl p-8 shadow-xs text-center">
              <Users className="w-10 h-10 text-[#5B6A61] mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold text-[#1B241F]">
                Vui lòng chọn một lớp học ở danh sách bên trái để xem chi tiết.
              </p>
            </div>
          )}
        </div>
      </div>

      <ReportsModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        selectedLop={reportModalClass}
        isAdmin={true}
      />

      <AdminFlaggedModal
        isOpen={showFlaggedModal}
        onClose={() => setShowFlaggedModal(false)}
        classList={classList}
      />

      {/* Modal Báo cáo toàn trường (BGH) */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#FBFAF5] rounded-3xl p-6 w-full max-w-sm shadow-2xl relative border-2 border-[#1F3B32]/10">
            <button
              type="button"
              onClick={() => setShowReportModal(false)}
              className="absolute top-4 right-4 p-2 text-[#5B6A61] hover:bg-[#E1EEE8] hover:text-[#1F3B32] rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-extrabold text-[#1B241F] mb-4">
              Báo cáo toàn trường
            </h3>
            <p className="text-sm text-[#5B6A61] mb-4">
              Chức năng xuất báo cáo chuyên cần toàn trường (Excel) sẽ sớm được cập nhật.
            </p>
            <button
              type="button"
              onClick={() => setShowReportModal(false)}
              className="w-full py-2.5 bg-[#3E7C6B] text-white rounded-xl text-sm font-bold cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      )}


      <AdminExcuseAuditModal
        isOpen={showExcuseAuditModal}
        onClose={() => setShowExcuseAuditModal(false)}
        classList={classList}
        onOpenLightbox={onOpenLightbox}
      />

      {/* School-wide Class & Roster Management Modal */}
      {showClassMgmtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-[#FBFAF5] border-[1.5px] border-[#1F3B32] rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-[#D7DCCB]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#3E7C6B]/20 text-[#245346] flex items-center justify-center font-bold">
                  <Users className="w-5 h-5 text-[#3E7C6B]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#1B241F]">
                    Quản Lý Lớp Học & Nạp Danh Sách Toàn Trường (BGH)
                  </h3>
                  <p className="text-xs text-[#5B6A61]">
                    Ban Giám Hiệu tạo lớp, cài đặt mã PIN lớp và nạp danh sách học sinh. Giáo viên chủ nhiệm chỉ cần đăng nhập bằng tên lớp và mã PIN mà không cần tự tạo lớp.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowClassMgmtModal(false);
                  setEditingClass(null);
                  setMgmtErrorMsg(null);
                  setMgmtSuccessMsg(null);
                }}
                className="text-xs text-[#5B6A61] hover:text-[#1B241F] px-3 py-1.5 rounded-lg hover:bg-[#EEF1EC] transition-colors cursor-pointer font-bold"
              >
                Đóng ✕
              </button>
            </div>

            {mgmtErrorMsg && (
              <div className="p-3 bg-[#F5DED5] text-[#7A3115] border border-red-300 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{mgmtErrorMsg}</span>
              </div>
            )}

            {mgmtSuccessMsg && (
              <div className="p-3 bg-[#E1EEE8] text-[#245346] border border-[#3E7C6B]/40 rounded-xl text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{mgmtSuccessMsg}</span>
              </div>
            )}

            {/* School-wide Master File Upload Section (Auto-split classes) */}
            <div className="bg-[#E1EEE8] border border-[#3E7C6B]/40 rounded-2xl p-5 shadow-2xs space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-extrabold text-[#1B241F] flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-[#3E7C6B]" />
                  <span>Nạp File Tổng Toàn Trường (Tự Động Tách Lớp & Ghi Tên Lớp)</span>
                </h4>
                <button
                  type="button"
                  onClick={() => fileInputMasterRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3E7C6B] hover:bg-[#346a5b] text-[#F4F0E4] rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                  <span>Chọn File Excel/CSV Tổng Toàn Trường</span>
                </button>
                <input
                  type="file"
                  ref={fileInputMasterRef}
                  onChange={handleMasterFileUpload}
                  accept=".csv, .xlsx, .xls"
                  className="hidden"
                />
              </div>

              <p className="text-xs text-[#245346] leading-relaxed">
                File Excel/CSV gồm các cột: <b>Mã HS</b>, <b>Họ và tên</b>, và <b>Lớp</b>. Hệ thống sẽ tự động quét, đọc tên từng lớp, tách học sinh vào đúng lớp tương ứng và tạo toàn bộ lớp học cho toàn trường trong 1 cú nhấp chuột!
              </p>

              {masterFileStatus && (
                <p className="text-xs font-semibold text-[#1B241F] bg-white/80 p-2.5 rounded-lg border border-[#3E7C6B]/30">
                  {masterFileStatus}
                </p>
              )}

              {parsedMasterClasses && parsedMasterClasses.length > 0 && (
                <div className="bg-white border border-[#3E7C6B]/30 rounded-xl p-4 space-y-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-[#1B241F]">
                      Xem trước ({parsedMasterClasses.length} lớp được quét):
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#5B6A61]">Mã PIN mặc định cho các lớp mới:</span>
                      <input
                        type="text"
                        value={masterDefaultPin}
                        onChange={e => setMasterDefaultPin(e.target.value)}
                        className="w-24 bg-[#FAF8F2] border border-[#D7DCCB] rounded-lg px-2 py-1 text-xs font-mono font-bold text-[#1B241F]"
                      />
                    </div>
                  </div>

                  <div className="max-h-36 overflow-y-auto flex flex-wrap gap-2">
                    {parsedMasterClasses.map(item => (
                      <span key={item.lop} className="px-2.5 py-1 bg-[#EEF1EC] border border-[#D7DCCB] rounded-lg text-xs font-bold text-[#1B241F]">
                        Lớp {item.lop}: <span className="text-[#3E7C6B]">{item.students.length} HS</span>
                      </span>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmImportMasterClasses}
                    className="w-full py-2.5 bg-[#3E7C6B] hover:bg-[#346a5b] text-white rounded-xl text-xs font-extrabold shadow-sm transition-colors cursor-pointer"
                  >
                    🚀 Xác Nhận Nạp Toàn Trường & Tự Động Tạo Tất Cả {parsedMasterClasses.length} Lớp
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Create New Class Form */}
              <div className="bg-white border border-[#D7DCCB] rounded-2xl p-5 shadow-2xs space-y-4">
                <h4 className="text-sm font-extrabold text-[#1B241F] flex items-center gap-2 border-b border-[#D7DCCB] pb-2.5">
                  <Building2 className="w-4 h-4 text-[#3E7C6B]" />
                  <span>Tạo Lớp Mới & Nạp Danh Sách</span>
                </h4>

                <form onSubmit={handleCreateClassByAdmin} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-[#1B241F] mb-1">
                      Tên lớp (vd: 10A1, 11B2):
                    </label>
                    <input
                      type="text"
                      value={newClassName}
                      onChange={e => setNewClassName(e.target.value)}
                      placeholder="Nhập tên lớp..."
                      className="w-full bg-[#FAF8F2] border-[1.5px] border-[#D7DCCB] rounded-xl px-3.5 py-2 text-sm font-bold text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1B241F] mb-1">
                      Mã PIN bảo mật lớp (cho GVCN):
                    </label>
                    <input
                      type="text"
                      value={newClassPin}
                      onChange={e => setNewClassPin(e.target.value)}
                      placeholder="Mã PIN tối thiểu 4 ký tự..."
                      className="w-full bg-[#FAF8F2] border-[1.5px] border-[#D7DCCB] rounded-xl px-3.5 py-2 text-sm font-bold font-mono text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-[#1B241F]">
                        Danh sách học sinh (Mã HS, Họ tên):
                      </label>
                      <button
                        type="button"
                        onClick={() => fileInputMgmtRef.current?.click()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#EEF1EC] hover:bg-[#E2E6DE] text-[#1B241F] rounded-lg text-xs font-bold transition-colors cursor-pointer border border-[#D7DCCB]"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-[#3E7C6B]" />
                        <span>Tải file Excel/CSV</span>
                      </button>
                      <input
                        type="file"
                        ref={fileInputMgmtRef}
                        onChange={handleFileUploadMgmt}
                        accept=".csv, .xlsx, .xls"
                        className="hidden"
                      />
                    </div>
                    {newFileStatus && (
                      <p className="text-[11px] text-[#3E7C6B] font-medium mb-1.5">{newFileStatus}</p>
                    )}
                    <textarea
                      value={newRosterText}
                      onChange={e => setNewRosterText(e.target.value)}
                      rows={5}
                      placeholder="VD:&#10;HS001, Nguyễn Văn A&#10;HS002, Trần Thị B"
                      className="w-full bg-[#FAF8F2] border-[1.5px] border-[#D7DCCB] rounded-xl p-3 text-xs font-mono text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                    ></textarea>
                    <p className="text-[10px] text-[#5B6A61] mt-1">
                      Mỗi dòng gồm Mã học sinh và Họ tên phân tách bằng dấu phẩy.
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 bg-[#3E7C6B] hover:bg-[#346a5b] text-[#F4F0E4] rounded-xl text-xs font-extrabold transition-colors cursor-pointer shadow-sm"
                  >
                    + Tạo Lớp & Lưu Danh Sách
                  </button>
                </form>
              </div>

              {/* Right: Existing Classes List */}
              <div className="bg-white border border-[#D7DCCB] rounded-2xl p-5 shadow-2xs space-y-4 flex flex-col">
                <h4 className="text-sm font-extrabold text-[#1B241F] flex items-center justify-between border-b border-[#D7DCCB] pb-2.5">
                  <span className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#3E7C6B]" />
                    <span>Danh Sách Lớp Toàn Trường ({classList.length})</span>
                  </span>
                </h4>

                <div className="flex-1 overflow-y-auto max-h-[350px] space-y-2.5">
                  {classList.length === 0 ? (
                    <div className="text-center py-8 text-xs text-[#5B6A61]">
                      Chưa có lớp học nào trong trường. BGH hãy tạo lớp ở form bên trái.
                    </div>
                  ) : (
                    classList.map(lop => {
                      const roster = getRoster(lop);
                      const pin = getClassPin(lop) || 'Chưa đặt';
                      const isEditing = editingClass === lop;

                      return (
                        <div
                          key={lop}
                          className="p-3 bg-[#FBFAF5] border border-[#D7DCCB] rounded-xl space-y-2"
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="font-extrabold text-sm text-[#1B241F]">Lớp {lop}</span>
                              <span className="ml-2 text-xs text-[#5B6A61] font-medium">({roster.length} HS)</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-mono px-2 py-0.5 bg-[#EEF1EC] text-[#1B241F] rounded border border-[#D7DCCB]">
                                PIN: <b>{pin}</b>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isEditing) {
                                    setEditingClass(null);
                                  } else {
                                    setEditingClass(lop);
                                    setEditClassPin(getClassPin(lop) || '');
                                    setEditRosterText(roster.map(s => `${s.id}, ${s.name}`).join('\n'));
                                    setEditFileStatus('');
                                  }
                                }}
                                className="px-2.5 py-1 bg-[#3E7C6B]/10 hover:bg-[#3E7C6B]/20 text-[#245346] rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              >
                                {isEditing ? 'Đóng' : 'Sửa'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteClassByAdmin(lop)}
                                className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                title="Xóa lớp"
                              >
                                Xóa
                              </button>
                            </div>
                          </div>

                          {/* Edit Class Inline Panel */}
                          {isEditing && (
                            <form onSubmit={handleSaveEditedClass} className="pt-2 border-t border-[#D7DCCB] space-y-2.5 animate-in fade-in duration-150">
                              <div>
                                <label className="block text-[11px] font-bold text-[#1B241F] mb-1">
                                  Đổi mã PIN lớp {lop}:
                                </label>
                                <input
                                  type="text"
                                  value={editClassPin}
                                  onChange={e => setEditClassPin(e.target.value)}
                                  placeholder="Mã PIN mới..."
                                  className="w-full bg-white border border-[#D7DCCB] rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-[#1B241F]"
                                />
                              </div>

                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <label className="text-[11px] font-bold text-[#1B241F]">
                                    Cập nhật danh sách học sinh:
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => fileInputEditRef.current?.click()}
                                    className="px-2 py-0.5 bg-[#EEF1EC] text-[#1B241F] rounded text-[11px] font-bold cursor-pointer"
                                  >
                                    Tải file
                                  </button>
                                  <input
                                    type="file"
                                    ref={fileInputEditRef}
                                    onChange={handleFileUploadEdit}
                                    accept=".csv, .xlsx, .xls"
                                    className="hidden"
                                  />
                                </div>
                                {editFileStatus && (
                                  <p className="text-[10px] text-[#3E7C6B] font-medium mb-1">{editFileStatus}</p>
                                )}
                                <textarea
                                  value={editRosterText}
                                  onChange={e => setEditRosterText(e.target.value)}
                                  rows={4}
                                  className="w-full bg-white border border-[#D7DCCB] rounded-lg p-2 text-[11px] font-mono text-[#1B241F]"
                                ></textarea>
                              </div>

                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingClass(null)}
                                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold cursor-pointer"
                                >
                                  Hủy
                                </button>
                                <button
                                  type="submit"
                                  className="px-3 py-1 bg-[#3E7C6B] text-white rounded-lg text-xs font-bold cursor-pointer"
                                >
                                  Lưu Thay Đổi
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Admin Live Activity Real-time Modal */}
      {/* Modal Admin Sửa Học Sinh */}
      {adminEditingStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-extrabold text-[#1B241F]">
                ✏️ BGH Chỉnh sửa học sinh
              </h3>
              <button
                type="button"
                onClick={() => setAdminEditingStudent(null)}
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
                  value={adminEditingStudent.id}
                  onChange={(e) => setAdminEditingStudent({ ...adminEditingStudent, id: e.target.value })}
                  className="w-full bg-[#F7F6F0] border-2 border-[#D7DCCB] rounded-xl px-3.5 py-2 text-sm font-mono font-bold text-[#1B241F] focus:outline-none focus:border-[#3E7C6B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1B241F] uppercase mb-1">
                  Họ và tên học sinh:
                </label>
                <input
                  type="text"
                  value={adminEditingStudent.name}
                  onChange={(e) => setAdminEditingStudent({ ...adminEditingStudent, name: e.target.value })}
                  className="w-full bg-[#F7F6F0] border-2 border-[#D7DCCB] rounded-xl px-3.5 py-2 text-sm font-bold text-[#1B241F] focus:outline-none focus:border-[#3E7C6B]"
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAdminEditingStudent(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleAdminSaveEditStudent}
                className="flex-1 py-2.5 bg-[#3E7C6B] hover:bg-[#346a5b] text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Admin Xóa Học Sinh */}
      {adminDeletingStudent && (
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
                  Xóa học sinh khỏi danh sách lớp {activeClassDetail}.
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs font-semibold text-red-900 space-y-1">
              <div><b>Mã HS:</b> {adminDeletingStudent.id}</div>
              <div><b>Họ tên:</b> {adminDeletingStudent.name}</div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAdminDeletingStudent(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleAdminDeleteStudent}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm"
              >
                Xác nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
