import { PartialType, PickType } from '@nestjs/swagger';
import { CreateFinancialAccountDto } from './create-financial-account.dto';

// PATCH /finance/accounts/:id -- secao 5/7 do pedido: propositalmente NAO
// inclui `type` nem `initialBalance` (imutaveis apos a criacao) nem
// `isActive` (somente via POST .../activate | .../deactivate).
export class UpdateFinancialAccountDto extends PartialType(
  PickType(CreateFinancialAccountDto, ['name', 'bankName', 'bankCode', 'accountNumberMasked'] as const),
) {}
