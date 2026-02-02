import { Test, TestingModule } from '@nestjs/testing';
import { RoomsService } from './rooms.service';
import { RoomsRepository } from './rooms.repository';

describe('RoomsService', () => {
    let service: RoomsService;
    let repository: jest.Mocked<RoomsRepository>;

    beforeEach(async () => {
        const repositoryMock = {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RoomsService,
                { provide: RoomsRepository, useValue: repositoryMock },
            ],
        }).compile();

        service = module.get<RoomsService>(RoomsService);
        repository = module.get(RoomsRepository);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
