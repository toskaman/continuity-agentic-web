/**
 * Generates NANDA-Index-validated A2A v1.0 Agent Cards (`/.well-known/agent-card.json`)
 * and static CORS `_headers` for all 5 Open Agentic Websites.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateA2aAgentCard } from "../packages/nanda-resolver/index.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

export async function writeAgentCardsAndHeaders(origins = {}) {
  const defaults = {
    continuity: origins.continuity || "http://127.0.0.1:8080",
    moveco: origins.moveco || "http://127.0.0.1:8081",
    permitflow: origins.permitflow || "http://localhost:8082",
    homeconnect: origins.homeconnect || "http://127.0.0.1:8083",
    powerflow: origins.powerflow || "http://localhost:8084",
  };

  const sites = [
    {
      key: "continuity",
      folder: "apps/continuity-web",
      network: "continuity_coordinator",
      skills: [
        {
          id: "coordinate-commitment-change",
          name: "Safe Multi-Provider Change Reconciliation",
          description: "Compiles schedule changes, computes bounded dependency impact, resolves minimal-change plans, binds SHA-256 approvals, and verifies Ed25519 receipts.",
          tags: ["change-coordination", "open-agentic-web", "saga", "minimal-change"],
        },
      ],
    },
    {
      key: "moveco",
      folder: "apps/demo-moveco",
      network: "moveco_dispatch",
      skills: [
        {
          id: "moving-crew-dispatch",
          name: "Moving Van Quotes, 15m Slot Holds & Rescheduling",
          description: "Provides demonstration residential Luton van crew quotes, non-destructive 15-minute slot holds, and idempotent booking reschedules.",
          tags: ["moving", "logistics", "slot-hold", "demo-peer"],
        },
      ],
    },
    {
      key: "permitflow",
      folder: "apps/demo-permitflow",
      network: "permitflow_advisor",
      skills: [
        {
          id: "curbside-permit-dossier-prep",
          name: "Public Curbside Bay Notice Rules & Dossier Drafts",
          description: "Checks public curbside loading-bay notice windows and updates demonstration permit application drafts (never mutates municipal databases).",
          tags: ["civic-prep", "parking-bay", "dossier-draft", "demo-peer"],
        },
      ],
    },
    {
      key: "homeconnect",
      folder: "apps/demo-homeconnect",
      network: "homeconnect_scheduler",
      skills: [
        {
          id: "fiber-technician-scheduling",
          name: "2 Gbps Fiber ONT Technician Windows & Holds",
          description: "Lists broadband optical installation technician windows, places 10-minute holds, and updates confirmed demonstration appointments.",
          tags: ["broadband", "fiber", "appointments", "demo-peer"],
        },
      ],
    },
    {
      key: "powerflow",
      folder: "apps/demo-powerflow",
      network: "powerflow_grid",
      skills: [
        {
          id: "smart-meter-energization",
          name: "Remote Smart-Meter Electricity Activation Scheduling",
          description: "Checks remote smart-meter energization dates and executes zero-fee schedule shifts in the demonstration environment.",
          tags: ["electricity", "utility", "smart-meter", "demo-peer"],
        },
      ],
    },
  ];

  for (const s of sites) {
    const siteDir = path.join(ROOT, s.folder);
    const manifest = JSON.parse(await readFile(path.join(siteDir, "agent-manifest.json"), "utf8"));
    const baseUrl = defaults[s.key].replace(/\/$/, "");
    const host = new URL(baseUrl).hostname;

    const agentCard = {
      name: manifest.brand,
      description: manifest.networks[0].description,
      version: "1.0.0",
      url: `${baseUrl}/${s.network}`,
      supportedInterfaces: [
        {
          url: `${baseUrl}/${s.network}`,
          protocolBinding: "HTTP+JSON",
          protocolVersion: "1.0",
        },
      ],
      capabilities: {
        streaming: false,
        pushNotifications: false,
        extendedAgentCard: false,
      },
      defaultInputModes: ["text/plain", "application/json"],
      defaultOutputModes: ["text/plain", "application/json"],
      skills: s.skills,
      extensions: {
        "org.worldwideagenticweb": {
          mvpProfile: "0.2",
          manifestUrl: `${baseUrl}/agent-manifest.json`,
          networkUrl: `${baseUrl}/${s.network}.network.json`,
          browserExecuted: true,
        },
        "org.projectnanda": {
          subjectUrnHint: `urn:air:${host}:agent:${s.network}`,
          resolutionProfile: "known-subject-resolution-02",
        },
      },
    };

    const check = validateA2aAgentCard(agentCard);
    if (!check.valid) {
      throw new Error(`Invalid A2A Agent Card for ${s.folder}: ${check.errors.join("; ")}`);
    }

    const wellKnownDir = path.join(siteDir, ".well-known");
    await mkdir(wellKnownDir, { recursive: true });
    await writeFile(
      path.join(wellKnownDir, "agent-card.json"),
      `${JSON.stringify(agentCard, null, 2)}\n`,
      "utf8",
    );

    const headersContent = `/agent-manifest.json
  Access-Control-Allow-Origin: *
/${s.network}.network.json
  Access-Control-Allow-Origin: *
/links.json
  Access-Control-Allow-Origin: *
/agent-mcp.json
  Access-Control-Allow-Origin: *
/.well-known/nsdeploy.json
  Access-Control-Allow-Origin: *
/.well-known/nsdeploy-agent.json
  Access-Control-Allow-Origin: *
/.well-known/agent-card.json
  Access-Control-Allow-Origin: *
/runtime/sandbox-worker.js
  Content-Security-Policy: default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'
`;
    await writeFile(path.join(siteDir, "_headers"), headersContent, "utf8");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await writeAgentCardsAndHeaders();
  console.log("Wrote validated /.well-known/agent-card.json and _headers for all 5 Open Agentic Websites.");
}
