import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
    constructor(private readonly sessionsService: SessionsService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new cinema session with seats' })
    @ApiResponse({ status: 201, description: 'Session created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input or less than 16 seats' })
    async create(@Body() createSessionDto: CreateSessionDto) {
        return this.sessionsService.create(createSessionDto);
    }

    @Get()
    @ApiOperation({ summary: 'Get all cinema sessions' })
    @ApiResponse({ status: 200, description: 'List of all sessions' })
    async findAll() {
        return this.sessionsService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get session by ID' })
    @ApiParam({ name: 'id', description: 'Session ID (UUID)' })
    @ApiResponse({ status: 200, description: 'Session found' })
    @ApiResponse({ status: 404, description: 'Session not found' })
    async findById(@Param('id', ParseUUIDPipe) id: string) {
        return this.sessionsService.findById(id);
    }

    @Get(':id/seats')
    @ApiOperation({ summary: 'Get seat availability for a session (real-time)' })
    @ApiParam({ name: 'id', description: 'Session ID (UUID)' })
    @ApiResponse({ status: 200, description: 'Seat availability with summary' })
    @ApiResponse({ status: 404, description: 'Session not found' })
    async getSeatAvailability(@Param('id', ParseUUIDPipe) id: string) {
        return this.sessionsService.getSeatAvailabilitySummary(id);
    }
}
