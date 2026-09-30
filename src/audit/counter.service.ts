import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Bộ đếm tăng dần, an toàn khi nhiều request cùng lúc (UPSERT + increment trong một câu lệnh). */
@Injectable()
export class CounterService {
  constructor(private readonly prisma: PrismaService) {}

  async next(name: string): Promise<number> {
    const row = await this.prisma.counter.upsert({
      where: { name },
      create: { name, value: 1 },
      update: { value: { increment: 1 } },
    });
    return row.value;
  }
}
