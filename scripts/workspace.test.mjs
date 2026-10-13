import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	access,
	mkdir,
	mkdtemp,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	html,
	inventory,
	localEndpoint,
	save,
	validateProposal,
} from "./workspace.mjs";

test("discovers nested repositories, ignores symlinks and leaves repositories unchanged", async (t) => {
	const temp = await mkdtemp(join(tmpdir(), "eos-workspace-test-"));
	t.after(() => rm(temp, { recursive: true, force: true }));
	const root = join(temp, "workspace");
	await mkdir(root);
	async function repo(path) {
		await mkdir(path, { recursive: true });
		const git = (args) =>
			execFileSync("git", ["-C", path, ...args], {
				env: {
					...process.env,
					GIT_CONFIG_GLOBAL: "/dev/null",
					GIT_CONFIG_NOSYSTEM: "1",
				},
				stdio: "pipe",
			});
		git(["init"]);
		git([
			"-c",
			"user.name=Fixture",
			"-c",
			"user.email=fixture@example.test",
			"-c",
			"commit.gpgsign=false",
			"commit",
			"--allow-empty",
			"-m",
			"Fixture",
		]);
	}
	await repo(join(root, "one"));
	await repo(join(root, "one", "nested"));
	await repo(join(root, "node_modules", "ignored"));
	await repo(join(temp, "outside"));
	await repo(join(root, ".claude", "worktrees", "ignored"));
	await mkdir(join(root, "empty"));
	execFileSync("git", ["init", join(root, "empty")], { stdio: "pipe" });
	await symlink(join(temp, "outside"), join(root, "external"));
	await writeFile(join(root, "one", "package.json"), "{}");
	const report = await inventory(root);
	assert.deepEqual(
		report.repositories.map((r) => r.path),
		["empty", "one", "one/nested"],
	);
	assert.equal(report.repositories[1].dirty, true);
	assert.deepEqual(report.repositories[1].stack, ["package.json"]);
	assert.equal(report.repositories[2].dirty, false);
	await assert.rejects(save(report, join(root, "output")), /outside/);
	await assert.rejects(access(join(root, "output")));
	await symlink(root, join(temp, "alias"));
	await assert.rejects(save(report, join(temp, "alias", "output")), /outside/);
	assert.equal(report.repositories[0].head, null);
	await save(report, join(temp, "reports"));
	const after = await inventory(root);
	assert.deepEqual(after.repositories, report.repositories);
});
test("LLM endpoints are strictly local without redirects or credentials", () => {
	assert.equal(
		localEndpoint("http://127.0.0.1:11434"),
		"http://127.0.0.1:11434",
	);
	for (const url of [
		"https://example.com",
		"http://localhost.evil",
		"http://127.0.0.1@evil",
		"http://user@127.0.0.1",
		"http://127.0.0.1/path",
	])
		assert.throws(() => localEndpoint(url));
});
test("HTML escapes model output and repository names", () => {
	const output = html({
		repositories: [
			{
				path: "<script>x</script>",
				branch: "main",
				stack: [],
				context: [],
				review: { proposal: "<img src=x onerror=alert(1)>" },
			},
		],
		errors: [],
		createdAt: "now",
	});
	assert.ok(!output.includes("<script>"));
	assert.ok(!output.includes("<img"));
});

test("rejects degenerate local model responses", () => {
	assert.throws(
		() => validateProposal("underwater ".repeat(100)),
		/repetitive/,
	);
	validateProposal("Review the existing changes before selecting a task.");
});

test("records model failures and continues to the next repository", async (t) => {
	const { review } = await import("./workspace.mjs");
	let calls = 0;
	t.mock.method(globalThis, "fetch", async (url, options) => {
		assert.equal(options.redirect, "error");
		if (url.endsWith("/api/tags"))
			return {
				ok: true,
				json: async () => ({ models: [{ name: "fixture" }] }),
			};
		calls++;
		if (calls === 1) return { ok: false, status: 500 };
		return {
			ok: true,
			json: async () => ({
				message: {
					content:
						"Inspect the README and existing changes before choosing a task.",
				},
				done_reason: "stop",
			}),
		};
	});
	const report = { repositories: [{ path: "one" }, { path: "two" }] };
	await review(report, "http://127.0.0.1:11434", "fixture");
	assert.equal(report.repositories[0].review.status, "failed");
	assert.equal(report.repositories[1].review.status, "complete");
});
