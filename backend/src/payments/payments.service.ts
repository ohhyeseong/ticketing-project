import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePaymentDto, userId: number) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: dto.reservationId } });
    if (!reservation) throw new NotFoundException('존재하지 않는 예약입니다.');
    if (reservation.userId !== userId) throw new ForbiddenException('본인의 예약만 결제할 수 있습니다.');
    if (!Number.isInteger(dto.amount) || dto.amount <= 0) {
      throw new BadRequestException('결제 금액은 0보다 큰 정수여야 합니다.');
    }
    if (reservation.status === 'CANCELLED') throw new ConflictException('취소된 예약은 결제할 수 없습니다.');

    const existing = await this.findByReservation(reservation.id);
    if (existing) return existing;

    try {
      return await this.prisma.payment.create({
        data: {
          reservationId: reservation.id,
          amount: dto.amount,
          status: 'SUCCESS',
          paidAt: new Date(),
        },
      });
    } catch (error) {
      // 동시 요청이 먼저 결제를 만든 경우: 오류 대신 그 결제를 돌려준다
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.findByReservation(reservation.id);
      }
      throw error;
    }
  }

  findByReservation(reservationId: number) {
    return this.prisma.payment.findUnique({ where: { reservationId } });
  }
}
