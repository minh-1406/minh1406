import React, { useState, useEffect } from 'react';
import {
  Building2,
  UserCheck,
  Users,
  Lock,
  Unlock,
  BookOpen,
} from 'lucide-react';
import { UserRole } from '../types';
import { getSchoolId, getSchoolName, getSchoolLogo } from '../utils/storage';
import logoImg from '../assets/images/app-logo.jpg';

interface HeaderProps {
  role: UserRole;
  setRole: (role: UserRole) => void;
  isTeacherUnlocked: boolean;
  onLockTeacher: () => void;
  isAdminUnlocked: boolean;
  onLockAdmin: () => void;
  isUnionUnlocked: boolean;
  onLockUnion: () => void;
  onOpenGuide?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  role,
  setRole,
  isTeacherUnlocked,
  onLockTeacher,
  isAdminUnlocked,
  onLockAdmin,
  isUnionUnlocked,
  onLockUnion,
  onOpenGuide,
}) => {
  const [schoolId, setSchoolId] = useState<string>(getSchoolId());
  const [schoolName, setSchoolName] = useState<string>(getSchoolName());
  const [schoolLogo, setSchoolLogo] = useState<string>(getSchoolLogo());

  useEffect(() => {
    const syncHeaderSchool = () => {
      const currentId = getSchoolId();
      const currentName = getSchoolName();
      const currentLogo = getSchoolLogo();
      setSchoolId(currentId);
      setSchoolName(currentName);
      setSchoolLogo(currentLogo);
      if (currentName && currentName !== 'DEFAULT') {
        document.title = `Điểm Danh GPS — ${currentName}`;
      } else {
        document.title = 'Điểm Danh GPS — Quản Lý Chuyên Cần Thông Minh';
      }
    };

    syncHeaderSchool();
    window.addEventListener('app_storage_updated', syncHeaderSchool);
    return () => {
      window.removeEventListener('app_storage_updated', syncHeaderSchool);
    };
  }, []);

  const hasSchool = schoolName && schoolName !== 'DEFAULT';

  return (
    <header className="flex justify-between items-end gap-4 flex-wrap border-b-2 border-[#1F3B32] pb-4 mb-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-white flex items-center justify-center shadow-xs border border-[#1F3B32]/15 shrink-0">
          <img
            src={schoolLogo || logoImg}
            alt={hasSchool ? `Logo ${schoolName}` : 'App Logo'}
            className="w-full h-full object-contain p-0.5"
          />
        </div>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#1B241F] tracking-tight leading-tight">
              Điểm Danh GPS {hasSchool ? `— ${schoolName}` : ''}
            </h1>
            {hasSchool && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#1F3B32] text-[#F4F0E4] shadow-xs"
                title={`Mã không gian dữ liệu riêng: ${schoolId}`}
              >
                <Building2 className="w-3 h-3 text-emerald-300" />
                <span>Đơn vị: {schoolName}</span>
              </span>
            )}
          </div>
          <p className="text-[#5B6A61] text-xs sm:text-sm mt-0.5">
            {hasSchool ? (
              <>
                Hệ thống điểm danh độc lập của <b className="text-[#1F3B32]">{schoolName}</b> — Dữ liệu bảo mật &amp; tách biệt 100%
              </>
            ) : (
              <>Học sinh tự điểm danh theo định vị GPS — Giáo viên &amp; Quản trị theo dõi trực tiếp</>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-[#FBFAF5] border-[1.5px] border-[#1F3B32] rounded-full p-1 shadow-xs">
          <button
            id="btnTeacherRole"
            type="button"
            onClick={() => setRole('teacher')}
            className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-full font-semibold text-xs sm:text-sm transition-all duration-200 cursor-pointer ${
              role === 'teacher'
                ? 'bg-[#1F3B32] text-[#F4F0E4] shadow-xs'
                : 'text-[#1F3B32] hover:bg-[#1F3B32]/10'
            }`}
          >
            {isTeacherUnlocked ? (
              <Unlock className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
            <span>Giáo viên</span>
          </button>

          <button
            id="btnAdminRole"
            type="button"
            onClick={() => setRole('admin')}
            className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-full font-semibold text-xs sm:text-sm transition-all duration-200 cursor-pointer ${
              role === 'admin'
                ? 'bg-[#1F3B32] text-[#F4F0E4] shadow-xs'
                : 'text-[#1F3B32] hover:bg-[#1F3B32]/10'
            }`}
          >
            {isAdminUnlocked ? (
              <Unlock className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
            <span>Quản trị</span>
          </button>

          <button
            id="btnUnionRole"
            type="button"
            onClick={() => setRole('union')}
            className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-full font-semibold text-xs sm:text-sm transition-all duration-200 cursor-pointer ${
              role === 'union'
                ? 'bg-[#1F3B32] text-[#F4F0E4] shadow-xs'
                : 'text-[#1F3B32] hover:bg-[#1F3B32]/10'
            }`}
          >
            {isUnionUnlocked ? (
              <Unlock className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
            <span>Đoàn trường</span>
          </button>

          <button
            id="btnStudentRole"
            type="button"
            onClick={() => setRole('student')}
            className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-full font-semibold text-xs sm:text-sm transition-all duration-200 cursor-pointer ${
              role === 'student'
                ? 'bg-[#1F3B32] text-[#F4F0E4] shadow-xs'
                : 'text-[#1F3B32] hover:bg-[#1F3B32]/10'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Học sinh</span>
          </button>
        </div>

        {role === 'teacher' && isTeacherUnlocked && (
          <button
            id="btnHeaderLockTeacher"
            type="button"
            onClick={onLockTeacher}
            className="flex items-center gap-1 px-3 py-2 border border-[#B3492F]/40 text-[#B3492F] hover:bg-[#F5DED5] rounded-full text-xs font-bold transition-colors cursor-pointer"
            title="Khóa quyền giáo viên ngay"
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Khóa GV</span>
          </button>
        )}

        {role === 'admin' && isAdminUnlocked && (
          <button
            id="btnHeaderLockAdmin"
            type="button"
            onClick={onLockAdmin}
            className="flex items-center gap-1 px-3 py-2 border border-[#B3492F]/40 text-[#B3492F] hover:bg-[#F5DED5] rounded-full text-xs font-bold transition-colors cursor-pointer"
            title="Khóa quyền quản trị ngay"
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Khóa QTV</span>
          </button>
        )}

        {role === 'union' && isUnionUnlocked && (
          <button
            id="btnHeaderLockUnion"
            type="button"
            onClick={onLockUnion}
            className="flex items-center gap-1 px-3 py-2 border border-[#B3492F]/40 text-[#B3492F] hover:bg-[#F5DED5] rounded-full text-xs font-bold transition-colors cursor-pointer"
            title="Khóa phiên làm việc Đoàn trường ngay"
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Khóa Đoàn</span>
          </button>
        )}

        {onOpenGuide && (
          <button
            id="btnOpenUserGuide"
            type="button"
            onClick={onOpenGuide}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#FAF9F5] border-[1.5px] border-[#1F3B32] hover:bg-[#EEF1E7] text-[#1F3B32] rounded-full font-bold text-xs sm:text-sm transition-colors cursor-pointer shadow-xs"
            title="Xem cẩm nang hướng dẫn sử dụng chi tiết"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#3E7C6B]" />
            <span className="hidden sm:inline">Hướng dẫn</span>
          </button>
        )}
      </div>
    </header>
  );
};


