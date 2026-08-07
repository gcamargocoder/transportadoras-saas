import { PartialType } from '@nestjs/swagger';
import { CreateTagProviderDto } from './create-tag-provider.dto';

export class UpdateTagProviderDto extends PartialType(CreateTagProviderDto) {}
