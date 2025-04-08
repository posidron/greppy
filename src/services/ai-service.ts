import * as vscode from "vscode";
import { FindingResult } from "../models/types";

/**
 * Service for AI-powered explanations for security findings.
 */
export class AIService {
  /**
   * Get an AI-powered explanation for a security finding.
   *
   * @param finding The security finding to explain
   * @returns A promise that resolves to the explanation text, or undefined if not available
   */
  public async getExplanation(
    finding: FindingResult
  ): Promise<string | undefined> {
    try {
      // Select an appropriate model
      const models = await vscode.lm.selectChatModels({
        vendor: "copilot",
        family: "gpt-4o-mini", // Lighter model for quick explanations
      });

      if (models.length === 0) {
        console.log("No AI model available for explanation");
        return undefined;
      }

      const model = models[0];

      const prompt = [
        vscode.LanguageModelChatMessage
          .User(`You are a security expert. Explain this potential security issue:

        Issue type: ${finding.patternName}
        Description: ${finding.patternDescription}
        Code snippet: \`${finding.matchedContent}\`

        Provide a concise explanation of what the issue is, why it's a security concern, and a brief example of how it could be exploited. Keep your response brief (max 5 sentences).`),
      ];

      const response = await model.sendRequest(
        prompt,
        {},
        new vscode.CancellationTokenSource().token
      );
      let explanation = "";

      for await (const fragment of response.text) {
        explanation += fragment;
      }

      return explanation;
    } catch (error) {
      console.error("Error getting AI explanation:", error);
      return undefined;
    }
  }
}
