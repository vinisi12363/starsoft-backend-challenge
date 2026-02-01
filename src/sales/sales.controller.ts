import { Controller, Get, Post, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import type { SalesService } from './sales.service';
import { UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DuplicateRequestGuard } from '../common/guards/duplicate-request.guard';

@ApiTags('sales')
@Controller()
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('reservations/:id/confirm')
  @ApiOperation({
    summary: 'Confirm payment for a reservation',
    description:
      'Converts a pending reservation into a confirmed sale. The reservation must not be expired.',
  })
  @ApiParam({ name: 'id', description: 'Reservation ID (UUID)' })
  @ApiResponse({
    status: 201,
    description: 'Payment confirmed and sale created',
  })
  @ApiResponse({
    status: 400,
    description: 'Reservation is expired or not in PENDING status',
  })
  @ApiResponse({ status: 404, description: 'Reservation not found' })
  @UseGuards(DuplicateRequestGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async confirmPayment(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.confirmPayment(id);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Get all sales' })
  @ApiResponse({ status: 200, description: 'List of all sales' })
  async findAll() {
    return this.salesService.findAll();
  }

  @Get('sales/:id')
  @ApiOperation({ summary: 'Get sale by ID' })
  @ApiParam({ name: 'id', description: 'Sale ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Sale found' })
  @ApiResponse({ status: 404, description: 'Sale not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.findById(id);
  }
}
