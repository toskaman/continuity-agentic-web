/**
 * Generates Agent Cards for NANDA discovery (`/.well-known/agent-card.json`),
 * Project NANDA AI Catalogs (`/.well-known/ai-catalog.json`), single-turn Public Facts Networks
 * (`facts/<network>_facts`), and static CORS `_headers` for all 5 Open Agentic Websites.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFactsNetworkBundle } from "../packages/facts-publisher/index.js";
import {
  validateA2aAgentCard,
  validateNandaAiCatalog,
  validatePoppyReachDeclaration,
} from "../packages/nanda-resolver/index.js";
import { canonicalizeJson, sha256Hex } from "../packages/shared-schemas/index.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const STABLE_FACTS_DATE = "2027-11-14";

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
      structuredFacts: [
        "Coordinates multi-provider schedule changes across moving, curbside bay prep, fiber installation, smart-meter activation, storage, and furniture delivery.",
        "Enforces hard user invariants in deterministic code: maximum budget ceiling, hold-before-release, zero unauthorized cancellations, and SHA-256 bound human approvals.",
        "Verifies Ed25519 provider receipts and exports updated RFC 5545 .ics calendars and signed cryptographic audit JSON bundles.",
      ],
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
      structuredFacts: [
        "Residential Luton van + 3-mover crew base rate: €390.00 (weekday morning 08:00–13:00), Saturday rate: €420.00 (09:00–14:00).",
        "Reschedule fee: €25.00. Temporary crew slot hold TTL: 15 minutes (900 seconds) with zero charge and original booking kept active.",
        "Demonstration moving service created for the Cognizant Open Agentic Web Challenge; no real trucks dispatched or payments charged.",
      ],
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
      structuredFacts: [
        "Zone B 15-meter curbside loading-bay dossier preparation base fee: €35.00; draft date amendment fee: €10.00.",
        "Public notice rule: occupation date must satisfy at least 48 hours advance notice (windows 07:30–14:00 or 08:00–14:00).",
        "Demonstration dossier preparation service only; never issues municipal permits or modifies government databases.",
      ],
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
      structuredFacts: [
        "2 Gbps symmetric fiber ONT installation visit: €49.00 weekday (14:00–17:00) or €39.00 Saturday off-peak (09:00–12:00).",
        "Reschedule fee: €0.00. Temporary technician window hold TTL: 10 minutes (600 seconds) while keeping the current appointment active.",
        "Demonstration broadband scheduler for the Open Agentic Web Challenge; no physical technician dispatched.",
      ],
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
      structuredFacts: [
        "Remote smart-meter electricity energization fee: €30.00 (08:00–12:00 window, no home technician visit needed).",
        "Schedule date modification fee: €0.00; staging a target date leaves the confirmed activation untouched until explicit confirmation.",
        "Demonstration utility activation service for the Open Agentic Web Challenge; no physical smart meter switched.",
      ],
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
    const htmlText = await readFile(path.join(siteDir, "index.html"), "utf8");
    const baseUrl = defaults[s.key].replace(/\/$/, "");
    const host = new URL(baseUrl).hostname;

    // 1. Build & write single-turn Public Facts Network (`facts/<network>_facts`)
    const factsDir = path.join(siteDir, "facts");
    await mkdir(factsDir, { recursive: true });
    let prevFactsNet = null;
    const factsNetPath = path.join(factsDir, `${s.network}_facts.network.json`);
    try {
      prevFactsNet = JSON.parse(await readFile(factsNetPath, "utf8"));
    } catch {
      prevFactsNet = null;
    }

    const factsBundle = await buildFactsNetworkBundle({
      siteName: manifest.brand,
      siteUrl: `${baseUrl}/`,
      networkName: s.network,
      htmlText,
      structuredFacts: s.structuredFacts,
      todayIso: STABLE_FACTS_DATE,
      previousNetworkJson: prevFactsNet,
    });

    await writeFile(path.join(factsDir, "agent-manifest.json"), `${JSON.stringify(factsBundle.manifestJson, null, 2)}\n`, "utf8");
    await writeFile(factsNetPath, `${JSON.stringify(factsBundle.networkJson, null, 2)}\n`, "utf8");
    await writeFile(path.join(factsDir, "links.json"), `${JSON.stringify(factsBundle.linksJson, null, 2)}\n`, "utf8");

    // Static sites advertise the published browser network as discovery metadata.
    const agentCard = {
      name: manifest.brand,
      description: manifest.networks[0].description,
      version: "1.0.0",
      url: `${baseUrl}/${s.network}.network.json`,
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
          factsNetworkUrl: `${baseUrl}/facts/${s.network}_facts.network.json`,
          browserExecuted: true,
        },
        "org.projectnanda": {
          subjectUrnHint: `urn:air:${host}:agent:${s.network}`,
          aiCatalogUrl: `${baseUrl}/ai-catalog.json`,
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
    const serializedCard = `${JSON.stringify(agentCard, null, 2)}\n`;
    await writeFile(path.join(wellKnownDir, "agent-card.json"), serializedCard, "utf8");
    await writeFile(path.join(siteDir, "agent-card.json"), serializedCard, "utf8");

    // 3. Build & validate Project NANDA AI Catalog (`ai-catalog.json` + `.well-known/ai-catalog.json`)
    const cardDigest = `sha256:${await sha256Hex(canonicalizeJson(agentCard))}`;
    const factsDigest = `sha256:${await sha256Hex(canonicalizeJson(factsBundle.networkJson))}`;

    const aiCatalog = {
      mediaType: "application/ai-catalog+json",
      version: "1.0",
      publisher: {
        identifier: host,
        displayName: manifest.brand,
        identityType: ["127.0.0.1", "localhost"].includes(host) ? "loopback-dev" : "https-origin",
      },
      entries: [
        {
          identifier: `urn:air:${host}:agent:${s.network}`,
          displayName: manifest.brand,
          description: manifest.networks[0].description,
          type: "application/a2a-agent-card+json",
          url: `${baseUrl}/agent-card.json`,
          targetDigest: cardDigest,
          tags: ["open-agentic-web", "a2a", s.key],
          publisher: {
            identifier: host,
            displayName: manifest.brand,
            identityType: "dns-or-platform-subpath",
          },
          extensions: {
            "org.projectnanda": {
              resolutionRole: "direct-agent-card",
              preferredDiscovery: "agent-manifest-and-a2a",
              resolutionProfile: "known-subject-resolution-02",
            },
            "org.worldwideagenticweb": {
              mvpProfile: "0.2",
              manifestUrl: `${baseUrl}/agent-manifest.json`,
              networkUrl: `${baseUrl}/${s.network}.network.json`,
              factsManifestUrl: `${baseUrl}/facts/agent-manifest.json`,
              factsNetworkDigest: factsDigest,
            },
          },
        },
      ],
    };

    const catCheck = validateNandaAiCatalog(aiCatalog);
    if (!catCheck.valid) {
      throw new Error(`Invalid NANDA AI Catalog for ${s.folder}: ${catCheck.errors.join("; ")}`);
    }
    const serializedCatalog = `${JSON.stringify(aiCatalog, null, 2)}\n`;
    await writeFile(path.join(wellKnownDir, "ai-catalog.json"), serializedCatalog, "utf8");
    await writeFile(path.join(siteDir, "ai-catalog.json"), serializedCatalog, "utf8");

    // 3b. Build & validate Poppy / nandaindex.org/reach v1 post-tab notification manifest (`poppy.json` + `.well-known/poppy.json`)
    const poppyJson = {
      poppy_version: "1.0",
      provider_name: manifest.brand,
      extensions: {
        "nandaindex.org/reach": [
          {
            version: "1",
            index: "https://api.nandaindex.org",
            message_topics: ["hold_expiry", "schedule_reconciliation", "promotion"],
            sender: `${s.key}-desk@continuity-agentic.example`,
            endpoint: `${baseUrl}/poppy.json`,
            description:
              "Stores only an opted-in session NANDA locator (urn:air:<publisher>:personal:<id>) to notify your Personal Agent about slot-hold expiry or overflow availability after tab close, never storing inbox or card URLs.",
          },
        ],
      },
    };
    const popCheck = validatePoppyReachDeclaration(poppyJson);
    if (!popCheck.valid) {
      throw new Error(`Invalid Poppy Reach manifest for ${s.folder}: ${popCheck.errors.join("; ")}`);
    }
    const serializedPoppy = `${JSON.stringify(poppyJson, null, 2)}\n`;
    await writeFile(path.join(wellKnownDir, "poppy.json"), serializedPoppy, "utf8");
    await writeFile(path.join(siteDir, "poppy.json"), serializedPoppy, "utf8");

    // 4. Static Hosting Headers (`_headers`)
    const headersContent = `/agent-manifest.json
  Access-Control-Allow-Origin: *
/${s.network}.network.json
  Access-Control-Allow-Origin: *
/links.json
  Access-Control-Allow-Origin: *
/agent-mcp.json
  Access-Control-Allow-Origin: *
/agent-card.json
  Access-Control-Allow-Origin: *
/ai-catalog.json
  Access-Control-Allow-Origin: *
/poppy.json
  Access-Control-Allow-Origin: *
/facts/agent-manifest.json
  Access-Control-Allow-Origin: *
/facts/${s.network}_facts.network.json
  Access-Control-Allow-Origin: *
/facts/links.json
  Access-Control-Allow-Origin: *
/.well-known/nsdeploy.json
  Access-Control-Allow-Origin: *
/.well-known/nsdeploy-agent.json
  Access-Control-Allow-Origin: *
/.well-known/agent-card.json
  Access-Control-Allow-Origin: *
/.well-known/ai-catalog.json
  Access-Control-Allow-Origin: *
/.well-known/poppy.json
  Access-Control-Allow-Origin: *
/runtime/sandbox-worker.js
  Content-Security-Policy: default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'
`;
    await writeFile(path.join(siteDir, "_headers"), headersContent, "utf8");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await writeAgentCardsAndHeaders();
  console.log("Wrote validated Agent Cards, NANDA AI Catalogs, Public Facts Networks, and _headers for all 5 Open Agentic Websites.");
}
