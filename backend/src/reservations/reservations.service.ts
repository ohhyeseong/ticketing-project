import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reservation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SeatsService } from '../seats/seats.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(
    private prisma: PrismaService,
    private seatsService: SeatsService,
  ) {}

  private async findOwned(id: number, userId: number): Promise<Reservation> {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('존재하지 않는 예약입니다.');
    if (reservation.userId !== userId) throw new ForbiddenException('본인의 예약만 처리할 수 있습니다.');
    return reservation;
  }

  async create(userId: number, dto: CreateReservationDto) {
    const seat = await this.prisma.seat.findUnique({ where: { id: dto.seatId } });
    if (!seat) throw new NotFoundException('존재하지 않는 좌석입니다.');
    if (seat.concertId !== dto.concertId) throw new BadRequestException('좌석이 해당 공연의 좌석이 아닙니다.');
    if ((await this.seatsService.getHolder(seat.id)) !== userId) {
      throw new ForbiddenException('먼저 해당 좌석을 선점해야 합니다.');
    }

    const existing = await this.prisma.reservation.findFirst({
      where: { userId, seatId: seat.id, status: 'PENDING' },
    });
    if (existing) return existing;

    return this.prisma.reservation.create({
      data: { userId, concertId: dto.concertId, seatId: dto.seatId },
    });
  }

  async confirm(id: number, userId: number) {
    const reservation = await this.findOwned(id, userId);
    if (reservation.status === 'CONFIRMED') return reservation;
    if (reservation.status === 'CANCELLED') throw new ConflictException('취소된 예약입니다.');
    if ((await this.seatsService.getHolder(reservation.seatId)) !== userId) {
      throw new ConflictException('좌석 선점 시간이 만료되었습니다.');
    }

    const confirmed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.reservation.update({ where: { id }, data: { status: 'CONFIRMED' } });
      await tx.seat.update({ where: { id: reservation.seatId }, data: { status: 'SOLD' } });
      return updated;
    });
    await this.seatsService.releaseHold(reservation.seatId, userId);
    return confirmed;
  }

  findMyReservations(userId: number) {
    return this.prisma.reservation.findMany({ where: { userId } });
  }

  findAll() {
    return this.prisma.reservation.findMany({
      include: {
        user: { select: { id: true, email: true } },
        concert: true,
        seat: true,
      },
    });
  }

  async cancel(id: number, userId: number) {
    const reservation = await this.findOwned(id, userId);
    if (reservation.status === 'CANCELLED') return reservation;

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.reservation.update({ where: { id }, data: { status: 'CANCELLED' } });
      await tx.seat.update({
        where: { id: reservation.seatId },
        data: { status: 'AVAILABLE', heldBy: null, heldAt: null },
      });
      return updated;
    });
    await this.seatsService.releaseHold(reservation.seatId, userId);
    return cancelled;
  }
}
