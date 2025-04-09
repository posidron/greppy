import * as vscode from "vscode";
import { PatternConfig } from "../models/types";
import { CPP_PATTERNS } from "./cpp-patterns";
import { GENERAL_PATTERNS } from "./general-patterns";
import { WEB_PATTERNS } from "./web-patterns";

// Define common file type sets that a user might want to use
// These are for convenience when adding custom patterns via UI
export const COMMON_FILE_TYPES = {
  general: ["*"], // For patterns that apply to all file types
  cpp: [
    "c",
    "cpp",
    "h",
    "hpp",
    "cc",
    "cxx",
    "c++",
    "hxx",
    "h++",
    "ixx", // C++20 modules interface
    "cppm", // C++20 modules implementation
    "cu", // CUDA files
    "inl", // Inline implementation files
    "tpp", // Template implementation files
    "txx", // Template implementation files (alternative extension)
    "mxx", // Module implementation files
  ],
  web: ["js", "ts", "jsx", "tsx", "html", "css", "php", "vue", "svelte"],
};

/**
 * Manages pattern sets and configurations for the Greppy extension.
 */
export class PatternManager {
  /**
   * Get all patterns based on current configuration.
   * Combines the active pattern set with user's custom patterns.
   */
  public static getPatterns(
    context?: vscode.ExtensionContext
  ): PatternConfig[] {
    // Get custom patterns from user settings
    const customPatterns = vscode.workspace
      .getConfiguration("greppy")
      .get<PatternConfig[]>("patterns", []);

    // Get active pattern set
    const activeSet = vscode.workspace
      .getConfiguration("greppy")
      .get<string>("activePatternSet", "general");

    // If user only wants custom patterns
    if (activeSet === "none") {
      return customPatterns;
    }

    // Get patterns from pattern sets
    let builtInPatterns: PatternConfig[] = [];

    // Try to get patterns from user-defined pattern sets first
    const patternSets = vscode.workspace
      .getConfiguration("greppy")
      .get<Record<string, PatternConfig[]>>("patternSets", {});

    // Get built-in pattern sets as base
    const defaultPatterns = PatternManager.getBuiltInPatternSet(activeSet);

    // Check if there's a user-defined set with the same name
    if (patternSets[activeSet] && Array.isArray(patternSets[activeSet])) {
      // Extension mode - user patterns extend the built-in set, don't replace
      const userPatterns = patternSets[activeSet];

      // Avoid duplicates by name when merging
      const existingNames = new Set(defaultPatterns.map((p) => p.name));
      const uniqueUserPatterns = userPatterns.filter(
        (p) => !existingNames.has(p.name)
      );

      builtInPatterns = [...defaultPatterns, ...uniqueUserPatterns];
    } else {
      builtInPatterns = defaultPatterns;
    }

    // Merge custom patterns with built-in patterns, making sure there are no duplicates by name
    const patternNames = new Set<string>(builtInPatterns.map((p) => p.name));
    const validCustomPatterns = customPatterns.filter(
      (p) => !patternNames.has(p.name)
    );

    let allPatterns = [...builtInPatterns, ...validCustomPatterns];

    // Filter out disabled patterns if context is provided
    if (context) {
      const disabledPatterns = context.workspaceState.get<string[]>(
        "greppyDisabledPatterns",
        []
      );
      if (disabledPatterns.length > 0) {
        allPatterns = allPatterns.filter(
          (pattern) => !disabledPatterns.includes(pattern.name)
        );
      }
    }

    return allPatterns;
  }

  /**
   * Get the built-in pattern set for a given set name
   * @param setName Name of the pattern set
   * @returns Array of patterns for the given set
   */
  private static getBuiltInPatternSet(setName: string): PatternConfig[] {
    let patterns: PatternConfig[] = [];

    switch (setName) {
      case "general":
        patterns = [...GENERAL_PATTERNS];
        break;
      case "cpp":
        patterns = [...GENERAL_PATTERNS, ...CPP_PATTERNS];
        break;
      case "web":
        patterns = [...GENERAL_PATTERNS, ...WEB_PATTERNS];
        break;
      default:
        patterns = [...GENERAL_PATTERNS];
        break;
    }

    // Each pattern should already have supportedFileTypes from its definition
    // No need to apply file type associations here
    return patterns;
  }

