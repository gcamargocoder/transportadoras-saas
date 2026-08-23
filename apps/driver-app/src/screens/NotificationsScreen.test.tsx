import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import * as notificationsApi from '../api/driverNotifications.api';
import { DriverNotification } from '../api/driverNotifications.types';
import { NotificationsScreen } from './NotificationsScreen';

jest.mock('../api/driverNotifications.api');

const api = notificationsApi as jest.Mocked<typeof notificationsApi>;

function renderScreen() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  return { ...render(<NotificationsScreen route={{} as never} navigation={navigation as never} />), navigation };
}

function buildNotification(overrides: Partial<DriverNotification> = {}): DriverNotification {
  return {
    id: 'notif-1',
    type: 'DELIVERY_PROOF_PENDING',
    title: 'Comprovante de entrega aguardando revisão',
    message: 'Comprovante da viagem SP -> RJ foi enviado e aguarda revisão.',
    severity: 'MEDIUM',
    entityType: 'FiscalDocument',
    entityId: 'doc-1',
    metadata: { tripId: 'trip-1' },
    readAt: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

// Fase 70 -- NotificationsScreen: lista, marca como lida ao tocar e navega
// para a origem so quando ha uma rota real (DeliveryProofScreen), nunca uma
// rota inventada.
describe('NotificationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lista as notificacoes do motorista', async () => {
    api.getNotifications.mockResolvedValue({
      items: [buildNotification()],
      meta: { total: 1, page: 1, pageSize: 50 },
    });
    renderScreen();

    expect(await screen.findByText('Comprovante de entrega aguardando revisão')).toBeTruthy();
  });

  it('lista vazia mostra mensagem, sem quebrar', async () => {
    api.getNotifications.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 50 } });
    renderScreen();

    expect(await screen.findByText('Nenhuma notificação por aqui.')).toBeTruthy();
  });

  it('falha ao carregar mostra estado de indisponibilidade, nunca trava a tela', async () => {
    api.getNotifications.mockRejectedValue(new Error('network'));
    renderScreen();

    expect(await screen.findByText('Nao foi possivel carregar as notificacoes agora. Verifique sua conexao.')).toBeTruthy();
  });

  it('tocar uma notificacao nao lida marca como lida e navega para a origem (DeliveryProof, via tripId)', async () => {
    const notification = buildNotification();
    api.getNotifications.mockResolvedValue({ items: [notification], meta: { total: 1, page: 1, pageSize: 50 } });
    api.markNotificationRead.mockResolvedValue({ ...notification, readAt: '2026-09-01T10:05:00.000Z' });
    const { navigation } = renderScreen();

    fireEvent.press(await screen.findByText('Comprovante de entrega aguardando revisão'));

    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith('notif-1'));
    expect(navigation.navigate).toHaveBeenCalledWith('DeliveryProof', { tripId: 'trip-1' });
  });

  it('tocar uma notificacao ja lida NUNCA chama markRead de novo (idempotente do lado do app)', async () => {
    const notification = buildNotification({ readAt: '2026-09-01T09:00:00.000Z' });
    api.getNotifications.mockResolvedValue({ items: [notification], meta: { total: 1, page: 1, pageSize: 50 } });
    const { navigation } = renderScreen();

    fireEvent.press(await screen.findByText('Comprovante de entrega aguardando revisão'));

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('DeliveryProof', { tripId: 'trip-1' }));
    expect(api.markNotificationRead).not.toHaveBeenCalled();
  });

  it('notificacao sem origem navegavel (entityType desconhecido) so marca como lida, nunca navega', async () => {
    const notification = buildNotification({
      id: 'notif-2',
      entityType: 'Vehicle',
      metadata: null,
      title: 'Veículo indisponível',
    });
    api.getNotifications.mockResolvedValue({ items: [notification], meta: { total: 1, page: 1, pageSize: 50 } });
    api.markNotificationRead.mockResolvedValue({ ...notification, readAt: '2026-09-01T10:05:00.000Z' });
    const { navigation } = renderScreen();

    fireEvent.press(await screen.findByText('Veículo indisponível'));

    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith('notif-2'));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('botao Atualizar recarrega a lista', async () => {
    api.getNotifications.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 50 } });
    renderScreen();
    await screen.findByText('Nenhuma notificação por aqui.');

    fireEvent.press(screen.getByText('Atualizar'));
    await waitFor(() => expect(api.getNotifications).toHaveBeenCalledTimes(2));
  });
});
