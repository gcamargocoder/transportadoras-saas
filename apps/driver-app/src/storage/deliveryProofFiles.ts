import * as FileSystem from 'expo-file-system';

// Fase 56 -- mesmo motivo/padrao de storage/evidenceFiles.ts (Fase 39): a
// URI que a camera/ImagePicker devolve fica em cache temporario do SO e
// pode desaparecer antes do flush da fila offline acontecer. O comprovante
// e copiado para documentDirectory (persistente, sobrevive a reinicio do
// app) IMEDIATAMENTE apos a captura -- a fila offline (syncQueue.ts, kind
// 'delivery-proof') sempre guarda esse path persistente, nunca a URI
// original da camera.
const DELIVERY_PROOF_DIR = `${FileSystem.documentDirectory}delivery-proof/`;

async function ensureDeliveryProofDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DELIVERY_PROOF_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DELIVERY_PROOF_DIR, { intermediates: true });
  }
}

export async function persistDeliveryProofFile(sourceUri: string, fileName: string): Promise<string> {
  await ensureDeliveryProofDir();
  const destUri = `${DELIVERY_PROOF_DIR}${fileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return destUri;
}

// Chamado apos confirmacao de sincronizacao bem-sucedida (ou "refazer" antes
// do envio) -- nunca deixa o diretorio crescer indefinidamente com fotos ja
// enviadas ou descartadas (mesmo padrao de deleteEvidenceFile).
export async function deleteDeliveryProofFile(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
