import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { User, Prisma } from '@prisma/client';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async findAll(orderBy?: Prisma.UserOrderByWithRelationInput): Promise<User[]> {
    return this.prisma.user.findMany({
      orderBy: orderBy ?? { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        reservations: {
          include: {
            reservationSeats: {
              include: {
                sessionSeat: {
                  include: { seat: true },
                },
              },
            },
            session: true,
          },
        },
      },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findPurchaseHistory(userId: string) {
    return this.prisma.sale.findMany({
      where: { userId },
      include: {
        reservation: {
          include: {
            session: true,
            reservationSeats: {
              include: {
                sessionSeat: {
                  // Camada intermediária da sessão
                  include: {
                    seat: true, // Agora sim, chegamos no assento físico!
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { confirmedAt: 'desc' },
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<User> {
    return this.prisma.user.delete({
      where: { id },
    });
  }

  async count(where?: Prisma.UserWhereInput): Promise<number> {
    return this.prisma.user.count({ where });
  }
}
