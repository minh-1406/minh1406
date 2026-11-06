import React, { useState } from 'react';
import {
  X,
  BookOpen,
  UserCheck,
  Shield,
  Clock,
  Camera,
  FileSpreadsheet,
  Building2,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Award,
} from 'lucide-react';

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserGuideModal: React.FC<UserGuideModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'student' | 'monitor' | 'teacher' | 'admin' | 'anticheat'>('student');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[120] p-3 sm:p-4">
      <div className="bg-[#F4F0E4] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col border border-[#D7DCCB]">
        {/* Header */}
        <div className="p-4 bg-[#1F3B32] text-[#F4F0E4] flex justify-between items-center shadow-xs">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-emerald-300" />
            <div>
              <h2 className="text-base sm:text-lg font-bold">Hướng Dẫn Sử Dụng Hệ Thống Điểm Danh GPS</h2>
              <p className="text-[11px] text-emerald-100/70">
                Cẩm nang toàn diện cho Học sinh, Ban Cán Sự, Giáo viên &amp; Quản trị
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

        {/* Tab Navigation */}
        <div className="bg-white border-b border-[#D7DCCB] px-3 pt-2 flex gap-1.5 overflow-x-auto text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('student')}
            className={`px-3.5 py-2.5 rounded-t-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border-b-2 ${
              activeTab === 'student'
                ? 'border-[#1F3B32] text-[#1F3B32] bg-[#F4F0E4]'
                : 'border-transparent text-[#5B6A61] hover:text-[#1F3B32]'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Học sinh</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('monitor')}
            className={`px-3.5 py-2.5 rounded-t-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border-b-2 ${
              activeTab === 'monitor'
                ? 'border-[#1F3B32] text-[#1F3B32] bg-[#F4F0E4]'
                : 'border-transparent text-[#5B6A61] hover:text-[#1F3B32]'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Ban Cán Sự (BCS)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('teacher')}
            className={`px-3.5 py-2.5 rounded-t-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border-b-2 ${
              activeTab === 'teacher'
                ? 'border-[#1F3B32] text-[#1F3B32] bg-[#F4F0E4]'
                : 'border-transparent text-[#5B6A61] hover:text-[#1F3B32]'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Giáo viên (GVCN)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className={`px-3.5 py-2.5 rounded-t-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border-b-2 ${
              activeTab === 'admin'
                ? 'border-[#1F3B32] text-[#1F3B32] bg-[#F4F0E4]'
                : 'border-transparent text-[#5B6A61] hover:text-[#1F3B32]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>BGH &amp; Quản trị</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('anticheat')}
            className={`px-3.5 py-2.5 rounded-t-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border-b-2 ${
              activeTab === 'anticheat'
                ? 'border-[#B3492F] text-[#B3492F] bg-[#F4F0E4]'
                : 'border-transparent text-[#5B6A61] hover:text-[#B3492F]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Quy tắc Chống Gian Lận</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs sm:text-sm text-[#1B241F] leading-relaxed">
          {/* TAB 1: HỌC SINH */}
          {activeTab === 'student' && (
            <div className="space-y-4">
              <div className="p-4 bg-white rounded-xl border border-[#D7DCCB] shadow-2xs space-y-2">
                <h3 className="font-bold text-sm text-[#1F3B32] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#3E7C6B]" />
                  1. Điểm danh có mặt bằng GPS
                </h3>
                <p>
                  - Chọn <b>Lớp</b> và nhập <b>Mã số học sinh (MSHS)</b>. Họ tên sẽ tự động hiển thị.
                  <br />
                  - Bấm nút <b>"Điểm danh ngay"</b> và nhấn <b>Cho phép (Allow)</b> khi trình duyệt hỏi quyền truy cập vị trí.
                  <br />
                  - <b>Đúng giờ:</b> Điểm danh trong khung giờ mở lớp (ví dụ 06:30 – 07:15).
                  <br />
                  - <b>Đi muộn:</b> Điểm danh trong vòng 10 phút sau khi kết thúc giờ mở lớp (ví dụ 07:15 – 07:25).
                  <br />
                  - <b>Vắng không phép:</b> Sau 10 phút tính từ giờ kết thúc, hệ thống tự động khóa nút và chốt Vắng không phép.
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-[#D7DCCB] shadow-2xs space-y-2">
                <h3 className="font-bold text-sm text-[#7A521E] flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#C98A3B]" />
                  2. Gửi đơn xin nghỉ phép &amp; Nợ đơn
                </h3>
                <p>
                  - Chọn ngày nghỉ (chỉ cho phép hôm nay hoặc ngày tương lai, không cho gửi bù ngày cũ sau giờ quy định).
                  <br />
                  - <b>Diện "Có đơn":</b> Chụp ảnh giấy xin phép viết tay có chữ ký phụ huynh hoặc giấy khám bệnh.
                  <br />
                  - <b>Diện "Nợ đơn":</b> Dành cho trường hợp đột xuất. Hệ thống cho nợ theo thời hạn BGH quy định (mặc định 2 ngày).
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-[#D7DCCB] shadow-2xs space-y-2">
                <h3 className="font-bold text-sm text-amber-900 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-amber-700" />
                  3. Bổ sung ảnh đơn nợ
                </h3>
                <p>
                  - Khi có đơn nợ, màn hình hiện khung cảnh báo màu vàng kèm hạn chót.
                  <br />
                  - Bấm <b>"Chụp / Tải ảnh bổ sung đơn ngay"</b> để tải ảnh đơn. Sau khi tải thành công, hệ thống tự động xác nhận bạn là <b>"Vắng có phép (Đã có đơn)"</b>.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: BAN CÁN SỰ */}
          {activeTab === 'monitor' && (
            <div className="space-y-4">
              <div className="p-4 bg-white rounded-xl border border-indigo-200 bg-indigo-50/40 shadow-2xs space-y-2">
                <h3 className="font-bold text-sm text-indigo-950 flex items-center gap-2">
                  <Award className="w-4 h-4 text-indigo-700" />
                  Nhiệm vụ của Ban Cán Sự (BCS)
                </h3>
                <p>
                  Ban Cán Sự được GVCN cấp quyền để hỗ trợ điểm danh cho các bạn trong lớp không mang điện thoại hoặc điện thoại gặp sự cố.
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-[#D7DCCB] shadow-2xs space-y-2">
                <h3 className="font-bold text-sm text-[#1F3B32] flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#3E7C6B]" />
                  Quy trình chụp ảnh điểm danh hộ
                </h3>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>BCS đăng nhập tài khoản MSHS của mình ở tab <b>Học sinh</b>.</li>
                  <li>Khu vực dành cho BCS sẽ xuất hiện ở cuối trang. Chọn <b>1 học sinh</b> cần điểm danh hộ.</li>
                  <li>Bấm nút chụp ảnh trực tiếp khuôn mặt/vị trí ngồi của bạn đó tại lớp.</li>
                  <li>
                    <b>Quy tắc 1 ảnh = 1 học sinh:</b> Mỗi ảnh chụp chỉ được dùng cho 1 bạn duy nhất. Hệ thống sẽ quét vân tay ảnh, nếu dùng lại ảnh cũ sẽ lập tức báo gian lận và từ chối lưu.
                  </li>
                  <li>
                    Bấm <b>"Gửi điểm danh hộ kèm ảnh"</b>: Trạng thái học sinh sẽ là <b>"BCS điểm danh"</b> (chờ GVCN xem ảnh duyệt).
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* TAB 3: GIÁO VIÊN CHỦ NHIỆM */}
          {activeTab === 'teacher' && (
            <div className="space-y-4">
              <div className="p-4 bg-white rounded-xl border border-[#D7DCCB] shadow-2xs space-y-2">
                <h3 className="font-bold text-sm text-[#1F3B32] flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#3E7C6B]" />
                  1. Mở khóa &amp; Cấu hình lớp
                </h3>
                <p>
                  - Chọn tab <b>Giáo viên</b>, chọn Lớp và nhập <b>Mã PIN của lớp</b> (hoặc Master PIN).
                  <br />
                  - Đứng tại lớp học, bấm <b>"Lấy vị trí GPS hiện tại"</b> để định vị tâm lớp.
                  <br />
                  - Cài đặt <b>Bán kính (80m)</b>, <b>Giờ mở</b>, <b>Giờ khóa</b> và <b>Hạn chót duyệt phép</b>.
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-[#D7DCCB] shadow-2xs space-y-2">
                <h3 className="font-bold text-sm text-[#1F3B32] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#3E7C6B]" />
                  2. Duyệt điểm danh hộ &amp; Đơn phép
                </h3>
                <p>
                  - Khi BCS điểm danh hộ: Bấm vào ảnh thu nhỏ để xem giờ chụp EXIF 24h thực tế, sau đó bấm <b>"Duyệt có mặt"</b> hoặc <b>"Từ chối"</b>.
                  <br />
                  - Khi GVCN duyệt ảnh BCS: Nhãn trạng thái sẽ hiển thị cả <b>"BCS điểm danh"</b> và <b>"GVCN xác nhận"</b>.
                  <br />
                  - Khi GVCN trực tiếp điểm danh hộ: Nhãn hiển thị duy nhất là <b>"GVCN điểm danh"</b>.
                  <br />
                  - Bấm nút <b>"📷 Xem tất cả ảnh đã gửi"</b> để mở thư viện tổng hợp toàn bộ ảnh trong ngày.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: BAN GIÁM HIỆU */}
          {activeTab === 'admin' && (
            <div className="space-y-4">
              <div className="p-4 bg-white rounded-xl border border-[#D7DCCB] shadow-2xs space-y-2">
                <h3 className="font-bold text-sm text-[#1F3B32] flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#3E7C6B]" />
                  1. Tạo link riêng cho Trường &amp; Cài đặt Logo
                </h3>
                <p>
                  - Để mỗi trường hoạt động độc lập, chỉ cần thêm <code>?school=TEN_TRUONG</code> vào đường dẫn.
                  <br />
                  - BGH đăng nhập bằng PIN Quản trị (Mặc định: <code>Admin@2026!</code>).
                  <br />
                  - Cài đặt <b>Tên hiển thị của trường</b> và <b>Logo trường</b> để xuất hiện trên đầu trang và các bản in báo cáo.
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-[#D7DCCB] shadow-2xs space-y-2">
                <h3 className="font-bold text-sm text-[#1F3B32] flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-[#3E7C6B]" />
                  2. Xuất báo cáo chuyên cần toàn trường
                </h3>
                <p>
                  - Bấm nút <b>"Báo cáo"</b>: Chọn kỳ báo cáo theo <b>Ngày / Tuần / Tháng / Học kỳ</b>.
                  <br />
                  - Xuất file <b>PDF / In ấn</b> có sẵn bảng biểu thống kê, tỷ lệ %, lý do và toàn bộ ảnh chụp minh chứng.
                  <br />
                  - Xuất file <b>CSV / Excel</b> để phục vụ báo cáo lên Sở / Phòng GD&amp;ĐT.
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: CHỐNG GIAN LẬN */}
          {activeTab === 'anticheat' && (
            <div className="space-y-3.5">
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-1.5">
                <div className="font-bold text-red-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  1. Chống gian lận sử dụng lại ảnh (1 ảnh = 1 học sinh)
                </div>
                <p className="text-red-950">
                  Hệ thống phân tích dấu vân tay kỹ thuật số của ảnh. Một bức ảnh chỉ được sử dụng cho một học sinh duy nhất. Nếu có hành vi dùng lại ảnh cũ của học sinh khác, hệ thống sẽ cảnh báo đỏ và chặn ngay lập tức.
                </p>
              </div>

              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
                <div className="font-bold text-amber-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-700" />
                  2. Chống ảnh cũ lấy từ thư viện (EXIF Metadata)
                </div>
                <p className="text-amber-950">
                  Ứng dụng tự động đọc thẻ EXIF DateTime gốc từ máy ảnh. Ảnh phải được chụp trực tiếp trong ngày hôm nay. Nếu ngày chụp trong quá khứ, hệ thống sẽ từ chối tiếp nhận.
                </p>
              </div>

              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5">
                <div className="font-bold text-emerald-900 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-700" />
                  3. Phát hiện 1 máy điểm danh hộ nhiều bạn (Device Fingerprint)
                </div>
                <p className="text-emerald-950">
                  Hệ thống nhận diện phần cứng thiết bị. Nếu cùng một điện thoại được dùng để bấm điểm danh cho nhiều học sinh khác nhau trong ngày, giáo viên sẽ nhận được cờ cảnh báo đỏ để kiểm tra.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#EEF1E7] border-t border-[#D7DCCB] flex justify-between items-center text-xs text-[#5B6A61]">
          <span>💡 Để xem tài liệu kỹ thuật chi tiết, vui lòng xem file <b>HUONG_DAN_SU_DUNG.md</b> trong mã nguồn.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#1F3B32] hover:bg-[#274A3E] text-white font-bold rounded-xl transition-colors cursor-pointer"
          >
            Đã hiểu &amp; Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
