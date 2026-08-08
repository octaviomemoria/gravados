import { ERROR_CODES, type ErrorCode } from './error-codes'

/**
 * Mapa de codigo -> mensagem amigavel em PT-BR. 08_UX_FLOWS.md exige que erros nunca exponham
 * codigo cru ao usuario e sempre comuniquem o que aconteceu, o impacto e uma acao possivel.
 */
export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  [ERROR_CODES.VALIDATION_ERROR]:
    'Os dados enviados sao invalidos. Verifique os campos e tente novamente.',
  [ERROR_CODES.DISK_SPACE_ERROR]:
    'Espaco em disco insuficiente para continuar. Libere espaco e tente novamente.',
  [ERROR_CODES.DEVICE_UNAVAILABLE_ERROR]:
    'Um dispositivo de captura ficou indisponivel durante a operacao.',
  [ERROR_CODES.PERMISSION_DENIED_ERROR]:
    'O sistema operacional negou a permissao necessaria para esta acao.',
  [ERROR_CODES.MEDIA_FINALIZE_ERROR]: 'Nao foi possivel finalizar a midia gravada.',
  [ERROR_CODES.EXPORT_FAILED_ERROR]: 'A exportacao falhou. Tente novamente.',
  [ERROR_CODES.NOT_FOUND_ERROR]: 'O item solicitado nao foi encontrado.',
  [ERROR_CODES.NOT_IMPLEMENTED]: 'Esta funcionalidade ainda nao esta disponivel nesta versao.',
  [ERROR_CODES.UNKNOWN_ERROR]: 'Ocorreu um erro inesperado. Tente novamente.'
}

export function getFriendlyErrorMessage(code: string): string {
  return ERROR_MESSAGES[code as ErrorCode] ?? ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR]
}
