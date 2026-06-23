# SGQ — Sistema de Gestão da Qualidade

Sistema web de gestão da qualidade para indústria de dispositivos médicos, conforme **NBR ISO 13485:2016** e regulamentações ANVISA.

## Módulos disponíveis

| Módulo | Descrição |
|---|---|
| Dashboard | KPIs, alertas e visão geral |
| CAPA | Ações Corretivas e Preventivas |
| RNC | Registros de Não-Conformidade |
| Fornecedores | Qualificação e gestão de fornecedores |
| Tecnovigilância | Queixas técnicas e notificações ANVISA |
| Validações | Validações de processo, equipamento e software |
| Gestão de Mudanças (GCM) | Controle de mudanças planejadas |
| Análise de Risco | FMEA / ISO 14971 — RPN por produto |
| Controle de Pragas | Agenda e registros de dedetização |
| Equipe | Colaboradoras e workload por atividade |
| Cronograma | Gantt visual de todos os prazos |
| Calendário | Grade mensal com todos os eventos |
| Configurações | Dados cadastrais da empresa |

## Como rodar localmente

Requer apenas Python (3.x) instalado:

```bash
# No diretório raiz do projeto:
python -m http.server 8080
```

Depois acesse: **http://localhost:8080**

> Os dados são armazenados no `localStorage` do navegador sob a chave `sgq_data_v1`. Não requer banco de dados, build step ou internet.

## Estrutura de arquivos

```
gestaosgq/
├── index.html              # HTML mínimo — único ponto de entrada
├── css/
│   ├── variables.css       # Custom properties (cores, espaçamentos)
│   ├── base.css            # Reset e animações globais
│   ├── layout.css          # Sidebar, topbar, main
│   └── components.css      # Botões, cards, tabelas, pills, modal, toast…
└── js/
    ├── constants.js        # Status, origens, tipos — Object.freeze
    ├── db.js               # Camada de dados — localStorage (singleton db)
    ├── utils.js            # Funções puras (formatDate, statusPill, etc.)
    ├── toast.js            # Sistema de notificações
    ├── modal.js            # Modal de formulário + confirm dialog
    ├── router.js           # Roteador hash-based
    ├── app.js              # Entry point — registra rotas e eventos globais
    └── modules/
        ├── dashboard.js
        ├── capa.js
        ├── rnc.js
        ├── fornecedores.js
        ├── tecnovig.js
        ├── validacoes.js
        ├── gcm.js
        ├── risco.js
        ├── pragas.js
        ├── equipe.js
        ├── cronograma.js
        ├── calendario.js
        └── configuracoes.js
```

## Backup e Restore

### Exportar dados

Clique em **⬇ Exportar** na barra superior. Um arquivo `sgq-backup-YYYY-MM-DD.json` será baixado com todos os dados.

### Restaurar dados

Clique em **⬆ Importar** e selecione um arquivo `.json` previamente exportado. A página será recarregada com os dados restaurados.

> O schema mínimo exigido no import: chaves `config`, `equipe`, `capa`, `rnc`, `fornecedores`, `tecno`, `validacoes`, `gcm`, `risco`, `pragas`.

## Arquitetura

- **ES Modules nativos** — sem bundler, sem build step
- **Event delegation** — todos os eventos via `addEventListener` com `data-action`
- **Data layer isolada** — `db.js` é a única camada que toca `localStorage`
- **Sem frameworks externos** — HTML/CSS/JS puro
- **Sem inline JS** — zero `onclick=` ou `onchange=` no HTML

## Compatibilidade

Navegadores modernos com suporte a ES Modules nativos:
- Chrome 61+, Firefox 60+, Safari 10.1+, Edge 16+
