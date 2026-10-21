import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

async function errorsOf(body: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(LoginDto, body);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('LoginDto', () => {
  it('accepts a valid gmail address and trims / lowercases it', async () => {
    const dto = plainToInstance(LoginDto, {
      email: '  Viet.Do@Gmail.com ',
      password: 'equiflow123',
    });
    expect(dto.email).toBe('viet.do@gmail.com');
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each(['.abc@gmail.com', 'a..b@gmail.com', 'abc.@gmail.com', 'a,b@gmail.com', 'abc@yahoo.com'])(
    'rejects %s',
    async (email) => {
      expect(await errorsOf({ email, password: 'equiflow123' })).toContain(
        'Email must be a @gmail.com address',
      );
    },
  );

  it('rejects an email longer than 254 characters', async () => {
    const email = `${'a'.repeat(250)}@gmail.com`;
    expect(await errorsOf({ email, password: 'equiflow123' })).toContain(
      'Email must be at most 254 characters',
    );
  });

  it('rejects a password longer than 128 characters', async () => {
    expect(await errorsOf({ email: 'a@gmail.com', password: 'x'.repeat(129) })).toContain(
      'Password must be at most 128 characters',
    );
  });

  it('rejects a password shorter than 8 characters', async () => {
    expect(await errorsOf({ email: 'a@gmail.com', password: 'short' })).toContain(
      'Password must be at least 8 characters',
    );
  });
});
