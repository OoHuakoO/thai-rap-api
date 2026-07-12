import { Injectable } from '@nestjs/common';
import type { Province } from '@prisma/client';
import { ProvinceRepository } from './province.repository';

@Injectable()
export class ProvinceService {
  constructor(private readonly provinceRepo: ProvinceRepository) {}

  findAll(): Promise<Province[]> {
    return this.provinceRepo.findAll();
  }

  isValid(nameTh: string): Promise<boolean> {
    return this.provinceRepo.exists(nameTh);
  }
}
