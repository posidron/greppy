import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import { DEFAULT_PATTERNS } from "../default-config";
import { FindingResult, PatternConfig } from "../models/types";
import { IdService } from "./id-service";

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
   * Check if the required tools are installed based on the patterns.
   *
   * @param patterns The patterns to check tools for
   * @returns Object with results of tool checks
   */
  async checkRequiredTools(patterns: PatternConfig[]): Promise<{
    ripgrepNeeded: boolean;
    weggliNeeded: boolean;
    ripgrepAvailable: boolean;
    weggliAvailable: boolean;
  }> {
    const result = {
      ripgrepNeeded: false,
      weggliNeeded: false,
      ripgrepAvailable: false,
      weggliAvailable: false,
    };

    // Check which tools are needed based on patterns
    for (const pattern of patterns) {
      if (pattern.tool === "ripgrep") {
        result.ripgrepNeeded = true;
      } else if (pattern.tool === "weggli") {
        result.weggliNeeded = true;
      }
    }

    // If no patterns need a specific tool, no need to check
    if (!result.ripgrepNeeded && !result.weggliNeeded) {
      return result;
    }

    try {
      const execa = await this.execaPromise;

      // Check ripgrep availability if needed
      if (result.ripgrepNeeded) {
        const rgPath = vscode.workspace
          .getConfiguration("greppy")
          .get<string>("ripgrepPath", "rg");

        try {
          await execa(rgPath, ["--version"]);
          result.ripgrepAvailable = true;
        } catch (error) {
          result.ripgrepAvailable = false;
          console.error("Ripgrep not available:", error);
        }
      }

      // Check weggli availability if needed
      if (result.weggliNeeded) {
        const weggliPath = vscode.workspace
          .getConfiguration("greppy")
          .get<string>("weggliPath", "weggli");

        try {
          await execa(weggliPath, ["--version"]);
          result.weggliAvailable = true;
        } catch (error) {
          result.weggliAvailable = false;
          console.error("Weggli not available:", error);
        }
      }
    } catch (error) {
      console.error("Error checking tool availability:", error);
    }

    return result;
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

    // Check for required tools
    const toolCheck = await this.checkRequiredTools(patterns);

    // Filter out patterns that require missing tools
    const filteredPatterns = patterns.filter((pattern) => {
      if (pattern.tool === "ripgrep" && !toolCheck.ripgrepAvailable) {
        return false;
      }
      if (pattern.tool === "weggli" && !toolCheck.weggliAvailable) {
        return false;
      }
      return true;
    });

    // If all patterns were filtered out, return early
    if (filteredPatterns.length === 0) {
      return [];
    }

    const allResults: FindingResult[] = [];

    for (const pattern of filteredPatterns) {
      try {
        const results = await this.executePattern(
          pattern,
          workspaceFolder.uri.fsPath
        );

        // Enhance each finding with context and persistent ID
        for (const result of results) {
          const enhancedFinding = await IdService.enhanceFinding(result);
          allResults.push(enhancedFinding);
        }
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

    console.log(
      `GrepService: Executing pattern "${pattern.name}" on workspace "${workspacePath}"`
    );

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

      // Check for specific tool not found errors (ENOENT = file or directory not found)
      if (error.code === "ENOENT") {
        if (pattern.tool === "ripgrep") {
          console.error(
            `Ripgrep not found at configured path. Pattern "${pattern.name}" skipped.`
          );
          throw new Error(
            `Ripgrep executable not found. Please check your ripgrep installation or configure 'greppy.ripgrepPath'.`
          );
        } else if (pattern.tool === "weggli") {
          console.error(
            `Weggli not found at configured path. Pattern "${pattern.name}" skipped.`
          );
          throw new Error(
            `Weggli executable not found. Please check your weggli installation or configure 'greppy.weggliPath'.`
          );
        }
      }

      throw error;
    }

    return results;
  }

  /**
   * Execute a single pattern against a specific file path.
   *
   * @param pattern The pattern configuration
   * @param filePath The path to the specific file to analyze
   * @returns Promise with the search results
   */
  async executePatternOnPath(
    pattern: PatternConfig,
    filePath: string
  ): Promise<FindingResult[]> {
    const results: FindingResult[] = [];
    const timestamp = Date.now();

    // Get file extension
    const fileExtension = filePath.split(".").pop()?.toLowerCase() || "";

    console.log(
      `GrepService: Executing pattern "${pattern.name}" on file "${filePath}" (${fileExtension})`
    );

    // Simple compatibility check for weggli (it only works on C/C++ files)
    if (pattern.tool === "weggli") {
      const supportedWeggli = [
        "c",
        "cpp",
        "h",
        "hpp",
        "cc",
        "cxx",
        "c++",
        "hxx",
        "h++",
      ];
      if (!supportedWeggli.includes(fileExtension)) {
        console.log(
          `GrepService: Skipping weggli pattern on non-C/C++ file (${fileExtension})`
        );
        return [];
      }
    }

    // Check file type compatibility with pattern
    if (pattern.supportedFileTypes && pattern.supportedFileTypes.length > 0) {
      // Skip if pattern doesn't support this file type and doesn't have a wildcard
      if (
        !pattern.supportedFileTypes.includes("*") &&
        !pattern.supportedFileTypes.includes(fileExtension)
      ) {
        console.log(
          `GrepService: Pattern ${pattern.name} doesn't support .${fileExtension} files, skipping`
        );
        return [];
      }
    }

    try {
      // Get the execa function instance
      const execa = await this.execaPromise;

      if (pattern.tool === "ripgrep") {
        const rgPath = vscode.workspace
          .getConfiguration("greppy")
          .get<string>("ripgrepPath", "rg");

        // Build command args specifically for this file
        const args = [
          "--line-number",
          "--no-heading",
          "--color",
          "never",
          ...(pattern.options || []),
          pattern.pattern,
          filePath, // Directly target the specific file
        ];

        // Execute ripgrep
        try {
          console.log(
            `GrepService: Running command: ${rgPath} ${args.join(" ")}`
          );
          const { stdout } = await execa(rgPath, args);
          // Parse the output
          results.push(...this.parseRipgrepOutput(stdout, pattern, timestamp));
        } catch (error: any) {
          // Handle expected errors like "no matches found"
          if (error.exitCode === 1 && error.stderr === "") {
            // No matches found is not an error for grep tools
            return [];
          }

          // Display more information about the error but don't throw
          console.error(`Error running ripgrep on ${filePath}:`, error);
          return []; // Return empty results to avoid breaking the auto-scan
        }
      } else if (pattern.tool === "weggli") {
        const weggliPath = vscode.workspace
          .getConfiguration("greppy")
          .get<string>("weggliPath", "weggli");

        // Build command args specifically for this file
        const args = [
          ...(pattern.options || []),
          pattern.pattern,
          filePath, // Directly target the specific file
        ];

        // Execute weggli
        try {
          console.log(
            `GrepService: Running command: ${weggliPath} ${args.join(" ")}`
          );
          const { stdout } = await execa(weggliPath, args);
          // Parse the output
          results.push(...this.parseWeggliOutput(stdout, pattern, timestamp));
        } catch (error: any) {
          // Handle expected errors like "no matches found"
          if (error.exitCode === 1 && error.stderr === "") {
            // No matches found is not an error for weggli
            return [];
          }

          // Display more information about the error but don't throw
          console.error(`Error running weggli on ${filePath}:`, error);
          return []; // Return empty results to avoid breaking the auto-scan
        }
      }
    } catch (error: any) {
      // Check for specific tool not found errors (ENOENT = file or directory not found)
      if (error.code === "ENOENT") {
        console.error(`Tool not found when analyzing ${filePath}`);
        return []; // Return empty results instead of throwing
      }
      console.error(`Error executing pattern on path ${filePath}:`, error);
      return []; // Return empty results to avoid breaking the auto-scan
    }

    if (results.length > 0) {
      console.log(
        `GrepService: Found ${results.length} results for pattern "${pattern.name}" in file "${filePath}"`
      );
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
        id: uuidv4(), // We still need a unique ID for the current session
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
        id: uuidv4(), // We still need a unique ID for the current session
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
