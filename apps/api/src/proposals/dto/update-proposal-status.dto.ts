import { ApiProperty } from '@nestjs/swagger';
import { ProposalStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateProposalStatusDto {
  @ApiProperty({ enum: ProposalStatus })
  @IsEnum(ProposalStatus, { message: 'status invalido.' })
  status!: ProposalStatus;
}
