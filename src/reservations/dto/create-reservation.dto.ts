import {
    IsArray,
    IsNotEmpty,
    IsString,
    IsUUID,
    ArrayMinSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReservationDto {
    @ApiProperty({
        example: '550e8400-e29b-41d4-a716-446655440000',
        description: 'ID do usuário que está realizando a reserva',
    })
    @IsUUID()
    @IsNotEmpty()
    userId: string;

    @ApiProperty({
        example: '550e8400-e29b-41d4-a716-446655440001',
        description: 'ID da sessão de cinema',
    })
    @IsUUID()
    @IsNotEmpty()
    sessionId: string;

    @ApiProperty({
        example: ['721e8400-e29b-41d4-a716-446655440099'],
        description: 'Array de IDs dos SessionSeats (a instância do assento na sessão)',
        type: [String],
    })
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID('4', { each: true })
    sessionSeatIds: string[];
}