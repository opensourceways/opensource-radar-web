/**
 * Data module - handles Excel loading, parsing, and sample data generation.
 *
 * Expected Excel columns:
 *   id        - number (display index on radar)
 *   name      - string (technology name)
 *   quadrant  - string: "Inference" | "Finetuning" | "Pretraining" | "Kernel" | "Reinforcement Learning"
 *   ring      - string: "Adopt" | "Trial" | "Assess" | "Hold"
 *   movement  - string: "new" | "moved" | "none"
 *   score     - number (higher is closer to center)
 *   description - string (HTML-safe text)
 *   community update - string (community notes)
 */

const RadarData = (() => {
  // Canonical ordering
  const QUADRANTS = ['Inference', 'Finetuning', 'Pretraining', 'Kernel', 'Reinforcement Learning'];
  const RINGS = ['Adopt', 'Trial', 'Assess', 'Hold'];

  const QUADRANT_COLORS = {
    'Inference':                '#3a8ea5',
    'Finetuning':               '#587e2e',
    'Pretraining':              '#b5872a',
    'Kernel':                   '#8b2252',
    'Reinforcement Learning':   '#5b5db3',
  };

  const QUADRANT_KEYS = {
    'Inference':                'inference',
    'Finetuning':               'finetuning',
    'Pretraining':              'pretraining',
    'Kernel':                   'kernel',
    'Reinforcement Learning':   'reinforcement',
  };

  /**
   * Parse an ArrayBuffer (from file input) into radar items.
   */
  function parseExcel(arrayBuffer) {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const items = rows.map((row) => ({
      id:          Number(row['id'] || row['ID'] || row['Id'] || 0),
      name:        String(row['name'] || row['Name'] || ''),
      quadrant:    normalizeQuadrant(String(row['quadrant'] || row['Quadrant'] || '')),
      ring:        normalizeRing(String(row['ring'] || row['Ring'] || '')),
      movement:    normalizeMovement(String(row['movement'] || row['Movement'] || 'none')),
      score:       row['score'],
      description: String(row['description'] || row['Description'] || ''),
      communityUpdate: String(
        row['community update'] ||
        row['Community Update'] ||
        row['community_update'] ||
        row['communityUpdate'] ||
        ''
      ),
    })).filter(item => item.name && item.quadrant && item.ring);

    return assignIds(items);
  }

  function assignIds(items) {
    const toScore = (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : Number.NEGATIVE_INFINITY;
    };

    const sortByScoreDesc = (a, b) => {
      const scoreDiff = toScore(b.item.score) - toScore(a.item.score);
      if (scoreDiff !== 0) return scoreDiff;
      return a.index - b.index;
    };

    const hasAnyId = items.some(item => Number(item.id) > 0);

    if (!hasAnyId) {
      const grouped = {};
      items.forEach((item, index) => {
        const key = item.quadrant || '__default__';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push({ item, index });
      });

      const result = new Array(items.length);
      Object.values(grouped).forEach((group) => {
        group.sort(sortByScoreDesc);
        group.forEach((entry, rank) => {
          result[entry.index] = { ...entry.item, id: rank + 1 };
        });
      });

      return result;
    }

    const result = items.map(item => ({ ...item }));
    const maxIdByQuadrant = {};

    result.forEach((item) => {
      const currentId = Number(item.id) || 0;
      if (currentId <= 0) return;
      const key = item.quadrant || '__default__';
      maxIdByQuadrant[key] = Math.max(maxIdByQuadrant[key] || 0, currentId);
    });

    const missingByQuadrant = {};
    result.forEach((item, index) => {
      const currentId = Number(item.id) || 0;
      if (currentId > 0) return;
      const key = item.quadrant || '__default__';
      if (!missingByQuadrant[key]) missingByQuadrant[key] = [];
      missingByQuadrant[key].push({ item, index });
    });

    Object.entries(missingByQuadrant).forEach(([key, group]) => {
      group.sort(sortByScoreDesc);
      let nextId = (maxIdByQuadrant[key] || 0) + 1;
      group.forEach((entry) => {
        result[entry.index].id = nextId;
        nextId += 1;
      });
    });

    return result;
  }

  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  function parseCSV(csvText) {
    const lines = csvText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    const rows = lines.slice(1).map((line) => {
      const values = parseCSVLine(line);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] !== undefined ? values[index].trim() : '';
      });
      return row;
    });

    const items = rows.map((row) => ({
      id:          Number(row['id'] || row['ID'] || row['Id'] || 0),
      name:        String(row['name'] || row['Name'] || ''),
      quadrant:    normalizeQuadrant(String(row['quadrant'] || row['Quadrant'] || '')),
      ring:        normalizeRing(String(row['ring'] || row['Ring'] || '')),
      movement:    normalizeMovement(String(row['movement'] || row['Movement'] || 'none')),
      score:       row['score'] || row['Score'],
      description: String(row['description'] || row['Description'] || ''),
      communityUpdate: String(
        row['community update'] ||
        row['Community Update'] ||
        row['community_update'] ||
        row['communityUpdate'] ||
        ''
      ),
    })).filter(item => item.name && item.quadrant && item.ring);

    return assignIds(items);
  }

  function parseFile(file) {
    return new Promise((resolve, reject) => {
      const fileName = (file?.name || '').toLowerCase();
      const reader = new FileReader();

      if (fileName.endsWith('.csv')) {
        reader.onload = (evt) => {
          try {
            resolve(parseCSV(String(evt.target.result || '')));
          } catch (err) {
            reject(new Error('Failed to parse CSV file: ' + err.message));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read CSV file'));
        reader.readAsText(file);
        return;
      }

      reader.onload = (evt) => {
        try {
          resolve(parseExcel(evt.target.result));
        } catch (err) {
          reject(new Error('Failed to parse Excel file: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read Excel file'));
      reader.readAsArrayBuffer(file);
    });
  }

  function normalizeQuadrant(q) {
    const value = String(q || '').trim();
    if (!value) return value;

    const lower = value.toLowerCase();
    const direct = QUADRANTS.find(qn => qn.toLowerCase() === lower);
    if (direct) return direct;

    const normalized = lower.replace(/[\s_-]+/g, '');
    const aliases = {
      kernel: 'Kernel',
      kernels: 'Kernel',
      finetune: 'Finetuning',
      finetuning: 'Finetuning',
      pretraining: 'Pretraining',
      inference: 'Inference',
      rl: 'Reinforcement Learning',
    };

    return aliases[normalized] || value;
  }

  function normalizeRing(r) {
    const lower = r.toLowerCase().trim();
    return RINGS.find(rn => rn.toLowerCase() === lower) || r;
  }

  function normalizeMovement(m) {
    const lower = m.toLowerCase().trim();
    if (lower === 'new') return 'new';
    if (lower === 'moved' || lower === 'moved in/out') return 'moved';
    return 'none';
  }

  /**
   * Generate sample data resembling a real technology radar.
   */
  function getSampleData() {
    const data = [
      // === Techniques ===
      { id: 1, name: 'Design Systems', quadrant: 'Techniques', ring: 'Adopt', movement: 'none', description: 'Design systems provide a shared set of principles and patterns that help teams build consistent user interfaces at scale. By codifying design decisions into reusable components and guidelines, organizations can accelerate development while maintaining quality.' },
      { id: 2, name: 'Retrieval-Augmented Generation (RAG)', quadrant: 'Techniques', ring: 'Adopt', movement: 'none', description: 'RAG combines information retrieval with generative AI to produce more accurate, grounded responses. By fetching relevant documents before generating text, RAG reduces hallucination and improves factual accuracy in LLM-powered applications.' },
      { id: 3, name: 'Micro Frontends', quadrant: 'Techniques', ring: 'Adopt', movement: 'none', description: 'Micro frontends extend microservice principles to frontend development, enabling independent teams to build, test and deploy UI features autonomously while maintaining a cohesive user experience.' },
      { id: 4, name: 'Platform Engineering', quadrant: 'Techniques', ring: 'Adopt', movement: 'moved', description: 'Platform engineering focuses on building internal developer platforms (IDPs) that reduce cognitive load and enable self-service infrastructure. Teams have found this approach significantly improves developer productivity and operational efficiency.' },
      { id: 5, name: 'AI-Assisted Test Generation', quadrant: 'Techniques', ring: 'Trial', movement: 'new', description: 'Using LLMs to generate unit tests, integration tests and property-based tests. While not a replacement for thoughtful test design, AI-assisted generation can significantly accelerate test coverage for boilerplate scenarios.' },
      { id: 6, name: 'Structured Outputs from LLMs', quadrant: 'Techniques', ring: 'Trial', movement: 'new', description: 'Techniques to force LLMs to produce valid JSON, XML or other structured formats. This is critical for building reliable pipelines that consume LLM output programmatically.' },
      { id: 7, name: 'GraphQL Federation', quadrant: 'Techniques', ring: 'Trial', movement: 'none', description: 'GraphQL Federation enables composing a unified graph from multiple independent subgraphs owned by different teams, promoting autonomy while maintaining a single API surface for consumers.' },
      { id: 8, name: 'Contract Testing', quadrant: 'Techniques', ring: 'Trial', movement: 'none', description: 'Contract testing verifies that services can communicate by checking each service against a shared contract. This approach catches integration issues early without requiring full end-to-end test environments.' },
      { id: 9, name: 'AI Code Review', quadrant: 'Techniques', ring: 'Assess', movement: 'new', description: 'Using AI models to provide automated code review feedback on pull requests. Early results show promise for catching common issues, but human review remains essential for architectural and design concerns.' },
      { id: 10, name: 'Agentic AI Workflows', quadrant: 'Techniques', ring: 'Assess', movement: 'new', description: 'Building AI systems that autonomously plan, execute and iterate on multi-step tasks. While powerful, these workflows require careful guardrails and monitoring to prevent runaway behavior.' },

      { id: 11, name: 'Prompt Engineering Patterns', quadrant: 'Techniques', ring: 'Assess', movement: 'new', description: 'Systematic approaches to crafting LLM prompts including chain-of-thought, few-shot learning, and role-based prompting. These patterns help teams get more reliable and consistent outputs from language models.' },
      { id: 12, name: 'Cell-Based Architecture', quadrant: 'Techniques', ring: 'Assess', movement: 'none', description: 'Cell-based architecture partitions a system into isolated cells, each containing a complete set of services. This limits the blast radius of failures and enables independent scaling per cell.' },
      { id: 13, name: 'LLM Fine-Tuning for Domain Tasks', quadrant: 'Techniques', ring: 'Assess', movement: 'none', description: 'Fine-tuning foundation models on domain-specific data to improve performance on specialized tasks. This approach requires careful data curation and evaluation to ensure quality improvements.' },
      { id: 14, name: 'AI-Generated Documentation', quadrant: 'Techniques', ring: 'Assess', movement: 'new', description: 'Leveraging AI to automatically generate and maintain technical documentation from code, commit history, and architecture decisions. Early results are promising but require human review.' },
      { id: 15, name: 'WASM for Server-Side Logic', quadrant: 'Techniques', ring: 'Assess', movement: 'none', description: 'Using WebAssembly beyond the browser to run server-side logic in a portable, sandboxed environment. This approach enables polyglot runtimes and plugin architectures with near-native performance.' },

      { id: 16, name: 'LLM-as-Judge Evaluation', quadrant: 'Techniques', ring: 'Trial', movement: 'new', description: 'Using one LLM to evaluate the output quality of another LLM. While convenient for scaling evaluations, this technique must be calibrated against human judgments to avoid systematic biases.' },
      { id: 17, name: 'Chaos Engineering for AI', quadrant: 'Techniques', ring: 'Assess', movement: 'new', description: 'Applying chaos engineering principles to AI systems by injecting adversarial inputs, model failures, and latency to test resilience. This helps teams understand failure modes before production incidents occur.' },
      { id: 18, name: 'Dependency Health Scoring', quadrant: 'Techniques', ring: 'Trial', movement: 'none', description: 'Systematically scoring third-party dependencies based on maintenance activity, security posture, and community health to make informed decisions about library adoption and migration.' },
      { id: 19, name: 'Event Modeling', quadrant: 'Techniques', ring: 'Trial', movement: 'none', description: 'A visual method for designing event-driven systems that maps commands, events, and views on a timeline. This technique bridges the communication gap between business stakeholders and engineering teams.' },
      { id: 20, name: 'AI Guardrails & Safety Layers', quadrant: 'Techniques', ring: 'Trial', movement: 'new', description: 'Implementing input/output filtering, content moderation, and safety classifiers around LLM deployments. Essential for production AI systems that interact with end users.' },
      { id: 21, name: 'Shift-Left Security Scanning', quadrant: 'Techniques', ring: 'Trial', movement: 'none', description: 'Moving security scanning earlier in the development lifecycle by integrating SAST, SCA, and secret scanning directly into the IDE and CI pipeline.' },

      { id: 22, name: 'Context Engineering for LLMs', quadrant: 'Techniques', ring: 'Trial', movement: 'new', description: 'Systematically managing the context window of LLMs through techniques like context compression, sliding windows, and hierarchical summarization to maximize the effective use of limited context.' },
      { id: 23, name: 'Synthetic Data Generation', quadrant: 'Techniques', ring: 'Trial', movement: 'none', description: 'Generating synthetic training data using statistical methods or generative models to augment datasets where real data is scarce, sensitive, or expensive to collect.' },
      { id: 24, name: 'Multi-Modal AI Pipelines', quadrant: 'Techniques', ring: 'Trial', movement: 'new', description: 'Building data pipelines that process text, images, audio, and video through unified AI models. The maturation of multi-modal foundation models makes these pipelines increasingly practical.' },
      { id: 25, name: 'FinOps for Cloud', quadrant: 'Techniques', ring: 'Trial', movement: 'none', description: 'Applying financial operations practices to cloud infrastructure spending through real-time cost visibility, automated rightsizing, and cross-functional accountability for cloud costs.' },

      { id: 26, name: 'Blockchain for Enterprise', quadrant: 'Techniques', ring: 'Hold', movement: 'none', description: 'While blockchain has legitimate use cases, we continue to see enterprise blockchain projects that would be better served by traditional databases. We recommend careful evaluation of whether distributed consensus is truly needed.' },
      { id: 27, name: 'Long-Lived Feature Branches', quadrant: 'Techniques', ring: 'Hold', movement: 'none', description: 'Maintaining feature branches that live for weeks or months leads to painful merges and delayed integration. We recommend trunk-based development with feature flags instead.' },

      // === Platforms ===
      { id: 28, name: 'Kubernetes', quadrant: 'Platforms', ring: 'Adopt', movement: 'none', description: 'Kubernetes remains the de facto standard for container orchestration. While complex, the ecosystem of tools and managed offerings has matured significantly, making adoption more accessible.' },
      { id: 29, name: 'Backstage (Spotify)', quadrant: 'Platforms', ring: 'Adopt', movement: 'moved', description: 'Backstage has become a leading internal developer portal framework. Its plugin ecosystem enables teams to centralize service catalogs, documentation, and developer tooling in one place.' },
      { id: 30, name: 'GitHub Actions', quadrant: 'Platforms', ring: 'Adopt', movement: 'none', description: 'GitHub Actions provides a mature CI/CD platform tightly integrated with GitHub repositories. The marketplace of community-maintained actions accelerates pipeline development.' },

      { id: 31, name: 'Cloudflare Workers', quadrant: 'Platforms', ring: 'Trial', movement: 'new', description: 'Edge computing platform that runs JavaScript, TypeScript, and WASM at the edge. Excellent for low-latency APIs, A/B testing, and content transformation close to users.' },
      { id: 32, name: 'Vercel', quadrant: 'Platforms', ring: 'Trial', movement: 'none', description: 'Vercel provides an excellent developer experience for deploying frontend applications, especially Next.js. Its edge functions and ISR capabilities make it a strong platform for modern web apps.' },
      { id: 33, name: 'Databricks', quadrant: 'Platforms', ring: 'Trial', movement: 'none', description: 'Databricks provides a unified analytics platform combining data engineering, data science, and ML workloads. Its lakehouse architecture bridges the gap between data lakes and data warehouses.' },
      { id: 34, name: 'Supabase', quadrant: 'Platforms', ring: 'Trial', movement: 'new', description: 'An open-source Firebase alternative built on PostgreSQL. Supabase provides authentication, real-time subscriptions, storage, and edge functions with a developer-friendly experience.' },
      { id: 35, name: 'Fly.io', quadrant: 'Platforms', ring: 'Trial', movement: 'none', description: 'A platform for running applications close to users worldwide. Fly.io makes it straightforward to deploy Docker containers to multiple regions with low-latency networking.' },
      { id: 36, name: 'AWS Bedrock', quadrant: 'Platforms', ring: 'Trial', movement: 'new', description: 'AWS managed service providing access to multiple foundation models (Claude, Llama, etc.) with enterprise features like fine-tuning, guardrails, and knowledge bases integration.' },
      { id: 37, name: 'Neon (Serverless Postgres)', quadrant: 'Platforms', ring: 'Trial', movement: 'new', description: 'Neon provides serverless PostgreSQL with branching capabilities, making it easy to create database branches for development, testing, and preview environments.' },
      { id: 38, name: 'Temporal', quadrant: 'Platforms', ring: 'Trial', movement: 'none', description: 'A durable execution platform for building reliable distributed systems. Temporal handles retries, state persistence, and workflow orchestration, reducing the complexity of building fault-tolerant systems.' },

      { id: 39, name: 'Azure AI Studio', quadrant: 'Platforms', ring: 'Assess', movement: 'new', description: 'Microsoft unified AI development platform for building generative AI applications. Combines model catalog, prompt engineering tools, and evaluation frameworks.' },
      { id: 40, name: 'Wasm-based Platforms', quadrant: 'Platforms', ring: 'Assess', movement: 'none', description: 'Platforms leveraging WebAssembly for portable, sandboxed execution of server-side workloads. Projects like Fermyon and Wasmer are making WASM a viable server-side runtime.' },
      { id: 41, name: 'Railway', quadrant: 'Platforms', ring: 'Assess', movement: 'new', description: 'A modern PaaS that simplifies deployment of web applications and services. Railway offers an intuitive interface for managing databases, cron jobs, and background workers.' },
      { id: 42, name: 'Pulumi', quadrant: 'Platforms', ring: 'Assess', movement: 'none', description: 'Infrastructure as code using general-purpose programming languages instead of DSLs. Pulumi enables teams to use TypeScript, Python, Go or C# for infrastructure definition with full IDE support.' },
      { id: 43, name: 'Humanitec', quadrant: 'Platforms', ring: 'Assess', movement: 'new', description: 'A platform orchestrator that helps teams build internal developer platforms. Humanitec manages dynamic configuration and resource provisioning based on developer intent.' },

      { id: 44, name: 'OpenShift', quadrant: 'Platforms', ring: 'Assess', movement: 'none', description: 'Red Hat enterprise Kubernetes platform with additional security, monitoring, and developer tools. Suitable for organizations requiring enterprise support and compliance features.' },
      { id: 45, name: 'Dagger', quadrant: 'Platforms', ring: 'Assess', movement: 'none', description: 'A programmable CI/CD engine that runs pipelines in containers. Dagger enables developers to write CI/CD pipelines in their preferred language and run them anywhere.' },

      { id: 46, name: 'HashiCorp Nomad', quadrant: 'Platforms', ring: 'Assess', movement: 'none', description: 'A simpler alternative to Kubernetes for workload orchestration. Nomad is worth considering for teams that find Kubernetes too complex for their needs.' },
      { id: 47, name: 'Rancher', quadrant: 'Platforms', ring: 'Assess', movement: 'none', description: 'Multi-cluster Kubernetes management platform. Useful for organizations managing multiple Kubernetes clusters across different environments and cloud providers.' },

      // === Tools ===
      { id: 48, name: 'Terraform', quadrant: 'Tools', ring: 'Adopt', movement: 'none', description: 'Terraform remains the most widely adopted infrastructure-as-code tool. Despite licensing changes, its ecosystem of providers and modules makes it a pragmatic choice for multi-cloud infrastructure management.' },
      { id: 49, name: 'GitHub Copilot', quadrant: 'Tools', ring: 'Adopt', movement: 'moved', description: 'GitHub Copilot has become an essential developer productivity tool. Teams report significant time savings on boilerplate code, test generation, and code exploration. Best results come from developers who critically review suggestions.' },
      { id: 50, name: 'Playwright', quadrant: 'Tools', ring: 'Adopt', movement: 'none', description: 'Playwright has emerged as the preferred end-to-end testing framework, offering cross-browser support, auto-waiting, and excellent developer experience. Its test generator and trace viewer significantly accelerate test development.' },

      { id: 51, name: 'Grafana & Prometheus', quadrant: 'Tools', ring: 'Adopt', movement: 'none', description: 'The Grafana/Prometheus stack remains the go-to open-source observability solution. With Grafana expanding into logs (Loki) and traces (Tempo), it provides a unified observability platform.' },
      { id: 52, name: 'OpenTelemetry', quadrant: 'Tools', ring: 'Adopt', movement: 'moved', description: 'OpenTelemetry has become the standard for instrumentation, providing vendor-neutral APIs and SDKs for traces, metrics, and logs. Its wide adoption across the industry makes it a safe investment.' },
      { id: 53, name: 'ArgoCD', quadrant: 'Tools', ring: 'Adopt', movement: 'none', description: 'ArgoCD is the leading GitOps continuous delivery tool for Kubernetes. It declaratively manages application deployments and provides automatic drift detection and self-healing capabilities.' },

      { id: 54, name: 'Cursor', quadrant: 'Tools', ring: 'Trial', movement: 'new', description: 'An AI-first code editor built on VS Code that integrates LLMs deeply into the editing experience. Cursor provides inline code generation, multi-file editing, and codebase-aware chat that teams find significantly accelerates development.' },
      { id: 55, name: 'Langfuse', quadrant: 'Tools', ring: 'Trial', movement: 'new', description: 'An open-source LLM observability platform for tracing, evaluating, and monitoring LLM applications. Langfuse helps teams understand model behavior, track costs, and debug prompt chains in production.' },
      { id: 56, name: 'Ollama', quadrant: 'Tools', ring: 'Trial', movement: 'new', description: 'A tool for running large language models locally. Ollama simplifies model management and provides an OpenAI-compatible API, making it easy to develop and test LLM applications without cloud dependencies.' },
      { id: 57, name: 'Claude Code / Aider', quadrant: 'Tools', ring: 'Trial', movement: 'new', description: 'Terminal-based AI coding assistants that work with your codebase through the command line. These tools excel at larger refactoring tasks and multi-file changes that IDE-based assistants struggle with.' },

      { id: 58, name: 'DuckDB', quadrant: 'Tools', ring: 'Trial', movement: 'none', description: 'An in-process analytical database that excels at OLAP queries on local data. DuckDB is ideal for data exploration, ETL pipelines, and replacing Pandas for large dataset operations.' },
      { id: 59, name: 'Trivy', quadrant: 'Tools', ring: 'Trial', movement: 'none', description: 'A comprehensive security scanner for containers, file systems, git repositories, and Kubernetes clusters. Trivy detects vulnerabilities, misconfigurations, and secrets with minimal setup.' },
      { id: 60, name: 'k6', quadrant: 'Tools', ring: 'Trial', movement: 'none', description: 'A modern load testing tool that uses JavaScript for test scripts. k6 provides excellent developer experience and integrates well with CI/CD pipelines for continuous performance testing.' },
      { id: 61, name: 'Renovate', quadrant: 'Tools', ring: 'Trial', movement: 'none', description: 'Automated dependency update tool that creates pull requests for outdated dependencies. Renovate flexible configuration and grouping capabilities make it preferred over Dependabot for complex monorepos.' },

      { id: 62, name: 'Warp Terminal', quadrant: 'Tools', ring: 'Trial', movement: 'new', description: 'A GPU-accelerated terminal with AI-powered command suggestions, collaborative features, and modern UI. Warp reimagines the terminal experience for modern development workflows.' },
      { id: 63, name: 'Mise (formerly rtx)', quadrant: 'Tools', ring: 'Trial', movement: 'new', description: 'A polyglot runtime manager that replaces nvm, pyenv, rbenv, and similar tools. Mise provides a unified interface for managing multiple language runtimes and tools.' },
      { id: 64, name: 'Bruno', quadrant: 'Tools', ring: 'Trial', movement: 'new', description: 'An open-source API client that stores collections in plain text files, making them version-controllable. Bruno is a Git-friendly alternative to Postman.' },
      { id: 65, name: 'Turborepo', quadrant: 'Tools', ring: 'Trial', movement: 'none', description: 'A high-performance build system for JavaScript and TypeScript monorepos. Turborepo provides remote caching and intelligent task scheduling that significantly speeds up CI builds.' },

      { id: 66, name: 'Weights & Biases', quadrant: 'Tools', ring: 'Trial', movement: 'none', description: 'ML experiment tracking and model management platform. W&B helps teams log, compare, and reproduce ML experiments with rich visualization and collaboration features.' },
      { id: 67, name: 'Semgrep', quadrant: 'Tools', ring: 'Trial', movement: 'none', description: 'A static analysis tool that lets developers write custom rules using a pattern-matching syntax similar to the source code. Excellent for enforcing coding standards and catching security issues.' },

      { id: 68, name: 'Zed Editor', quadrant: 'Tools', ring: 'Assess', movement: 'new', description: 'A high-performance code editor built in Rust with native AI integration and real-time collaboration. Zed is worth evaluating as a lightweight alternative to VS Code.' },
      { id: 69, name: 'Devcontainers', quadrant: 'Tools', ring: 'Assess', movement: 'none', description: 'Standardized development environments defined in configuration files. Devcontainers ensure consistent tooling across team members and work with VS Code, GitHub Codespaces, and other tools.' },
      { id: 70, name: 'Pkl (Apple Config Language)', quadrant: 'Tools', ring: 'Assess', movement: 'new', description: 'A configuration language from Apple designed to be safe, readable, and programmable. Pkl generates JSON, YAML, and property lists with validation and IDE support.' },

      { id: 71, name: 'Continue.dev', quadrant: 'Tools', ring: 'Assess', movement: 'new', description: 'An open-source AI coding assistant that connects to any LLM. Continue provides an alternative to GitHub Copilot with the flexibility to use self-hosted or different commercial models.' },
      { id: 72, name: 'Oxlint', quadrant: 'Tools', ring: 'Assess', movement: 'new', description: 'A JavaScript/TypeScript linter written in Rust that is significantly faster than ESLint. While the rule coverage is still growing, the performance improvement is substantial for large codebases.' },

      // === Languages & Frameworks ===
      { id: 73, name: 'TypeScript', quadrant: 'Languages & Frameworks', ring: 'Adopt', movement: 'none', description: 'TypeScript continues to be the standard for typed JavaScript development. The type system improvements in recent versions and the ecosystem maturity make it an easy recommendation for any JavaScript project.' },
      { id: 74, name: 'React', quadrant: 'Languages & Frameworks', ring: 'Adopt', movement: 'none', description: 'React remains the most widely adopted UI library. With Server Components and the continued evolution of the ecosystem, React provides a solid foundation for building complex user interfaces.' },
      { id: 75, name: 'Next.js', quadrant: 'Languages & Frameworks', ring: 'Adopt', movement: 'none', description: 'Next.js has become the default React framework, offering server-side rendering, static generation, and the new App Router with Server Components. Its developer experience and performance optimizations make it a strong choice.' },
      { id: 76, name: 'FastAPI', quadrant: 'Languages & Frameworks', ring: 'Adopt', movement: 'none', description: 'FastAPI has become the go-to Python web framework for building APIs. Its automatic OpenAPI documentation, type validation via Pydantic, and async support make it excellent for backend services.' },
      { id: 77, name: 'Tailwind CSS', quadrant: 'Languages & Frameworks', ring: 'Adopt', movement: 'none', description: 'Tailwind CSS utility-first approach has proven itself at scale. Teams consistently report faster UI development and easier maintenance compared to traditional CSS approaches.' },

      { id: 78, name: 'LangChain / LangGraph', quadrant: 'Languages & Frameworks', ring: 'Trial', movement: 'moved', description: 'LangChain provides building blocks for LLM-powered applications, while LangGraph enables building stateful multi-agent workflows. The framework has matured significantly but can add unnecessary complexity for simple use cases.' },
      { id: 79, name: 'Rust', quadrant: 'Languages & Frameworks', ring: 'Trial', movement: 'none', description: 'Rust continues to gain traction for systems programming, CLI tools, and performance-critical services. The learning curve is steep, but the safety guarantees and performance benefits are substantial.' },
      { id: 80, name: 'Astro', quadrant: 'Languages & Frameworks', ring: 'Trial', movement: 'none', description: 'A web framework optimized for content-driven websites. Astro ships zero JavaScript by default and supports multiple UI frameworks, making it excellent for blogs, documentation, and marketing sites.' },
      { id: 81, name: 'htmx', quadrant: 'Languages & Frameworks', ring: 'Trial', movement: 'none', description: 'htmx enables dynamic web interfaces by extending HTML with attributes for AJAX, WebSockets, and server-sent events. It offers a simpler alternative to SPA frameworks for many use cases.' },
      { id: 82, name: 'vLLM', quadrant: 'Languages & Frameworks', ring: 'Trial', movement: 'new', description: 'A high-throughput LLM serving engine that uses PagedAttention for efficient memory management. vLLM significantly improves inference throughput compared to naive serving approaches.' },
      { id: 83, name: 'Effect (TypeScript)', quadrant: 'Languages & Frameworks', ring: 'Assess', movement: 'new', description: 'A TypeScript library for building robust, type-safe applications with structured concurrency, error handling, and dependency injection. Effect brings functional programming patterns to mainstream TypeScript.' },
      { id: 84, name: 'Bun', quadrant: 'Languages & Frameworks', ring: 'Assess', movement: 'none', description: 'An all-in-one JavaScript runtime, bundler, and package manager. Bun aims to be a faster drop-in replacement for Node.js, though ecosystem compatibility gaps remain.' },

      { id: 85, name: 'Fastify', quadrant: 'Languages & Frameworks', ring: 'Adopt', movement: 'none', description: 'A fast and low-overhead web framework for Node.js. Fastify provides excellent performance, a powerful plugin system, and first-class TypeScript support that makes it a strong alternative to Express.' },
      { id: 86, name: 'Spring Boot', quadrant: 'Languages & Frameworks', ring: 'Adopt', movement: 'none', description: 'Spring Boot remains the dominant Java framework for building production applications. Its auto-configuration, extensive ecosystem, and native image support via GraalVM make it a reliable choice.' },

      { id: 87, name: 'Svelte / SvelteKit', quadrant: 'Languages & Frameworks', ring: 'Trial', movement: 'none', description: 'Svelte compiles to minimal vanilla JavaScript at build time, resulting in smaller bundles and faster runtime performance. SvelteKit provides a full application framework comparable to Next.js.' },
      { id: 88, name: 'Crossplane', quadrant: 'Languages & Frameworks', ring: 'Trial', movement: 'none', description: 'A Kubernetes-native framework for building cloud infrastructure using Kubernetes APIs. Crossplane enables teams to define and manage cloud resources as Kubernetes custom resources.' },
      { id: 89, name: 'deepeval', quadrant: 'Languages & Frameworks', ring: 'Trial', movement: 'new', description: 'An open-source evaluation framework for LLM applications that provides metrics for hallucination, relevancy, toxicity, and more. Essential for systematic quality assurance of AI-powered features.' },
      { id: 90, name: 'fastMCP', quadrant: 'Languages & Frameworks', ring: 'Trial', movement: 'new', description: 'A Python framework for building Model Context Protocol (MCP) servers that allow AI assistants to interact with external tools and data sources. fastMCP simplifies creating tool integrations for LLM applications.' },
      { id: 91, name: 'LiteLLM', quadrant: 'Languages & Frameworks', ring: 'Trial', movement: 'none', description: 'LiteLLM is a SDK that provides seamless integration with multiple LLM providers through a standardized OpenAI API format. It supports a wide range of providers and models, offering a unified interface for text completion, embeddings and image generation.' },

      { id: 92, name: 'Deno', quadrant: 'Languages & Frameworks', ring: 'Trial', movement: 'none', description: 'Deno has improved Node.js compatibility significantly and provides built-in TypeScript support, security-first design, and modern web standard APIs. Worth evaluating for new server-side JavaScript projects.' },
      { id: 93, name: 'Kotlin Multiplatform', quadrant: 'Languages & Frameworks', ring: 'Trial', movement: 'none', description: 'Kotlin Multiplatform enables sharing business logic across Android, iOS, web, and server platforms from a single codebase. The technology has reached stable status and is seeing growing adoption.' },
      { id: 94, name: 'Zig', quadrant: 'Languages & Frameworks', ring: 'Assess', movement: 'none', description: 'A systems programming language designed as a better C. Zig offers manual memory management, compile-time execution, and seamless C interop without hidden control flow or allocations.' },
      { id: 95, name: 'Gleam', quadrant: 'Languages & Frameworks', ring: 'Assess', movement: 'new', description: 'A type-safe functional language that runs on the BEAM (Erlang VM). Gleam combines Erlang/OTP reliability with modern developer experience including a friendly type system and excellent tooling.' },
      { id: 96, name: 'WGSL (WebGPU Shading)', quadrant: 'Languages & Frameworks', ring: 'Assess', movement: 'new', description: 'The shading language for WebGPU, enabling GPU compute and graphics on the web. As WebGPU gains browser support, WGSL becomes relevant for high-performance web applications and AI inference in the browser.' },
    ];

    return data.map((item) => {
      const id = Number(item.id) || 0;
      const index = ((id - 1) % QUADRANTS.length + QUADRANTS.length) % QUADRANTS.length;
      const score = item.score;
      return { ...item, quadrant: QUADRANTS[index], score };
    });
  }

  /**
   * Generate sample Excel file and trigger download.
   */
  function generateSampleExcel() {
    const data = getSampleData();
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Radar');
    XLSX.writeFile(wb, 'tech-radar-sample.xlsx');
  }

  /**
   * Export the current radar data to an Excel file.
   */
  function exportExcel(items, filename = 'opensource-radar.xlsx') {
    const data = Array.isArray(items) ? items : [];
    const rows = data.map((item) => ({
      id: item.id ?? '',
      name: item.name ?? '',
      quadrant: item.quadrant ?? '',
      ring: item.ring ?? '',
      movement: item.movement ?? '',
      score: item.score ?? '',
      description: item.description ?? '',
      'community update': item.communityUpdate ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Radar');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 0);
  }

  return {
    QUADRANTS,
    RINGS,
    QUADRANT_COLORS,
    QUADRANT_KEYS,
    parseExcel,
    parseCSV,
    parseFile,
    getSampleData,
    generateSampleExcel,
    exportExcel,
  };
})();
