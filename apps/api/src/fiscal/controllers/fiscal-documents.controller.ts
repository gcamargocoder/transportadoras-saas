import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { UPLOAD_THROTTLE } from '../../common/constants/throttle.constants';
import { TenantContext } from '../../tenants/context/tenant-context';
import { FISCAL_DOCUMENTS_READ_ROLES, FISCAL_DOCUMENTS_WRITE_ROLES } from '../constants/fiscal-roles.constants';
import { FindFiscalDocumentsQueryDto } from '../dto/find-fiscal-documents-query.dto';
import { ImportFiscalXmlDto } from '../dto/import-fiscal-xml.dto';
import { UpdateFiscalDocumentDto } from '../dto/update-fiscal-document.dto';
import { UploadFiscalDocumentDto } from '../dto/upload-fiscal-document.dto';
import { FiscalDashboardEntity } from '../entities/fiscal-dashboard.entity';
import { FiscalDocumentEntity } from '../entities/fiscal-document.entity';
import { PaginatedFiscalDocumentsEntity } from '../entities/paginated-fiscal-documents.entity';
import { TripDocumentStatusEntity } from '../entities/trip-document-status.entity';
import { MulterExceptionFilter } from '../../toll-import/filters/multer-exception.filter';
import { FiscalDocumentsService } from '../services/fiscal-documents.service';

