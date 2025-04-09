import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import { FindingResult, PatternConfig } from "../models/types";
import { COMMON_FILE_TYPES, PatternManager } from "../patterns/pattern-manager";
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
   * Runs a security analysis on the workspace using ripgrep and weggli.
   * @param workspaceFolder The workspace folder to analyze
   * @param patterns Optional list of patterns to use. If not provided, will use the active pattern set.
   * @returns Array of findings
   */
  public async runAnalysis(
    workspaceFolder: vscode.WorkspaceFolder,
    patterns?: PatternConfig[]
  ): Promise<FindingResult[]> {
    // If no patterns were supplied, get them from the pattern manager
    if (!patterns) {
      patterns = PatternManager.getPatterns(this.context);
    }

    // Filter out disabled patterns
    const disabledPatterns = this.context.workspaceState.get<string[]>(
      "greppyDisabledPatterns",
      []
    );
    if (disabledPatterns.length > 0) {
      patterns = patterns.filter(
        (pattern) => !disabledPatterns.includes(pattern.name)
      );
    }

    // Log the active pattern set and number of patterns
    const activeSet = vscode.workspace
      .getConfiguration("greppy")
      .get<string>("activePatternSet", "general");
    console.log(
      `Running security analysis with ${patterns.length} patterns from set "${activeSet}"`
    );

    if (patterns.length === 0) {
      vscode.window.showInformationMessage(
        "No patterns configured. Please add patterns in the settings."
      );
      return [];
    }

    console.log(
      `GrepService: Running analysis on workspace ${workspaceFolder.uri.fsPath} with ${patterns.length} patterns`
    );

    // Check for required tools
    const toolCheck = await this.checkRequiredTools(patterns);

    // Filter out patterns that require missing tools
    const filteredPatterns = patterns.filter((pattern) => {
      if (pattern.tool === "ripgrep" && !toolCheck.ripgrepAvailable) {
        console.log(
          `GrepService: Skipping pattern "${pattern.name}" - ripgrep not available`
        );
        return false;
      }
      if (pattern.tool === "weggli" && !toolCheck.weggliAvailable) {
        console.log(
          `GrepService: Skipping pattern "${pattern.name}" - weggli not available`
        );
        return false;
      }
      return true;
    });

    // If all patterns were filtered out, return early
    if (filteredPatterns.length === 0) {
      console.log("GrepService: No applicable patterns remain after filtering");
      return [];
    }

    console.log(
      `GrepService: Analysis will run with ${filteredPatterns.length} patterns`
    );
    const allResults: FindingResult[] = [];

    for (const pattern of filteredPatterns) {
      try {
        // Before running the pattern, create a file filter to only analyze supported file types
        let fileTypeFilter = "";

        // If pattern has specific supportedFileTypes, use those to filter files
        if (
          pattern.supportedFileTypes &&
          pattern.supportedFileTypes.length > 0
        ) {
          // If wildcard is present, no filtering needed
          if (pattern.supportedFileTypes.includes("*")) {
            fileTypeFilter = "";
          } else {
            // Create glob patterns for each supported file type
            const globArgs = [];
            for (const ext of pattern.supportedFileTypes) {
              globArgs.push("--glob", `*.${ext}`);
            }
            fileTypeFilter = globArgs.join(" ");

            console.log(
              `GrepService: Filtering pattern "${
                pattern.name
              }" to only scan files with extensions: ${pattern.supportedFileTypes.join(
                ", "
              )}`
            );
          }
        } else if (pattern.tool === "weggli") {
          // Special case: weggli only works with C/C++ files
          const globArgs = [];
          for (const ext of COMMON_FILE_TYPES.cpp) {
            globArgs.push("--glob", `*.${ext}`);
          }
          fileTypeFilter = globArgs.join(" ");

          console.log(
            `GrepService: Filtering weggli pattern "${pattern.name}" to only C/C++ files`
          );
        }
        // For patterns without supportedFileTypes, no filtering is applied

        const results = await this.executePattern(
          pattern,
          workspaceFolder.uri.fsPath,
          fileTypeFilter
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
   * @param fileTypeFilter Optional filter to limit search to specific file types
   * @returns Promise with the search results
   */
  private async executePattern(
    pattern: PatternConfig,
    workspacePath: string,
    fileTypeFilter: string = ""
  ): Promise<FindingResult[]> {
    const results: FindingResult[] = [];
    const timestamp = Date.now();

    console.log(
      `GrepService: Executing pattern "${
        pattern.name
      }" on workspace "${workspacePath}"${
        fileTypeFilter ? " with filter " + fileTypeFilter : ""
      }`
    );

    try {
      // Get the execa function instance
      const execa = await this.execaPromise;

      if (pattern.tool === "ripgrep") {
        const rgPath = vscode.workspace
          .getConfiguration("greppy")
          .get<string>("ripgrepPath", "rg");

        // Build command args
        let args = [
          "--line-number",
          "--no-heading",
          "--color",
          "never",
          ...(pattern.options || []),
        ];

        // Add file type filter if specified
        if (fileTypeFilter) {
          // Parse the fileTypeFilter into individual args
          const filterParts = fileTypeFilter.split(" ");
          for (let i = 0; i < filterParts.length; i += 2) {
            if (filterParts[i] && filterParts[i + 1]) {
              args.push(filterParts[i], filterParts[i + 1]);
            }
          }
        }

        // Add the pattern and path
        args = [...args, pattern.pattern, workspacePath];

        // Execute ripgrep
        const { stdout } = await execa(rgPath, args);

        // Parse the output
        results.push(...this.parseRipgrepOutput(stdout, pattern, timestamp));
      } else if (pattern.tool === "weggli") {
        const weggliPath = vscode.workspace
          .getConfiguration("greppy")
          .get<string>("weggliPath", "weggli");

        // For weggli, we need to find C/C++ files to analyze
        // Use ripgrep to find all C/C++ files in the workspace
        const rgPath = vscode.workspace
          .getConfiguration("greppy")
          .get<string>("ripgrepPath", "rg");

        // Build the glob pattern for C/C++ files using COMMON_FILE_TYPES.cpp
        // This ensures we only run weggli on C/C++ files
        const globPatterns = COMMON_FILE_TYPES.cpp.map(
          (ext: string) => `--glob=*.${ext}`
        );

        let cppFiles = [];
        try {
          // Find all C/C++ files
          const { stdout } = await execa(rgPath, [
            "--files",
            ...globPatterns,
            workspacePath,
          ]);

          cppFiles = stdout.split("\n").filter((file) => file.trim() !== "");

          if (cppFiles.length === 0) {
            console.log(
              `GrepService: No C/C++ files found in workspace, skipping weggli pattern "${pattern.name}"`
            );
            return [];
          }

          console.log(
            `GrepService: Found ${cppFiles.length} C/C++ files for weggli pattern "${pattern.name}"`
          );
        } catch (error) {
          console.error(`Error finding C/C++ files for weggli:`, error);
          return [];
        }

        // Process each C/C++ file individually with weggli
        for (const file of cppFiles) {
          try {
            const { stdout } = await execa(weggliPath, [
              ...(pattern.options || []),
              pattern.pattern,
              file,
            ]);

            // Parse the output
            if (stdout.trim()) {
              results.push(
                ...this.parseWeggliOutput(stdout, pattern, timestamp)
              );
            }
          } catch (error: any) {
            // Handle expected errors like "no matches found"
            if (error.exitCode === 1 && error.stderr === "") {
              // No matches found is not an error for weggli
              continue;
            }
            console.error(`Error running weggli on ${file}:`, error);
          }
        }
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

    // Check if pattern is disabled
    const disabledPatterns = this.context.workspaceState.get<string[]>(
      "greppyDisabledPatterns",
      []
    );
    if (disabledPatterns.includes(pattern.name)) {
      console.log(
        `GrepService: Skipping disabled pattern "${pattern.name}" on file "${filePath}"`
      );
      return [];
    }

    // Extract the file extension
    const fileExtension = filePath.split(".").pop()?.toLowerCase() || "";

    // Check if this pattern is applicable to this file type
    if (!PatternManager.isPatternSupportedForFileType(pattern, fileExtension)) {
      // Skip this pattern for this file type
      return [];
    }

    console.log(
      `GrepService: Executing pattern "${pattern.name}" on file "${filePath}"`
    );

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
