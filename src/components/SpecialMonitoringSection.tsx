import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ShieldCheck, Check, X, Smartphone } from 'lucide-react';
import { Student, SpecialCheckinRule, PendingDeviceRequest } from '../types';
import { 
  syncGetSpecialRules, 
  syncSaveSpecialRule, 
  syncDeleteSpecialRule,
  syncGetPendingDevices,
  syncDeletePendingDevice
} from '../utils/firestoreSync';
import { sSet } from '../utils/storage';

interface SpecialMonitoringSectionProps {
  roster: Student[];
}

export const SpecialMonitoringSection: React.FC<SpecialMonitoringSectionProps> = ({ roster }) => {
  const [rules, setRules] = useState<SpecialCheckinRule[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingDeviceRequest[]>([]);
  const [newStudentId, setNewStudentId] = useState('');
  
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const dataRules = await syncGetSpecialRules();
    setRules(dataRules);
    const dataDevices = await syncGetPendingDevices();
    setPendingRequests(dataDevices);
  };

  const addRule = async () => {
    const student = roster.find(s => s.id === newStudentId);
    if (!student) return alert('Học sinh không tồn tại trong lớp!');
    
    const newRule: SpecialCheckinRule = {
      studentId: student.id,
      studentName: student.name,
      timeSlots: [{ startTime: '08:00', endTime: '09:00' }],
      forceGps: true,
      forcePhoto: true,
      isActive: true,
    };
    await syncSaveSpecialRule(newRule);
    setNewStudentId('');
    loadData();
  };

  const updateRule = async (rule: SpecialCheckinRule) => {
    await syncSaveSpecialRule(rule);
    loadData();
  };

  const deleteRule = async (studentId: string) => {
    await syncDeleteSpecialRule(studentId);
    loadData();
  };

  const handleApproveDevice = async (req: PendingDeviceRequest) => {
    // Mark as approved in local storage cache
    const approvedKey = `approvedDevice:${req.studentId}:${req.fingerprint}`;
    sSet(approvedKey, true);

    // Also add to deviceHistory for that student
    const historyKey = `deviceHistory:${req.studentId}`;
    const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    if (!history.includes(req.fingerprint)) {
      history.push(req.fingerprint);
      localStorage.setItem(historyKey, JSON.stringify(history));
    }

    await syncDeletePendingDevice(req.id);
    loadData();
    alert(`Đã phê duyệt thiết bị mới cho học sinh ${req.studentName} (${req.studentId}) thành công!`);
  };

  const handleRejectDevice = async (reqId: string) => {
    await syncDeletePendingDevice(reqId);
    loadData();
    alert('Đã từ chối yêu cầu đăng ký thiết bị mới.');
  };

  return (
    <div className="space-y-4">
      {/* Pending Device Approvals Section */}
      {pendingRequests.length > 0 && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-sm space-y-3">
          <h3 className="text-sm font-black text-amber-950 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-amber-700 animate-pulse" />
            Yêu cầu phê duyệt thiết bị mới vượt ngưỡng ({pendingRequests.length})
          </h3>
          <div className="space-y-2">
            {pendingRequests.map(req => (
              <div key={req.id} className="p-3 bg-white border border-amber-200 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-[#1B241F]">{req.studentName} <span className="text-gray-500 font-mono font-normal">({req.studentId})</span></div>
                  <div className="text-[11px] text-gray-600 font-mono mt-0.5">Mã thiết bị (FP): {req.fingerprint.substring(0, 16)}...</div>
                  <div className="text-[10px] text-amber-800 mt-0.5">Yêu cầu lúc: {new Date(req.requestedAt).toLocaleTimeString()}</div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleApproveDevice(req)} 
                    className="px-3 py-1.5 bg-[#245346] hover:bg-[#1a3d34] text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                    title="Phê duyệt máy mới"
                  >
                    <Check className="w-3.5 h-3.5" /> Duyệt
                  </button>
                  <button 
                    onClick={() => handleRejectDevice(req.id)} 
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                    title="Từ chối"
                  >
                    <X className="w-3.5 h-3.5" /> Từ chối
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Special Monitoring Rules Section */}
      <div className="p-4 bg-white border border-[#D7DCCB] rounded-2xl shadow-sm space-y-4">
        <h3 className="text-sm font-black text-[#1F3B32] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Học sinh cần giám sát đặc biệt & Cài đặt khung giờ riêng
        </h3>
        
        <div className="flex gap-2">
          <select value={newStudentId} onChange={(e) => setNewStudentId(e.target.value)} className="flex-1 p-2 border border-[#D7DCCB] rounded-lg text-xs">
            <option value="">Chọn học sinh...</option>
            {roster.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
          </select>
          <button onClick={addRule} className="px-3 py-2 bg-[#1F3B32] text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer">
            <Plus className="w-3 h-3" /> Thêm theo dõi
          </button>
        </div>

        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.studentId} className="p-3 bg-[#FBFAF5] border border-[#D7DCCB] rounded-xl text-xs space-y-2">
              <div className="flex justify-between items-center font-bold text-[#1F3B32]">
                <span>{rule.studentName} ({rule.studentId})</span>
                <button onClick={() => deleteRule(rule.studentId)} className="text-red-500 hover:text-red-700 cursor-pointer" title="Xóa học sinh khỏi giám sát">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-[#5B6A61] block">Các khung giờ điểm danh riêng:</span>
                {rule.timeSlots.map((slot, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input type="time" value={slot.startTime} onChange={e => {
                      const newSlots = [...rule.timeSlots];
                      newSlots[i].startTime = e.target.value;
                      updateRule({...rule, timeSlots: newSlots});
                    }} className="p-1 border rounded bg-white text-xs" />
                    <span>đến</span>
                    <input type="time" value={slot.endTime} onChange={e => {
                      const newSlots = [...rule.timeSlots];
                      newSlots[i].endTime = e.target.value;
                      updateRule({...rule, timeSlots: newSlots});
                    }} className="p-1 border rounded bg-white text-xs" />
                    <button onClick={() => {
                      const newSlots = rule.timeSlots.filter((_, index) => index !== i);
                      updateRule({...rule, timeSlots: newSlots});
                    }} className="text-red-400 hover:text-red-600 cursor-pointer" title="Xóa khung giờ này">
                       <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              <button onClick={() => updateRule({...rule, timeSlots: [...rule.timeSlots, {startTime: '09:00', endTime: '09:15'}]})} className="text-emerald-700 font-bold text-[10px] underline block mb-2 cursor-pointer">
                + Thêm khung giờ
              </button>
              
              <div className="flex gap-4 pt-2 border-t border-[#D7DCCB]">
                <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={rule.forceGps} 
                    onChange={e => updateRule({...rule, forceGps: e.target.checked})} 
                  />
                  <span>Bắt buộc lấy định vị GPS</span>
                </label>
                <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={rule.forcePhoto} 
                    onChange={e => updateRule({...rule, forcePhoto: e.target.checked})} 
                  />
                  <span>Bắt buộc chụp ảnh thực tế</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
