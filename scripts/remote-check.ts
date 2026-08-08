#!/usr/bin/env node
import os from "node:os";
import { runRemotePreflight } from "../src/remote-preflight.js";

const expectedDeploymentId = process.argv[2] ?? process.env.LOCALMIND_EXPECTED_DEPLOYMENT_ID;
if (!expectedDeploymentId?.trim()) {
  process.stderr.write("사용법: npm run remote-check -- <기대 deployment id>\n");
  process.exitCode = 2;
} else {
  const result = await runRemotePreflight({
    home: process.env.HOME ?? os.homedir(),
    projectDir: process.cwd(),
    expectedDeploymentId: expectedDeploymentId.trim(),
  });
  const detail = result.ok && result.scope && result.deploymentId
    ? ` (scope=${result.scope}, deployment=${result.deploymentId})`
    : "";
  const output = `${result.ok ? "✓" : "✗"} [${result.code}] ${result.message}${detail}\n`;
  (result.ok ? process.stdout : process.stderr).write(output);
  if (!result.ok) process.exitCode = 1;
}
