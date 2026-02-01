import { Controller, Get, Post, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import type { RoomsService } from './rooms.service';
import type { CreateRoomDto } from './dto/create-room.dto';

@ApiTags('Rooms')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar uma nova sala' })
  @ApiResponse({ status: 201, description: 'Sala criada com sucesso.' })
  async create(@Body() createRoomDto: CreateRoomDto) {
    return this.roomsService.create(createRoomDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas as salas' })
  @ApiResponse({ status: 200, description: 'Lista de salas retornada.' })
  async findAll() {
    return this.roomsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar sala por ID' })
  @ApiParam({ name: 'id', description: 'UUID da sala' })
  @ApiResponse({ status: 200, description: 'Sala encontrada.' })
  @ApiResponse({ status: 404, description: 'Sala não encontrada.' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.roomsService.findById(id);
  }
}
