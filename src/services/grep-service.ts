import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import { DEFAULT_PATTERNS } from "../default-config";
import { FindingResult, PatternConfig } from "../models/types";

// We'll use dynamic import for execa
type ExecaFn = (
  file: string,
  args?: readonly string[]
) => Promise<{ stdout: string; stderr: string }>;

export class GrepService {
  private execaPromise: Promise<ExecaFn>;

  constructor(private context: vscode.ExtensionContext) {
    // Initialize dynamic import of execa
    this.execaPromise = this.initExeca();
  }

  private async initExeca(): Promise<ExecaFn> {
    try {
      const execaModule = await import("execa");
      return execaModule.execa;
    } catch (error) {
      console.error("Failed to import execa:", error);
      throw new Error("Failed to initialize execa module required for Greppy");
    }
  }

  /**
   * Run analysis using the configured patterns.
   *
   * @param workspaceFolder The workspace folder to analyze
   * @param patterns Optional patterns to use instead of those from settings
   * @returns Promise with the analysis results
   */
  async runAnalysis(
    workspaceFolder: vscode.WorkspaceFolder,
    patterns?: PatternConfig[]
  ): Promise<FindingResult[]> {
    // If patterns aren't provided, get them from settings
    if (!patterns) {
      patterns = vscode.workspace
        .getConfiguration("greppy")
        .get<PatternConfig[]>("patterns", []);

      // If still no patterns, use defaults
      if (patterns.length === 0) {
        patterns = DEFAULT_PATTERNS;
      }
    }

    if (patterns.length === 0) {
      vscode.window.showInformationMessage(
        "No patterns configured. Please add patterns in the settings."
      );
      return [];
    }

    const allResults: FindingResult[] = [];

    for (const pattern of patterns) {
      try {
        const results = await this.executePattern(
          pattern,
          workspaceFolder.uri.fsPath
        );
        allResults.push(...results);
      } catch (error) {
        console.error(`Error executing pattern ${pattern.name}:`, error);
        vscode.window.showErrorMessage(
          `Error executing pattern ${pattern.name}: ${error}`
        );
      }
    }

    return allResults;
  }

  /**
   * Execute a single pattern against the workspace.
   *
   * @param pattern The pattern configuration
   * @param workspacePath The path to the workspace folder
   * @returns Promise with the search results
   */
  private async executePattern(
    pattern: PatternConfig,
    workspacePath: string
  ): Promise<FindingResult[]> {
    const results: FindingResult[] = [];
    const timestamp = Date.now();

    try {
      // Get the execa function instance
      const execa = await this.execaPromise;

      if (pattern.tool === "ripgrep") {
        const rgPath = vscode.workspace
          .getConfiguration("greppy")
          .get<string>("ripgrepPath", "rg");

        // Build command args
        const args = [
          "--line-number",
          "--no-heading",
          "--color",
          "never",
          ...(pattern.options || []),
          pattern.pattern,
          workspacePath,
        ];

        // Execute ripgrep
        const { stdout } = await execa(rgPath, args);

        // Parse the output
        results.push(...this.parseRipgrepOutput(stdout, pattern, timestamp));
      } else if (pattern.tool === "weggli") {
        const weggliPath = vscode.workspace
          .getConfiguration("greppy")
          .get<string>("weggliPath", "weggli");

        // Build command args
        const args = [
          ...(pattern.options || []),
          pattern.pattern,
          workspacePath,
        ];

        // Execute weggli
        const { stdout } = await execa(weggliPath, args);

        // Parse the output
        results.push(...this.parseWeggliOutput(stdout, pattern, timestamp));
      }
    } catch (error: any) {
      // Handle expected errors like "no matches found"
      if (error.exitCode === 1 && error.stderr === "") {
        // No matches found is not an error for grep tools
        return [];
      }

      throw error;
    }

    return results;
  }

