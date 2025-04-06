import * as vscode from "vscode";
import { PatternConfig } from "../models/types";
import { CPP_PATTERNS } from "./cpp-patterns";
import { GENERAL_PATTERNS } from "./general-patterns";
import { WEB_PATTERNS } from "./web-patterns";

/**
 * Manages pattern sets and configurations for the Greppy extension.
 */
export class PatternManager {
  /**
   * Get all patterns based on current configuration.
   * Combines the active pattern set with user's custom patterns.
   */
  public static getPatterns(): PatternConfig[] {
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

    return [...builtInPatterns, ...validCustomPatterns];
  }

  /**
   * Get the built-in pattern set for a given set name
   * @param setName Name of the pattern set
   * @returns Array of patterns for the given set
   */
  private static getBuiltInPatternSet(setName: string): PatternConfig[] {
    switch (setName) {
      case "general":
        return GENERAL_PATTERNS;
      case "cpp":
        return [...GENERAL_PATTERNS, ...CPP_PATTERNS];
      case "web":
        return [...GENERAL_PATTERNS, ...WEB_PATTERNS];
      default:
        return GENERAL_PATTERNS;
    }
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
      patternSets["general"] = [];
      patternSets["cpp"] = [];
      patternSets["web"] = [];

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

    // Create the new pattern
    const newPattern: PatternConfig = {
      name,
      description,
      tool: selectedTool.label as "ripgrep" | "weggli",
      pattern,
      severity: selectedSeverity.label as "info" | "warning" | "critical",
    };

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
