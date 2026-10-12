# Flow Lite

Aplicativo desktop de digitacao por voz inteligente para Windows, projetado para transformar fala em texto formatado e pontuado com alta precisao diretamente no cursor de qualquer programa.

---

## Recursos

- **Ilha Flutuante Monocromatica**: Widget minimalista em preto e branco com visualizador de onda sonora em tempo real, cronometro de gravacao e indicador de status.
- **Acionamento por CAPS LOCK**: Pressione e mantenha a tecla CAPS LOCK pressionada para falar; solte para transcrever e colar o texto automaticamente. Pressionar Shift + CAPS LOCK preserva a alternancia convencional de maiusculas.
- **Reconhecimento de Contexto**: Utiliza a API do Windows UI Automation para identificar a janela ativa (editores de codigo, comunicadores, navegadores e documentos) e adequar a pontuacao, tom e estilo.
- **Transcricao Multimodal via OpenRouter**: Conecta-se a modelos de audio nativos de alta velocidade (padrao: `google/gemini-2.5-flash`), eliminando gaguejos, pausas involuntarias e inserindo pontuacao natural.
- **Painel de Controle Completo**:
  - **Historico**: Lista as transcricoes recentes com contagem de palavras, horario e botao de copia rápida.
  - **Dicionario Pessoal**: Cadastro de termos tecnicos, siglas e nomes proprios para orientar o modelo.
  - **Estatisticas**: Metricas de total de ditados, palavras geradas e tempo economizado.
  - **Configuracoes**: Posicionamento da ilha (inferior ou superior), modo de exibicao (dinamico, fixo ou discreto) e teste de conexao com a API.
- **Design Monocromatico**: Interface estritamente em preto e branco, sem emojis, com icone em pixel art.

---

## Requisitos

- Sistema Operacional: Windows 10 ou Windows 11 (64-bit)
- Microfone ativo e configurado no Windows
- Conexao com a internet
- Chave de API do [OpenRouter](https://openrouter.ai/) (com creditos disponiveis)

---

## Como Usar (Versao Executavel)

1. Baixe o executavel `Flow Lite.exe` (ou extraia a pasta `win-unpacked`).
2. Execute `Flow Lite.exe`.
3. Na primeira execucao, o **Painel de Controle** sera exibido:
   - Acesse **Configuracoes**.
   - Insira sua chave de API do OpenRouter (`sk-or-v1-...`).
   - Clique em **Testar Conexao** para validar sua chave.
   - Clique em **Salvar Configuracoes**.
4. A ilha flutuante ficara posicionada na parte inferior da tela e o icone sera adicionado a bandeja do sistema (proximo ao relogio do Windows).
5. Em qualquer aplicativo (navegador, terminal, editor de texto, mensageiro):
   - Mantenha **CAPS LOCK** pressionado e fale.
   - Solte a tecla para que o texto polido seja colado no seu cursor.

---

## Execucao a Partir do Codigo Fonte

### 1. Clonar o Repositorio

```bash
git clone https://github.com/seu-usuario/flow-lite.git
cd flow-lite
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Iniciar em Modo de Desenvolvimento

```bash
npm start
```

---

## Como Gerar o Executavel (.exe)

Para gerar a pasta descompactada pronta para execucao:

```bash
npm run build
```

Os arquivos serao gerados em `dist/win-unpacked/Flow Lite.exe`.

Para gerar o executavel unico portavel (arquivo unico sem necessidade de instalacao):

```bash
npm run dist
```

O arquivo standalone sera gerado na pasta `dist/`.

---

## Estrutura do Projeto

```
flow-lite/
├── assets/
│   ├── icon.ico             # Icone nativo para executavel e bandeja
│   ├── icon.png             # Icone em alta resolucao
│   └── flowliteicon.jpg     # Imagem original da marca
├── src/
│   ├── main/
│   │   ├── index.js         # Processo principal do Electron, janelas e atalhos
│   │   ├── openrouter.js    # Comunicacao com API de audio do OpenRouter
│   │   ├── contextReader.js # Inspecao de contexto da janela ativa
│   │   └── textInjector.js  # Injecao de texto simulando Ctrl+V
│   ├── renderer/
│   │   ├── index.html       # Interface da ilha flutuante
│   │   ├── renderer.js      # Captura de microfone e equalizador
│   │   ├── dashboard.html   # Interface do painel de controle
│   │   └── dashboard.js     # Logica de navegacao, historico e configuracoes
│   └── scripts/
│       ├── caps-hook.cs     # Hook nativo de baixo nivel de teclado em C#
│       ├── caps-hook.exe    # Executavel compilado do hook
│       ├── get-context.ps1  # Script PowerShell para UI Automation
│       └── paste-text.ps1   # Script PowerShell para simulacao de colagem
├── package.json             # Metadados e dependencias do projeto
├── LICENSE                  # Licenca MIT
└── README.md                # Documentacao do projeto
```

---

## Licenca

Este projeto esta sob a licenca MIT. Consulte o arquivo [LICENSE](LICENSE) para obter mais informacoes.
