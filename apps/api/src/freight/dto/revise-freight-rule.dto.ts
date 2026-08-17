import { OmitType } from '@nestjs/swagger';
import { CreateFreightRuleDto } from './create-freight-rule.dto';

// Todos os campos opcionais: quando omitido, o valor da versao anterior e
// herdado (secao 4 -- "criar nova versao" nunca exige redigitar tudo).
// freightTableId nunca muda numa revisao (a nova versao fica na MESMA
// tabela da anterior).
export class ReviseFreightRuleDto extends OmitType(CreateFreightRuleDto, ['freightTableId'] as const) {}
