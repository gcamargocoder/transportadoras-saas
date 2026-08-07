import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TripExpenseEntity } from './trip-expense.entity';

export class PaginatedTripExpensesEntity {
  @ApiProperty({ type: [TripExpenseEntity] })
  items!: TripExpenseEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
