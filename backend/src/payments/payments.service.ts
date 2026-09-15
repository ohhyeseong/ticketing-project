import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreatePaymentDto) {
    return this.prisma.payment.create({
      data: {
        reservationId: dto.reservationId,
        amount: dto.amount,
        status: 'SUCCESS',
        paidAt: new Date(),
      },
    });
  }

  findByReservation(reservationId: number) {
    return this.prisma.payment.findUnique({ where: { reservationId } });
  }
}
