import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator';
import { STORE_TARGET_TOTAL } from '@constants/index';

// The full assignment list, not a delta — omitting a store revokes it. An empty
// array is the documented way to clear every assignment.
export class AssignStoresDto {
  @ApiProperty({ type: [String], example: ['clx1store1', 'clx1store2'] })
  @IsArray()
  @ArrayUnique()
  // The programme's whole cohort is the natural ceiling; assigning more ids than
  // there are stores can only be junk, and every id costs a row in the join.
  @ArrayMaxSize(STORE_TARGET_TOTAL)
  @IsString({ each: true })
  storeIds: string[];
}
