import * as FileSystem from 'expo-file-system';
import { deleteEvidenceFile, persistEvidenceBase64Png, persistEvidenceFile } from './evidenceFiles';

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///docs/',
  EncodingType: { Base64: 'base64' },
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

const fs = FileSystem as jest.Mocked<typeof FileSystem>;

// Fase 39 -- garante que toda evidencia (foto ou assinatura) e sempre
// copiada/gravada em documentDirectory (persistente), nunca deixada na URI
// efemera original da camera/canvas (ver comentario em evidenceFiles.ts).
describe('evidenceFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('persistEvidenceFile', () => {
    it('cria o diretorio de evidencia quando ainda nao existe', async () => {
      fs.getInfoAsync.mockResolvedValue({ exists: false } as never);
      fs.copyAsync.mockResolvedValue(undefined);

      const uri = await persistEvidenceFile('file:///cache/camera-temp.jpg', 'foto.jpg');

      expect(fs.makeDirectoryAsync).toHaveBeenCalledWith('file:///docs/checklist-evidence/', {
        intermediates: true,
      });
      expect(fs.copyAsync).toHaveBeenCalledWith({
        from: 'file:///cache/camera-temp.jpg',
        to: 'file:///docs/checklist-evidence/foto.jpg',
      });
      expect(uri).toBe('file:///docs/checklist-evidence/foto.jpg');
    });

    it('nao recria o diretorio quando ele ja existe', async () => {
      fs.getInfoAsync.mockResolvedValue({ exists: true } as never);
      fs.copyAsync.mockResolvedValue(undefined);

      await persistEvidenceFile('file:///cache/camera-temp.jpg', 'foto2.jpg');

      expect(fs.makeDirectoryAsync).not.toHaveBeenCalled();
    });
  });

  describe('persistEvidenceBase64Png', () => {
    it('grava a assinatura (base64) em documentDirectory', async () => {
      fs.getInfoAsync.mockResolvedValue({ exists: true } as never);
      fs.writeAsStringAsync.mockResolvedValue(undefined);

      const uri = await persistEvidenceBase64Png('aGVsbG8=', 'assinatura.png');

      expect(fs.writeAsStringAsync).toHaveBeenCalledWith(
        'file:///docs/checklist-evidence/assinatura.png',
        'aGVsbG8=',
        { encoding: 'base64' },
      );
      expect(uri).toBe('file:///docs/checklist-evidence/assinatura.png');
    });
  });

  describe('deleteEvidenceFile', () => {
    it('remove o arquivo de forma idempotente (nunca lanca se ja nao existir)', async () => {
      fs.deleteAsync.mockResolvedValue(undefined);

      await deleteEvidenceFile('file:///docs/checklist-evidence/foto.jpg');

      expect(fs.deleteAsync).toHaveBeenCalledWith('file:///docs/checklist-evidence/foto.jpg', { idempotent: true });
    });
  });
});
