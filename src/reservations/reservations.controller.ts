import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    Headers,
    ParseUUIDPipe,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiHeader,
} from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@ApiTags('reservations')
@Controller('reservations')
export class ReservationsController {
    constructor(private readonly reservationsService: ReservationsService) { }

    @Post()
    @ApiOperation({
        summary: 'Create a seat reservation',
        description:
            'Reserves one or more seats for a session. The reservation expires in 30 seconds if not confirmed.',
    })
    @ApiHeader({
        name: 'X-Idempotency-Key',
        description: 'Unique key to prevent duplicate reservations (optional)',
        required: false,
    })
    @ApiResponse({
        status: 201,
        description: 'Reservation created successfully',
    })
    @ApiResponse({
        status: 409,
        description: 'Seats are not available or lock acquisition failed',
    })
    @ApiResponse({
        status: 404,
        description: 'User or session not found',
    })
    async create(
        @Body() createReservationDto: CreateReservationDto,
        @Headers('X-Idempotency-Key') idempotencyKey?: string,
    ) {
        return this.reservationsService.create(createReservationDto, idempotencyKey);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get reservation by ID' })
    @ApiParam({ name: 'id', description: 'Reservation ID (UUID)' })
    @ApiResponse({ status: 200, description: 'Reservation found' })
    @ApiResponse({ status: 404, description: 'Reservation not found' })
    async findById(@Param('id', ParseUUIDPipe) id: string) {
        return this.reservationsService.findById(id);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Cancel a reservation' })
    @ApiParam({ name: 'id', description: 'Reservation ID (UUID)' })
    @ApiResponse({ status: 200, description: 'Reservation cancelled' })
    @ApiResponse({ status: 400, description: 'Cannot cancel this reservation' })
    @ApiResponse({ status: 404, description: 'Reservation not found' })
    async cancel(@Param('id', ParseUUIDPipe) id: string) {
        return this.reservationsService.cancel(id);
    }
}
