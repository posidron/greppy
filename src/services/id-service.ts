import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { FindingResult, IgnoredFinding } from "../models/types";

/**
 * Service for managing persistent IDs for findings.
 *
 * This service implements:
 * 1. Content-based hashing for persistent IDs
 * 2. Fingerprinting to improve resilience to code changes
 * 3. Mapping system to match findings across runs
 */
export class IdService {
  private static readonly CONTEXT_LINES = 3; // Number of lines before and after to include in context

  /**
   * Generate a persistent ID for a finding based on its content.
   *
   * @param finding The finding to generate an ID for
   * @returns The persistent ID
   */
  public static generatePersistentId(finding: FindingResult): string {
    // Create a string that combines the key identifying factors of the finding
    // We include:
    // 1. Pattern name (the rule that was matched)
    // 2. Relative file path within the workspace
    // 3. Line content (actual code that matched)

    // Get relative path to make IDs workspace-independent
    const relativePath = this.getRelativeFilePath(finding.filePath);

    // Combine all factors into a single string for hashing
    const idString = `${finding.patternName}:${relativePath}:${finding.matchedContent}`;

    // Generate a hash of this string
    return crypto
      .createHash("sha256")
      .update(idString)
      .digest("hex")
      .substring(0, 24);
  }

  /**
   * Enhance a finding with context and persistent ID.
   *
   * @param finding The finding to enhance
   * @returns Promise resolving to the enhanced finding
   */
  public static async enhanceFinding(
    finding: FindingResult
  ): Promise<FindingResult> {
    // 1. Add context content if possible
    const enhancedFinding = { ...finding };

    try {
      const context = await this.getContextContent(
        finding.filePath,
        finding.lineNumber,
        this.CONTEXT_LINES
      );

      if (context) {
        enhancedFinding.contextContent = context.content;
        enhancedFinding.contextStart = context.startLine;
        enhancedFinding.contextEnd = context.endLine;
      }
    } catch (error) {
      console.error(`Error getting context for finding: ${error}`);
      // Continue even if context cannot be retrieved
    }

    // 2. Generate a persistent ID
    enhancedFinding.persistentId = this.generatePersistentId(enhancedFinding);

    return enhancedFinding;
  }

  /**
   * Get content surrounding a line for fingerprinting.
   *
   * @param filePath Path to the file
   * @param lineNumber Line number (1-based)
   * @param contextLines Number of lines before and after to include
   * @returns Context content and line range
   */
  private static async getContextContent(
    filePath: string,
    lineNumber: number,
    contextLines: number
  ): Promise<
    { content: string; startLine: number; endLine: number } | undefined
  > {
    try {
      // Read the file
      const fileContent = await fs.promises.readFile(filePath, "utf8");
      const lines = fileContent.split("\n");

      // Calculate start and end lines
      const startLine = Math.max(1, lineNumber - contextLines);
      const endLine = Math.min(lines.length, lineNumber + contextLines);

      // Extract the context lines
      const contextContent = lines.slice(startLine - 1, endLine).join("\n");

      return {
        content: contextContent,
        startLine,
        endLine,
      };
    } catch (error) {
      console.error(`Error reading file for context: ${error}`);
      return undefined;
    }
  }

  /**
   * Match a finding to potential ignored findings based on similarity.
   *
   * @param finding The current finding to check
   * @param ignoredFindings List of ignored findings
   * @returns The matching ignored finding ID if found, or undefined
   */
  public static findMatchingIgnoredFinding(
    finding: FindingResult,
    ignoredFindings: IgnoredFinding[]
  ): string | undefined {
    // First, check for exact persistent ID match
    if (finding.persistentId) {
      const exactMatch = ignoredFindings.find(
        (ignored) => ignored.persistentId === finding.persistentId
      );

      if (exactMatch) {
        return exactMatch.id;
      }
    }

    // If no exact match, try fuzzy matching based on:
    // 1. Same pattern name
    // 2. Same or similar file path
    // 3. Similar line content
    // 4. Line number within a reasonable range

    const relativePath = this.getRelativeFilePath(finding.filePath);

    const similarFindings = ignoredFindings.filter((ignored) => {
      // Must be the same pattern
      if (ignored.patternName !== finding.patternName) {
        return false;
      }

      // Check if it's the same file or a file with similar path
      const ignoredRelativePath = this.getRelativeFilePath(ignored.filePath);
      if (ignoredRelativePath !== relativePath) {
        // Allow for moved files where the filename is the same
        if (!ignoredRelativePath.endsWith("/" + path.basename(relativePath))) {
          return false;
        }
      }

      // Line number should be within a reasonable range (±15 lines)
      if (Math.abs(ignored.lineNumber - finding.lineNumber) > 15) {
        return false;
      }

      // Content should be somewhat similar
      const similarity = this.calculateStringSimilarity(
        ignored.matchedContent,
        finding.matchedContent
      );

      return similarity > 0.7; // 70% similarity threshold
    });

    // Return the most similar match if any
    if (similarFindings.length > 0) {
      return similarFindings[0].id;
    }

    return undefined;
  }

  /**
   * Get relative path to make IDs workspace-independent.
   *
   * @param filePath Absolute file path
   * @returns Relative path within workspace
   */
  private static getRelativeFilePath(filePath: string): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(filePath)
    );
    if (workspaceFolder) {
      return filePath.substring(workspaceFolder.uri.fsPath.length);
    }
    return filePath;
  }

  /**
   * Calculate similarity between two strings (0-1).
   *
   * @param str1 First string
   * @param str2 Second string
   * @returns Similarity score between 0 and 1
   */
  private static calculateStringSimilarity(str1: string, str2: string): number {
    // Simple implementation of Levenshtein distance
    const m = str1.length;
    const n = str2.length;

    // If either string is empty, similarity is 0
    if (m === 0 || n === 0) {
      return 0;
    }

    // Initialize matrix
    const d: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    // Set the first row and column
    for (let i = 0; i <= m; i++) {
      d[i][0] = i;
    }

    for (let j = 0; j <= n; j++) {
      d[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1, // deletion
          d[i][j - 1] + 1, // insertion
          d[i - 1][j - 1] + cost // substitution
        );
      }
    }

    // Calculate similarity as 1 - normalized distance
    const maxLength = Math.max(m, n);
    return 1 - d[m][n] / maxLength;
  }
}
