import { ApiProperty } from '@nestjs/swagger';
import { TireLocationType } from '@prisma/client';

// Fase 109 -- resumo de uma TireMovement vinculada a esta OS (ver
// TireMovement.maintenanceId), exibido em GET /maintenances/:id (mesmo
// padrao de MaintenancePartEntity acima: embutido na entity da OS, nunca um
// endpoint cross-pneu novo). So os campos uteis para identificar a troca a
// partir da tela da OS -- o detalhe completo continua em /tires/:id.
export class MaintenanceTireMovementEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tireId!: string;

  @ApiProperty()
  tireFireNumber!: string;

  @ApiProperty()
  movementDate!: Date;

  @ApiProperty({ enum: TireLocationType })
  newLocationType!: TireLocationType;

  @ApiProperty({ nullable: true })
  previousPosition!: string | null;

  @ApiProperty({ nullable: true })
  newPosition!: string | null;

  @ApiProperty({ nullable: true })
  reason!: string | null;
}
