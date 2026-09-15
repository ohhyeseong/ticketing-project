import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ConcertsModule } from './concerts/concerts.module';
import { SeatsModule } from './seats/seats.module';
import { ReservationsModule } from './reservations/reservations.module';
import { PaymentsModule } from './payments/payments.module';
import { RedisModule } from 'redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ConcertsModule,
    SeatsModule,
    ReservationsModule,
    PaymentsModule,
    RedisModule
  ],
})
export class AppModule {}