  /**
   * Get code indicator based on file extension
   *
   * @param filePath The path of the file
   * @returns The code indicator string for the file
   */
  private getCodeIndicator(filePath: string): string {
    const fileExtension = filePath.split(".").pop()?.toLowerCase() || "";

    if (["js", "ts", "jsx", "tsx"].includes(fileExtension)) {
      return "js";
    } else if (["py"].includes(fileExtension)) {
      return "python";
    } else if (["c", "cpp", "h", "hpp"].includes(fileExtension)) {
      return "c";
    } else if (["java"].includes(fileExtension)) {
      return "java";
    } else if (["go"].includes(fileExtension)) {
      return "go";
    } else if (["php"].includes(fileExtension)) {
      return "php";
    } else if (["rb"].includes(fileExtension)) {
      return "ruby";
    } else if (["html", "htm"].includes(fileExtension)) {
      return "html";
    } else if (["css", "scss", "sass", "less"].includes(fileExtension)) {
      return "css";
    } else if (["json"].includes(fileExtension)) {
      return "json";
    } else if (["xml"].includes(fileExtension)) {
      return "xml";
    } else if (["md", "markdown"].includes(fileExtension)) {
      return "markdown";
    } else if (["sh", "bash"].includes(fileExtension)) {
      return "bash";
    } else {
      return fileExtension || "text";
    }
  }

  /**
   * Parse ripgrep output into FindingResult objects.
   *
   * @param output The output from ripgrep
   * @param pattern The pattern configuration
   * @param timestamp The timestamp for the results
   * @returns Array of finding results
   */
  private parseRipgrepOutput(
    output: string,
    pattern: PatternConfig,
    timestamp: number
  ): FindingResult[] {
    const results: FindingResult[] = [];

    if (!output.trim()) {
      return results;
    }

    // Ripgrep output format: file:line:content
    const lines = output.trim().split("\n");

    for (const line of lines) {
      const firstColonIndex = line.indexOf(":");
      if (firstColonIndex === -1) {
        continue;
      }

      const secondColonIndex = line.indexOf(":", firstColonIndex + 1);
      if (secondColonIndex === -1) {
        continue;
      }

      const filePath = line.substring(0, firstColonIndex);
      const lineNumber = parseInt(
        line.substring(firstColonIndex + 1, secondColonIndex),
        10
      );
      const matchedContent = line.substring(secondColonIndex + 1).trim();

      if (isNaN(lineNumber)) {
        continue;
      }

      // Get code indicator based on file extension
      const codeIndicator = this.getCodeIndicator(filePath);

      results.push({
        id: uuidv4(),
        patternName: pattern.name,
        patternDescription: pattern.description,
        tool: pattern.tool,
        severity: pattern.severity,
        filePath,
        lineNumber,
        matchedContent,
        codeIndicator,
        timestamp,
      });
    }

    return results;
  }

  /**
   * Parse weggli output into FindingResult objects.
   *
   * @param output The output from weggli
   * @param pattern The pattern configuration
   * @param timestamp The timestamp for the results
   * @returns Array of finding results
   */
  private parseWeggliOutput(
    output: string,
    pattern: PatternConfig,
    timestamp: number
  ): FindingResult[] {
    const results: FindingResult[] = [];

    if (!output.trim()) {
      return results;
    }

    // Weggli output format is more complex, we'll extract file paths, line numbers and content
    const matches = output.split("====").slice(1); // Split by match separators

    for (const match of matches) {
      // Extract file path and line info
      const fileMatch = match.match(/File: ([^\s]+)/);
      if (!fileMatch) {
        continue;
      }

      const filePath = fileMatch[1];

      // Extract line number - weggli typically shows line numbers like "Line: 45-55"
      const lineMatch = match.match(/Line: (\d+)(?:-\d+)?/);
      if (!lineMatch) {
        continue;
      }

      const lineNumber = parseInt(lineMatch[1], 10);
      if (isNaN(lineNumber)) {
        continue;
      }

      // Extract the matched content - this is a bit more tricky with weggli
      // We'll take the first non-empty line after the header as the content
      const lines = match.split("\n");
      let matchedContent = "";

      for (let i = 3; i < lines.length; i++) {
        const content = lines[i].trim();
        if (content) {
          matchedContent = content;
          break;
        }
      }

      // Get code indicator based on file extension
      const codeIndicator = this.getCodeIndicator(filePath);

      results.push({
        id: uuidv4(),
        patternName: pattern.name,
        patternDescription: pattern.description,
        tool: pattern.tool,
        severity: pattern.severity,
        filePath,
        lineNumber,
        matchedContent,
        codeIndicator,
        timestamp,
      });
    }

    return results;
  }
}
