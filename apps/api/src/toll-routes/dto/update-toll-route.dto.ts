import { PartialType } from '@nestjs/swagger';
import { CreateTollRouteDto } from './create-toll-route.dto';

export class UpdateTollRouteDto extends PartialType(CreateTollRouteDto) {}
