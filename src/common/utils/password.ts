// Luật độ mạnh mật khẩu — giống FE (src/shared/lib/password.ts) để hai bên chấm như nhau.
import * as bcrypt from 'bcryptjs';

export function scorePassword(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s += 1;
  if (pw.length >= 12) s += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 1;
  if (/[0-9]/.test(pw)) s += 1;
  if (/[^A-Za-z0-9]/.test(pw)) s += 1;
  return Math.min(s, 4);
}

// Trả về câu lỗi, hoặc "" nếu hợp lệ.
export function passwordError(pw: string): string {
  if (!pw) return 'New password is required.';
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (scorePassword(pw) < 2) return 'Add an uppercase letter, a digit or a symbol.';
  return '';
}

const ROUNDS = 10;

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, ROUNDS);
}

// Hash giả để so sánh khi email không tồn tại / chưa đặt mật khẩu: thời gian phản hồi như nhau,
// không lộ email nào có thật.
const DUMMY_HASH = bcrypt.hashSync('equiflow-dummy-password', ROUNDS);

export async function verifyPassword(
  pw: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(pw, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(pw, hash);
}
