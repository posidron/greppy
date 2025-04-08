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
  },
  {
    name: "Debug Print Statements",
    description: "Finds debug print statements that should be removed",
    tool: "ripgrep",
    pattern: "(console\\.log|print|printf|System\\.out\\.print)\\(",
    severity: "info",
    supportedFileTypes: ["*"],
  },
  {
    name: "Insecure Functions",
    description: "Detects usage of insecure functions",
    tool: "ripgrep",
    pattern: "(eval|exec)\\(",
    severity: "critical",
    supportedFileTypes: ["*"],
  },
];
