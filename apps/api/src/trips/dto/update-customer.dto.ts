import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateCustomerDto } from './create-customer.dto';

// Fase 93 -- PATCH /customers/:id, lacuna real ate esta fase (o cadastro so
// tinha create/list/get). isActive nao esta em CreateCustomerDto (sempre
// nasce ativo) -- so faz sentido no update.
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
