import { HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

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
});
