import * as FileSystem from 'expo-file-system';

// Fase 39, secao 18 -- a URI que a camera/ImagePicker devolve fica em
// cache temporario do SO e pode desaparecer antes do flush da fila
// acontecer (ex: SO libera espaco, app fica horas offline). Por isso toda
// evidencia e copiada para documentDirectory (persistente, sobrevive a
// reinicio do app) IMEDIATAMENTE apos a captura -- a fila offline
// (syncQueue.ts, kind 'checklist-evidence') sempre guarda esse path
// persistente, nunca a URI original da camera.
const EVIDENCE_DIR = `${FileSystem.documentDirectory}checklist-evidence/`;

async function ensureEvidenceDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(EVIDENCE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(EVIDENCE_DIR, { intermediates: true });
  }
}

export async function persistEvidenceFile(sourceUri: string, fileName: string): Promise<string> {
  await ensureEvidenceDir();
  const destUri = `${EVIDENCE_DIR}${fileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return destUri;
}

// Assinatura (react-native-signature-canvas) sai como base64 puro (nao uma
// URI de arquivo, ja que nao vem de camera/galeria) -- grava direto em
// documentDirectory pelo mesmo motivo de persistencia das fotos.
export async function persistEvidenceBase64Png(base64: string, fileName: string): Promise<string> {
  await ensureEvidenceDir();
  const destUri = `${EVIDENCE_DIR}${fileName}`;
  await FileSystem.writeAsStringAsync(destUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return destUri;
}

// Chamado apos "refazer"/"remover" (antes da conclusao, secao 14) ou apos
// confirmacao de sincronizacao bem-sucedida -- nunca deixa o diretorio
// crescer indefinidamente com fotos ja enviadas ou descartadas.
export async function deleteEvidenceFile(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
