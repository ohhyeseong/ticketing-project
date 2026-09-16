import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(private prisma: PrismaService) {}

  create(userId: number, dto: CreateReservationDto) {
    return this.prisma.reservation.create({
      data: {
        userId,
        concertId: dto.concertId,
        seatId: dto.seatId,
      },
    });
  }

  async confirm(id: number) {
    const reservation = await this.prisma.reservation.update({
      where: { id },
      data: { status: 'CONFIRMED' },
    });
    await this.prisma.seat.update({
      where: { id: reservation.seatId },
      data: { status: 'SOLD' },
    });
    return reservation;
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

  async cancel(id: number) {
    const reservation = await this.prisma.reservation.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.prisma.seat.update({
      where: { id: reservation.seatId },
      data: { status: 'AVAILABLE' },
    });
    return reservation;
  }
}
