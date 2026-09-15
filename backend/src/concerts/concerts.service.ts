import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConcertDto } from './dto/create-concert.dto';

@Injectable()
export class ConcertsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateConcertDto) {
    const concert = await this.prisma.concert.create({
      data: {
        title: dto.title,
        venue: dto.venue,
        performanceDate: new Date(dto.performanceDate),
        totalSeats: 100,
      },
    });

    const seatsData = Array.from({ length: 100 }, (_, i) => ({
      concertId: concert.id,
      seatNumber: `A-${i + 1}`,
    }));
    await this.prisma.seat.createMany({ data: seatsData });

    return concert;
  }

  findAll() {
    return this.prisma.concert.findMany();
  }

  findOne(id: number) {
    return this.prisma.concert.findUnique({ where: { id } });
  }
}
