# 📖 HƯỚNG DẪN SỬ DỤNG HỆ THỐNG ĐIỂM DANH GPS & QUẢN LÝ CHUYÊN CẦN THÔNG MINH

Hệ thống điểm danh thông minh chống gian lận hỗ trợ phân quyền đa vai trò: **Học sinh**, **Ban Cán Sự (BCS)**, **Giáo viên chủ nhiệm (GVCN)**, **Ban Giám Hiệu (BGH)** và **Đoàn trường**. Hệ thống hỗ trợ đa trường học/đơn vị độc lập (Multi-tenant) và đồng bộ thời gian thực qua Cloud Firestore.

---

## 📑 MỤC LỤC
1. [Khái quát & Cách tạo liên kết riêng cho từng Trường/Đơn vị](#1-khái-quát--cách-tạo-liên-kết-riêng-cho-từng-trườngđơn-vị)
2. [Hướng dẫn dành cho Học sinh](#2-hướng-dẫn-dành-cho-học-sinh)
3. [Hướng dẫn dành cho Ban Cán Sự (BCS)](#3-hướng-dẫn-dành-cho-ban-cán-sự-bcs)
4. [Hướng dẫn dành cho Giáo viên chủ nhiệm (GVCN)](#4-hướng-dẫn-dành-cho-giáo-viên-chủ-nhiệm-gvcn)
5. [Hướng dẫn dành cho Ban Giám Hiệu & Quản trị viên](#5-hướng-dẫn-dành-cho-ban-giám-hiệu--quản-trị-viên)
6. [Hướng dẫn dành cho Đoàn trường](#6-hướng-dẫn-dành-cho-đoàn-trường)
7. [Các quy tắc và Cơ chế Chống Gian Lận Tự Động](#7-các-quy-tắc-và-cơ-chế-chống-gian-lận-tự-động)
8. [Xuất Báo cáo & In ấn (PDF / CSV)](#8-xuất-báo-cáo--in-ấn-pdf--csv)
9. [Cơ chế Lưu trữ & Triển khai trên Hosting (Vercel)](#9-cơ-chế-lưu-trữ--triển-khai-trên-hosting-vercel)

---

## 1. KHÁI QUÁT & CÁCH TẠO LIÊN KẾT RIÊNG CHO TỪNG TRƯỜNG/ĐƠN VỊ

Hệ thống cho phép mỗi trường học hoạt động hoàn toàn độc lập, dữ liệu danh sách học sinh, mã PIN và ảnh minh chứng của từng trường được cách ly 100%.

- **Đường link mặc định:**
  `https://your-domain.com/` (Không gian dữ liệu chung).
- **Tạo đường link riêng cho từng trường:**
  Chỉ cần thêm đuôi `?school=TEN_TRUONG` vào cuối link:
  - Ví dụ Trường THPT Nguyễn Trãi: `https://your-domain.com/?school=THPT_NguyenTrai`
  - Ví dụ Trường THPT Lê Quý Đôn: `https://your-domain.com/?school=THPT_LeQuyDon`
- **Tên trường & Logo:**
  Ban Giám Hiệu vào tab **Quản trị** để cài đặt Tên hiển thị của trường và tải lên Logo riêng.

---

## 2. HƯỚNG DẪN DÀNH CHO HỌC SINH

### A. Tự điểm danh bằng định vị GPS (Dành cho học sinh có mang điện thoại)
1. Truy cập vào ứng dụng, chọn tab **Học sinh**.
2. Chọn **Lớp** và nhập **Mã số học sinh (MSHS)**. Hệ thống sẽ tự động điền Họ và tên.
3. Khi trong khung giờ quy định:
   - Bấm nút **"Điểm danh ngay"**.
   - Trình duyệt sẽ yêu cầu cấp quyền vị trí ➔ Chọn **"Cho phép" (Allow)**.
4. **Kết quả:**
   - **Có mặt đúng giờ:** Điểm danh trong khung giờ mở của lớp (ví dụ 06:30 – 07:15) và trong bán kính lớp cho phép.
   - **Đi muộn:** Điểm danh trong vòng 10 phút sau giờ kết thúc (ví dụ 07:15 – 07:25).
   - **Vắng không phép:** Sau 10 phút tính từ giờ kết thúc, hệ thống tự động khóa nút và chốt Vắng không phép.

### B. Gửi đơn xin nghỉ phép
1. Cuộn xuống mục **"Gửi đơn xin phép nghỉ học"**.
2. Chọn **Ngày nghỉ** (chỉ cho phép ngày hôm nay hoặc ngày trong tương lai, không cho phép gửi bù ngày cũ sau khi đã hết giờ).
3. Chọn diện đơn:
   - **Có đơn kèm ảnh:** Bắt buộc chụp/tải ảnh đơn có chữ ký phụ huynh hoặc giấy khám.
   - **Nợ đơn:** Dành cho trường hợp đột xuất chưa kịp viết đơn. Hệ thống sẽ cho phép nợ theo thời hạn của BGH (mặc định 2 ngày).
4. Nhập lý do và bấm **"Gửi đơn xin phép"**.

### C. Nộp bổ sung ảnh đơn nợ
1. Khi có đơn nợ chưa bổ sung ảnh, màn hình học sinh sẽ hiển thị khung cảnh báo màu vàng kèm thời hạn chót.
2. Học sinh chụp ảnh đơn viết tay và bấm **"Chụp / Tải ảnh bổ sung đơn ngay"**.
3. Sau khi tải ảnh hợp lệ, trạng thái tự động chuyển thành **"Vắng có phép (Đã có đơn)"**.

---

## 3. HƯỚNG DẪN DÀNH CHO BAN CÁN SỰ (BCS)

Ban Cán Sự được GVCN phân quyền đặc biệt để **chụp ảnh điểm danh hộ** cho những bạn trong lớp không mang điện thoại hoặc điện thoại hết pin/hỏng GPS.

### Quy trình điểm danh hộ:
1. BCS đăng nhập tài khoản học sinh của mình ở tab **Học sinh**.
2. Tại khu vực dành riêng cho BCS:
   - Chọn **1 học sinh** cần điểm danh hộ từ danh sách lớp.
   - Bấm **"Chụp ảnh minh chứng tại lớp"**.
3. **Quy định nghiêm ngặt về ảnh chụp:**
   - **1 ảnh chỉ dùng cho 1 học sinh:** Nghiêm cấm dùng 1 ảnh chụp chung cho nhiều bạn. Nếu tái sử dụng ảnh cũ, hệ thống sẽ báo đỏ và từ chối lưu.
   - **Chống ảnh cũ trong thư viện:** Ảnh chụp phải có siêu dữ liệu thời gian (EXIF) đúng ngày hôm nay.
4. Bấm **"Gửi điểm danh hộ kèm ảnh"**:
   - Trạng thái học sinh sẽ hiển thị: **"BCS điểm danh"** và tạm tính Có mặt, chuyển sang danh sách chờ GVCN xem ảnh duyệt lần cuối.
   - Nút Điểm danh hộ của GVCN sẽ tự động ẩn đi đối với học sinh này (chỉ còn nút duyệt/từ chối).
   - Nếu GVCN đã tự điểm danh cho học sinh trước đó, hệ thống sẽ ngăn BCS không được gửi ảnh đè lên.

---

## 4. HƯỚNG DẪN DÀNH CHO GIÁO VIÊN CHỦ NHIỆM (GVCN)

### A. Đăng nhập và Bảo mật lớp
1. Chọn tab **Giáo viên**.
2. Chọn Lớp của mình và nhập **Mã PIN bảo mật của lớp** (hoặc Mã PIN Quản trị BGH).
3. Có thể đổi mã PIN của lớp bất cứ lúc nào ở mục **"Đổi mã PIN bảo mật"**.

### B. Cấu hình Vị trí GPS & Khung giờ
1. Đứng trực tiếp tại phòng học, bấm **"Lấy vị trí GPS hiện tại"**.
2. Điều chỉnh **Bán kính cho phép** (mặc định 80 mét).
3. Đặt **Giờ mở điểm danh** (vd: 06:30) và **Giờ khóa sổ** (vd: 07:15).
4. Đặt **Hạn chót duyệt phép trong ngày** (vd: 17:00).
5. Bấm **"Lưu cấu hình lớp"**.

### C. Quản lý danh sách học sinh & Phân quyền BCS
1. **Nhập danh sách học sinh:**
   - Tải file Excel/CSV mẫu hoặc dán trực tiếp theo dạng `MãHS, Họ và tên`.
   - Có thể thêm từng học sinh, sửa tên, đổi mã HS, hoặc xóa học sinh bất kỳ lúc nào.
2. **Phân quyền Ban Cán Sự (BCS):**
   - Tìm học sinh muốn phân quyền, bấm vào nút **"+ BCS"**.
   - Học sinh này khi đăng nhập sẽ tự động mở giao diện chụp ảnh điểm danh hộ.

### D. Theo dõi điểm danh & Duyệt minh chứng
1. Bảng điểm danh phân loại rõ các trạng thái:
   - **Có mặt:** Hiển thị rõ nguồn *(Tự động GPS, BCS điểm danh, GVCN điểm danh, GVCN xác nhận)*.
   - **Đi muộn:** Tự động ghi nhận khi điểm danh trong 10 phút sau giờ kết thúc.
   - **Đơn chờ duyệt:** Xem lý do và ảnh chụp đơn để bấm **"Duyệt có mặt / Duyệt nghỉ / Từ chối"**.
   - **Chờ duyệt điểm danh hộ:** Bấm vào ảnh thu nhỏ để kiểm tra giờ chụp EXIF, sau đó bấm **"Duyệt có mặt"** hoặc **"Từ chối"**.
2. **Xem ảnh minh chứng:**
   - Bấm vào ảnh thu nhỏ tại cột *Đơn & Minh chứng*.
   - Hoặc bấm nút **"📷 Xem tất cả ảnh đã gửi"** để xem bộ sưu tập toàn bộ ảnh chụp trong ngày.
3. **Xóa ảnh gian lận:** Nếu phát hiện học sinh tải ảnh không đúng, GVCN có thể bấm nút xóa ảnh để chuyển học sinh về diện Nợ đơn hoặc Vắng không phép.

---

## 5. HƯỚNG DẪN DÀNH CHO BAN GIÁM HIỆU & QUẢN TRỊ VIÊN

### A. Đăng nhập Quản trị
- Chọn tab **Quản trị**.
- Nhập **Mã PIN Quản trị** (Mặc định: `Admin@2026!`, có thể đổi sau khi đăng nhập).

### B. Tính năng dành cho BGH
1. **Thiết lập Đơn vị/Trường học:**
   - Đặt Tên hiển thị chính thức của Trường.
   - Tải lên Logo trường.
2. **Cấu hình thời hạn nợ đơn toàn trường:**
   - Quy định số ngày tối đa cho phép nộp & duyệt đơn trễ (mặc định 2 ngày). Nếu quá thời hạn này mà học sinh chưa bổ sung ảnh đơn, hệ thống tự động chốt thành Vắng không phép.
3. **Theo dõi Real-time toàn trường:**
   - Xem tổng quan tỷ lệ chuyên cần của toàn bộ các lớp.
   - Xem cảnh báo trùng thiết bị (1 máy điểm danh cho nhiều em).
   - Xem hoạt động trực tiếp của từng GVCN và học sinh.
4. **Phân bổ học sinh hàng loạt:** Tải lên 1 file Excel chứa toàn bộ học sinh toàn trường, hệ thống tự động bóc tách và phân lớp.

---

## 6. HƯỚNG DẪN DÀNH CHO ĐOÀN TRƯỜNG

1. Chọn tab **Đoàn trường**.
2. Nhập **Mã PIN Đoàn trường** (Mặc định: `DoanTruong@2026!`).
3. Đoàn trường có quyền theo dõi chuyên cần tất cả các lớp, giám sát tỷ lệ đi muộn, vắng mặt để chấm điểm thi đua tuần/tháng mà không can thiệp thay đổi dữ liệu của giáo viên.

---

## 7. CÁC QUY TẮC VÀ CƠ CHẾ CHỐNG GIAN LẬN TỰ ĐỘNG

| Quy tắc | Cơ chế hoạt động |
| :--- | :--- |
| **Chống dùng lại 1 ảnh (Mới)** | Hệ thống tạo vân tay kỹ thuật số cho từng ảnh. **Một ảnh chỉ được dùng cho duy nhất 1 học sinh**. Nếu dùng lại ảnh cũ của học sinh khác, hệ thống sẽ cảnh báo gian lận và từ chối. |
| **Chống ảnh cũ từ thư viện** | Tự động đọc dữ liệu EXIF 24h gốc của camera. Nếu ngày chụp không phải hôm nay, hệ thống từ chối nhận ảnh. |
| **Quy định 10 phút đi muộn** | Trong khung giờ: Có mặt đúng giờ.<br>Trong 10 phút sau khung giờ: Chuyển sang **Đi muộn**.<br>Sau 10 phút: Tự động khóa và chốt **Vắng không phép**. |
| **Nhãn phân định nguồn** | - BCS điểm danh hộ: Nhãn duy nhất `BCS điểm danh`.<br>- GVCN vào duyệt ảnh BCS: Xuất hiện thêm nhãn `GVCN xác nhận`.<br>- GVCN trực tiếp điểm danh hộ: Nhãn duy nhất `GVCN điểm danh`. |
| **Chống 1 máy điểm danh hộ nhiều bạn** | Phân tích dấu vân tay phần cứng trình duyệt (Browser Fingerprint). Nếu 1 thiết bị điểm danh cho 2 tài khoản khác nhau trong ngày, hệ thống sẽ gắn cờ cảnh báo đỏ cho GVCN. |
| **Hết hạn nợ đơn tự động** | Hết số ngày nợ đơn quy định mà chưa có ảnh đơn ➔ Tự động hạ từ Có phép thành **Vắng không phép**. |

---

## 8. XUẤT BÁO CÁO & IN ẤN (PDF / CSV)

Tại giao diện GVCN hoặc BGH, bấm vào nút **"Báo cáo"**:
1. **Chọn kỳ báo cáo:** Theo Ngày, Theo Tuần, Theo Tháng, hoặc Theo Học kỳ (HK1 / HK2).
2. **Chọn phạm vi:** Từng lớp cụ thể hoặc Toàn trường.
3. **Xuất file:**
   - **In / Xuất PDF:** Đầy đủ bảng biểu thống kê, tỷ lệ %, danh sách chi tiết học sinh vắng, lý do, và **toàn bộ ảnh chụp minh chứng in trực tiếp**.
   - **Xuất CSV:** File bảng tính Excel đầy đủ các cột dữ liệu để lưu trữ và báo cáo cấp trên.

---

## 9. CƠ CHẾ LƯU TRỮ & TRIỂN KHAI TRÊN HOSTING (VERCEL)

1. **Dữ liệu đám mây (Firebase Firestore):**
   - Toàn bộ hồ sơ điểm danh, danh sách học sinh và ảnh minh chứng được lưu trữ trên Firebase Firestore Cloud Database.
   - Sang ngày mới, dữ liệu ngày cũ **không bị mất**, có thể chọn lại lịch để xem bất cứ lúc nào.
2. **Tự động cập nhật khi deploy Vercel:**
   - Nếu dự án Vercel kết nối với kho lưu trữ GitHub, mỗi khi mã nguồn được cập nhật, Vercel sẽ tự động build và cập nhật phiên bản mới nhất cho tất cả người dùng trong vòng 1-2 phút.
