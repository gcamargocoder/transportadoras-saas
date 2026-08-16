import { ApiProperty } from '@nestjs/swagger';
import { TenantEntity } from './tenant.entity';

// Fase 47 -- item da listagem GET /tenants (SUPER_ADMIN). Estende
// TenantEntity com contagens resolvidas em LOTE para a pagina inteira
// (TenantsRepository.getUserAndVehicleCountsByTenant), nunca 1 query por
// linha. Usado SOMENTE aqui -- GET /tenants/:id e o self-service continuam
// retornando TenantEntity puro (sem essas contagens, que so fazem sentido
// numa listagem).
export class TenantListItemEntity extends TenantEntity {
  @ApiProperty()
  userCount!: number;

  @ApiProperty()
  vehicleCount!: number;
}
