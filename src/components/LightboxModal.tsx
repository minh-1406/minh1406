import React from 'react';
import { X, Clock, Upload, ShieldCheck } from 'lucide-react';
import { format24hDateTime } from '../utils/storage';

export interface LightboxData {
  src: string;
  captureTime?: string | null;
  submitTime?: number | string | null;
  title?: string;
}

interface LightboxModalProps {
  src: string | LightboxData | null;
  onClose: () => void;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({ src, onClose }) => {
  if (!src) return null;

  let imageSrc = '';
  let captureTimeStr: string | undefined = undefined;
  let submitTimeStr: string | undefined = undefined;
  let titleStr: string | undefined = undefined;

  if (typeof src === 'string') {
    imageSrc = src;
  } else if (src && typeof src === 'object') {
    imageSrc = src.src;
    captureTimeStr = src.captureTime || undefined;
    submitTimeStr = src.submitTime ? format24hDateTime(src.submitTime) : undefined;
    titleStr = src.title;
  }

  if (!imageSrc) return null;

  return (
    <div
      id="lightboxOverlay"
      className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4 cursor-zoom-out animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[92vh] flex flex-col items-center bg-[#1B241F] border border-white/20 rounded-2xl p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-white/10 text-white">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h4 className="text-sm font-bold text-emerald-300">
              {titleStr || 'Minh Chứng Ảnh & Trích Xuất Ngày Giờ Xác Thực'}
            </h4>
          </div>
          <button
            id="btnCloseLightbox"
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="relative flex items-center justify-center overflow-hidden max-h-[70vh] rounded-xl bg-black/50 border border-white/10">
          <img
            src={imageSrc}
            alt="Minh chứng"
            className="max-w-[85vw] max-h-[68vh] object-contain rounded-lg shadow-2xl"
          />
        </div>

        {/* Dual Timestamp Verification Overlay (Mục 1 & Mục 2) */}
        <div className="w-full mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 flex items-start gap-2">
            <Clock className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <div>
              <span className="block text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                1. Giờ chụp ảnh (EXIF/Tệp):
              </span>
              <span className="font-mono font-extrabold text-sm text-amber-100">
                {captureTimeStr ? format24hDateTime(captureTimeStr) : 'Chưa trích xuất'}
              </span>
              <p className="text-[10px] text-amber-200/70 mt-0.5">
                Kiểm tra có đúng thời điểm đang có mặt tại lớp hay không.
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 flex items-start gap-2">
            <Upload className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
            <div>
              <span className="block text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
                2. Giờ gửi lên hệ thống:
              </span>
              <span className="font-mono font-extrabold text-sm text-emerald-100">
                {submitTimeStr ? format24hDateTime(submitTimeStr) : '—'}
              </span>
              <p className="text-[10px] text-emerald-200/70 mt-0.5">
                Hệ thống đối chiếu khung giờ mở để tính đi muộn & thời hạn BGH.
              </p>
            </div>
          </div>
        </div>

        <p className="text-white/60 text-[11px] mt-2 font-medium">
          Bấm bất kỳ đâu bên ngoài hoặc dấu X để đóng
        </p>
      </div>
    </div>
  );
};
