// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { DEFAULT_PATTERNS } from "./default-config";
import { PatternConfig } from "./models/types";
import { GrepService } from "./services/grep-service";
import { GrepResultsProvider } from "./views/results-provider";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("Greppy extension is now active");

  // Show a welcome notification
  showWelcomeNotification();

  // Initialize services
  const grepService = new GrepService(context);
  const resultsProvider = new GrepResultsProvider(context);

  // Register the tree data provider
  const treeView = vscode.window.createTreeView("greppyResults", {
    treeDataProvider: resultsProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Open the Greppy view container automatically
  setTimeout(() => {
    vscode.commands.executeCommand("workbench.view.extension.greppy-container");
  }, 1000);

  // Register commands - log their registration
  console.log("Registering greppy.runAnalysis command");

  const runAnalysisCommand = vscode.commands.registerCommand(
    "greppy.runAnalysis",
    async () => {
      console.log("greppy.runAnalysis command executed");

      // Get the current workspace folder
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(
          "Greppy requires an open workspace to run analysis."
        );
        return;
      }

      // If multiple workspace folders, let the user choose
      let workspaceFolder: vscode.WorkspaceFolder;

      if (workspaceFolders.length === 1) {
        workspaceFolder = workspaceFolders[0];
      } else {
        const selected = await vscode.window.showWorkspaceFolderPick({
          placeHolder: "Select a workspace folder to analyze",
        });

        if (!selected) {
          return; // User cancelled
        }

        workspaceFolder = selected;
      }

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Running security analysis...",
          cancellable: true,
        },
        async (progress, token) => {
          try {
            // Get patterns from settings
            let patterns = vscode.workspace
              .getConfiguration("greppy")
              .get<PatternConfig[]>("patterns", []);

            // If no patterns are configured, use default patterns
            if (patterns.length === 0) {
              patterns = DEFAULT_PATTERNS;
              // Inform the user that default patterns are being used
              vscode.window
                .showInformationMessage(
                  "No patterns configured. Using default patterns. Configure custom patterns in settings.",
                  "Open Settings"
                )
                .then((selection) => {
                  if (selection === "Open Settings") {
                    vscode.commands.executeCommand(
                      "workbench.action.openSettings",
                      "greppy.patterns"
                    );
                  }
                });
            }

            // Run the analysis with the provided patterns
            const results = await grepService.runAnalysis(
              workspaceFolder,
              patterns
            );

            // Update the tree view
            resultsProvider.update(results, patterns);

            // Show a summary notification
            vscode.window.showInformationMessage(
              `Analysis complete. Found ${results.length} results.`
            );

            // Focus the tree view
            if (treeView.visible) {
              // Only try to reveal if the tree view is visible
              // This will also focus the view
              vscode.commands.executeCommand("greppyResults.focus");
            } else {
              // If the view isn't visible, show the Greppy view container
              vscode.commands.executeCommand(
                "workbench.view.extension.greppy-container"
              );
            }

            return results;
          } catch (error) {
            console.error("Error running analysis:", error);
            vscode.window.showErrorMessage(`Error running analysis: ${error}`);
            return [];
          }
        }
      );
    }
  );

  console.log("Registering greppy.refreshResults command");

  const refreshResultsCommand = vscode.commands.registerCommand(
    "greppy.refreshResults",
    async () => {
      console.log("greppy.refreshResults command executed");
      // Simply re-run the analysis
      await vscode.commands.executeCommand("greppy.runAnalysis");
    }
  );

  const showWelcomeCommand = vscode.commands.registerCommand(
    "greppy.showWelcome",
    () => {
      showWelcomeNotification();
    }
  );

  // Register the commands
  context.subscriptions.push(runAnalysisCommand);
  context.subscriptions.push(refreshResultsCommand);
  context.subscriptions.push(showWelcomeCommand);

  // Create an initial status bar item as another way to access the extension
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = "$(shield) Greppy";
  statusBarItem.tooltip = "Run Greppy Security Analysis";
  statusBarItem.command = "greppy.runAnalysis";
  statusBarItem.show();

  context.subscriptions.push(statusBarItem);

  console.log("Greppy extension fully activated with all commands and views");
}

function showWelcomeNotification() {
  vscode.window
    .showInformationMessage(
      "Greppy security analysis extension is now active! Run security analysis on your code.",
      "Run Analysis",
      "Open Panel"
    )
    .then((selection) => {
      if (selection === "Run Analysis") {
        vscode.commands.executeCommand("greppy.runAnalysis");
      } else if (selection === "Open Panel") {
        vscode.commands.executeCommand(
          "workbench.view.extension.greppy-container"
        );
      }
    });
}

// This method is called when your extension is deactivated
export function deactivate() {}
