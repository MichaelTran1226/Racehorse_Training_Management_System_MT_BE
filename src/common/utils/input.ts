// Chuẩn hóa giá trị client gửi lên (DTO chỉ kiểm tra kiểu; luật nghiệp vụ nằm ở service
// để trả đúng mã lỗi FE đọc, vd. INVALID_EMAIL, WEAK_PASSWORD).

// Nhóm chốt chỉ nhận email @gmail.com (xem docs/API_CONTRACT.md bên FE).
export const EMAIL_RE = /^[^\s@]+@gmail\.com$/i;

export function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

// Mật khẩu: KHÔNG trim (khoảng trắng là một phần của mật khẩu).
export function raw(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normEmail(value: unknown): string {
  return str(value).toLowerCase();
}

// "YYMM" của thời điểm hiện tại, dùng trong mã REQ-YYMM-NNN và 403-YYMM-NNNN.
export function yymm(date = new Date()): string {
  return `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}`;
}
