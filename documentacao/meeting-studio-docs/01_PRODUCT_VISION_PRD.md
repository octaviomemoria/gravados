# PRD — Product Requirements Document

## 1. Problema

Reuniões longas geram informações importantes, porém os registros ficam dispersos, difíceis de consultar e frequentemente não existem. Ferramentas de gravação tradicionais normalmente priorizam a captura, mas não todo o ciclo de uso posterior do conteúdo.

O Meeting Studio deverá transformar uma reunião em um ativo pesquisável e editável.

## 2. Proposta de valor

**Gravar, editar, organizar e compreender reuniões em um único aplicativo.**

O produto combina:

- gravador de tela;
- gravador de webcam;
- gravador de áudio;
- editor simplificado;
- biblioteca de reuniões;
- transcrição;
- resumo;
- memória corporativa pesquisável.

## 3. Personas iniciais

### Consultor

Precisa registrar reuniões com clientes, rever decisões e gerar entregáveis.

### Gestor

Precisa recuperar decisões, responsabilidades e prazos sem assistir novamente uma reunião inteira.

### Criador/apresentador

Precisa gravar apresentação + webcam e editar rapidamente antes de compartilhar.

### Equipe administrativa

Precisa manter atas, registros e evidências organizadas.

## 4. Jobs to be done

### Antes da reunião

- configurar fontes;
- verificar microfone/câmera;
- escolher tela;
- definir qualidade;
- definir segmentação.

### Durante

- iniciar/parar;
- pausar/retomar;
- adicionar marcadores;
- monitorar duração;
- monitorar uso de disco;
- visualizar status das fontes.

### Depois

- localizar gravação;
- reproduzir;
- cortar;
- remover trechos;
- ajustar áudio;
- alterar layout de câmera;
- exportar;
- transcrever;
- gerar resumo;
- pesquisar conteúdo.

## 5. Objetivos do MVP

O MVP será considerado funcional quando o usuário conseguir:

1. instalar o aplicativo no Windows;
2. criar uma reunião;
3. selecionar microfone, webcam e tela;
4. gravar tela + webcam + áudio;
5. dividir a gravação automaticamente por tempo;
6. opcionalmente dividir por tamanho aproximado;
7. encerrar sem perda dos segmentos;
8. recuperar uma sessão interrompida;
9. visualizar a reunião na biblioteca;
10. abrir em um editor;
11. cortar/excluir trechos;
12. ajustar volume;
13. alternar visibilidade de webcam;
14. exportar MP4 e áudio;
15. continuar utilizando o arquivo original intacto.

## 6. Fora do MVP

Não bloquear o MVP por:

- login;
- SaaS;
- pagamentos;
- colaboração;
- edição multicâmera avançada;
- transcrição ao vivo;
- edição por IA;
- aplicativos mobile;
- integrações Zoom/Teams/Meet;
- upload automático.

## 7. Métricas de produto

### Confiabilidade

- sessões concluídas sem perda: > 99%;
- recuperação após encerramento inesperado;
- zero corrupção dos arquivos já finalizados.

### Performance

- UI responsiva durante gravação;
- ausência de crescimento ilimitado de RAM;
- preview sem travamentos recorrentes.

### Usabilidade

- iniciar gravação em poucos cliques;
- usuário deve compreender claramente quais fontes estão ativas;
- exportação deve mostrar progresso e resultado.

## 8. Diferenciais planejados

### Edição pela transcrição

Excluir texto = excluir trecho correspondente.

### Limpeza inteligente

Sugerir remoção de:

- silêncios;
- preparação;
- testes de microfone;
- repetições.

### Memória corporativa

Perguntas em linguagem natural sobre reuniões anteriores, com referência à reunião, data e timestamp.

## 9. Princípio de escopo

Quando houver conflito entre funcionalidades e confiabilidade da gravação, **confiabilidade vence**.
