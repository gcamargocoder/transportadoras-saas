import { ApiProperty } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { DocumentExpiryStatus } from '../utils/document-expiry.util';

export class VehicleDocumentEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ enum: DocumentType })
  type!: DocumentType;

  @ApiProperty({ nullable: true })
  number!: string | null;

  @ApiProperty({ nullable: true })
  issuedAt!: Date | null;

  @ApiProperty({ nullable: true })
  expiresAt!: Date | null;

  @ApiProperty({ enum: ['VALID', 'EXPIRING_SOON', 'EXPIRED', 'NO_EXPIRY'] })
  expiryStatus!: DocumentExpiryStatus;

  @ApiProperty()
  createdAt!: Date;
}
