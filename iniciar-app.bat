@echo off
REM Inicia o Meeting Studio em modo de desenvolvimento (sempre reflete o codigo mais
REM recente, sem precisar rodar "pnpm build" manualmente antes). De um duplo-clique
REM neste arquivo, ou crie um atalho pra ele na Area de Trabalho / Menu Iniciar.
setlocal
cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERRO] "pnpm" nao foi encontrado no PATH. Instale o Node.js e o pnpm antes de continuar.
  echo        https://pnpm.io/installation
  pause
  exit /b 1
)

echo Iniciando o Meeting Studio (modo desenvolvimento)...
echo (Esta janela precisa continuar aberta enquanto o app estiver rodando.)
echo.
call pnpm dev

echo.
echo O aplicativo foi encerrado.
pause
