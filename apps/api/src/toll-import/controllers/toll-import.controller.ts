import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UPLOAD_THROTTLE } from '../../common/constants/throttle.constants';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import {
  TOLL_IMPORT_READ_ROLES,
  TOLL_IMPORT_WRITE_ROLES,
} from '../constants/toll-import-roles.constants';
import { FindImportJobErrorsQueryDto } from '../dto/find-import-job-errors-query.dto';
import { FindImportJobsQueryDto } from '../dto/find-import-jobs-query.dto';
import { UploadTollImportDto } from '../dto/upload-toll-import.dto';
import { ImportJobEntity } from '../entities/import-job.entity';
import { PaginatedImportJobErrorsEntity } from '../entities/paginated-import-job-errors.entity';
import { PaginatedImportJobsEntity } from '../entities/paginated-import-jobs.entity';
import { MulterExceptionFilter } from '../filters/multer-exception.filter';
import { TollImportService } from '../services/toll-import.service';

@ApiTags('toll-import')
@ApiBearerAuth()
@Controller('toll-import')
@RequireModule(TenantModule.TOLLS)
export class TollImportController {
  constructor(
    private readonly tollImportService: TollImportService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  @Roles(...TOLL_IMPORT_WRITE_ROLES)
  @Throttle(UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('file'))
  @UseFilters(MulterExceptionFilter)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'providerId'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Extrato em CSV ou XLSX.' },
        providerId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Importa um extrato de pedagio (CSV ou XLSX) de uma operadora. Colunas esperadas: ' +
      'tag, praca, dataHora, valor, eixos. Cada linha e validada e importada individualmente -- ' +
      'uma linha invalida nunca interrompe o restante da importacao.',
  })
  @ApiCreatedResponse({ type: ImportJobEntity })
  async create(
    @Body() dto: UploadTollImportDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportJobEntity> {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatorio. Extensoes aceitas: .csv, .xlsx.');
    }
    return this.tollImportService.create(
      this.tenantContext.requireTenantId(),
      dto,
      file,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get()
  @Roles(...TOLL_IMPORT_READ_ROLES)
  @ApiOperation({ summary: 'Lista os jobs de importacao de extrato da empresa (paginado).' })
  @ApiOkResponse({ type: PaginatedImportJobsEntity })
  findAll(@Query() query: FindImportJobsQueryDto): Promise<PaginatedImportJobsEntity> {
    return this.tollImportService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...TOLL_IMPORT_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um job de importacao de extrato.' })
  @ApiOkResponse({ type: ImportJobEntity })
  @ApiNotFoundResponse({ description: 'Job de importacao nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ImportJobEntity> {
    return this.tollImportService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Get(':id/errors')
  @Roles(...TOLL_IMPORT_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista as linhas nao importadas de um job (erro de validacao ou duplicidade), paginado.',
  })
  @ApiOkResponse({ type: PaginatedImportJobErrorsEntity })
  @ApiNotFoundResponse({ description: 'Job de importacao nao encontrado nesta empresa.' })
  findErrors(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: FindImportJobErrorsQueryDto,
  ): Promise<PaginatedImportJobErrorsEntity> {
    return this.tollImportService.findErrors(this.tenantContext.requireTenantId(), id, query);
  }
}
