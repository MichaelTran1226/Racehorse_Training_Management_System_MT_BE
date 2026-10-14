import { fullNameError } from './name';

describe('fullNameError (luật họ tên)', () => {
  it('should require a name', () => {
    expect(fullNameError('  ')).toBe('Full name is required.');
  });

  it('should accept Vietnamese letters and spaces', () => {
    expect(fullNameError('Nguyễn Hoàng Anh')).toBe('');
    expect(fullNameError('Michael Tran')).toBe('');
  });

  it('should reject digits and symbols', () => {
    expect(fullNameError('Anh 123')).toBe('Full name can only contain letters and spaces.');
    expect(fullNameError('Anh@Nguyen')).toBe('Full name can only contain letters and spaces.');
    expect(fullNameError('Anh-Nguyen')).toBe('Full name can only contain letters and spaces.');
  });
});
