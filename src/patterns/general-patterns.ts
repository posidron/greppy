import { PatternConfig } from "../models/types";

/**
 * General security patterns applicable to most codebases.
 */
export const GENERAL_PATTERNS: PatternConfig[] = [
  // Ripgrep patterns
  {
    name: "Hard-coded Credentials",
    description: "Finds hard-coded passwords and API keys",
    tool: "ripgrep",
    pattern: "(password|api.?key)\\s*=\\s*['\"]([\\w\\W]{5,}?)['\"]",
    severity: "critical",
    supportedFileTypes: ["*"],
    mitigation:
      "Use environment variables, secure vaults, or configuration services for sensitive credentials",
  },
  {
    name: "Debug Print Statements",
    description: "Finds debug print statements that should be removed",
    tool: "ripgrep",
    pattern: "(console\\.log|print|printf|System\\.out\\.print)\\(",
    severity: "info",
    supportedFileTypes: ["*"],
    mitigation:
      "Remove debug statements or replace with proper logging that can be configured at runtime",
  },
  {
    name: "Insecure Functions",
    description: "Detects usage of insecure functions",
    tool: "ripgrep",
    pattern: "(eval|exec)\\(",
    severity: "critical",
    supportedFileTypes: ["*"],
    mitigation:
      "Avoid dynamic code execution or use safer alternatives with strict input validation",
  },
];
