import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateMaintenanceProviderDto } from './create-maintenance-provider.dto';

// `type` nunca e editavel -- uma oficina que virou fornecedor (ou
// vice-versa) e uma entidade diferente na pratica; corrigir um cadastro
// errado deve ser feito criando um novo registro, nao reclassificando um
// existente (mesmo espirito de ReviseFreightRuleDto/UpdateFuelSupplyDto).
export class UpdateMaintenanceProviderDto extends PartialType(
  OmitType(CreateMaintenanceProviderDto, ['type'] as const),
) {}
