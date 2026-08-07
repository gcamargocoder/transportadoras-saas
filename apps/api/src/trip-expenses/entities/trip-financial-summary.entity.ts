import { ApiProperty } from '@nestjs/swagger';

// GET /trips/:id/financial-summary -- considera apenas despesas PENDING ou
// APPROVED (REJECTED/CANCELLED nao representam custo real da viagem). Ver
// TripExpensesService.getFinancialSummary.
export class TripFinancialSummaryEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty()
  totalExpenses!: number;

  @ApiProperty()
  fuelExpenses!: number;

  @ApiProperty()
  foodExpenses!: number;

  @ApiProperty()
  hotelExpenses!: number;

  @ApiProperty()
  maintenanceExpenses!: number;

  @ApiProperty({ description: 'TIRES, PARKING, WASH, ADVANCE, FINE e OTHER somados.' })
  otherExpenses!: number;

  @ApiProperty({
    description: 'Categoria TOLL_EXTRA -- distinta do pedagio via tag (TollTransaction).',
  })
  tollExpenses!: number;

  @ApiProperty()
  expenseCount!: number;

  @ApiProperty()
  averageExpense!: number;

  @ApiProperty()
  largestExpense!: number;
}
