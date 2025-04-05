// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { PatternManager } from "./patterns/pattern-manager";
import { DecoratorService } from "./services/decorator-service";
import { GrepService } from "./services/grep-service";
import { GrepResultsProvider } from "./views/results-provider";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("Greppy extension is now active");

  // Initialize pattern sets
  PatternManager.initializeDefaultPatternSets();

  // Initialize services
  const grepService = new GrepService(context);
  const decoratorService = new DecoratorService(context);
  const resultsProvider = new GrepResultsProvider(context, decoratorService);

  // Register the tree data provider
  const treeView = vscode.window.createTreeView("greppyResults", {
    treeDataProvider: resultsProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Initialize the view with empty results to show welcome screen
  resultsProvider.update([], []);

  // Open the Greppy view container automatically
  setTimeout(() => {
    vscode.commands.executeCommand("workbench.view.extension.greppy-container");
  }, 1000);

  // Show a welcome notification
  showWelcomeNotification();

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
            // Get patterns from pattern manager
            const patterns = PatternManager.getPatterns();

            // If no patterns, show a message
            if (patterns.length === 0) {
              vscode.window
                .showInformationMessage(
                  "No patterns configured. Please add patterns or select a pattern set.",
                  "Edit Patterns",
                  "Select Pattern Set"
                )
                .then((selection) => {
                  if (selection === "Edit Patterns") {
                    vscode.commands.executeCommand("greppy.editPatterns");
                  } else if (selection === "Select Pattern Set") {
                    vscode.commands.executeCommand("greppy.selectPatternSet");
                  }
                });
              return [];
            }

            // Show which pattern set is being used
            const activeSet = vscode.workspace
              .getConfiguration("greppy")
              .get<string>("activePatternSet", "general");
            vscode.window.showInformationMessage(
              `Running analysis with the "${activeSet}" pattern set.`
            );

            // Run the analysis with the patterns
            const results = await grepService.runAnalysis(
              workspaceFolder,
              patterns
            );

            // Update the tree view and decorations with the same set of results
            // The decorator service will filter out ignored findings internally
            resultsProvider.update(results, patterns);
            decoratorService.updateFindings(results);

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

  const editPatternsCommand = vscode.commands.registerCommand(
    "greppy.editPatterns",
    () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "greppy.patterns"
      );
    }
  );

  const selectPatternSetCommand = vscode.commands.registerCommand(
    "greppy.selectPatternSet",
    async () => {
      await PatternManager.selectPatternSet();
    }
  );

  // Register a command to clear code decorations
  const clearDecorationsCommand = vscode.commands.registerCommand(
    "greppy.clearDecorations",
    () => {
      decoratorService.updateFindings([]);
      vscode.window.showInformationMessage("Greppy code indicators cleared");
    }
  );

  // Register a command to refresh the results tree view
  const refreshResultsTreeCommand = vscode.commands.registerCommand(
    "greppy.refreshResultsTree",
    () => {
      // Cause the tree view to refresh
      resultsProvider.refresh();
    }
  );

  // Register the commands
  context.subscriptions.push(runAnalysisCommand);
  context.subscriptions.push(refreshResultsCommand);
  context.subscriptions.push(showWelcomeCommand);
  context.subscriptions.push(editPatternsCommand);
  context.subscriptions.push(selectPatternSetCommand);
  context.subscriptions.push(clearDecorationsCommand);
  context.subscriptions.push(refreshResultsTreeCommand);

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
      "Open Panel",
      "Edit Patterns",
      "Select Pattern Set"
    )
    .then((selection) => {
      if (selection === "Run Analysis") {
        vscode.commands.executeCommand("greppy.runAnalysis");
      } else if (selection === "Open Panel") {
        vscode.commands.executeCommand(
          "workbench.view.extension.greppy-container"
        );
      } else if (selection === "Edit Patterns") {
        vscode.commands.executeCommand("greppy.editPatterns");
      } else if (selection === "Select Pattern Set") {
        vscode.commands.executeCommand("greppy.selectPatternSet");
      }
    });
}

// This method is called when your extension is deactivated
export function deactivate() {}
