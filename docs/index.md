# engineering-os

A personal OS for cloud and infrastructure engineers: your notes as a queryable
knowledge base, wired into AI coding agents. Everything runs locally.

## What you get from one clone

- An **Obsidian vault template** scaffolded for the five domains an infra
  engineer actually works in: CloudOps, FinOps, DevOps, SecOps, Architecture.
- A local **hybrid RAG index** over your vaults: a small TypeScript service
  over SQLite + sqlite-vec + FTS5, vector search fused with BM25, optional MMR
  reranking. No Python, no PyTorch, no cloud. Your notes never leave your
  machine.
- An **HTTP search server** your AI agent (Claude Code or any MCP-capable
  client) can query for grounded context.
- **Three vaults** with a write-routing contract, a **standards** governance
  layer, and ADR scaffolding.

## Where to go next

- [Quickstart](quickstart.md) - clone, build, index, search in about 15 minutes.
- [Concepts](concepts.md) - the three vaults, unified reading vs segregated
  writing, and the hybrid retrieval pipeline.
- [The five domains](domains.md) - how the work vault is organized.
- [RAG layer](rag.md) - the `eos-rag` service, its search API, and model choice.
- [Working layer](working-layer.md) - beads for agent tasks, the vault for narrative.
- [Standards](standards.md) - the governance layer and how it is distributed.
- [Architecture](architecture.md) - the decisions behind the design.

!!! note "Status"
    v0.1. The vault template, the TypeScript RAG layer, the standards layer with
    the `plan` and `clone-projects` skills, work-tracking (beads Phase A), and
    this docs site are all in place. Claude Code hooks and the Linear/planning
    phases of the working layer come next.
