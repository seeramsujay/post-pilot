# PostPilot: Architectural Review & Devvit Ecosystem Roadmap (future.md)

---

## 1. Architectural Code Review & Current State Analysis

PostPilot is an interactive posting portal and automated moderation enforcer engineered for Reddit communities using the **Reddit Developer Platform (Devvit)** and **React / Vite**. By replacing the generic Reddit post creator with a custom webview portal pinned as a sticky canvas, PostPilot prevents rule-violating submissions before they are ever published, relieving community moderators of tedious manual triage.

### Architectural Strengths
- **Dual-Layer Validation Architecture:** Evaluates regex titles, word counts, and forbidden keywords in real-time within the client React webview, backed by a secondary server-side check in `main.tsx` against user account age and karma thresholds.
- **Idempotency Locking (Redis NX):** Uses Devvit's managed Redis KV store to acquire a 10-second distributed lock per post UUID, mitigating duplicate creation under flaky mobile connections.
- **Background Fallback Enforcer (`PostSubmit`):** Automatically detects and quarantines any post submitted outside the official portal canvas, providing an explanatory mod reply.

### Identified Bottlenecks & Platform Limits
1. **Devvit 4MB Payload Limit:** Rich-text paste events containing uncompressed Base64 image data or heavy clipboard bloat can exceed Devvit RPC message boundaries.
2. **Static Blacklists vs Semantic Evading:** Malicious actors easily bypass static keyword lists using leetspeak, zero-width spaces, or homoglyphs.
3. **Single-Subreddit Configuration Coupling:** Settings are currently scoped to individual subreddit installations without central synchronization across federated sister communities.

---

## 2. Strategic Engineering Roadmap

```mermaid
flowchart TD
    subgraph Phase 1: Robust Client Defense & Content Scrubbing
        P1A[Client-Side Wasm Image Compressor] --> P1B[Zero-Width Space & Homoglyph Normalizer]
        P1B --> P1C[Devvit Redis Key Expiration Optimizer]
    end

    subgraph Phase 2: On-Device Semantic Moderation
        P2A[TensorFlow.js / ONNX Toxicity Classifier] --> P2B[Automated Duplicate / Repost Vector Search]
        P2B --> P2C[Context-Aware Flair Recommendation]
    end

    subgraph Phase 3: Moderator Analytics & Live Telemetry
        P3A[Real-Time Rejection Analytics Webview] --> P3B[A/B Title Optimization Sandbox]
        P3B --> P3C[Automated Weekly Rule Compliance Reports]
    end

    subgraph Phase 4: Multi-Subreddit Network Federation
        P4A[Cross-Subreddit Shared Ban & Scam Network] --> P4B[Global Mod Rule Sync via Webhooks]
        P4B --> P4C[Federated Community Reputation Graph]
    end

    Phase 1 --> Phase 2
    Phase 2 --> Phase 3
    Phase 3 --> Phase 4
```

---

## 3. Detailed Milestone Execution Plan

### Milestone 1: High-Performance Payload Compression & Text Normalization
- [ ] **Wasm Image Pre-Compressor:** Compress uploaded media to WebP format directly in the client webview before transmission to keep total payload size under $<1\text{MB}$.
- [ ] **Unicode Homoglyph Canonicalizer:** Canonicalize leetspeak and Cyrillic/Greek lookalikes prior to regex and blacklist evaluation.
- [ ] **Atomic Redis Transactions:** Transition from individual `set` / `expire` calls to Lua scripts for atomic lock release and counter increments.

### Milestone 2: Client-Side Machine Learning & Spam Defense
- [ ] **Local Toxicity Classifier:** Deploy an in-browser quantized ONNX model to evaluate abusive or offensive drafting without server round-trips.
- [ ] **Semantic Repost Detector:** Embed post titles using lightweight client embeddings and query Redis vector search to alert users if an identical query was asked within the last 7 days.
- [ ] **Smart Tagging:** Suggest appropriate post flair automatically based on body content semantics.

### Milestone 3: Advanced Mod Telemetry Hub & Live Triage
- [ ] **Interactive Triage Queue:** Build a dedicated moderator view inside the webview allowing one-click rule adjustments based on top rejected keywords.
- [ ] **Exportable Compliance Logs:** Stream aggregated rule breach statistics to external SRE / Discord webhooks for real-time moderator notifications.

### Milestone 4: Federated Multi-Subreddit Sync
- [ ] **Shared Blacklist Network:** Allow participating subreddits to synchronize known spam domains and bot network signatures dynamically.
- [ ] **Cross-Community Karma Passport:** Compute an aggregated trustworthy score across sister subreddits to bypass new-account probation for established contributors.