  /**
   * Determines if a pattern is applicable to a given file based on its extension
   * @param pattern The pattern to check
   * @param fileExtension The file extension to check against
   * @returns true if the pattern is applicable, false otherwise
   */
  public static isPatternSupportedForFileType(
    pattern: PatternConfig,
    fileExtension: string
  ): boolean {
    // If the pattern has explicitly defined supportedFileTypes, respect that completely
    if (pattern.supportedFileTypes && pattern.supportedFileTypes.length > 0) {
      // Wildcard means the pattern applies to all file types
      if (pattern.supportedFileTypes.includes("*")) {
        return true;
      }

      // Otherwise, only apply if the file extension is in the supportedFileTypes list
      return pattern.supportedFileTypes.includes(fileExtension);
    }

    // Special case: Weggli only works with C/C++ files (hard requirement)
    if (pattern.tool === "weggli") {
      return COMMON_FILE_TYPES.cpp.includes(fileExtension);
    }

    // For patterns without explicit supportedFileTypes, default to including them
    // This preserves backward compatibility with older patterns
    return true;
  }

  /**
   * Get patterns applicable for a specific file
   * @param filePath Path to the file
   * @param context Extension context for checking disabled patterns
   * @returns Array of patterns applicable to the file
   */
  public static getPatternsForFile(
    filePath: string,
    context?: vscode.ExtensionContext
  ): PatternConfig[] {
    // Get the file extension
    const fileExtension = filePath.split(".").pop()?.toLowerCase() || "";

    // Get all available patterns from the active pattern set
    const allPatterns = PatternManager.getPatterns(context);

    // Filter patterns to only those applicable to this file type
    const applicablePatterns = allPatterns.filter((pattern) =>
      PatternManager.isPatternSupportedForFileType(pattern, fileExtension)
    );

    console.log(
      `PatternManager: Found ${applicablePatterns.length} patterns applicable to "${filePath}" out of ${allPatterns.length} total patterns`
    );

    return applicablePatterns;
  }

  /**
   * Initialize default pattern sets in user settings if they don't exist yet.
   */
  public static initializeDefaultPatternSets(): void {
    const config = vscode.workspace.getConfiguration("greppy");
    const patternSets = config.get<Record<string, PatternConfig[]>>(
      "patternSets",
      {}
    );

    // If user hasn't defined any pattern sets yet, initialize with built-in defaults
    if (Object.keys(patternSets).length === 0) {
      patternSets["general"] = GENERAL_PATTERNS;
      patternSets["cpp"] = [...GENERAL_PATTERNS, ...CPP_PATTERNS];
      patternSets["web"] = [...GENERAL_PATTERNS, ...WEB_PATTERNS];

      config.update(
        "patternSets",
        patternSets,
        vscode.ConfigurationTarget.Global
      );
    }
  }

