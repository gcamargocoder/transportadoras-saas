import { PartialType } from '@nestjs/swagger';
import { CreateFleetDto } from './create-fleet.dto';

export class UpdateFleetDto extends PartialType(CreateFleetDto) {}
