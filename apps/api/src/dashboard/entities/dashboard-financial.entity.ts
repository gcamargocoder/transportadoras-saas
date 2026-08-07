import { ApiProperty } from '@nestjs/swagger';

// profit = totalRevenue - approvedExpenses
// netResult = profit - advances
// margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0 -- nunca NaN.
export class DashboardFinancialEntity {
  @ApiProperty()
  totalRevenue!: number;

  @ApiProperty({ description: 'Soma de TripExpense.amount com status APPROVED.' })
  approvedExpenses!: number;

  @ApiProperty()
  advances!: number;

  @ApiProperty()
  profit!: number;

  @ApiProperty()
  netResult!: number;

  @ApiProperty()
  averageTripRevenue!: number;

  @ApiProperty()
  averageTripExpense!: number;

  @ApiProperty()
  largestRevenue!: number;

  @ApiProperty()
  largestExpense!: number;

  @ApiProperty({ description: 'Percentual (0-100). 0 quando totalRevenue = 0.' })
  margin!: number;
}
