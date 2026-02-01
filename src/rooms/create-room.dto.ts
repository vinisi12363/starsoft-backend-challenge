import { IsString, IsNotEmpty, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({ example: 'Sala 01 - IMAX', description: 'Nome único da sala' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 5, description: 'Quantidade de fileiras (A, B, C...)' })
  @IsInt()
  @Min(1)
  @Max(26) // Limite de A-Z
  rows: number;

  @ApiProperty({ example: 10, description: 'Assentos por fileira' })
  @IsInt()
  @Min(1)
  seatsPerRow: number;
}
