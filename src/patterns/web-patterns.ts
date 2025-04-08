import { PatternConfig } from "../models/types";

// Web file extensions - expanded to include modern framework files and build artifacts
const WEB_FILE_TYPES = [
  // JavaScript/TypeScript
  "js",
  "ts",
  "jsx",
  "tsx",
  "mjs", // ES modules
  "cjs", // CommonJS modules
  "d.ts", // TypeScript declaration files

  // Markup/Template
  "html",
  "htm",
  "xhtml",
  "php",
  "vue",
  "svelte",
  "astro", // Astro components
  "mdx", // Markdown with JSX
  "hbs", // Handlebars
  "ejs", // Embedded JavaScript templates
  "pug", // Pug templates
  "njk", // Nunjucks templates

  // Styling
  "css",
  "scss",
  "sass",
  "less",
  "styl", // Stylus
  "pcss", // PostCSS

  // Modern frameworks
  "solid", // SolidJS
  "qwik", // Qwik framework
  "lit", // Lit elements
  "wc", // Web Components

  // Config files that may contain security settings
  "json",
  "yaml",
  "yml",
  "toml",
];

const JS_FILE_TYPES = [
  "js",
  "ts",
  "jsx",
  "tsx",
  "mjs",
  "cjs",
  "vue",
  "svelte",
  "astro",
  "solid",
  "qwik",
  "lit",
  "wc",
];

const MARKUP_FILE_TYPES = [
  "html",
  "htm",
  "xhtml",
  "php",
  "vue",
  "svelte",
  "astro",
  "mdx",
  "jsx",
  "tsx",
  "hbs",
  "ejs",
  "pug",
  "njk",
  "solid",
  "qwik",
  "lit",
  "wc",
];

const STYLE_FILE_TYPES = ["css", "scss", "sass", "less", "styl", "pcss"];

const CONFIG_FILE_TYPES = ["json", "yaml", "yml", "toml"];

/**
 * Advanced security patterns for modern web applications (2025).
 * Covers client-side, server-side, API, and modern framework vulnerabilities.
 */
