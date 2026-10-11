import { passwordError } from './password';

describe('passwordError (luật mật khẩu mới)', () => {
  it('should require a password', () => {
    expect(passwordError('')).toBe('New password is required.');
  });

  it('should require at least 8 characters', () => {
    expect(passwordError('Ab1!')).toBe('Password must be at least 8 characters.');
  });

  it('should require an uppercase letter', () => {
    expect(passwordError('abcdefg1!')).toBe('Add at least one uppercase letter.');
  });

  it('should require a digit', () => {
    expect(passwordError('Abcdefgh!')).toBe('Add at least one digit.');
  });

  it('should require a special character', () => {
    expect(passwordError('Abcdefg1')).toBe('Add at least one special character.');
  });

  it('should accept a password that meets every rule', () => {
    expect(passwordError('Horse@2026')).toBe('');
  });
});
