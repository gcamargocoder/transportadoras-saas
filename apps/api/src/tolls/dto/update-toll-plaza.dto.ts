import { PartialType } from '@nestjs/swagger';
import { CreateTollPlazaDto } from './create-toll-plaza.dto';

export class UpdateTollPlazaDto extends PartialType(CreateTollPlazaDto) {}
