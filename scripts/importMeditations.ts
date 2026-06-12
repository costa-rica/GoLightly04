import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import type {
  ImportMeditationRequest,
  ImportMeditationResponse,
  ImportProvenanceMetadata,
  Meditation,
} from "@golightly/shared-types";

const SECRETS_PATH = "/home/nick/agents_home/hermes/secrets/.env";
const DEFAULT_API_BASE = "http://localhost:3000";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

type UserKey = "nick" | "benevolent_monkey";

type CliOptions = {
  userKey: UserKey;
  dir?: string;
  file?: string;
  dryRun: boolean;
  overwrite: boolean;
  apiBase: string;
};

type ParsedMarkdown = {
  title: string;
  description: string;
  script: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    dryRun: false,
    overwrite: false,
    apiBase: process.env.API_BASE_URL || DEFAULT_API_BASE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--overwrite") {
      options.overwrite = true;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    index += 1;

    if (arg === "--user-key") {
      if (next !== "nick" && next !== "benevolent_monkey") {
        throw new Error("--user-key must be nick or benevolent_monkey");
      }
      options.userKey = next;
    } else if (arg === "--dir") {
      options.dir = next;
    } else if (arg === "--file") {
      options.file = next;
    } else if (arg === "--api-base") {
      options.apiBase = next.replace(/\/$/, "");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.userKey) {
    throw new Error("--user-key is required");
  }
  if ((options.dir ? 1 : 0) + (options.file ? 1 : 0) !== 1) {
    throw new Error("Provide exactly one of --dir or --file");
  }

  return options as CliOptions;
}

function loadSecrets(): void {
  const result = dotenv.config({ path: SECRETS_PATH });
  if (result.error) {
    throw new Error(`Unable to load credentials file at ${SECRETS_PATH}`);
  }

  const typoKeys = Object.keys(process.env).filter((key) => key.includes("BENEVOLENT_MOKNEY"));
  if (typoKeys.length > 0) {
    throw new Error("Rename BENEVOLENT_MOKNEY credential variables to BENEVOLENT_MONKEY");
  }
}

function credentialsFor(userKey: UserKey): { email: string; password: string } {
  const suffix = userKey.toUpperCase();
  const email = process.env[`CREDENTIALS_EMAIL_${suffix}`];
  const password = process.env[`CREDENTIALS_PASSWORD_${suffix}`];
  if (!email || !password) {
    throw new Error(`Missing credentials for ${userKey}`);
  }
  return { email, password };
}

function parseMarkdown(content: string): ParsedMarkdown {
  const sections = new Map<string, string>();
  const headingPattern = /^##\s+(.+?)\s*$/gm;
  const headings = Array.from(content.matchAll(headingPattern));
  for (const [index, match] of headings.entries()) {
    const title = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < headings.length ? headings[index + 1].index ?? content.length : content.length;
    sections.set(title.toLowerCase(), content.slice(start, end).trim());
  }

  const title = sections.get("title");
  const description = sections.get("description");
  const script = sections.get("meditation script");
  if (!title) {
    throw new Error("Missing ## Title section");
  }
  if (!description) {
    throw new Error("Missing ## Description section");
  }
  if (!script) {
    throw new Error("Missing ## Meditation Script section");
  }

  return { title, description, script };
}

function listMarkdownFiles(options: CliOptions): string[] {
  if (options.file) {
    return [path.resolve(options.file)];
  }

  const root = path.resolve(options.dir!);
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => path.join(root, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function checksum(content: string): string {
  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
}

function sourceRootFor(options: CliOptions, filePath: string): string {
  return options.dir ? path.resolve(options.dir) : path.dirname(filePath);
}

function sourceFileFor(options: CliOptions, filePath: string): string {
  const root = sourceRootFor(options, filePath);
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

async function requestJson<T>(
  apiBase: string,
  endpoint: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiBase}${endpoint}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return data as T;
}

async function login(apiBase: string, email: string, password: string): Promise<string> {
  const response = await requestJson<{ accessToken: string }>(apiBase, "/users/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return response.accessToken;
}

async function lookupImport(
  apiBase: string,
  token: string,
  metadata: Pick<ImportProvenanceMetadata, "sourceUserKey" | "sourceFile">,
): Promise<Meditation | null> {
  const params = new URLSearchParams({
    sourceUserKey: metadata.sourceUserKey,
    sourceFile: metadata.sourceFile,
  });
  const response = await requestJson<{ duplicate: boolean; meditation?: Meditation }>(
    apiBase,
    `/meditations/imports?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.duplicate ? response.meditation ?? null : null;
}

async function importMeditation(
  apiBase: string,
  token: string,
  body: ImportMeditationRequest,
): Promise<ImportMeditationResponse> {
  return requestJson<ImportMeditationResponse>(apiBase, "/meditations/imports", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

async function pollMeditation(apiBase: string, token: string, meditationId: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const response = await requestJson<{ meditation: Meditation }>(
      apiBase,
      `/meditations/${meditationId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (response.meditation.status === "complete") {
      return;
    }
    if (response.meditation.status === "failed") {
      throw new Error(`Meditation ${meditationId} failed`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for meditation ${meditationId}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadSecrets();
  const credentials = credentialsFor(options.userKey);
  const files = listMarkdownFiles(options);

  const token = options.dryRun ? null : await login(options.apiBase, credentials.email, credentials.password);
  let failures = 0;

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    try {
      const parsed = parseMarkdown(content);
      const metadata: ImportProvenanceMetadata = {
        sourceFile: sourceFileFor(options, filePath),
        sourceRoot: sourceRootFor(options, filePath),
        sourceUserKey: options.userKey,
        importedAt: new Date().toISOString(),
        checksum: checksum(content),
      };

      if (options.dryRun) {
        console.log(`[dry-run] ${metadata.sourceFile}: ${parsed.title}`);
        continue;
      }

      const duplicate = await lookupImport(options.apiBase, token!, metadata);
      if (duplicate && !options.overwrite) {
        console.log(`[skip] ${metadata.sourceFile}: duplicate meditation ${duplicate.id}`);
        continue;
      }

      const response = await importMeditation(options.apiBase, token!, {
        title: parsed.title,
        description: parsed.description,
        script: parsed.script,
        overwrite: options.overwrite,
        importMetadata: metadata,
      });

      if (response.action !== "duplicate") {
        console.log(`[${response.action}] ${metadata.sourceFile}: meditation ${response.meditation.id}`);
        await pollMeditation(options.apiBase, token!, response.meditation.id);
      }
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[failed] ${path.basename(filePath)}: ${message}`);
    }
  }

  if (failures > 0) {
    throw new Error(`${failures} file(s) failed`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
