// Luật Họ tên — giống FE (src/shared/lib/name.ts): chỉ chữ cái (kể cả có dấu tiếng Việt) và khoảng trắng.
const NAME_RE = /^[\p{L}\p{M} ]+$/u;

// Trả về câu lỗi, hoặc "" nếu hợp lệ.
export function fullNameError(name: string): string {
  const v = name.trim();
  if (!v) return 'Full name is required.';
  if (!NAME_RE.test(v)) return 'Full name can only contain letters and spaces.';
  return '';
}
