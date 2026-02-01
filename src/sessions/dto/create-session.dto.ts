import { IsString, IsNotEmpty, IsDateString, IsNumber, IsPositive, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateSessionDto {
  @ApiProperty({ example: 'Interestelar 2', description: 'Título do filme' })
  @IsString()
  @IsNotEmpty()
  movieTitle: string;

  @ApiProperty({
    example: '2026-02-01T19:00:00Z',
    description: 'Horário de início (ISO)',
  })
  @IsDateString()
  @IsNotEmpty()
  startShowTime: string;

  @ApiProperty({
    example: '2026-02-01T22:00:00Z',
    description: 'Horário de término (ISO)',
  })
  @IsDateString()
  @IsNotEmpty()
  endShowTime: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'UUID da Sala física',
  })
  @IsUUID()
  @IsNotEmpty()
  roomId: string; // Referência direta para a sala já criada

  @ApiProperty({ example: 35.5, description: 'Preço do ingresso' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  ticketPrice: number;
}
