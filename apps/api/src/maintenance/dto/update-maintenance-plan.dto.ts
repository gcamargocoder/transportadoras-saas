import { PartialType } from '@nestjs/swagger';
import { CreateMaintenancePlanDto } from './create-maintenance-plan.dto';

export class UpdateMaintenancePlanDto extends PartialType(CreateMaintenancePlanDto) {}
