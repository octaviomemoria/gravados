# Critérios de Aceite

## MVP-AC-001 — Setup

**Dado** que existem tela, microfone e webcam disponíveis  
**Quando** o usuário abre "Nova gravação"  
**Então** consegue visualizar e selecionar as fontes.

## MVP-AC-002 — Recording

**Quando** o usuário inicia  
**Então** o status muda para RECORDING e o contador avança.

## MVP-AC-003 — Persistência

**Durante** gravação longa  
**Então** o uso de memória não cresce linearmente com a duração.

## MVP-AC-004 — Segmentação por tempo

**Dado** limite de 1 minuto em ambiente de teste  
**Quando** grava por > 2 minutos  
**Então** existem pelo menos 3 segmentos coerentes.

## MVP-AC-005 — Segmentação por tamanho

**Dado** threshold pequeno em teste  
**Quando** bytes persistidos excedem limite  
**Então** o engine rotaciona o segmento sem encerrar a reunião.

## MVP-AC-006 — Crash recovery

**Dado** uma sessão ativa  
**Quando** o processo é encerrado abruptamente  
**E** o app abre novamente  
**Então** a sessão aparece como recuperável.

## MVP-AC-007 — Fonte falha

**Dado** câmera + tela + áudio  
**Quando** a câmera é desconectada  
**Então** o aplicativo alerta e tenta preservar as demais tracks.

## MVP-AC-008 — Editor não destrutivo

**Quando** usuário remove um intervalo  
**Então** os arquivos source mantêm hash/tamanho original.

## MVP-AC-009 — Undo

**Quando** uma operação é desfeita  
**Então** o estado anterior da timeline é restaurado.

## MVP-AC-010 — Export

**Quando** usuário exporta 1080p  
**Então** o job finaliza, arquivo é validado e pode ser reproduzido.

## MVP-AC-011 — Export range

**Quando** seleciona intervalo  
**Então** duração exportada corresponde ao intervalo com tolerância técnica documentada.

## MVP-AC-012 — Reopen

**Quando** fecha e reabre editor  
**Então** operações persistidas reaparecem.

## MVP-AC-013 — Espaço crítico

**Quando** espaço chega ao threshold crítico  
**Então** usuário é alertado e o sistema não corrompe segmentos já finalizados.

## MVP-AC-014 — Permissões

**Quando** acesso é negado  
**Então** aplicação mostra orientação e não trava.

## MVP-AC-015 — Segurança

Renderer não possui acesso Node irrestrito.
