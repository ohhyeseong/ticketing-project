import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Seat } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

// 값이 userId와 같을 때만 키를 삭제한다 (확인과 삭제를 한 번에 처리)
const RELEASE_IF_HOLDER = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

export type SeatView = Seat;

@Injectable()
export class SeatsService {
  constructor(
    private prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private key(seatId: number) {
    return `seat:hold:${seatId}`;
  }

  private ttlSeconds() {
    return Number(process.env.SEAT_HOLD_TTL_SECONDS ?? 300);
  }

  // 선점 여부의 기준은 Redis. DB는 AVAILABLE/SOLD만 확정 상태로 본다.
  private toView(seat: Seat, holder: string | null): SeatView {
    if (seat.status === 'SOLD') return seat;
    if (holder) return { ...seat, status: 'HOLDING', heldBy: Number(holder) };
    return { ...seat, status: 'AVAILABLE', heldBy: null, heldAt: null };
  }

  async findByConcert(concertId: number): Promise<SeatView[]> {
    const seats = await this.prisma.seat.findMany({ where: { concertId }, orderBy: { id: 'asc' } });
    if (seats.length === 0) return [];
    const holders = await this.redis.mget(seats.map((seat) => this.key(seat.id)));
    return seats.map((seat, i) => this.toView(seat, holders[i]));
  }

  async getHolder(seatId: number): Promise<number | null> {
    const holder = await this.redis.get(this.key(seatId));
    return holder === null ? null : Number(holder);
  }

  async releaseHold(seatId: number, userId: number): Promise<void> {
    await this.redis.eval(RELEASE_IF_HOLDER, 1, this.key(seatId), String(userId));
  }

  async hold(seatId: number, userId: number): Promise<SeatView> {
    const seat = await this.prisma.seat.findUnique({ where: { id: seatId } });
    if (!seat) throw new NotFoundException('존재하지 않는 좌석입니다.');
    if (seat.status === 'SOLD') throw new ConflictException('이미 판매된 좌석입니다.');

    const acquired = await this.redis.set(this.key(seatId), String(userId), 'EX', this.ttlSeconds(), 'NX');
    if (!acquired && (await this.getHolder(seatId)) !== userId) {
      throw new ConflictException('이미 예약이 된 좌석입니다. 다른 좌석을 선택해주세요.');
    }
    return this.toView(seat, String(userId));
  }

  async cancelHold(seatId: number, userId: number): Promise<SeatView> {
    const released = await this.redis.eval(RELEASE_IF_HOLDER, 1, this.key(seatId), String(userId));
    if (released === 0) {
      const holder = await this.getHolder(seatId);
      throw new ConflictException(
        holder === null ? '해당 좌석은 예약이 되어있지 않습니다.' : '해당 좌석을 예약한 사용자가 아닙니다.',
      );
    }
    const seat = await this.prisma.seat.findUnique({ where: { id: seatId } });
    return this.toView(seat, null);
  }
}
