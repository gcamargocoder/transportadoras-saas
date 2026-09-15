import { ApiProperty } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { DocumentExpiryStatus } from '../../fleet/utils/document-expiry.util';

export class DriverDocumentEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  driverId!: string;

  @ApiProperty({ enum: DocumentType })
  type!: DocumentType;

  @ApiProperty({ nullable: true })
  number!: string | null;

  @ApiProperty({ nullable: true })
  issuedAt!: Date | null;

  @ApiProperty({ nullable: true })
  expiresAt!: Date | null;

  // Fase 119 -- corrige a assimetria com VehicleDocumentEntity, que ja
  // expunha este campo desde a Fase 62 (mesma resolveDocumentExpiryStatus).
  @ApiProperty({ enum: ['VALID', 'EXPIRING_SOON', 'EXPIRED', 'NO_EXPIRY'] })
  expiryStatus!: DocumentExpiryStatus;

  @ApiProperty()
  createdAt!: Date;
}
