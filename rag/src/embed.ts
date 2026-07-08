// Embedding via transformers.js (ONNX, quantized). Whitelisted models only:
// an unknown id must be a hard error, never a silent downgrade that would
// build an index at the wrong dimension. e5-family models get the mandatory
// "passage: " / "query: " prefixes automatically.

import os from "node:os";
import path from "node:path";

export const DEFAULT_MODEL = "intfloat/multilingual-e5-small";

// id -> { dim, hub }: hub is the repo carrying ONNX weights for transformers.js.
const SUPPORTED: Record<string, { dim: number; hub: string }> = {
  "sentence-transformers/all-MiniLM-L6-v2": { dim: 384, hub: "Xenova/all-MiniLM-L6-v2" },
  "intfloat/multilingual-e5-small": { dim: 384, hub: "Xenova/multilingual-e5-small" },
  "intfloat/multilingual-e5-base": { dim: 768, hub: "Xenova/multilingual-e5-base" },
  "intfloat/multilingual-e5-large": { dim: 1024, hub: "Xenova/multilingual-e5-large" },
};

export function resolveModel(id: string): { dim: number; hub: string } {
  const entry = SUPPORTED[id];
  if (entry === undefined) {
    throw new Error(
      `unknown embed model ${JSON.stringify(id)}. Supported: ${Object.keys(SUPPORTED).join(", ")}`,
    );
  }
  return entry;
}

export function isE5(id: string): boolean {
  return id.includes("/multilingual-e5-") || id.includes("/e5-");
}

export function modelCacheDir(env: Record<string, string | undefined> = process.env): string {
  if (env.EOS_MODEL_CACHE !== undefined && env.EOS_MODEL_CACHE !== "") {
    return env.EOS_MODEL_CACHE;
  }
  return path.join(os.homedir(), ".engineering-os", "models");
}

type FeaturePipeline = (
  texts: string[],
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

export class Embedder {
  readonly dim: number;
  readonly modelId: string;
  private readonly pipe: FeaturePipeline;
  private readonly e5: boolean;

  private constructor(modelId: string, dim: number, pipe: FeaturePipeline) {
    this.modelId = modelId;
    this.dim = dim;
    this.pipe = pipe;
    this.e5 = isE5(modelId);
  }

  static async create(modelId: string, cacheDir?: string): Promise<Embedder> {
    const { dim, hub } = resolveModel(modelId);
    const { pipeline } = await import("@huggingface/transformers");
    const pipe = (await pipeline("feature-extraction", hub, {
      dtype: "q8",
      cache_dir: cacheDir ?? modelCacheDir(),
    })) as unknown as FeaturePipeline;
    const embedder = new Embedder(modelId, dim, pipe);
    const probe = await embedder.embedRaw(["dimension probe"]);
    const got = probe[0]?.length ?? 0;
    if (got !== dim) {
      throw new Error(`model ${modelId} produced dimension ${got}, expected ${dim}`);
    }
    return embedder;
  }

  private async embedRaw(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const out = await this.pipe(texts, { pooling: "mean", normalize: true });
    return out.tolist().map((v) => Float32Array.from(v));
  }

  async embedPassages(texts: string[]): Promise<Float32Array[]> {
    const prefixed = this.e5 ? texts.map((t) => `passage: ${t}`) : texts;
    return this.embedRaw(prefixed);
  }

  async embedQuery(text: string): Promise<Float32Array> {
    const prefixed = this.e5 ? `query: ${text}` : text;
    const out = await this.embedRaw([prefixed]);
    const vec = out[0];
    if (vec === undefined) throw new Error("embedding a query returned no vector");
    return vec;
  }
}
