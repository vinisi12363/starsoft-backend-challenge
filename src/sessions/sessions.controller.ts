import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import type { SeatStatus } from '@prisma/client';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Criar uma nova sessão de cinema',
    description:
      'Ao criar uma sessão, o sistema automaticamente gera o estado inicial (AVAILABLE) de todos os assentos da sala vinculada.',
  })
  @ApiResponse({ status: 201, description: 'Sessão criada e assentos instanciados com sucesso.' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou sala com menos de 16 assentos.' })
  @ApiResponse({ status: 404, description: 'Sala (Room) não encontrada.' })
  async create(@Body() createSessionDto: CreateSessionDto) {
    return this.sessionsService.create(createSessionDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas as sessões' })
  @ApiResponse({ status: 200, description: 'Lista de sessões com informações das salas.' })
  async findAll() {
    return this.sessionsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar detalhes de uma sessão específica' })
  @ApiParam({ name: 'id', description: 'ID da Sessão (UUID)' })
  @ApiResponse({ status: 200, description: 'Dados da sessão encontrados.' })
  @ApiResponse({ status: 404, description: 'Sessão não encontrada.' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessionsService.findById(id);
  }

  @Get(':id/seats')
  @ApiOperation({
    summary: 'Mapa de assentos em tempo real',
    description:
      'Retorna todos os assentos da sessão com seus respectivos status (AVAILABLE, RESERVED, SOLD).',
  })
  @ApiParam({ name: 'id', description: 'ID da Sessão (UUID)' })
  @ApiResponse({ status: 200, description: 'Mapa de assentos e estatísticas de ocupação.' })
  @ApiResponse({ status: 404, description: 'Sessão não encontrada.' })
  async getSeatAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status?: SeatStatus,
  ) {
    return this.sessionsService.getSessionMap(id, status || undefined);
  }
}
