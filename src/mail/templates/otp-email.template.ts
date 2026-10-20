export interface OtpEmailOptions {
  code: string;
  purpose?: 'signup' | 'reset' | 'invite' | 'tournament' | string;
  purposeLabel?: string;
  expiresInMinutes?: number;
  userName?: string;
  brandName?: string;
  actionUrl?: string;
  actionUrlLabel?: string;
}

export interface GeneratedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Mẫu email OTP & Bảo mật chuẩn hóa cho hệ thống TMEC (Hệ thống Quản lý Huấn luyện Ngựa đua):
 * - Thương hiệu: TMEC
 * - Hệ màu: Forest Green (#315D4B) & Racing Dark Emerald (#0F1814, #162A21) chuẩn tokens.css của dự án đua ngựa
 * - Văn phong: Doanh nghiệp chuyên nghiệp, trang trọng, rõ ràng mục đích gửi thư
 * - Tương thích 100% với cơ chế nhận diện OTP và nút "Sao chép mã" native của Gmail
 */
function formatDuration(minutes: number): string {
  if (minutes <= 0) return 'ngay lập tức';
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days * 24} giờ (${days} ngày)`;
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60} giờ`;
  }
  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours} giờ ${mins} phút`;
  }
  return `${minutes} phút`;
}

export function buildOtpEmail(options: OtpEmailOptions): GeneratedEmail {
  const {
    code,
    purpose = 'signup',
    expiresInMinutes = 10,
    userName = 'Quý khách',
    brandName = 'TMEC',
    actionUrl,
    actionUrlLabel,
  } = options;

  const durationText = formatDuration(expiresInMinutes);

  let badgeText = 'XÁC THỰC TÀI KHOẢN';
  let contextDescription = 'Hệ thống ghi nhận yêu cầu kích hoạt tài khoản truy cập Hệ thống Quản lý Huấn luyện Ngựa đua TMEC.';
  let actionInstruction = 'Quý khách vui lòng sử dụng mã xác thực bên dưới để hoàn tất xác nhận danh tính và kích hoạt quyền truy cập hệ thống.';
  let subjectDetail = 'Mã xác thực tài khoản';

  if (purpose === 'reset') {
    badgeText = 'ĐẶT LẠI MẬT KHẨU';
    contextDescription = 'Hệ thống nhận được yêu cầu cấp lại mật khẩu bảo mật cho tài khoản của Quý khách trên hệ thống TMEC.';
    actionInstruction = 'Quý khách vui lòng nhập mã xác thực này vào biểu mẫu để tiến hành thiết lập mật khẩu mới.';
    subjectDetail = 'Mã xác thực đặt lại mật khẩu';
  } else if (purpose === 'invite') {
    badgeText = 'LỜI MỜI THAM GIA';
    contextDescription = 'Quý khách được Ban Quản lý Câu lạc bộ TMEC phân quyền tham gia điều hành và quản lý chuồng trại.';
    actionInstruction = 'Quý khách vui lòng nhập mã xác thực này để kích hoạt tài khoản nhân sự và khởi tạo mật khẩu bảo mật.';
    subjectDetail = 'Mã kích hoạt tài khoản thành viên';
  } else if (purpose === 'tournament') {
    badgeText = 'CHECK-IN GIẢI ĐUA';
    contextDescription = 'Chiến mã của Quý khách đã được xác nhận vào danh sách tham gia giải đua thuộc hệ thống TMEC.';
    actionInstruction = 'Quý khách vui lòng xuất trình mã này tại bàn kiểm tra y tế và chuồng cân ngựa trước giờ xuất phát.';
    subjectDetail = 'Mã check-in tham gia giải đua';
  }

  // Tiêu đề email chuẩn mực, rõ ràng
  const subject = `[${brandName}] ${subjectDetail}: ${code}`;

  // Bản text thuần cho spam filter và thiết bị không hỗ trợ HTML
  const text = [
    `${brandName} — HỆ THỐNG QUẢN LÝ HUẤN LUYỆN NGỰA ĐUA`,
    '--------------------------------------------------',
    `Kính gửi ${userName},`,
    '',
    `${contextDescription}`,
    `${actionInstruction}`,
    '',
    `MÃ XÁC THỰC CỦA QUÝ KHÁCH (OTP): ${code}`,
    '',
    actionUrl ? `Hoặc bấm vào liên kết để tự động kích hoạt:\n${actionUrl}\n\n` : '',
    `Lưu ý bảo mật:`,
    `- Mã xác thực có hiệu lực trong vòng ${durationText} kể từ thời điểm gửi.`,
    `- Tuyệt đối không cung cấp mã này cho bất kỳ ai để đảm bảo an toàn tài khoản.`,
    `- Nếu Quý khách không thực hiện yêu cầu này, vui lòng bỏ qua thư này hoặc thông báo cho Ban Quản trị.`,
    '',
    'Trân trọng,',
    `Ban Quản lý Hệ thống ${brandName}`,
    'Hệ thống Quản lý Huấn luyện & Chuồng trại Ngựa đua',
  ].join('\n');

  // Bản HTML cao cấp với bảng màu Forest Green (#315D4B) đồng bộ tokens.css của dự án
  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${subject}</title>
  <style>
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    body { margin: 0; padding: 0; width: 100% !important; background-color: #080d0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; border-radius: 8px !important; }
      .email-content { padding: 28px 20px !important; }
      .otp-code { font-size: 32px !important; letter-spacing: 6px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 36px 0; background-color: #080d0a;">

  <!-- Preheader text ẩn tối ưu hóa hiển thị ngoài danh sách thư Gmail -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #080d0a; opacity: 0;">
    Mã xác thực của Quý khách: ${code}. Mã có hiệu lực trong ${durationText}.
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding: 12px;">
        
        <!-- Khung Card chính: Nền Racing Dark Slate, viền Forest Green trầm -->
        <table role="presentation" class="email-container" border="0" cellpadding="0" cellspacing="0" width="560" style="background-color: #0e1612; border-radius: 12px; border: 1px solid #1c2e26; overflow: hidden; box-shadow: 0 12px 30px -5px rgba(0, 0, 0, 0.7);">
          
          <!-- Thanh viền thương hiệu Forest Green trên cùng -->
          <tr>
            <td height="4" style="background-color: #315D4B; font-size: 1px; line-height: 1px;">&nbsp;</td>
          </tr>

          <!-- Nội dung chính -->
          <tr>
            <td class="email-content" style="padding: 36px 40px; color: #94a3b8; font-size: 15px; line-height: 1.6;">
              
              <!-- Tên thương hiệu & Phụ đề -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td>
                    <div style="font-size: 22px; font-weight: 800; letter-spacing: 2px; color: #f8fafc; text-transform: uppercase;">
                      ${brandName}
                    </div>
                    <div style="font-size: 12px; font-weight: 500; color: #6ee7b7; letter-spacing: 0.8px; text-transform: uppercase; margin-top: 3px;">
                      Hệ thống Quản lý Huấn luyện Ngựa đua
                    </div>
                  </td>
                  <td align="right" valign="top">
                    <!-- Badge trạng thái / mục đích sử dụng màu Forest Accent -->
                    <span style="display: inline-block; background-color: #162a21; color: #a7f3d0; border: 1px solid #2d5543; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 4px; letter-spacing: 0.8px; text-transform: uppercase;">
                      ${badgeText}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Lời chào trang trọng -->
              <div style="font-size: 15px; color: #cbd5e1; margin-bottom: 14px;">
                Kính gửi <strong style="color: #ffffff;">${userName}</strong>,
              </div>

              <!-- Nội dung mô tả sự kiện -->
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
                ${contextDescription}
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                ${actionInstruction}
              </p>

              <!-- Khung hiển thị mã OTP (Đồng bộ màu Forest Green #315D4B & viền ngọc bích đậm #2d5543) -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0 16px 0;">
                <tr>
                  <td align="center" style="background-color: #121e18; border: 1.5px solid #2d5543; border-radius: 8px; padding: 24px 16px;">
                    
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #6ee7b7; margin-bottom: 8px;">
                      MÃ XÁC THỰC CỦA QUÝ KHÁCH (OTP)
                    </div>

                    <!-- Dãy số OTP: Rõ nét, hỗ trợ 1 chạm bôi đen toàn bộ số -->
                    <div class="otp-code" style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 36px; font-weight: 800; color: #ffffff; letter-spacing: 8px; user-select: all; -webkit-user-select: all;">
                      ${code}
                    </div>

                  </td>
                </tr>
              </table>

              ${actionUrl ? `
              <!-- Nút kích hoạt trực tiếp (1 chạm - mở web và tự điền mã) -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${actionUrl}" target="_blank" style="display: inline-block; background-color: #315D4B; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 13px 30px; border-radius: 6px; letter-spacing: 0.5px; border: 1px solid #4a8069;">
                      ${actionUrlLabel || 'KÍCH HOẠT TÀI KHOẢN NGAY'} &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- Khối lưu ý bảo mật chính thống -->
              <div style="background-color: #111a15; border-left: 3px solid #315D4B; border-radius: 0 6px 6px 0; padding: 12px 16px; margin: 20px 0 28px 0;">
                <div style="font-size: 13px; color: #cbd5e1; margin-bottom: 4px;">
                  • Mã xác thực có hiệu lực trong vòng <strong style="color: #6ee7b7;">${durationText}</strong> kể từ thời điểm gửi.
                </div>
                <div style="font-size: 13px; color: #94a3b8;">
                  • Vì lý do an toàn bảo mật, tuyệt đối không chia sẻ mã này cho bất kỳ ai.
                </div>
              </div>

              <!-- Phân cách -->
              <div style="border-top: 1px solid #1c2e26; margin-bottom: 20px;"></div>

              <!-- Lời chào kết trang trọng -->
              <div style="font-size: 14px; color: #94a3b8; line-height: 1.6;">
                Trân trọng cảm ơn,<br>
                <strong style="color: #f1f5f9; font-weight: 600;">Ban Quản lý Hệ thống TMEC</strong><br>
                <span style="font-size: 13px; color: #64748b;">Hệ thống Quản lý Huấn luyện Ngựa đua</span>
              </div>

            </td>
          </tr>

          <!-- Footer pháp lý chuẩn doanh nghiệp -->
          <tr>
            <td align="center" style="background-color: #0a100d; padding: 18px 32px; border-top: 1px solid #16241e; font-size: 12px; color: #52635a; line-height: 1.5;">
              © ${new Date().getFullYear()} TMEC Racehorse Training & Management System. All rights reserved.<br>
              Email này được tạo tự động từ hệ thống bảo mật, vui lòng không phản hồi trực tiếp.
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;

  return { subject, text, html };
}
