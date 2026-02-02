import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

@Injectable()
export class SalesRepository {
  constructor(private readonly prisma: PrismaService) { }

  private readonly saleInclude = {
    reservation: {
      include: {
        session: true,
        reservationSeats: {
          include: {
            sessionSeat: {
              include: { seat: true }, // Caminho: Reservation -> ReservationSeat -> SessionSeat -> Seat
            },
          },
        },
      },
    },
    user: true,
  };

  async create(data: Prisma.SaleUncheckedCreateInput) {
    return this.prisma.sale.create({
      data,
      include: this.saleInclude,
    });
  }

  async findAll() {
    return this.prisma.sale.findMany({
      include: this.saleInclude,
      orderBy: { confirmedAt: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.sale.findUnique({
      where: { id },
      include: this.saleInclude,
    });
  }

  async findByUserId(userId: string) {
    return this.prisma.sale.findMany({
      where: { userId },
      include: this.saleInclude,
      orderBy: { confirmedAt: 'desc' },
    });
  }

  async count(where?: Prisma.SaleWhereInput): Promise<number> {
    return this.prisma.sale.count({ where });
  }
}
