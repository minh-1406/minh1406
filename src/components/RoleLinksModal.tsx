import React, { useState } from 'react';
import {
  QrCode,
  Link2,
  Copy,
  Check,
  X,
  Download,
  ExternalLink,
  UserCheck,
  GraduationCap,
  ShieldCheck,
  Award,
  School,
} from 'lucide-react';
import { UserRole } from '../types';
import { getSchoolId, getSchoolName, getLopList } from '../utils/storage';

interface RoleLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: UserRole;
  selectedLop?: string;
}

interface RoleConfigItem {
  role: UserRole;
  title: string;
  subtitle: string;
  badgeColor: string;
  icon: React.ReactNode;
}

export const RoleLinksModal: React.FC<RoleLinksModalProps> = ({
  isOpen,
  onClose,
  currentRole,
  selectedLop,
}) => {
  const [copiedRole, setCopiedRole] = useState<string | null>(null);
  const [filterClass, setFilterClass] = useState<string>(selectedLop || '');

  if (!isOpen) return null;

  const schoolId = getSchoolId();
  const schoolName = getSchoolName();
  const classes = getLopList();

  const buildRoleUrl = (targetRole: UserRole, lop?: string) => {
    const baseUrl = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    if (schoolId && schoolId !== 'default') {
      params.set('school', schoolId);
    }
    params.set('role', targetRole);
    if (lop && (targetRole === 'student' || targetRole === 'teacher')) {
      params.set('lop', lop);
    }
    return `${baseUrl}?${params.toString()}`;
  };

  const getQrImageUrl = (url: string) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(
      url
    )}`;
  };

  const handleCopy = (roleKey: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedRole(roleKey);
    setTimeout(() => setCopiedRole(null), 2000);
  };

  const roleConfigs: RoleConfigItem[] = [
    {
      role: 'student',
      title: 'Cổng Học Sinh',
      subtitle: 'Chỉ hiện giao diện Điểm danh GPS & Gửi đơn xin phép (Ẩn các mục quản lý)',
      badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      icon: <UserCheck className="w-5 h-5 text-emerald-700" />,
    },
    {
      role: 'teacher',
      title: 'Cổng Giáo Viên Chủ Nhiệm',
      subtitle: 'Vào thẳng trang đăng nhập & quản lý lớp của GVCN',
      badgeColor: 'bg-blue-100 text-blue-900 border-blue-300',
      icon: <GraduationCap className="w-5 h-5 text-blue-700" />,
    },
    {
      role: 'union',
      title: 'Cổng Đoàn Trường',
      subtitle: 'Vào thẳng trang theo dõi nền nếp & chuyên cần của Đoàn trường',
      badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
      icon: <Award className="w-5 h-5 text-amber-700" />,
    },
    {
      role: 'admin',
      title: 'Cổng Quản Trị (BGH)',
      subtitle: 'Vào thẳng trang Quản trị hệ thống & Thống kê toàn trường',
      badgeColor: 'bg-purple-100 text-purple-900 border-purple-300',
      icon: <ShieldCheck className="w-5 h-5 text-purple-700" />,
    },
  ];

  // If teacher opens this, show Student & Teacher links prominently
  const visibleRoles =
    currentRole === 'teacher'
      ? roleConfigs.filter((r) => r.role === 'student' || r.role === 'teacher')
      : roleConfigs;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#FAF9F5] border-2 border-[#1F3B32] rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#D7DCCB] pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#1F3B32] text-[#F4F0E4] flex items-center justify-center shrink-0 shadow-xs">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-[#1B241F]">
                Chia sẻ Link &amp; Mã QR Riêng Cho Từng Bộ Phận
              </h2>
              <p className="text-xs sm:text-sm text-[#5B6A61]">
                Khi truy cập bằng Link hoặc Mã QR riêng, người dùng sẽ vào thẳng đúng cổng của mình (ẩn các tab khác).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#5B6A61] hover:text-[#1B241F] hover:bg-[#EEF1E7] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Class pre-select option */}
        <div className="bg-[#EEF1E7] border border-[#1F3B32]/20 rounded-xl p-3.5 mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#1F3B32]">
            <School className="w-4 h-4 text-[#245346]" />
            <span>Chọn sẵn Lớp trong Link / Mã QR (Tùy chọn cho Học sinh &amp; GVCN):</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="px-3 py-1.5 bg-white border border-[#1F3B32]/30 rounded-lg text-xs sm:text-sm font-bold text-[#1B241F] focus:outline-none"
            >
              <option value="">-- Tất cả các lớp (Tự chọn lớp) --</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  Lớp {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Grid of Role Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleRoles.map((item) => {
            const url = buildRoleUrl(item.role, filterClass);
            const qrUrl = getQrImageUrl(url);
            const isCopied = copiedRole === item.role;

            return (
              <div
                key={item.role}
                className="bg-white border border-[#D7DCCB] rounded-xl p-4 shadow-xs flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <h3 className="font-extrabold text-[#1B241F] text-base">
                        {item.title}
                      </h3>
                    </div>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${item.badgeColor}`}
                    >
                      {filterClass && (item.role === 'student' || item.role === 'teacher')
                        ? `Lớp ${filterClass}`
                        : schoolName !== 'DEFAULT'
                        ? schoolName
                        : 'Cổng riêng'}
                    </span>
                  </div>
                  <p className="text-xs text-[#5B6A61] leading-relaxed">
                    {item.subtitle}
                  </p>
                </div>

                {/* QR Code Display */}
                <div className="flex items-center gap-4 bg-[#FAF9F5] p-3 rounded-xl border border-[#E5E7EB]">
                  <div className="w-28 h-28 bg-white p-1.5 rounded-lg border border-[#D7DCCB] shrink-0 flex items-center justify-center">
                    <img
                      src={qrUrl}
                      alt={`QR ${item.title}`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="text-[11px] font-mono text-slate-600 bg-white p-2 rounded border border-slate-200 break-all line-clamp-2">
                      {url}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCopy(item.role, url)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isCopied
                            ? 'bg-emerald-700 text-white'
                            : 'bg-[#1F3B32] hover:bg-[#245346] text-[#F4F0E4]'
                        }`}
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Đã chép link</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Sao chép Link</span>
                          </>
                        )}
                      </button>

                      <a
                        href={qrUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={`QR-${item.role}${filterClass ? `-${filterClass}` : ''}.png`}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-[#1F3B32] border border-[#1F3B32]/30 rounded-lg text-xs font-bold transition-colors"
                        title="Mở / Tải ảnh Mã QR"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Tải QR</span>
                      </a>

                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-colors"
                        title="Mở thử cổng này"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="mt-5 pt-3 border-t border-[#D7DCCB] flex items-center justify-between flex-wrap gap-2 text-xs text-[#5B6A61]">
          <span>
            💡 <b>Mẹo triển khai:</b> Gửi Link/QR <b>Cổng Học Sinh</b> vào nhóm Zalo lớp để học sinh chỉ thấy đúng màn hình điểm danh của lớp mình.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1F3B32] text-white rounded-lg font-bold cursor-pointer hover:bg-[#245346]"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
