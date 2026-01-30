import {
    IsString,
    IsNotEmpty,
    IsDateString,
    IsNumber,
    IsPositive,
    Min,
    IsInt,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateSessionDto {
    @ApiProperty({ example: 'Inception', description: 'Movie title' })
    @IsString()
    @IsNotEmpty()
    movieTitle: string;

    @ApiProperty({
        example: '2024-12-25T19:00:00Z',
        description: 'Show time (ISO date)',
    })
    @IsDateString()
    @IsNotEmpty()
    showTime: string;

    @ApiProperty({ example: 'Sala 1', description: 'Room name' })
    @IsString()
    @IsNotEmpty()
    roomName: string;

    @ApiProperty({ example: 25.0, description: 'Ticket price in BRL' })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    ticketPrice: number;

    @ApiProperty({ example: 4, description: 'Number of seat rows (A, B, C, ...)' })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    rows: number;

    @ApiProperty({ example: 4, description: 'Number of seats per row' })
    @Type(() => Number)
    @IsInt()
    @Min(4) // Mínimo 16 assentos (4x4) conforme requisito
    seatsPerRow: number;
}
