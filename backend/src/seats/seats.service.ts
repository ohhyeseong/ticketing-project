import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'redis/redis.module';

@Injectable()
export class SeatsService {
  constructor(
    private prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  findByConcert(concertId: number) {
    return this.prisma.seat.findMany({ where: { concertId } });
  }

  async hold(seatId: number, userId: number) {
    const seat = await this.redis.set(`seat:hold:${seatId}`, userId, 'EX', 300, 'NX');
    
    if (!seat) {
      throw new ConflictException('이미 예약이 된 좌석입니다. 다른 좌석을 선택해주세요.');
    } else {
      return await this.prisma.seat.update({
        where: { id: seatId },
        data: {
          status: 'HOLDING',
          heldBy: userId,
          heldAt: new Date(),
        },
      });
    }
  }

  async cancelHold(seatId: number, userId: number) {
    const cancelled = await this.redis.get(`seat:hold:${seatId}`);
    
    if (!cancelled) {
      throw new ConflictException('해당 좌석은 예약이 되어있지 않습니다.');
    } else if (cancelled !== String(userId)) {
      throw new ConflictException('해당 좌석을 예약한 사용자가 아닙니다.');
    } else {
      await this.redis.del(`seat:hold:${seatId}`);
    }
    return this.prisma.seat.update({
      where: { id: seatId },
      data: {
        status: 'AVAILABLE',
        heldBy: null,
        heldAt: null,
      },
    });
  }
}
