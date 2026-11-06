import React, { useState } from 'react';
import {
  ShieldAlert,
  KeyRound,
  ArrowLeft,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  Building2,
  Lock,
} from 'lucide-react';
import { getMasterPin } from '../utils/storage';

interface AdminLockScreenProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const AdminLockScreen: React.FC<AdminLockScreenProps> = ({
  onSuccess,
  onCancel,
}) => {
  const [pin, setPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanPin = pin.trim();
    if (!cleanPin) {
      setErrorMsg('Vui lòng nhập mã PIN Quản trị hệ thống.');
      return;
    }

    const currentMasterPin = getMasterPin();
    if (cleanPin === currentMasterPin) {
      onSuccess();
    } else {
      setErrorMsg('Mã PIN Quản trị hệ thống không chính xác! Vui lòng thử lại.');
    }
  };

  return (
    <div className="max-w-md mx-auto my-6 bg-[#FBFAF5] border-[1.5px] border-[#1F3B32] rounded-2xl p-6 sm:p-7 shadow-md">
      {/* Top Header */}
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#1F3B32] text-[#F4F0E4] flex items-center justify-center mb-3 shadow-xs">
          <Building2 className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-extrabold text-[#1B241F] tracking-tight">
          Quản Trị Hệ Thống
        </h2>
        <p className="text-xs sm:text-sm text-[#5B6A61] mt-1 leading-relaxed">
          Khu vực dành cho Ban Giám Hiệu / Quản trị viên để giám sát, theo dõi số liệu điểm danh của tất cả các lớp trong toàn trường.
        </p>
      </div>

      <div className="p-3 bg-[#E1EEE8] text-[#245346] border border-[#3E7C6B]/30 rounded-xl text-xs font-semibold mb-5 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-[#3E7C6B]" />
        <span>
          <b>Quy định bảo mật:</b> Tài khoản Quản trị hệ thống có toàn quyền xem đầy đủ tất cả các lớp, nhưng <u>không có quyền xóa</u> bất kỳ dữ liệu nào.
        </span>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="mb-4 p-3 rounded-xl bg-[#F5DED5] text-[#7A3115] border border-[#B3492F]/30 text-xs font-semibold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label
            htmlFor="adminPinInput"
            className="block text-xs font-bold text-[#1B241F] uppercase tracking-wider mb-1.5"
          >
            Mã PIN Quản trị hệ thống (Master PIN)
          </label>
          <div className="relative">
            <input
              id="adminPinInput"
              type={showPin ? 'text' : 'password'}
              placeholder="Nhập mã PIN Quản trị viên..."
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
            * Vui lòng nhập mã PIN Quản trị viên để tiếp tục. (Đã được bảo mật để ngăn học sinh truy cập trái phép).
          </p>
        </div>

        <button
          id="btnUnlockAdmin"
          type="submit"
          className="w-full inline-flex items-center justify-center gap-2 bg-[#1F3B32] text-[#F4F0E4] hover:bg-[#274A3E] py-3 rounded-xl font-bold text-sm shadow-xs transition-colors cursor-pointer"
        >
          <KeyRound className="w-4 h-4" />
          Đăng nhập Quản Trị Hệ Thống
        </button>
      </form>

      {/* Back to Student */}
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
