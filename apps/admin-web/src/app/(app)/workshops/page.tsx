import { MaintenanceProviderListPage } from '../../../features/maintenance-providers/provider-list-page';

export default function WorkshopsPage(): JSX.Element {
  return (
    <MaintenanceProviderListPage
      type="WORKSHOP"
      title="Oficinas"
      description="Cadastro de oficinas para vínculo com Ordens de Serviço da frota."
      detailBasePath="/workshops"
    />
  );
}