  /**
   * Prompt user to select a pattern set.
   */
  public static async selectPatternSet(): Promise<void> {
    const config = vscode.workspace.getConfiguration("greppy");
    const currentSet = config.get<string>("activePatternSet", "general");
    const patternSets = config.get<Record<string, PatternConfig[]>>(
      "patternSets",
      {}
    );

    // Create list of options
    const options = [
      {
        label: "General",
        description: "Basic security patterns for all codebases",
        id: "general",
      },
      {
        label: "C/C++",
        description: "Security patterns for C and C++ development",
        id: "cpp",
      },
      {
        label: "Web",
        description: "Security patterns for web applications",
        id: "web",
      },
      {
        label: "Custom Only",
        description: "Use only your custom patterns",
        id: "none",
      },
      ...Object.keys(patternSets)
        .filter((key) => !["general", "cpp", "web"].includes(key))
        .map((key) => ({
          label: key,
          description: `Custom pattern set (${patternSets[key].length} patterns)`,
          id: key,
        })),
    ];

    // Show quick pick
    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: "Select pattern set",
      title: "Greppy: Select Active Pattern Set",
    });

    if (selected) {
      await config.update(
        "activePatternSet",
        selected.id,
        vscode.ConfigurationTarget.Global
      );
      vscode.window.showInformationMessage(
        `Pattern set '${selected.label}' is now active.`
      );
    }
  }

  /**
   * Prompt user to add a pattern to a specific pattern set.
   */
  public static async addPatternToSet(): Promise<void> {
    const config = vscode.workspace.getConfiguration("greppy");
    const patternSets = config.get<Record<string, PatternConfig[]>>(
      "patternSets",
      {}
    );

    // Create list of options including built-in and custom pattern sets
    const options = [
      {
        label: "general",
        description: "Basic security patterns for all codebases",
        id: "general",
      },
      {
        label: "cpp",
        description: "Security patterns for C and C++ development",
        id: "cpp",
      },
      {
        label: "web",
        description: "Security patterns for web applications",
        id: "web",
      },
      ...Object.keys(patternSets)
        .filter((key) => !["general", "cpp", "web"].includes(key))
        .map((key) => ({
          label: key,
          description: `Custom pattern set (${patternSets[key].length} patterns)`,
          id: key,
        })),
    ];

    // First, let the user select which pattern set to add to
    const selectedSet = await vscode.window.showQuickPick(options, {
      placeHolder: "Select pattern set to add to",
      title: "Greppy: Add Pattern to Set",
    });

    if (!selectedSet) {
      return; // User cancelled
    }

    // Now gather pattern information
    const name = await vscode.window.showInputBox({
      title: "Pattern Name",
      prompt: "Enter a name for your pattern",
      placeHolder: "e.g., Memory Leak",
    });

    if (!name) {
      return; // User cancelled
    }

    const description = await vscode.window.showInputBox({
      title: "Pattern Description",
      prompt: "Enter a description for your pattern",
      placeHolder: "e.g., Detects potential memory leaks",
    });

    if (!description) {
      return; // User cancelled
    }

    const toolOptions = [
      { label: "ripgrep", description: "Regular expression based search" },
      { label: "weggli", description: "Semantic C/C++ code search" },
    ];

    const selectedTool = await vscode.window.showQuickPick(toolOptions, {
      placeHolder: "Select search tool",
      title: "Greppy: Select Tool",
    });

    if (!selectedTool) {
      return; // User cancelled
    }

    const pattern = await vscode.window.showInputBox({
      title: "Search Pattern",
      prompt: `Enter a ${selectedTool.label} search pattern`,
      placeHolder:
        selectedTool.label === "ripgrep"
          ? "e.g., (malloc|calloc)\\("
          : "e.g., { free($p); _($p); }",
    });

    if (!pattern) {
      return; // User cancelled
    }

    const severityOptions = [
      { label: "info", description: "Informational finding" },
      { label: "warning", description: "Potential issue" },
      { label: "critical", description: "Serious security concern" },
    ];

    const selectedSeverity = await vscode.window.showQuickPick(
      severityOptions,
      {
        placeHolder: "Select severity level",
        title: "Greppy: Select Severity",
      }
    );

    if (!selectedSeverity) {
      return; // User cancelled
    }

    // Ask user for supported file types
    const fileTypeOptions = [
      { label: "*", description: "All file types" },
      { label: "custom", description: "Specify custom file types" },
    ];

    if (selectedSet.id === "cpp") {
      fileTypeOptions.splice(1, 0, {
        label: "cpp",
        description: "C/C++ file types (.c, .cpp, .h, .hpp, etc.)",
      });
    } else if (selectedSet.id === "web") {
      fileTypeOptions.splice(1, 0, {
        label: "web",
        description: "Web file types (.js, .ts, .html, .css, etc.)",
      });
    }

    const selectedFileTypes = await vscode.window.showQuickPick(
      fileTypeOptions,
      {
        placeHolder: "Select supported file types",
        title: "Greppy: Select Supported File Types",
      }
    );

    if (!selectedFileTypes) {
      return; // User cancelled
    }

    let supportedFileTypes: string[] | undefined;

    if (selectedFileTypes.label === "*") {
      supportedFileTypes = ["*"];
    } else if (selectedFileTypes.label === "cpp") {
      supportedFileTypes = COMMON_FILE_TYPES.cpp;
    } else if (selectedFileTypes.label === "web") {
      supportedFileTypes = COMMON_FILE_TYPES.web;
    } else if (selectedFileTypes.label === "custom") {
      const customFileTypes = await vscode.window.showInputBox({
        title: "Custom File Types",
        prompt: "Enter comma-separated file extensions (without dots)",
        placeHolder: "e.g., js,ts,py",
      });

      if (!customFileTypes) {
        return; // User cancelled
      }

      supportedFileTypes = customFileTypes
        .split(",")
        .map((ext) => ext.trim().toLowerCase())
        .filter((ext) => ext.length > 0);
    }

    // Create the new pattern
    const newPattern: PatternConfig = {
      name,
      description,
      tool: selectedTool.label as "ripgrep" | "weggli",
      pattern,
      severity: selectedSeverity.label as "info" | "warning" | "critical",
    };

    // Add supported file types if specified
    if (supportedFileTypes) {
      newPattern.supportedFileTypes = supportedFileTypes;
    }

    // Get the current patterns for the selected set
    if (!patternSets[selectedSet.id]) {
      patternSets[selectedSet.id] = [];
    }

    // Add the new pattern
    patternSets[selectedSet.id].push(newPattern);

    // Save the updated pattern sets
    await config.update(
      "patternSets",
      patternSets,
      vscode.ConfigurationTarget.Global
    );

    vscode.window.showInformationMessage(
      `Pattern '${name}' added to the '${selectedSet.label}' pattern set.`
    );
  }
}
