import {
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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { TRIP_READ_ROLES, TRIP_WRITE_ROLES } from '../constants/trip-roles.constants';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { CreateCustomerContactDto } from '../dto/create-customer-contact.dto';
import { CreateCustomerNoteDto } from '../dto/create-customer-note.dto';
import { FindCustomersQueryDto } from '../dto/find-customers-query.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { UpdateCustomerContactDto } from '../dto/update-customer-contact.dto';
import { CustomerEntity } from '../entities/customer.entity';
import { CustomerContactEntity } from '../entities/customer-contact.entity';
import { CustomerNoteEntity } from '../entities/customer-note.entity';
import { CustomerSummaryEntity } from '../entities/customer-summary.entity';
import { PaginatedCustomersEntity } from '../entities/paginated-customers.entity';
import { CustomerContactsService } from '../services/customer-contacts.service';
import { CustomerNotesService } from '../services/customer-notes.service';
import { CustomersService } from '../services/customers.service';

// Fase 93 -- evoluido do cadastro minimo de clientes para a camada de CRM
// operacional/comercial (edicao, resumo de indicadores, contatos e
// observacoes). Historico de viagens/faturamento/contratos continua sendo
// consultado pelos endpoints ja existentes desses modulos (filtro
// customerId), nunca duplicado aqui.
@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly customerContactsService: CustomerContactsService,
    private readonly customerNotesService: CustomerNotesService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Lista clientes da empresa (busca, filtro por status, paginacao).' })
  @ApiOkResponse({ type: PaginatedCustomersEntity })
  findAll(@Query() query: FindCustomersQueryDto): Promise<PaginatedCustomersEntity> {
    return this.customersService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um cliente da empresa.' })
  @ApiOkResponse({ type: CustomerEntity })
  @ApiNotFoundResponse({ description: 'Cliente nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerEntity> {
    return this.customersService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Get(':id/summary')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Indicadores basicos do cliente (viagens, contatos, observacoes, contratos). Nao inclui indicadores financeiros.' })
  @ApiOkResponse({ type: CustomerSummaryEntity })
  @ApiNotFoundResponse({ description: 'Cliente nao encontrado nesta empresa.' })
  getSummary(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerSummaryEntity> {
    return this.customersService.getSummary(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({ summary: 'Cadastra um cliente (embarcador).' })
  @ApiCreatedResponse({ type: CustomerEntity })
  create(@Body() dto: CreateCustomerDto): Promise<CustomerEntity> {
    return this.customersService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza dados cadastrais e comerciais de um cliente.' })
  @ApiOkResponse({ type: CustomerEntity })
  @ApiNotFoundResponse({ description: 'Cliente nao encontrado nesta empresa.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto): Promise<CustomerEntity> {
    return this.customersService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get(':id/contacts')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Lista os contatos comerciais de um cliente.' })
  @ApiOkResponse({ type: [CustomerContactEntity] })
  @ApiNotFoundResponse({ description: 'Cliente nao encontrado nesta empresa.' })
  findContacts(@Param('id', ParseUUIDPipe) customerId: string): Promise<CustomerContactEntity[]> {
    return this.customerContactsService.findAllForCustomer(this.tenantContext.requireTenantId(), customerId);
  }

  @Post(':id/contacts')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({ summary: 'Cadastra um contato comercial do cliente.' })
  @ApiCreatedResponse({ type: CustomerContactEntity })
  @ApiNotFoundResponse({ description: 'Cliente nao encontrado nesta empresa.' })
  createContact(
    @Param('id', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateCustomerContactDto,
  ): Promise<CustomerContactEntity> {
    return this.customerContactsService.create(
      this.tenantContext.requireTenantId(),
      customerId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/contacts/:contactId')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza um contato comercial do cliente.' })
  @ApiOkResponse({ type: CustomerContactEntity })
  @ApiNotFoundResponse({ description: 'Contato nao encontrado para este cliente.' })
  updateContact(
    @Param('id', ParseUUIDPipe) customerId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateCustomerContactDto,
  ): Promise<CustomerContactEntity> {
    return this.customerContactsService.update(
      this.tenantContext.requireTenantId(),
      customerId,
      contactId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id/contacts/:contactId')
  @Roles(...TRIP_WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um contato comercial do cliente.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Contato nao encontrado para este cliente.' })
  removeContact(
    @Param('id', ParseUUIDPipe) customerId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<void> {
    return this.customerContactsService.remove(
      this.tenantContext.requireTenantId(),
      customerId,
      contactId,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get(':id/notes')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Lista as observacoes/interacoes comerciais registradas para o cliente.' })
  @ApiOkResponse({ type: [CustomerNoteEntity] })
  @ApiNotFoundResponse({ description: 'Cliente nao encontrado nesta empresa.' })
  findNotes(@Param('id', ParseUUIDPipe) customerId: string): Promise<CustomerNoteEntity[]> {
    return this.customerNotesService.findAllForCustomer(this.tenantContext.requireTenantId(), customerId);
  }

  @Post(':id/notes')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({ summary: 'Registra uma observacao/interacao comercial do cliente.' })
  @ApiCreatedResponse({ type: CustomerNoteEntity })
  @ApiNotFoundResponse({ description: 'Cliente nao encontrado nesta empresa.' })
  createNote(
    @Param('id', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateCustomerNoteDto,
  ): Promise<CustomerNoteEntity> {
    return this.customerNotesService.create(
      this.tenantContext.requireTenantId(),
      customerId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
