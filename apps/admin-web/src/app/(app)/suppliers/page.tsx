import { MaintenanceProviderListPage } from '../../../features/maintenance-providers/provider-list-page';

export default function SuppliersPage(): JSX.Element {
  return (
    <MaintenanceProviderListPage
      type="SUPPLIER"
      title="Fornecedores"
      description="Cadastro de fornecedores para vínculo com Ordens de Serviço da frota."
      detailBasePath="/suppliers"
    />
  );
}
