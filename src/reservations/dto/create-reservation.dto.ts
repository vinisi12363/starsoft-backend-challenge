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
        description: 'User ID',
    })
    @IsUUID()
    @IsNotEmpty()
    userId: string;

    @ApiProperty({
        example: '550e8400-e29b-41d4-a716-446655440001',
        description: 'Session ID',
    })
    @IsUUID()
    @IsNotEmpty()
    sessionId: string;

    @ApiProperty({
        example: ['550e8400-e29b-41d4-a716-446655440002'],
        description: 'Array of seat IDs to reserve',
        type: [String],
    })
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID('4', { each: true })
    seatIds: string[];
}
