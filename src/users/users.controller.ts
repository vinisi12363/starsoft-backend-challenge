import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new user' })
    @ApiResponse({ status: 201, description: 'User created successfully' })
    @ApiResponse({ status: 409, description: 'User with this email already exists' })
    async create(@Body() createUserDto: CreateUserDto) {
        return this.usersService.create(createUserDto);
    }

    @Get()
    @ApiOperation({ summary: 'Get all users' })
    @ApiResponse({ status: 200, description: 'List of all users' })
    async findAll() {
        return this.usersService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get user by ID' })
    @ApiParam({ name: 'id', description: 'User ID (UUID)' })
    @ApiResponse({ status: 200, description: 'User found' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async findById(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findById(id);
    }

    @Get(':id/purchases')
    @ApiOperation({ summary: 'Get user purchase history' })
    @ApiParam({ name: 'id', description: 'User ID (UUID)' })
    @ApiResponse({ status: 200, description: 'Purchase history' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getPurchaseHistory(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.getPurchaseHistory(id);
    }
}