// Fase 52 -- modulo Fiscal/Documental. SEM emissao fiscal, SEM integracao
// SEFAZ nesta fase (ver docs/fiscal-documents.md). Mesmo grupo de roles
// operacional ja usado por toll-import/checklists -- DRIVER nunca acessa.
@ApiTags('fiscal')
@ApiBearerAuth()
@Controller('fiscal/documents')
export class FiscalDocumentsController {
  constructor(
    private readonly fiscalDocumentsService: FiscalDocumentsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get('dashboard')
  @Roles(...FISCAL_DOCUMENTS_READ_ROLES)
  @ApiOperation({
    summary:
      'Indicadores agregados: total, por tipo (CT-e/MDF-e/NF-e/CIOT/...), por status (pendente/valido/invalido/' +
      'cancelado), vinculados/sem vinculo, evolucao mensal, documentos pendentes/problematicos. Aceita os mesmos ' +
      'filtros de GET /fiscal/documents -- todos os indicadores respeitam o mesmo escopo.',
  })
  @ApiOkResponse({ type: FiscalDashboardEntity })
  getDashboard(@Query() query: FindFiscalDocumentsQueryDto): Promise<FiscalDashboardEntity> {
    return this.fiscalDocumentsService.getDashboard(this.tenantContext.requireTenantId(), query);
  }

  @Get('trip/:tripId/status')
  @Roles(...FISCAL_DOCUMENTS_READ_ROLES)
  @ApiOperation({
    summary:
      'Situacao documental consolidada de uma viagem: existentes/pendentes/invalidos/cancelados, tipos presentes ' +
      'e ausentes (informativo -- nunca uma lista de documentos obrigatorios).',
  })
  @ApiOkResponse({ type: TripDocumentStatusEntity })
  getTripDocumentStatus(@Param('tripId', ParseUUIDPipe) tripId: string): Promise<TripDocumentStatusEntity> {
    return this.fiscalDocumentsService.getTripDocumentStatus(this.tenantContext.requireTenantId(), tripId);
  }

  @Get()
  @Roles(...FISCAL_DOCUMENTS_READ_ROLES)
  @ApiOperation({ summary: 'Lista documentos fiscais/documentais da empresa (paginado, filtravel).' })
  @ApiOkResponse({ type: PaginatedFiscalDocumentsEntity })
  findAll(@Query() query: FindFiscalDocumentsQueryDto): Promise<PaginatedFiscalDocumentsEntity> {
    return this.fiscalDocumentsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FISCAL_DOCUMENTS_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um documento fiscal/documental.' })
  @ApiOkResponse({ type: FiscalDocumentEntity })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<FiscalDocumentEntity> {
    return this.fiscalDocumentsService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Get(':id/file')
  @Roles(...FISCAL_DOCUMENTS_READ_ROLES)
  @ApiOperation({
    summary:
      'Fase 68 -- preview/download do arquivo original do documento (ex: comprovante de entrega). ' +
      'Imagem/PDF: inline (preview no navegador). Demais formatos: download. Acessa o arquivo ' +
      'SOMENTE via Attachment.storageKey (nunca um caminho vindo do cliente).',
  })
  async getFile(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const file = await this.fiscalDocumentsService.getFile(this.tenantContext.requireTenantId(), id);
    const safeFileName = file.fileName.replace(/["\r\n]/g, '_');
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `${file.inline ? 'inline' : 'attachment'}; filename="${safeFileName}"`,
    });
    return new StreamableFile(file.stream);
  }

  @Get(':id/history')
  @Roles(...FISCAL_DOCUMENTS_READ_ROLES)
  @ApiOperation({ summary: 'Historico de auditoria do documento fiscal (quem, quando, IP, User-Agent, antes/depois).' })
  @ApiOkResponse({ type: PaginatedAuditLogEntity })
  getHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedAuditLogEntity> {
    return this.fiscalDocumentsService.getHistory(this.tenantContext.requireTenantId(), id, query);
  }

  @Post('upload')
  @Roles(...FISCAL_DOCUMENTS_WRITE_ROLES)
  @Throttle(UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('file'))
  @UseFilters(MulterExceptionFilter)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'documentType'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'PDF, XML, JPG/JPEG ou PNG.' },
        documentType: { type: 'string' },
        documentNumber: { type: 'string' },
        accessKey: { type: 'string' },
        series: { type: 'string' },
        issueDate: { type: 'string', format: 'date' },
        senderName: { type: 'string' },
        senderDocument: { type: 'string' },
        recipientName: { type: 'string' },
        recipientDocument: { type: 'string' },
        tripId: { type: 'string', format: 'uuid' },
        vehicleId: { type: 'string', format: 'uuid' },
        driverId: { type: 'string', format: 'uuid' },
        customerId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Upload direto de um documento fiscal/documental (sem parser -- metadados sempre informados manualmente). ' +
      'Rejeita duplicidade por accessKey/identificacao (409) quando ja existe um documento equivalente.',
  })
  @ApiCreatedResponse({ type: FiscalDocumentEntity })
  async upload(
    @Body() dto: UploadFiscalDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<FiscalDocumentEntity> {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatorio. Extensoes aceitas: .pdf, .xml, .jpg, .jpeg, .png.');
    }
    return this.fiscalDocumentsService.upload(
      this.tenantContext.requireTenantId(),
      dto,
      file,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('import')
  @Roles(...FISCAL_DOCUMENTS_WRITE_ROLES)
  @Throttle(UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('file'))
  @UseFilters(MulterExceptionFilter)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'XML fiscal (NF-e/CT-e/MDF-e).' },
        tripId: { type: 'string', format: 'uuid' },
        vehicleId: { type: 'string', format: 'uuid' },
        driverId: { type: 'string', format: 'uuid' },
        customerId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Importa um XML fiscal (NF-e/CT-e/MDF-e), extraindo chave/numero/serie/data/emitente/destinatario via parser ' +
      'tolerante. Nunca valida autenticidade perante a SEFAZ. Reimportar o mesmo XML (mesma accessKey) e idempotente.',
  })
  @ApiCreatedResponse({ type: FiscalDocumentEntity })
  async importXml(
    @Body() dto: ImportFiscalXmlDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<FiscalDocumentEntity> {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatorio. Extensao aceita: .xml.');
    }
    return this.fiscalDocumentsService.importXml(
      this.tenantContext.requireTenantId(),
      dto,
      file,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FISCAL_DOCUMENTS_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza metadados/status/vinculo operacional de um documento fiscal.' })
  @ApiOkResponse({ type: FiscalDocumentEntity })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFiscalDocumentDto,
  ): Promise<FiscalDocumentEntity> {
    return this.fiscalDocumentsService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(...FISCAL_DOCUMENTS_WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um documento fiscal (registro -- o arquivo em disco nao e apagado, mesmo padrao de outros anexos do sistema).' })
  @ApiNoContentResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.fiscalDocumentsService.remove(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
