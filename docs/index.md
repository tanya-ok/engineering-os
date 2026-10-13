<p class="project-kicker">Engineering knowledge / Portable tasks</p>

# Turn your notes into useful context.

<p class="project-lead">Keep knowledge in Markdown, retrieve the relevant passages and track work with beads. Your files stay portable; Linear is optional.</p>

## How it works

```mermaid
---
config:
  theme: base
  themeVariables:
    primaryTextColor: '#183452'
    textColor: '#183452'
    lineColor: '#7b8797'
    edgeLabelBackground: '#e8effa'
    fontFamily: 'Arial, sans-serif'
    fontSize: '15px'
  flowchart:
    nodeSpacing: 24
    rankSpacing: 28
    padding: 12
---
flowchart TB
    accTitle: Local knowledge and portable task tracking
    accDescr: Markdown notes build a local search index that an AI client can query. Project beads feed a work dashboard. The client decides where retrieved passages are sent; the index is not the original knowledge source.
    N[("Markdown notes<br/>Source of truth")] --> S["Local search index<br/>Keywords + meaning"]
    S -->|Relevant passages| A["Your AI client"]
    B[("Project tasks<br/>beads")] --> D["Work dashboard<br/>Dependencies + next tasks"]
    classDef source fill:#e8effa,stroke:#5276a2,color:#183452,stroke-width:1.5px
    classDef core fill:#e0f3ec,stroke:#328267,color:#173f33,stroke-width:1.5px
    classDef limit fill:#fff0dc,stroke:#b27b36,color:#63421d,stroke-width:1.5px
    class N,B source
    class S,D core
    class A limit
```

[Start locally](quickstart.md){ .overview-link }
[See the work graph](dashboard.md){ .overview-link }
[Portability and boundaries](portable-portfolio.md){ .overview-link }

!!! note "Scope"
    Retrieval runs locally. A connected cloud AI client may transmit retrieved text. Keep private trust domains in separate indexes.
