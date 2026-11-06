import React, { useState, useEffect } from 'react';
import {
  Lock,
  KeyRound,
  PlusCircle,
  ArrowLeft,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import {
  getLopList,
  checkClassPin,
  setClassPin,
  setRoster,
  getMasterPin,
} from '../utils/storage';
import { syncSaveRoster, syncSaveClassPin } from '../utils/firestoreSync';

interface TeacherLockScreenProps {
  onSuccess: (lop: string, isMaster: boolean) => void;
  onCancel: () => void;
  targetLop?: string;
}

export const TeacherLockScreen: React.FC<TeacherLockScreenProps> = ({
  onSuccess,
  onCancel,
  targetLop,
}) => {
  const [lopList, setLopList] = useState<string[]>(() => getLopList());
  const [mode, setMode] = useState<'login' | 'create'>('login');

  // Login form
  const [selectedLop, setSelectedLop] = useState<string>(
    targetLop || getLopList()[0] || ''
  );
  const [pin, setPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Create class form
  const [newClassName, setNewClassName] = useState<string>('');
  const [newClassPin, setNewClassPin] = useState<string>('');
  const [confirmClassPin, setConfirmClassPin] = useState<string>('');
  const [showNewPin, setShowNewPin] = useState<boolean>(false);

  useEffect(() => {
    const handleStorageUpdate = () => {
      const list = getLopList();
      setLopList(list);
      if (list.length > 0 && (!selectedLop || !list.includes(selectedLop))) {
        setSelectedLop(list[0]);
      }
    };
    window.addEventListener('app_storage_updated', handleStorageUpdate);
    return () => {
      window.removeEventListener('app_storage_updated', handleStorageUpdate);
    };
  }, [selectedLop]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedLop && lopList.length > 0) {
      setErrorMsg('Vui lòng chọn lớp học cần quản lý.');
      return;
    }

    if (!pin.trim()) {
      setErrorMsg('Vui lòng nhập mã PIN hoặc Mật khẩu Giáo viên.');
      return;
    }

    // Check with class pin or master pin
    const res = checkClassPin(selectedLop, pin);
    if (res.valid) {
      onSuccess(selectedLop, res.isMaster);
    } else {
      setErrorMsg(
        'Mã PIN không chính xác! Vui lòng nhập đúng mã PIN của giáo viên lớp này hoặc mã PIN quản trị.'
      );
    }
  };

  const handleCreateClass = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanName = newClassName.trim();
    if (!cleanName) {
      setErrorMsg('Vui lòng nhập tên lớp học (vd: 10A2).');
      return;
    }

    if (lopList.map((l) => l.toLowerCase()).includes(cleanName.toLowerCase())) {
      setErrorMsg(`Lớp "${cleanName}" đã tồn tại trên hệ thống.`);
      return;
    }

    if (!newClassPin || newClassPin.length < 4) {
      setErrorMsg('Mã PIN bảo mật của lớp phải có ít nhất 4 ký tự.');
      return;
    }

    if (newClassPin !== confirmClassPin) {
      setErrorMsg('Xác nhận mã PIN không trùng khớp.');
      return;
    }

    // Set class and pin locally and sync to Firestore
    setRoster(cleanName, []);
    syncSaveRoster(cleanName, []);
    setClassPin(cleanName, newClassPin);
    syncSaveClassPin(cleanName, newClassPin);
    onSuccess(cleanName, false);
  };

  return (
    <div className="max-w-md mx-auto my-4 bg-[#FBFAF5] border-[1.5px] border-[#1F3B32] rounded-2xl p-6 sm:p-7 shadow-md">
      {/* Top Header */}
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#1F3B32] text-[#F4F0E4] flex items-center justify-center mb-3 shadow-xs">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-extrabold text-[#1B241F] tracking-tight">
          Xác thực Giáo viên
        </h2>
        <p className="text-xs sm:text-sm text-[#5B6A61] mt-1 leading-relaxed">
          Khu vực bảo mật chỉ dành riêng cho giáo viên phụ trách lớp. Học sinh không có quyền truy cập.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex bg-[#EEF1E7] p-1 rounded-xl mb-5 border border-[#D7DCCB]">
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setErrorMsg('');
          }}
          className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer ${
            mode === 'login'
              ? 'bg-[#1F3B32] text-[#F4F0E4] shadow-xs'
              : 'text-[#5B6A61] hover:text-[#1B241F]'
          }`}
        >
          Đăng nhập lớp
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('create');
            setErrorMsg('');
          }}
          className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer ${
            mode === 'create'
              ? 'bg-[#1F3B32] text-[#F4F0E4] shadow-xs'
              : 'text-[#5B6A61] hover:text-[#1B241F]'
          }`}
        >
          Tạo lớp mới &amp; Đặt PIN
        </button>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="mb-4 p-3 rounded-xl bg-[#F5DED5] text-[#7A3115] border border-[#B3492F]/30 text-xs font-semibold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {mode === 'login' ? (
        <form onSubmit={handleLogin} className="space-y-4">
          {lopList.length > 0 ? (
            <div>
              <label
                htmlFor="authClassSelect"
                className="block text-xs font-bold text-[#1B241F] uppercase tracking-wider mb-1.5"
              >
                Chọn lớp cần quản lý
              </label>
              <select
                id="authClassSelect"
                value={selectedLop}
                onChange={(e) => setSelectedLop(e.target.value)}
                className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-xl px-3.5 py-2.5 text-sm text-[#1B241F] font-semibold focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
              >
                {lopList.map((l) => (
                  <option key={l} value={l}>
                    Lớp {l}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="p-3.5 bg-[#F5E6D0] text-[#7A521E] rounded-xl text-xs font-medium">
              Chưa có lớp nào trong hệ thống. Vui lòng chuyển sang tab <b>"Tạo lớp mới &amp; Đặt PIN"</b> để khởi tạo lớp đầu tiên.
            </div>
          )}

          <div>
            <label
              htmlFor="authPinInput"
              className="block text-xs font-bold text-[#1B241F] uppercase tracking-wider mb-1.5"
            >
              Mã PIN / Mật khẩu Giáo viên
            </label>
            <div className="relative">
              <input
                id="authPinInput"
                type={showPin ? 'text' : 'password'}
                placeholder="Nhập mã PIN giáo viên..."
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5B6A61] hover:text-[#1B241F] p-1"
                title={showPin ? 'Ẩn mã PIN' : 'Hiện mã PIN'}
              >
                {showPin ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-[11px] text-[#5B6A61] mt-1.5">
              * Nhập mã PIN do giáo viên phụ trách lớp đặt hoặc mã PIN Quản trị viên để quản lý.
            </p>
          </div>

          <button
            id="btnUnlockTeacher"
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 bg-[#1F3B32] text-[#F4F0E4] hover:bg-[#274A3E] py-3 rounded-xl font-bold text-sm shadow-xs transition-colors cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
            Mở khóa giao diện Giáo viên
          </button>
        </form>
      ) : (
        <form onSubmit={handleCreateClass} className="space-y-4">
          <div>
            <label
              htmlFor="newClassInput"
              className="block text-xs font-bold text-[#1B241F] uppercase tracking-wider mb-1.5"
            >
              Tên lớp học mới
            </label>
            <input
              id="newClassInput"
              type="text"
              placeholder="Vd: 10A1, 11B2..."
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-xl px-3.5 py-2.5 text-sm text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="newClassPinInput"
              className="block text-xs font-bold text-[#1B241F] uppercase tracking-wider mb-1.5"
            >
              Mã PIN bảo mật riêng cho lớp
            </label>
            <div className="relative">
              <input
                id="newClassPinInput"
                type={showNewPin ? 'text' : 'password'}
                placeholder="Tối thiểu 4 số/ký tự (vd: 2026, 8888)"
                value={newClassPin}
                onChange={(e) => setNewClassPin(e.target.value)}
                className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
              />
              <button
                type="button"
                onClick={() => setShowNewPin(!showNewPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5B6A61] hover:text-[#1B241F] p-1"
              >
                {showNewPin ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirmClassPinInput"
              className="block text-xs font-bold text-[#1B241F] uppercase tracking-wider mb-1.5"
            >
              Xác nhận mã PIN
            </label>
            <input
              id="confirmClassPinInput"
              type={showNewPin ? 'text' : 'password'}
              placeholder="Nhập lại mã PIN ở trên"
              value={confirmClassPin}
              onChange={(e) => setConfirmClassPin(e.target.value)}
              className="w-full bg-white border-[1.5px] border-[#D7DCCB] rounded-xl px-3.5 py-2.5 text-sm text-[#1B241F] focus:outline-none focus:ring-2 focus:ring-[#3E7C6B]"
            />
          </div>

          <button
            id="btnCreateClassAndUnlock"
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 bg-[#1F3B32] text-[#F4F0E4] hover:bg-[#274A3E] py-3 rounded-xl font-bold text-sm shadow-xs transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Tạo lớp &amp; Mở khóa quản lý
          </button>
        </form>
      )}

      {/* Back to Student button */}
      <div className="mt-5 pt-4 border-t border-[#D7DCCB] text-center">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5B6A61] hover:text-[#1B241F] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lại vai trò Học sinh</span>
        </button>
      </div>
    </div>
  );
};
