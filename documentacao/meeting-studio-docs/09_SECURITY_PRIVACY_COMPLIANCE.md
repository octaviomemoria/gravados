# Segurança, Privacidade e Compliance

## 1. Objetivo

O aplicativo lida com áudio, vídeo, tela e potencialmente informações confidenciais.

Segurança é requisito de produto.

## 2. Electron

Obrigatório:

- `contextIsolation: true`;
- `nodeIntegration: false`;
- API de preload mínima;
- validação de mensagens IPC;
- bloquear navegação não autorizada;
- bloquear abertura arbitrária de URLs;
- CSP adequada.

## 3. Filesystem

O renderer não informa comandos ou caminhos arbitrários diretamente a processos do sistema.

Toda ação deve validar:

- project ID;
- path permitido;
- extensão;
- escopo.

## 4. FFmpeg

Nunca interpolar texto do usuário em uma shell string.

Preferir:

```ts
spawn(binary, args)
```

em vez de:

```ts
exec(`ffmpeg ${userInput}`)
```

## 5. Segredos

API keys:

- não commitar;
- não logar;
- não armazenar em texto puro.

Usar mecanismo seguro do sistema operacional quando disponível, por exemplo `safeStorage` do Electron.

## 6. Logs

Não logar:

- chunks;
- conteúdo de transcrição completo por padrão;
- API key;
- tokens;
- senhas.

## 7. Consentimento

Gravação de pessoas pode possuir requisitos legais e contratuais diferentes por contexto.

Produto deve:

- oferecer aviso de gravação;
- permitir registrar que o usuário declarou ter autorização;
- não tentar afirmar automaticamente conformidade legal.

## 8. Indicador visual

Nunca gravar silenciosamente no MVP.

Durante captura deve existir indicador visível no aplicativo.

## 9. Telemetria

MVP recomendado: desativada por padrão ou mínima.

Se implementada:

- opt-in/opt-out claro;
- nunca enviar áudio/vídeo;
- documentar eventos enviados.

## 10. Exclusão

Quando usuário excluir projeto:

- confirmar;
- listar impacto;
- excluir banco + arquivos;
- tratar falhas parciais;
- registrar resultado local.

## 11. IA externa

Antes do primeiro envio:

> O áudio selecionado será enviado ao provedor de IA configurado para processamento.

## 12. Dependências

Executar auditorias e atualizar dependências de forma controlada.

Não aceitar automaticamente major updates.
