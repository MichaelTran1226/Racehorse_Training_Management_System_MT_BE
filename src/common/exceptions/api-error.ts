import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Lỗi nghiệp vụ có mã máy đọc được (`code`) và dữ liệu kèm theo (`data`), ví dụ
 * `OTP_INVALID` + `{ attemptsLeft: 3 }`. AllExceptionsFilter đưa hai trường này vào phản hồi
 * để FE hiện đúng thông báo. Trả về đúng lớp HttpException theo mã HTTP (401 → UnauthorizedException…).
 */
export function apiError(
  status: HttpStatus,
  code: string,
  message: string,
  data: Record<string, unknown> = {},
): HttpException {
  const body = { message, code, data };
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return new BadRequestException(body);
    case HttpStatus.UNAUTHORIZED:
      return new UnauthorizedException(body);
    case HttpStatus.FORBIDDEN:
      return new ForbiddenException(body);
    case HttpStatus.NOT_FOUND:
      return new NotFoundException(body);
    case HttpStatus.CONFLICT:
      return new ConflictException(body);
    default:
      return new HttpException(body, status);
  }
}
