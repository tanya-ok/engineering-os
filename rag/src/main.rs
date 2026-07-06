//! eos-rag: single-binary local RAG for engineering-os.
//! Subcommands: `index` (build/update) and `serve` (search API).

mod chunk;
mod config;
mod db;
mod embed;
mod index;
mod server;

use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};

use config::Config;

#[derive(Parser)]
#[command(
    name = "eos-rag",
    about = "Local hybrid RAG for engineering-os (fastembed + sqlite-vec)"
)]
struct Cli {
    #[command(subcommand)]
    cmd: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Build or update the index over the configured vaults.
    Index {
        #[arg(long, default_value = "rag/vaults.json")]
        config: PathBuf,
        /// Drop the index and reindex everything.
        #[arg(long)]
        rebuild: bool,
    },
    /// Serve the search API.
    Serve {
        #[arg(long, default_value = "rag/vaults.json")]
        config: PathBuf,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Command::Index { config, rebuild } => run_index(&config, rebuild),
        Command::Serve { config } => run_serve(&config),
    }
}

fn run_index(config_path: &std::path::Path, rebuild: bool) -> Result<()> {
    let cfg = Config::load(config_path)?;
    if rebuild && cfg.resolved_db.exists() {
        std::fs::remove_file(&cfg.resolved_db)?;
        println!("Removed {} for full rebuild", cfg.resolved_db.display());
    }
    println!(
        "Loading embedding model {} (first run downloads it)...",
        cfg.embed_model
    );
    let mut embedder = embed::Embedder::new(&cfg.embed_model)?;
    let conn = db::open(&cfg.resolved_db)?;
    let total = index::index_all(&cfg, &mut embedder, &conn)?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM chunks", [], |r| r.get(0))?;
    println!(
        "Done. {total} chunks written this run, {count} chunks total in {}",
        cfg.resolved_db.display()
    );
    Ok(())
}

fn run_serve(config_path: &std::path::Path) -> Result<()> {
    let cfg = Config::load(config_path)?;
    let host = std::env::var("EOS_SERVER_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    // A bad EOS_SERVER_PORT is a mistake, not a reason to silently serve on 8765.
    let port: u16 = match std::env::var("EOS_SERVER_PORT") {
        Ok(v) => v
            .parse()
            .with_context(|| format!("EOS_SERVER_PORT={v:?} is not a valid port"))?,
        Err(_) => 8765,
    };
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(server::serve(cfg, host, port))
}
