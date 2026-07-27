import { Injectable } from '@nestjs/common';
import type { StoreType } from '@prisma/client';
import { StoreTypeRepository } from './store-type.repository';

@Injectable()
export class StoreTypeService {
  constructor(private readonly storeTypeRepo: StoreTypeRepository) {}

  findAll(): Promise<StoreType[]> {
    return this.storeTypeRepo.findAll();
  }

  isValid(nameTh: string): Promise<boolean> {
    return this.storeTypeRepo.exists(nameTh);
  }
}
