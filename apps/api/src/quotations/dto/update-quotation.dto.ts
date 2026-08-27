import { PartialType } from '@nestjs/swagger';
import { CreateQuotationDto } from './create-quotation.dto';

// PATCH /quotations/:id -- so permitido enquanto status DRAFT/SENT (regra 7
// -- ver QuotationsService.assertEditable). status muda apenas via
// PATCH /quotations/:id/status (UpdateQuotationStatusDto), nunca aqui.
export class UpdateQuotationDto extends PartialType(CreateQuotationDto) {}
