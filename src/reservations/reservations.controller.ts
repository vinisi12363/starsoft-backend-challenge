import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    Headers,
    ParseUUIDPipe,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiHeader,
    ApiExtraModels,
} from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import type { CreateReservationDto } from './dto/create-reservation.dto';
import { UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DuplicateRequestGuard } from '../common/guards/duplicate-request.guard';

@ApiTags('Reservations')
@Controller('reservations')
export class ReservationsController {
    constructor(private readonly reservationsService: ReservationsService) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Criar uma reserva de assentos',
        description: `
            Inicia o fluxo de reserva para um ou mais assentos em uma sessão específica. 
            Utiliza Redis para Distributed Locking e garante que o mesmo assento não seja reservado simultaneamente.
            A reserva expira automaticamente em 30 segundos se o pagamento não for detectado.
        `,
    })
    @ApiHeader({
        name: 'x-idempotency-key',
        description: 'Chave única (UUID) para evitar processamento duplicado da mesma reserva.',
        required: false,
    })
    @ApiResponse({
        status: 201,
        description: 'Reserva criada com sucesso. Assentos temporariamente bloqueados.',
    })
    @ApiResponse({
        status: 400,
        description: 'Dados inválidos ou erro na solicitação.',
    })
    @ApiResponse({
        status: 404,
        description: 'Sessão ou Assento não encontrado.',
    })
    @ApiResponse({
        status: 409,
        description: 'Conflito: Um ou mais assentos já estão reservados ou vendidos.',
    })
    @UseGuards(DuplicateRequestGuard)
    @Throttle({ default: { limit: 5, ttl: 60000 } }) // Limit: 5 reservations per minute per IP
    async create(
        @Body() createReservationDto: CreateReservationDto,
        @Headers('x-idempotency-key') idempotencyKey?: string,
    ) {
        // Passamos o DTO e a chave de idempotência direto para a orquestração da Service
        return this.reservationsService.create(createReservationDto, idempotencyKey);
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Consultar detalhes de uma reserva',
        description: 'Retorna os dados da reserva, incluindo os labels dos assentos (ex: A1, B2).',
    })
    @ApiParam({ name: 'id', description: 'ID da Reserva (UUID)' })
    @ApiResponse({ status: 200, description: 'Reserva encontrada.' })
    @ApiResponse({ status: 404, description: 'Reserva não encontrada.' })
    async findById(@Param('id', ParseUUIDPipe) id: string) {
        return this.reservationsService.findById(id);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Cancelar manualmente uma reserva',
        description: 'Libera os assentos vinculados à reserva e altera o status para CANCELLED.',
    })
    @ApiParam({ name: 'id', description: 'ID da Reserva (UUID)' })
    @ApiResponse({ status: 204, description: 'Reserva cancelada e assentos liberados.' })
    @ApiResponse({
        status: 400,
        description: 'Reserva não pode ser cancelada (já confirmada ou expirada).',
    })
    @ApiResponse({ status: 404, description: 'Reserva não encontrada.' })
    async cancel(@Param('id', ParseUUIDPipe) id: string) {
        await this.reservationsService.cancel(id);
    }
}
