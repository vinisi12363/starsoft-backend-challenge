import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import type { CreateUserDto } from './dto/create-user.dto';
import type { User } from '@prisma/client';
import type { UsersRepository } from './users.repository';

/**
 * Users Service
 *
 * Contém a lógica de negócio relacionada a usuários.
 * Delega operações de banco de dados para o UsersRepository.
 */
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  /**
   * Cria um novo usuário
   * Valida se email já existe antes de criar
   */
  async create(createUserDto: CreateUserDto): Promise<User> {
    // Validação de negócio: email único
    const existingUser = await this.usersRepository.findByEmail(createUserDto.email);

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    return this.usersRepository.create(createUserDto);
  }

  /**
   * Lista todos os usuários
   */
  async findAll(): Promise<User[]> {
    return this.usersRepository.findAll();
  }

  /**
   * Busca usuário por ID
   * Lança exceção se não encontrado
   */
  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  /**
   * Busca usuário por email
   * Retorna null se não encontrado
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  /**
   * Retorna histórico de compras do usuário
   */
  async getPurchaseHistory(userId: string) {
    // Valida se usuário existe
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return this.usersRepository.findPurchaseHistory(userId);
  }
}
