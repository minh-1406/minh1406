/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { TeacherView } from './components/TeacherView';
import { TeacherLockScreen } from './components/TeacherLockScreen';
import { AdminView } from './components/AdminView';
import { AdminLockScreen } from './components/AdminLockScreen';
import { UnionLockScreen } from './components/UnionLockScreen';
import { StudentView } from './components/StudentView';
import { LightboxModal } from './components/LightboxModal';
import { UserGuideModal } from './components/UserGuideModal';
import { RoleLinksModal } from './components/RoleLinksModal';
import { UserRole, TeacherAuthState, AdminAuthState, UnionAuthState } from './types';
import {
  initializeSampleDataIfEmpty,
  getLopList,
  getSchoolId,
} from './utils/storage';
import { syncFromFirestore, subscribeAllSchoolData } from './utils/firestoreSync';

function getUrlRoleParam(): UserRole | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const r = params.get('role')?.trim().toLowerCase();
  if (r === 'student' || r === 'teacher' || r === 'admin' || r === 'union') {
    return r as UserRole;
  }
  return null;
}

function getUrlLopParam(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return params.get('lop')?.trim() || '';
}

export default function App() {
  const [lockedRole] = useState<UserRole | null>(() => getUrlRoleParam());
  const [role, setRole] = useState<UserRole>(() => getUrlRoleParam() || 'student');
  const [selectedLop, setSelectedLop] = useState<string>(() => getUrlLopParam());
  const [lightboxSrc, setLightboxSrc] = useState<any>(null);
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [showRoleLinksModal, setShowRoleLinksModal] = useState<boolean>(false);
  const [currentSchoolId, setCurrentSchoolId] = useState<string>(() => getSchoolId());

  // Teacher Authentication state
  const [teacherAuth, setTeacherAuth] = useState<TeacherAuthState>(() => {
    try {
      const saved = sessionStorage.getItem('teacher_auth_session');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // Ignore
    }
    return {
      isAuthenticated: false,
      activeClass: '',
      isMaster: false,
    };
  });

  // System Admin Authentication state
  const [adminAuth, setAdminAuth] = useState<AdminAuthState>(() => {
    try {
      const saved = sessionStorage.getItem('admin_auth_session');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // Ignore
    }
    return {
      isAuthenticated: false,
    };
  });

  // Union Authentication state
  const [unionAuth, setUnionAuth] = useState<UnionAuthState>(() => {
    try {
      const saved = sessionStorage.getItem('union_auth_session');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // Ignore
    }
    return {
      isAuthenticated: false,
    };
  });

  // Save teacher auth state to session storage
  const updateTeacherAuth = (newAuth: TeacherAuthState) => {
    setTeacherAuth(newAuth);
    try {
      sessionStorage.setItem('teacher_auth_session', JSON.stringify(newAuth));
    } catch (e) {
      // Ignore
    }
  };

  // Save admin auth state to session storage
  const updateAdminAuth = (newAuth: AdminAuthState) => {
    setAdminAuth(newAuth);
    try {
      sessionStorage.setItem('admin_auth_session', JSON.stringify(newAuth));
    } catch (e) {
      // Ignore
    }
  };

  // Save union auth state to session storage
  const updateUnionAuth = (newAuth: UnionAuthState) => {
    setUnionAuth(newAuth);
    try {
      sessionStorage.setItem('union_auth_session', JSON.stringify(newAuth));
    } catch (e) {
      // Ignore
    }
  };

  useEffect(() => {
    const checkSchoolChange = () => {
      const latestId = getSchoolId();
      setCurrentSchoolId((prev) => (prev !== latestId ? latestId : prev));
    };
    window.addEventListener('app_storage_updated', checkSchoolChange);
    window.addEventListener('popstate', checkSchoolChange);
    return () => {
      window.removeEventListener('app_storage_updated', checkSchoolChange);
      window.removeEventListener('popstate', checkSchoolChange);
    };
  }, []);

  useEffect(() => {
    initializeSampleDataIfEmpty();
    const urlLop = getUrlLopParam();

    // 1. Initial sync from Firestore for this isolated school
    syncFromFirestore().then(() => {
      const classes = getLopList();
      if (urlLop && classes.includes(urlLop)) {
        setSelectedLop(urlLop);
      } else if (classes.length > 0) {
        setSelectedLop((prev) => (prev && classes.includes(prev) ? prev : classes[0]));
      } else {
        setSelectedLop('');
      }
    });

    // 2. Setup real-time listener across all devices for this isolated school
    const unsubscribe = subscribeAllSchoolData(() => {
      const classes = getLopList();
      if (urlLop && classes.includes(urlLop)) {
        setSelectedLop((prev) => prev || urlLop);
      } else if (classes.length > 0) {
        setSelectedLop((prev) => (prev && classes.includes(prev) ? prev : classes[0]));
      } else {
        setSelectedLop('');
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentSchoolId]);

  // Handle successful teacher login
  const handleTeacherAuthSuccess = (lop: string, isMaster: boolean) => {
    updateTeacherAuth({
      isAuthenticated: true,
      activeClass: lop,
      isMaster: isMaster,
    });
    if (lop) {
      setSelectedLop(lop);
    }
    setRole('teacher');
  };

  // When teacher creates a new class in teacher view
  const handleClassCreated = (newLop: string) => {
    updateTeacherAuth({
      isAuthenticated: true,
      activeClass: newLop,
      isMaster: teacherAuth.isMaster,
    });
    setSelectedLop(newLop);
  };

  // Lock teacher session
  const handleLockTeacher = () => {
    updateTeacherAuth({
      isAuthenticated: false,
      activeClass: '',
      isMaster: false,
    });
    if (!lockedRole) {
      setRole('student');
    }
  };

  // Handle successful admin login
  const handleAdminAuthSuccess = () => {
    updateAdminAuth({
      isAuthenticated: true,
    });
    setRole('admin');
  };

  // Lock admin session
  const handleLockAdmin = () => {
    updateAdminAuth({
      isAuthenticated: false,
    });
    if (!lockedRole) {
      setRole('student');
    }
  };

  // Handle successful union login
  const handleUnionAuthSuccess = () => {
    updateUnionAuth({
      isAuthenticated: true,
    });
    setRole('union');
  };

  // Lock union session
  const handleLockUnion = () => {
    updateUnionAuth({
      isAuthenticated: false,
    });
    if (!lockedRole) {
      setRole('student');
    }
  };

  const isTeacherUnlockedForCurrent =
    teacherAuth.isAuthenticated &&
    Boolean(teacherAuth.activeClass || selectedLop);

  return (
    <div className="min-h-screen bg-[#EEF1E7] text-[#1B241F] py-7 px-4 sm:px-6">
      <div id="mainContainer" className="max-w-4xl mx-auto">
        {/* Top Header */}
        <Header
          role={role}
          setRole={setRole}
          lockedRole={lockedRole}
          isTeacherUnlocked={teacherAuth.isAuthenticated}
          onLockTeacher={handleLockTeacher}
          isAdminUnlocked={adminAuth.isAuthenticated}
          onLockAdmin={handleLockAdmin}
          isUnionUnlocked={unionAuth.isAuthenticated}
          onLockUnion={handleLockUnion}
          onOpenGuide={() => setShowGuideModal(true)}
          onOpenRoleLinks={() => setShowRoleLinksModal(true)}
        />

        {/* Dynamic Views */}
        <main>
          <AnimatePresence mode="wait">
            {role === 'teacher' ? (
              isTeacherUnlockedForCurrent ? (
                <motion.div
                  key="teacher-view"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <TeacherView
                    selectedLop={teacherAuth.activeClass || selectedLop}
                    setSelectedLop={(newClass) => {
                      setSelectedLop(newClass);
                      updateTeacherAuth({
                        ...teacherAuth,
                        activeClass: newClass,
                      });
                    }}
                    onOpenLightbox={(src) => setLightboxSrc(src)}
                    teacherAuth={teacherAuth}
                    onLockTeacher={handleLockTeacher}
                    onClassCreated={handleClassCreated}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="teacher-lock"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                >
                  <TeacherLockScreen
                    targetLop={selectedLop}
                    onSuccess={handleTeacherAuthSuccess}
                    onCancel={() => {
                      if (!lockedRole) setRole('student');
                    }}
                  />
                </motion.div>
              )
            ) : role === 'admin' ? (
              adminAuth.isAuthenticated ? (
                <motion.div
                  key="admin-view"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <AdminView
                    onOpenLightbox={(src) => setLightboxSrc(src)}
                    onLockAdmin={handleLockAdmin}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="admin-lock"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                >
                  <AdminLockScreen
                    onSuccess={handleAdminAuthSuccess}
                    onCancel={() => {
                      if (!lockedRole) setRole('student');
                    }}
                  />
                </motion.div>
              )
            ) : role === 'union' ? (
              unionAuth.isAuthenticated ? (
                <motion.div
                  key="union-view"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <AdminView
                    onOpenLightbox={(src) => setLightboxSrc(src)}
                    onLockAdmin={handleLockUnion}
                    isUnion={true}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="union-lock"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                >
                  <UnionLockScreen
                    onSuccess={handleUnionAuthSuccess}
                    onCancel={() => {
                      if (!lockedRole) setRole('student');
                    }}
                  />
                </motion.div>
              )
            ) : (
              <motion.div
                key="student-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <StudentView
                  selectedLop={selectedLop}
                  setSelectedLop={setSelectedLop}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer info */}
        <footer className="mt-8 text-xs text-[#5B6A61] leading-relaxed border-t border-[#D7DCCB] pt-4">
          <p>
            Hệ thống tự mở điểm danh mỗi ngày theo khung giờ đã cấu hình cho từng lớp — học sinh tự vào điểm danh, không cần giáo viên bấm bắt đầu.
            Giáo viên chỉ cần xem bảng, duyệt đơn xin phép và đóng điểm danh khi hết giờ. Định vị GPS và dấu vân thiết bị giúp phát hiện các trường hợp
            điểm danh hộ phổ biến. Quản trị hệ thống có thể theo dõi tiến độ điểm danh toàn trường theo thời gian thực.
          </p>
        </footer>
      </div>

      {/* Lightbox for Excuse Photos */}
      <LightboxModal
        src={lightboxSrc}
        onClose={() => setLightboxSrc(null)}
      />

      {/* Interactive User Guide Modal */}
      <UserGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
      />

      {/* Dedicated Role Links & QR Code Generator Modal */}
      <RoleLinksModal
        isOpen={showRoleLinksModal}
        onClose={() => setShowRoleLinksModal(false)}
        currentRole={role}
        selectedLop={selectedLop}
      />
    </div>
  );
}

