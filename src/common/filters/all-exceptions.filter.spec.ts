import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { apiError } from '../exceptions/api-error';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should catch HttpException and format JSON response correctly', () => {
    const statusFn = jest.fn().mockReturnThis();
    const jsonFn = jest.fn();

    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => ({
          status: statusFn,
          json: jsonFn,
        }),
        getRequest: () => ({
          url: '/api/test',
          method: 'GET',
        }),
      }),
    } as any;

    const exception = new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);

    filter.catch(exception, mockHost);

    expect(statusFn).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.FORBIDDEN,
        success: false,
        message: 'Forbidden resource',
        path: '/api/test',
        method: 'GET',
      }),
    );
  });

  const hostCapturing = () => {
    const statusFn = jest.fn().mockReturnThis();
    const jsonFn = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn, json: jsonFn }),
        getRequest: () => ({ url: '/api/auth/login', method: 'POST' }),
      }),
    } as any;
    return { host, statusFn, jsonFn };
  };

  it('should expose code and data of business errors created with apiError()', () => {
    const { host, statusFn, jsonFn } = hostCapturing();

    filter.catch(
      apiError(HttpStatus.TOO_MANY_REQUESTS, 'ATTEMPTS_EXCEEDED', 'Too many attempts', {
        retryAt: '2026-09-30T10:00:00.000Z',
      }),
      host,
    );

    expect(statusFn).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Too Many Requests',
        code: 'ATTEMPTS_EXCEEDED',
        message: 'Too many attempts',
        data: { retryAt: '2026-09-30T10:00:00.000Z' },
      }),
    );
  });

  it('should use code VALIDATION for ValidationPipe errors', () => {
    const { host, jsonFn } = hostCapturing();

    filter.catch(new BadRequestException(['email must be a string']), host);

    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION', error: 'Bad Request', data: {} }),
    );
  });
});
