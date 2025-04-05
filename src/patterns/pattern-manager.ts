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

    if (patternSets[activeSet] && Array.isArray(patternSets[activeSet])) {
      builtInPatterns = patternSets[activeSet];
    } else {
      // If not found in user-defined sets, use the built-in sets
      switch (activeSet) {
        case "general":
          builtInPatterns = GENERAL_PATTERNS;
          break;
        case "cpp":
          builtInPatterns = [...GENERAL_PATTERNS, ...CPP_PATTERNS];
          break;
        case "web":
          builtInPatterns = [...GENERAL_PATTERNS, ...WEB_PATTERNS];
          break;
        default:
          builtInPatterns = GENERAL_PATTERNS;
      }
    }

    // Merge custom patterns with built-in patterns, making sure there are no duplicates by name
    const patternNames = new Set<string>(builtInPatterns.map((p) => p.name));
    const validCustomPatterns = customPatterns.filter(
      (p) => !patternNames.has(p.name)
    );

    return [...builtInPatterns, ...validCustomPatterns];
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
      patternSets["cpp"] = CPP_PATTERNS;
      patternSets["web"] = WEB_PATTERNS;

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
}
