import { IsString, IsNotEmpty, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoomDto {
    @ApiProperty({ example: 'Sala IMAX 01', description: 'Nome da sala' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 50, description: 'Capacidade total da sala' })
    @IsInt()
    @Min(1)
    capacity: number;
}
