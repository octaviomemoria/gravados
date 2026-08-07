# Requisitos Funcionais

Os IDs devem ser usados em issues, commits, testes e critérios de aceite.

## RF-001 — Criar reunião

O usuário deve poder criar um projeto de reunião contendo:

- título;
- data/hora;
- pasta de armazenamento;
- observações opcionais.

## RF-002 — Selecionar tela

Permitir:

- tela inteira;
- monitor específico;
- janela específica quando suportado.

## RF-003 — Selecionar webcam

Listar dispositivos de vídeo disponíveis e exibir preview.

## RF-004 — Selecionar microfone

Listar dispositivos de entrada e permitir teste visual de nível.

## RF-005 — Capturar áudio do sistema

Quando suportado pela plataforma, permitir incluir áudio reproduzido pelo computador.

## RF-006 — Combinações de captura

Permitir:

- apenas áudio;
- tela + áudio;
- webcam + áudio;
- tela + webcam + áudio.

## RF-007 — Gravar fontes independentes

Preservar fontes separadas quando possível:

- screen;
- camera;
- microphone;
- system audio.

## RF-008 — Preview

Mostrar preview da composição durante configuração e gravação.

## RF-009 — Iniciar gravação

Exibir contagem regressiva opcional e iniciar sessão persistente.

## RF-010 — Pausar e retomar

Pausar gravação sem finalizar o projeto.

O modelo de timestamps deve preservar a relação correta entre as trilhas.

## RF-011 — Encerrar gravação

Finalizar:

- chunks;
- manifest;
- metadados;
- status da sessão.

## RF-012 — Segmentação por tempo

Configuração:

- 5;
- 10;
- 15;
- 30;
- 60 minutos;
- personalizado.

## RF-013 — Segmentação por tamanho

Configuração aproximada em MB/GB.

O motor deve monitorar bytes gravados e rotacionar para um novo segmento quando o limite for atingido.

## RF-014 — Salvamento contínuo

Dados recebidos durante a gravação devem ser persistidos continuamente.

Não acumular a sessão completa em memória.

## RF-015 — Recuperação

Ao iniciar o app, detectar sessões com status:

- RECORDING;
- FINALIZING;
- RECOVERABLE.

Oferecer recuperação.

## RF-016 — Marcadores

Durante gravação, permitir adicionar marcador com:

- timestamp;
- título opcional;
- nota opcional.

## RF-017 — Biblioteca

Listar reuniões com:

- título;
- data;
- duração;
- tamanho;
- status;
- thumbnail;
- tags futuras.

## RF-018 — Reprodução

Reproduzir a reunião e permitir navegar pelos segmentos como uma única timeline lógica.

## RF-019 — Editor

Abrir projeto mantendo mídia original.

## RF-020 — Cortar início/fim

Definir intervalo útil do projeto.

## RF-021 — Dividir

Criar pontos de corte lógicos na timeline.

## RF-022 — Excluir trecho

Marcar um intervalo como removido sem modificar mídia original.

## RF-023 — Volume

Ajustar ganho de áudio:

- global;
- por track;
- por intervalo.

## RF-024 — Mute

Silenciar track ou intervalo.

## RF-025 — Fade

Aplicar fade-in/fade-out de áudio.

## RF-026 — Velocidade

Alterar velocidade de reprodução/exportação de intervalos suportados.

## RF-027 — Layout de vídeo

Para composição tela + webcam:

- picture-in-picture;
- lado a lado;
- somente tela;
- somente câmera.

## RF-028 — Transformação da câmera

Ajustar:

- posição;
- tamanho;
- crop;
- formato visual.

## RF-029 — Ocultar track

Permitir ocultar câmera ou tela em intervalos específicos.

## RF-030 — Blur

Fase posterior do editor: aplicar blur a área definida da tela em intervalo.

## RF-031 — Undo/Redo

Manter histórico de operações do editor.

## RF-032 — Exportar vídeo

Mínimo:

- MP4;
- 720p;
- 1080p.

## RF-033 — Exportar áudio

Mínimo:

- M4A ou AAC;
- MP3 quando disponível no build/licenciamento escolhido;
- WAV.

## RF-034 — Exportar seleção

Permitir exportar somente intervalo selecionado.

## RF-035 — Progresso de exportação

Exibir:

- progresso;
- estado;
- possibilidade de cancelar;
- erros legíveis.

## RF-036 — Transcrição

Fase IA. Enviar áudio selecionado ao provedor configurado e persistir segmentos com timestamps.

## RF-037 — Diarização

Quando o modelo/provedor suportar, identificar speakers.

## RF-038 — Resumo

Gerar:

- resumo executivo;
- temas;
- decisões;
- tarefas;
- responsáveis quando identificáveis;
- prazos mencionados.

## RF-039 — Pesquisa textual

Pesquisar texto nas transcrições.

## RF-040 — Pesquisa semântica

Fase futura: localizar conteúdo por significado entre múltiplas reuniões.

## RF-041 — Configurações

Persistir preferências:

- dispositivos;
- resolução;
- FPS;
- pasta;
- segmentação;
- layout;
- exportação.

## RF-042 — Espaço em disco

Antes e durante gravação:

- verificar espaço livre;
- alertar em níveis críticos;
- evitar iniciar sessão quando não houver margem mínima configurada.

## RF-043 — Indicador de gravação

A interface deve mostrar claramente quando uma sessão está sendo gravada.

## RF-044 — Consentimento

Disponibilizar recurso para apresentação de aviso de gravação e registro opcional de consentimento no projeto.