export const WEB_PATTERNS: PatternConfig[] = [
  // === Client-Side Security ===
  {
    name: "DOM-Based XSS Vulnerabilities",
    description:
      "Identifies potentially unsafe DOM manipulation that could lead to XSS",
    tool: "ripgrep",
    pattern:
      "(innerHTML|outerHTML|document\\.write\\(|insertAdjacentHTML|eval\\(|new\\s+Function\\(|setTimeout\\([^,)]*(?:\\$|`|\"|'))|setInterval\\([^,)]*(?:\\$|`|\"|'))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Use safe DOM APIs like textContent, createElement, or framework-specific sanitization. For dynamic execution, use CSP and trusted types.",
  },
  {
    name: "Modern Framework XSS Vectors",
    description: "Detects unsafe binding patterns in modern frameworks",
    tool: "ripgrep",
    pattern:
      "(v-html|\\[innerHTML\\]|dangerouslySetInnerHTML|\\{\\{\\{|@html|\\<\\!--\\s*\\[CDATA\\[|\\<portal|isHTML|trusted-html|html=)",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: [...JS_FILE_TYPES, ...MARKUP_FILE_TYPES],
    mitigation:
      "Use framework-specific sanitization or escape mechanisms; avoid rendering raw HTML from untrusted sources.",
  },
  {
    name: "Third-Party Script Integrity Issues",
    description:
      "Finds script tags without integrity or with weak integrity attributes",
    tool: "ripgrep",
    pattern:
      "<script[^>]*src=[^>]*(?:(?:integrity=[\"'](?:sha[^\"']*)[\"'].*crossorigin=[\"']anonymous[\"'])|(?:!integrity))",
    options: ["--pcre2"],
    severity: "warning",
    supportedFileTypes: MARKUP_FILE_TYPES,
    mitigation:
      "Add Subresource Integrity (SRI) attributes with strong hash algorithms (SHA-384+) to all third-party scripts.",
  },
  {
    name: "Content Security Policy Weaknesses",
    description:
      "Detects problematic CSP configurations including missing directives and unsafe sources",
    tool: "ripgrep",
    pattern:
      "Content-Security-Policy[^;]*(unsafe-inline|unsafe-eval|unsafe-hashes|data:|blob:|wasm-unsafe-eval|\\*)(?!-report-only)",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: [
      ...MARKUP_FILE_TYPES,
      ...JS_FILE_TYPES,
      ...CONFIG_FILE_TYPES,
    ],
    mitigation:
      "Implement strict CSP with nonces or hashes, avoid unsafe-* directives, and use CSP Level 3 features like strict-dynamic.",
  },
  {
    name: "Missing Security Headers",
    description:
      "Identifies missing crucial security headers in HTTP responses or configurations",
    tool: "ripgrep",
    pattern:
      "(?:app\\.use|router\\.use|response\\.setHeader|headers:|http:|helmet\\.|security:|nginx\\.conf|httpd\\.conf)(?!.*?X-Content-Type-Options|.*?X-Frame-Options|.*?Strict-Transport-Security|.*?Permissions-Policy|.*?Content-Security-Policy)",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: [...JS_FILE_TYPES, ...CONFIG_FILE_TYPES],
    mitigation:
      "Implement all recommended security headers: HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy.",
  },
  {
    name: "Weak CORS Configuration",
    description:
      "Detects permissive CORS settings that could enable cross-origin attacks",
    tool: "ripgrep",
    pattern:
      "(Access-Control-Allow-Origin:\\s*\\*|cors\\(\\{\\s*origin:\\s*(['\"]\\*['\"]|true)\\s*\\}\\))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: [...JS_FILE_TYPES, ...CONFIG_FILE_TYPES],
    mitigation:
      "Restrict CORS to specific trusted origins instead of using wildcards, and implement proper CORS preflight validation.",
  },

  // === Authentication & Authorization ===
  {
    name: "Insecure Authentication Patterns",
    description:
      "Finds authentication implementations with potential security flaws",
    tool: "ripgrep",
    pattern:
      "((?:password|credential|token|secret)\\s*(?:==|===|!=|!==))|(?:auth.*?(?:md5|sha1)\\()|(?:basicAuth\\()|(?:\\.compare\\(.*?password)",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Use timing-safe comparisons for credentials, modern password hashing algorithms (Argon2id), and implement multi-factor authentication.",
  },
  {
    name: "JWT Security Issues",
    description: "Detects insecure JWT implementation patterns",
    tool: "ripgrep",
    pattern:
      "(jwt\\.sign\\([^,]*,\\s*[^,]*,\\s*\\{\\s*(?!.*?algorithm))|(?:alg[\"']?\\s*:\\s*[\"'](?:none|HS256)[\"'])|(?:jwt\\.decode\\(.*?\\{\\s*(?!.*?complete:\\s*true))|(?:jwt\\.verify\\(.*?(?:RS256|HS256))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Use strong algorithms (ES256/ES384), validate all claims, explicitly specify algorithms, and implement proper key rotation.",
  },
  {
    name: "Missing Authorization Checks",
    description:
      "Identifies routes or API endpoints with potentially missing authorization validation",
    tool: "ripgrep",
    pattern:
      "(\\.(?:get|post|put|delete|patch)\\([\"']\\/?(?:api|v\\d+|admin|user|account|profile|settings|dashboard).*?\\)\\s*,\\s*(?!.*?(?:auth|isAuthenticated|isAuthorized|verify|protect|requireLogin|checkPermission)).*?=>)",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Implement consistent authorization middleware for all sensitive routes and APIs; use role-based or attribute-based access control.",
  },
  {
    name: "Insecure Session Management",
    description: "Detects weak session configuration patterns",
    tool: "ripgrep",
    pattern:
      "(session\\(\\{(?!.*?secure:.*?true).*?\\}\\)|session\\(\\{(?!.*?httpOnly:.*?true).*?\\}\\)|session\\(\\{(?!.*?sameSite:.*?(?:'strict'|\"strict\"|'lax'|\"lax\")).*?\\}\\))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Configure sessions with secure, httpOnly, and sameSite attributes; implement proper session expiration and rotation.",
  },
  {
    name: "OAuth/OIDC Implementation Flaws",
    description:
      "Identifies potential security issues in OAuth or OpenID Connect implementations",
    tool: "ripgrep",
    pattern:
      "(oauth|openid|OIDC|passport).*?((?!state:).*?redirect_uri|(?!nonce).*?id_token|implicit\\s+grant)",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Always validate state parameters, use PKCE for mobile/SPA apps, implement proper nonce validation, and prefer authorization code flow.",
  },

  // === Injection Vulnerabilities ===
  {
    name: "SQL Injection Vectors",
    description:
      "Identifies potential SQL injection vulnerabilities in database queries",
    tool: "ripgrep",
    pattern:
      "((?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\\s+.*?\\$\\{|(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\\s+.*?\\+\\s*[\"']|(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\\s+.*?\\$\\d+.*?(?!parameterized|prepared)|\\$\\(.*?\\).*?(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Use parameterized queries, prepared statements, or ORM query builders with proper parameter binding.",
  },
  {
    name: "NoSQL Injection Vulnerabilities",
    description: "Detects patterns that could lead to NoSQL injection attacks",
    tool: "ripgrep",
    pattern:
      "(\\$where\\s*:\\s*[\"']function|\\{\\s*\\$(?:regex|where).*?\\$(?:req|param|query|body)|\\$\\{.*?\\}.*?\\$(?:eq|ne|gt|lt|in|nin|and|or|not)|find\\(\\{[^}]*?\\$\\{)",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Validate and sanitize user inputs, use type checking, avoid using operators like $where with user input, and implement proper data filters.",
  },
  {
    name: "GraphQL Injection Risks",
    description: "Identifies potential GraphQL injection vulnerabilities",
    tool: "ripgrep",
    pattern:
      "(gql`.*?\\$\\{|graphql\\([\"'].*?\\$\\{|makeExecutableSchema\\(.*?(?!depthLimit|validationRules))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Implement query depth limiting, amount limiting, query cost analysis, and proper input validation for GraphQL operations.",
  },
  {
    name: "Command Injection Vulnerabilities",
    description: "Detects patterns that could allow command injection",
    tool: "ripgrep",
    pattern:
      "((?:exec|spawn|execFile|execSync|spawnSync)\\([^,]*(?:\\$\\{|\\+|\\`|(?:req|res)\\.|user\\.))|(?:child_process|shelljs|execa).*?(\\$\\{|\\+\\s*[\"']|\\`.*?\\$\\{)|(?:eval\\(.*?(?:req|res)\\.))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Avoid executing system commands with user input; if necessary, use allow-lists for command arguments and proper input validation.",
  },
  {
    name: "Path Traversal Vulnerabilities",
    description: "Identifies potential path traversal attack vectors",
    tool: "ripgrep",
    pattern:
      "((?:fs|path)\\.[^(]*\\([^)]*(?:\\$\\{|req\\.|res\\.|user\\.)|(?:\\.\\.\\/|\\.\\\\|\\\\\\.\\\\\\.|\\/\\.\\.|\\.\\.\\/|%2e%2e%2f|%252e%252e%252f)|(?:(?:read|write)(?:File|JSON|dir)|appendFile|createReadStream|createWriteStream)\\([^)]*(?:\\$\\{|req\\.|res\\.|user\\.))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Use path.resolve() with a fixed base directory, validate and sanitize file paths, and implement proper access controls for file operations.",
  },
  {
    name: "Server-Side Template Injection",
    description:
      "Detects potential server-side template injection vulnerabilities",
    tool: "ripgrep",
    pattern:
      "((?:compile|render|template|evaluate)\\([^)]*(?:\\$\\{|req\\.|res\\.|user\\.)|(?:ejs|pug|handlebars|nunjucks|dot|template|lodash\\.template).*?(?:compile|render|template|evaluate)\\([^)]*(?:\\$\\{|req\\.|res\\.|user\\.))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Separate templates from user input, use template systems with strict sandboxing, and avoid rendering templates constructed from user input.",
  },

  // === Client-Side Vulnerabilities ===
  {
    name: "CSRF Vulnerabilities",
    description: "Detects forms or API patterns vulnerable to CSRF attacks",
    tool: "ripgrep",
    pattern:
      "(<form[^>]*(?:method=[\"'](?:post|delete|put|patch)[\"'])[^>]*>(?!.*?(?:csrf|token|nonce)))|(\\.(?:post|put|delete|patch)\\([^)]*\\{(?!.*?(?:csrf|token|x-csrf)))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: [...MARKUP_FILE_TYPES, ...JS_FILE_TYPES],
    mitigation:
      "Implement anti-CSRF tokens, use SameSite=Strict cookies, and validate Origin/Referer headers for sensitive operations.",
  },
  {
    name: "Insecure Cookie Configuration",
    description: "Identifies cookies set without proper security attributes",
    tool: "ripgrep",
    pattern:
      "((?:setCookie|set-cookie|document\\.cookie)(?!.*?secure).*?=)|(?:cookie:\\s*\\{(?!.*?secure:.*?true).*?\\})|(?:setCookie|set-cookie|document\\.cookie)(?!.*?httpOnly).*?=|(?:cookie:\\s*\\{(?!.*?httpOnly:.*?true).*?\\})|(?:setCookie|set-cookie|document\\.cookie)(?!.*?sameSite).*?=|(?:cookie:\\s*\\{(?!.*?sameSite).*?\\})",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: [
      ...MARKUP_FILE_TYPES,
      ...JS_FILE_TYPES,
      ...CONFIG_FILE_TYPES,
    ],
    mitigation:
      "Set Secure, HttpOnly, and SameSite=Strict attributes for all sensitive cookies; implement proper cookie prefixes (__Secure-, __Host-).",
  },
  {
    name: "DOM Clobbering Vulnerabilities",
    description: "Detects patterns vulnerable to DOM clobbering attacks",
    tool: "ripgrep",
    pattern:
      "((?:getElementById|querySelector|querySelectorAll)\\([^)]*(?:content|config|settings|options))|(?:window\\[)|(?:document\\[)|(\\[(?:id|name)=[\"'](?:content|config|settings|options)[\"'])",
    options: ["--pcre2"],
    severity: "medium",
    supportedFileTypes: [...JS_FILE_TYPES, ...MARKUP_FILE_TYPES],
    mitigation:
      "Use namespaced properties, avoid accessing DOM elements as properties, and implement proper input validation for DOM selectors.",
  },
  {
    name: "Clickjacking Vulnerabilities",
    description:
      "Identifies potential clickjacking vulnerabilities including missing X-Frame-Options",
    tool: "ripgrep",
    pattern:
      "((?:response\\.header|res\\.set|res\\.header|app\\.use).*?(?!X-Frame-Options|frame-ancestors))|(<(?:iframe|frame)[^>]*>)",
    options: ["--pcre2"],
    severity: "medium",
    supportedFileTypes: [
      ...JS_FILE_TYPES,
      ...MARKUP_FILE_TYPES,
      ...CONFIG_FILE_TYPES,
    ],
    mitigation:
      "Implement X-Frame-Options or CSP frame-ancestors directive to prevent embedding in untrusted sites.",
  },

  // === Modern Web API Security ===
  {
    name: "Insecure WebSockets",
    description: "Detects insecure WebSocket implementation patterns",
    tool: "ripgrep",
    pattern:
      "(new\\s+WebSocket\\([\"']ws://)|(?:WebSocket|ws|socket\\.io).*?(?!origin|auth|verify)|(\\.on\\([\"']connection[\"'],\\s*(?!.*?(?:auth|verify|validate)))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Use secure WebSocket (wss://), implement proper authentication and authorization for WebSocket connections.",
  },
  {
    name: "Web Workers Security Issues",
    description: "Identifies potential security issues with Web Workers",
    tool: "ripgrep",
    pattern:
      "(new\\s+Worker\\((?:eval|\\$\\{)|importScripts\\((?:\\$\\{|\\+|req\\.))",
    options: ["--pcre2"],
    severity: "medium",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Use Content Security Policy with worker-src directive, avoid dynamic worker scripts, and implement proper origin checks.",
  },
  {
    name: "Service Worker Security",
    description: "Detects insecure Service Worker patterns",
    tool: "ripgrep",
    pattern:
      "(navigator\\.serviceWorker\\.register\\([^)]*(?:\\$\\{|\\+|eval))|(\\.fetch\\([^)]*(?:includes\\(|indexOf\\())|(importScripts\\([^)]*(?:\\$\\{|\\+|eval))|(caches\\.match\\([^)]*(?:\\$\\{|\\+|eval))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Implement proper cache controls, use static and trusted script sources, and validate requests in fetch handlers.",
  },
  {
    name: "WebRTC/getUserMedia Privacy Issues",
    description: "Identifies potential privacy issues with media APIs",
    tool: "ripgrep",
    pattern:
      "(getUserMedia|getDisplayMedia|RTCPeerConnection).*?(?!permission|prompt|consent|secure|https)",
    options: ["--pcre2"],
    severity: "medium",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Request minimal necessary permissions, implement proper user consent workflows, and ensure secure connections for media streaming.",
  },

  // === Modern Framework Security ===
  {
    name: "React Vulnerability Patterns",
    description: "Detects common security anti-patterns in React applications",
    tool: "ripgrep",
    pattern:
      "(dangerouslySetInnerHTML\\s*=\\s*\\{\\s*\\{\\s*__html\\s*:\\s*(?!`|[\"']))|((?:setState|useState)\\(.*?(?:location\\.(?:search|hash|href)|localStorage|sessionStorage))|(\\.(?:post|put|delete|patch)\\(.*?(?:withCredentials\\s*:\\s*true)(?!.*?(?:csrf|token)))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: ["js", "jsx", "ts", "tsx"],
    mitigation:
      "Use React's built-in protection mechanisms, implement proper sanitization for dynamic content, and use framework-specific security hooks.",
  },
  {
    name: "Vue.js Security Issues",
    description: "Identifies security vulnerabilities in Vue.js applications",
    tool: "ripgrep",
    pattern:
      "(v-html\\s*=\\s*[\"'](?!`|[\"']))|(\\.(?:split|replace|match)\\(.*?(?:location\\.(?:search|hash|href)))|(<component\\s+:is\\s*=\\s*[\"'].*?(?:\\$\\{|\\+|user\\.))|(Vue\\.prototype\\.\\$http\\.(?:post|put|delete|patch)\\(.*?(?!token|csrf))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: ["js", "vue"],
    mitigation:
      "Avoid v-html with untrusted content, properly sanitize dynamic component names, and use Vue's security features like v-bind directives.",
  },
  {
    name: "Angular Security Vulnerabilities",
    description: "Detects security issues in Angular applications",
    tool: "ripgrep",
    pattern:
      "(\\[innerHtml\\]\\s*=\\s*[\"'](?!`|[\"']))|(\\.(?:bypassSecurityTrustHtml|bypassSecurityTrustScript|bypassSecurityTrustStyle|bypassSecurityTrustUrl|bypassSecurityTrustResourceUrl)\\()|(private\\s+sanitizer\\s*:\\s*DomSanitizer).*?(this\\.sanitizer\\.bypassSecurity)",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: ["ts", "html"],
    mitigation:
      "Avoid bypassing Angular's built-in sanitization, use Angular's security context-aware binding syntax, and leverage @angular/platform-browser's sanitization.",
  },

  // === Supply Chain Security ===
  {
    name: "Dependency Confusion Vulnerabilities",
    description:
      "Identifies patterns that could lead to dependency confusion attacks",
    tool: "ripgrep",
    pattern:
      '("dependencies":\\s*\\{[^}]*"@(?:company|internal|private)\\/|"name":\\s*"@(?:company|internal|private)\\/)',
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: ["json", "pkg"],
    mitigation:
      "Use private package registries with scope access controls, implement checksum verification, and use dependency locking.",
  },
  {
    name: "Insecure Package Usage",
    description: "Detects usage of known vulnerable or deprecated packages",
    tool: "ripgrep",
    pattern:
      '("(?:dependencies|devDependencies|peerDependencies)":\\s*\\{[^}]*"(?:serialize-javascript|lodash|jquery|moment|bootstrap|handlebars|angular|react-dom|express|axios)":\\s*"(?:0|1|2|3|4|5|6|7|8|9|10))',
    options: ["--pcre2"],
    severity: "medium",
    supportedFileTypes: ["json", "pkg"],
    mitigation:
      "Keep dependencies updated, use dependency scanning tools, and implement automatic vulnerability scanning in CI/CD pipelines.",
  },
  {
    name: "Outdated Polyfills/Shims",
    description: "Identifies usage of outdated or insecure polyfills",
    tool: "ripgrep",
    pattern:
      "(import|require)\\([\"'](?:core-js|@babel/polyfill|es6-promise|whatwg-fetch|promise-polyfill|regenerator-runtime)[\"']\\)",
    options: ["--pcre2"],
    severity: "info",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Use modern runtime polyfills with automatic feature detection, keep polyfills updated to latest versions.",
  },

  // === Security Configuration ===
  {
    name: "Environment Variable Exposure",
    description:
      "Detects potential exposure of sensitive environment variables",
    tool: "ripgrep",
    pattern:
      "(process\\.env\\.(SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL|AUTH)|window\\.API_KEY|const\\s+API_KEY\\s*=\\s*[\"'])",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: [...JS_FILE_TYPES, ...MARKUP_FILE_TYPES],
    mitigation:
      "Use server-side environment variables, implement proper secrets management, and avoid exposing sensitive keys to the client.",
  },
  {
    name: "Insecure HTTPS Configuration",
    description: "Identifies weak TLS/SSL configurations",
    tool: "ripgrep",
    pattern:
      "(https\\.createServer\\(\\{[^}]*(?:TLSv1\\.0|TLSv1\\.1|SSLv3|ciphers:\\s*[\"'][^\"']*(?:DES|RC4|MD5|SHA1|NULL|EXPORT|anon)))|(?:secureProtocol:\\s*[\"'](?:TLSv1_method|TLSv1_1_method|SSLv3_method)[\"'])",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Use TLS 1.3 or TLS 1.2 with secure ciphers, implement proper certificate validation, and use strong key exchange mechanisms.",
  },
  {
    name: "Permissive Access Controls",
    description:
      "Detects overly permissive CORS or access control configurations",
    tool: "ripgrep",
    pattern:
      "(Access-Control-Allow-Origin:\\s*\\*|cors\\(\\{\\s*origin:\\s*[\"']\\*[\"'])|(?:app\\.use\\(cors\\(\\)\\)))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: [...JS_FILE_TYPES, ...CONFIG_FILE_TYPES],
    mitigation:
      "Restrict CORS to specific trusted origins, implement proper preflight checks, and use Access-Control-Allow-Credentials carefully.",
  },
  {
    name: "Weak Crypto Configuration",
    description:
      "Identifies usage of weak cryptographic algorithms or configurations",
    tool: "ripgrep",
    pattern:
      "(crypto\\.createHash\\([\"'](?:md5|sha1)[\"']\\)|crypto\\.createCipher\\(|Crypto\\.(?:AES|DES|TripleDES)\\.encrypt\\(|CryptoJS\\.(?:MD5|SHA1)\\()",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Use modern algorithms (SHA-256/SHA-3, AES-GCM), implement proper key management, and follow cryptographic best practices.",
  },

  // === Weggli patterns ===
  {
    name: "Reflected User Input",
    description: "Identifies user input being reflected to the DOM",
    tool: "weggli",
    pattern: "{ $req = req._; $value = $req._; _($value); }",
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Sanitize all user inputs before reflecting them in the DOM or HTTP responses.",
  },
  {
    name: "Unsafe API Parameter Handling",
    description: "Detects unsafe handling of API parameters",
    tool: "weggli",
    pattern:
      "{ $app._ ('/:$param', function($req, $res) { _($req.params.$param); }); }",
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Validate and sanitize all route parameters before using them in operations.",
  },
  {
    name: "Improper JWT Validation",
    description: "Identifies improper JWT token validation",
    tool: "weggli",
    pattern: "{ jwt.verify($token, $secret, { NOT: algorithms: _; }); }",
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Always specify algorithms explicitly when verifying JWTs to prevent algorithm confusion attacks.",
  },
  {
    name: "Prototype Pollution Risk",
    description: "Detects patterns vulnerable to prototype pollution",
    tool: "weggli",
    pattern:
      "{ Object.assign($target, $source); NOT: if ($source._);  NOT: $source = _($source); }",
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Use Object.create(null) for empty objects, validate object properties, and use defensive programming techniques.",
  },
  {
    name: "Unchecked File Operations",
    description: "Identifies potentially dangerous file operations",
    tool: "weggli",
    pattern:
      "{ $path = $req._; fs._($path); NOT: path.normalize($path); NOT: path.resolve($path); NOT: if (_($path)); }",
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Validate file paths, use path normalization, and implement proper access controls for file operations.",
  },
  {
    name: "Vulnerable Deserialization",
    description: "Detects unsafe deserialization of user-controlled data",
    tool: "weggli",
    pattern:
      "{ $data = $req._; (JSON.parse($data) | eval($data) | deserialize($data) | unserialize($data) | YAML.load($data)); NOT: try { _; } catch (_) { _; } }",
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Use schema validation, implement proper input sanitization, and avoid deserializing untrusted data.",
  },
  {
    name: "Unvalidated Redirects",
    description: "Identifies potential open redirect vulnerabilities",
    tool: "weggli",
    pattern:
      "{ $url = $req._; $res.redirect($url); NOT: if (_($url)); NOT: $url = _($url); }",
    severity: "critical",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Validate redirect URLs against an allowlist, use relative URLs, or implement proper URL validation.",
  },
  {
    name: "Improper Error Handling",
    description:
      "Detects improper error handling that could leak sensitive information",
    tool: "weggli",
    pattern: "{ try { _; } catch ($err) { $res._ ($err); } }",
    severity: "medium",
    supportedFileTypes: JS_FILE_TYPES,
    mitigation:
      "Implement proper error handling with custom error objects, avoid exposing stack traces, and use centralized error handling.",
  },
  {
    name: "React State Pollution",
    description: "Identifies React state being set directly from user input",
    tool: "weggli",
    pattern:
      "{ $input = $event.target.value; this.setState({ $state: $input }); NOT: $input = _($input); }",
    severity: "medium",
    supportedFileTypes: ["js", "jsx", "ts", "tsx"],
    mitigation:
      "Validate and sanitize all user inputs before setting state, implement input validation hooks.",
  },
  {
    name: "Insecure Component Loading",
    description: "Detects dynamic component loading from user input",
    tool: "weggli",
    pattern:
      "{ $component = $props._; return <$component _/>; NOT: if (_($component)); }",
    severity: "critical",
    supportedFileTypes: ["js", "jsx", "ts", "tsx"],
    mitigation:
      "Use a predefined mapping of allowed components instead of directly using user input for component names.",
  },
];
