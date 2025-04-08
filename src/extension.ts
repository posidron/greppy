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

  // Initialize the view with empty results
  resultsProvider.update([], []);

  // Ensure that all components are properly initialized before beginning auto-scan
  let extensionReady = false;

  // Mark extension as ready after activation
  setTimeout(() => {
    extensionReady = true;
    console.log(
      "Greppy extension fully initialized and ready for auto-scanning"
    );

    // Set up auto-scan functionality for open files
    const autoScanEnabled = vscode.workspace
      .getConfiguration("greppy")
      .get<boolean>("enableAutoScan", true);

    if (autoScanEnabled) {
      console.log("Auto-scan enabled, setting up file watchers");

      // Scan all open files immediately
      vscode.workspace.textDocuments.forEach(scanSingleFile);
      console.log("Initial auto-scan of open files completed");

      // Set up watcher for newly opened files
      const textDocOpenListener = vscode.workspace.onDidOpenTextDocument(
        (document) => {
          // Get the current auto-scan setting (it might have changed)
          const isAutoScanEnabled = vscode.workspace
            .getConfiguration("greppy")
            .get<boolean>("enableAutoScan", true);

          // Check if this is a file opening as a result of clicking a result
          const isFromManualScan = resultsProvider.hasNonEmptyResults();

          if (isAutoScanEnabled && !isFromManualScan) {
            // Only auto-scan if this isn't from clicking a result in the results panel
            scanSingleFile(document);
          } else if (isFromManualScan) {
            // If we're opening a file from results view, just apply decorations
            // without rescanning or replacing the results
            const results = resultsProvider.getResults();
            decoratorService.updateFindings(results);
            console.log("Applied existing findings to newly opened document");
          }
        }
      );

      // Set up watcher for active editor changes (switching between tabs)
      const activeEditorListener = vscode.window.onDidChangeActiveTextEditor(
        (editor) => {
          if (editor) {
            // Get the current auto-scan setting
            const isAutoScanEnabled = vscode.workspace
              .getConfiguration("greppy")
              .get<boolean>("enableAutoScan", true);

            // Check if this is from a manual scan to avoid overriding results
            const isFromManualScan = resultsProvider.hasNonEmptyResults();

            if (isAutoScanEnabled && !isFromManualScan) {
              // Only auto-scan if this isn't from clicking a result in the results panel
              const document = editor.document;
              console.log(`Editor changed to: ${document.fileName}`);
              scanSingleFile(document);
            } else if (isFromManualScan) {
              // If we're navigating between files from results view, just apply decorations
              // without rescanning or replacing the results
              console.log(
                "Editor changed but manual scan results exist - preserving results"
              );
              const results = resultsProvider.getResults();
              decoratorService.updateFindings(results);
            }
          }
        }
      );

      // Listen for changes to the auto-scan setting
      const configListener = vscode.workspace.onDidChangeConfiguration(
        (event) => {
          if (event.affectsConfiguration("greppy.enableAutoScan")) {
            const newAutoScanEnabled = vscode.workspace
              .getConfiguration("greppy")
              .get<boolean>("enableAutoScan", true);
            console.log(`Auto-scan setting changed to: ${newAutoScanEnabled}`);
          }
        }
      );

      // Add listeners to subscriptions
      context.subscriptions.push(textDocOpenListener);
      context.subscriptions.push(activeEditorListener);
      context.subscriptions.push(configListener);
    }
  }, 1000); // Small delay to ensure everything is ready

  // Function to determine appropriate patterns for a file based on its extension
  const getPatternsForFile = (filePath: string): any[] => {
    // Use the new pattern manager method to get patterns for this file
    return PatternManager.getPatternsForFile(filePath);
  };

  // Function to scan a single file
  const scanSingleFile = async (document: vscode.TextDocument) => {
    try {
      // Skip scanning if the extension isn't fully initialized yet
      if (!extensionReady) {
        console.log(
          `Skipping scan of ${document.fileName} - extension not fully initialized yet`
        );
        return;
      }

      // Skip unsaved or non-file documents
      if (document.isUntitled || document.uri.scheme !== "file") {
        return;
      }

      // Get workspace folder for this file
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!workspaceFolder) {
        return; // Skip files not in a workspace
      }

      // Get patterns for this file
      const patternsToUse = getPatternsForFile(document.uri.fsPath);
      if (patternsToUse.length === 0) {
        return; // No patterns to use
      }

      console.log(
        `Auto-scanning file: ${document.fileName} with ${patternsToUse.length} patterns`
      );

      // Create a specialized wrapper around the grep service to target just this file
      const fileResults: any[] = [];

      // Approach 1: Run the entire analysis but filter to just this file
      try {
        const results = await grepService.runAnalysis(
          workspaceFolder,
          patternsToUse
        );

        // Get the absolute path in a normalized form for comparison
        const normalizedFilePath = document.uri.fsPath.replace(/\\/g, "/");

        // Use more flexible path matching
        const thisFileResults = results.filter((result) => {
          const resultPath = result.filePath.replace(/\\/g, "/");
          return (
            resultPath.endsWith(normalizedFilePath) ||
            normalizedFilePath.endsWith(resultPath) ||
            resultPath === normalizedFilePath
          );
        });

        fileResults.push(...thisFileResults);

        if (thisFileResults.length > 0) {
          console.log(
            `Found ${thisFileResults.length} issues in ${document.fileName} via workspace analysis`
          );
        }
      } catch (error) {
        console.error(`Error during whole-workspace analysis: ${error}`);
      }

      // Approach 2: Direct file scan (if available in your GrepService)
      // This is a fallback approach if the workspace scan doesn't yield results
      if (fileResults.length === 0) {
        console.log(
          `No results from workspace analysis for ${document.fileName}, trying direct file scan`
        );
        try {
          // Try to run ripgrep/weggli directly on the file
          for (const pattern of patternsToUse) {
            try {
              // The pattern file type compatibility is already checked by PatternManager.getPatternsForFile
              const fileSpecificResults =
                await grepService.executePatternOnPath(
                  pattern,
                  document.uri.fsPath
                );

              if (fileSpecificResults.length > 0) {
                console.log(
                  `Pattern '${pattern.name}' found ${fileSpecificResults.length} issues in ${document.fileName}`
                );
              }

              fileResults.push(...fileSpecificResults);
            } catch (error) {
              // Log but continue with other patterns - only log significant errors, not "no matches found"
              if (
                !(
                  error instanceof Error &&
                  (error.message.includes("No files to parse") ||
                    error.message.includes("exit code 1"))
                )
              ) {
                console.error(`Error with pattern ${pattern.name}: ${error}`);
              }
            }
          }

          if (fileResults.length > 0) {
            console.log(
              `Direct file scan found ${fileResults.length} total issues in ${document.fileName}`
            );
          }
        } catch (error) {
          console.error(`Error during direct file scan: ${error}`);
        }
      }

      if (fileResults.length > 0) {
        // Update the tree view and decorations
        console.log(
          `Applying ${fileResults.length} findings for ${document.fileName} to UI`
        );

        // First update the results provider
        await resultsProvider.update(fileResults, patternsToUse);
        console.log(
          "Updating results provider with",
          fileResults.length,
          "findings"
        );

        // Then apply decorations to all editors
        await decoratorService.updateFindings(fileResults);
        console.log("Applied decorations to all editors");

        // Show notification about findings (optional)
        console.log(
          `Auto-scan found ${fileResults.length} issues in ${document.fileName}`
        );
      } else {
        console.log(`No issues found in ${document.fileName}`);
      }
    } catch (error) {
      console.error(`Error during auto-scan of ${document.fileName}:`, error);
    }
  };

  // Function to scan all open files
  const scanAllOpenFiles = async () => {
    console.log("Scanning all open files...");
    const openFiles = vscode.workspace.textDocuments.filter(
      (doc) => !doc.isUntitled && doc.uri.scheme === "file"
    );

    if (openFiles.length === 0) {
      vscode.window.showInformationMessage("No open files to scan.");
      return;
    }

    // Show progress notification for the scan
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Auto-Scanning Open Files",
        cancellable: true,
      },
      async (progress, token) => {
        // Start with empty results
        let allResults: any[] = [];
        const allPatterns = PatternManager.getPatterns();

        // Check for tool availability first
        const toolCheck = await grepService.checkRequiredTools(allPatterns);
        if (
          (toolCheck.ripgrepNeeded && !toolCheck.ripgrepAvailable) ||
          (toolCheck.weggliNeeded && !toolCheck.weggliAvailable)
        ) {
          vscode.window.showWarningMessage(
            "Some required tools are not available. Results may be incomplete."
          );
        }

        // Process each file
        for (let i = 0; i < openFiles.length; i++) {
          const document = openFiles[i];

          try {
            progress.report({
              message: `Scanning ${i + 1}/${openFiles.length}: ${
                document.fileName
              }`,
              increment: 100 / openFiles.length,
            });

            if (token.isCancellationRequested) {
              break;
            }

            await scanSingleFile(document);
          } catch (error) {
            console.error(`Error scanning ${document.fileName}:`, error);
          }
        }

        // Show summary notification
        vscode.window.showInformationMessage(
          `Scan complete. Processed ${openFiles.length} open files.`
        );
      }
    );
  };

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

            // Check if required tools are available
            const toolCheck = await grepService.checkRequiredTools(patterns);

            // Show warnings if tools are needed but not available
            if (toolCheck.ripgrepNeeded && !toolCheck.ripgrepAvailable) {
              const response = await vscode.window.showWarningMessage(
                "Ripgrep (rg) is required for analysis but was not found. Please install or configure the correct path.",
                "Configure Path",
                "Install ripgrep"
              );

              if (response === "Configure Path") {
                vscode.commands.executeCommand(
                  "workbench.action.openSettings",
                  "greppy.ripgrepPath"
                );
                return [];
              } else if (response === "Install ripgrep") {
                vscode.env.openExternal(
                  vscode.Uri.parse(
                    "https://github.com/BurntSushi/ripgrep#installation"
                  )
                );
                return [];
              } else {
                return []; // User canceled
              }
            }

            if (toolCheck.weggliNeeded && !toolCheck.weggliAvailable) {
              const response = await vscode.window.showWarningMessage(
                "Weggli is required for analysis but was not found. Please install or configure the correct path.",
                "Configure Path",
                "Install weggli"
              );

              if (response === "Configure Path") {
                vscode.commands.executeCommand(
                  "workbench.action.openSettings",
                  "greppy.weggliPath"
                );
                return [];
              } else if (response === "Install weggli") {
                vscode.env.openExternal(
                  vscode.Uri.parse(
                    "https://github.com/weggli-rs/weggli#installation"
                  )
                );
                return [];
              } else {
                return []; // User canceled
              }
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
            await resultsProvider.update(results, patterns);
            await decoratorService.updateFindings(results);

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
      vscode.commands.executeCommand("workbench.action.openSettings", "greppy");
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
    async () => {
      await decoratorService.updateFindings([]);
      vscode.window.showInformationMessage("Greppy code indicators cleared");
    }
  );

  // Register a command to refresh the results tree view
  const refreshResultsTreeCommand = vscode.commands.registerCommand(
    "greppy.refreshResultsTree",
    async () => {
      await resultsProvider.refresh();
    }
  );

  // Set initial filter states
  updateFilterCheckboxes(true, true, true);

  // Register a command to add a pattern to a specific pattern set
  const addPatternToSetCommand = vscode.commands.registerCommand(
    "greppy.addPatternToSet",
    async () => {
      await PatternManager.addPatternToSet();
    }
  );

  // Register a command to manage ignored findings
  const manageIgnoredFindingsCommand = vscode.commands.registerCommand(
    "greppy.manageIgnoredFindings",
    () => {
      vscode.commands.executeCommand("greppy.manageIgnoredFindings");
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
  context.subscriptions.push(addPatternToSetCommand);
  context.subscriptions.push(manageIgnoredFindingsCommand);

  // Register command to auto-scan all open files
  const autoScanOpenFilesCommand = vscode.commands.registerCommand(
    "greppy.autoScanOpenFiles",
    async () => {
      await scanAllOpenFiles();
    }
  );
  context.subscriptions.push(autoScanOpenFilesCommand);

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
  vscode.window.showInformationMessage(
    "Greppy security analysis extension is now active! Use the shield icon in the activity bar to access security analysis features."
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}

/**
 * Updates the filter context variables for showing the appropriate filter button
 */
function updateFilterCheckboxes(
  showInfo: boolean,
  showWarning: boolean, // Controls both warning and medium severities
  showCritical: boolean
): void {
  // Count enabled filters
  const enabledCount = [showInfo, showWarning, showCritical].filter(
    Boolean
  ).length;
  // We have 4 severity levels (info, warning, medium, critical)
  // but only 3 toggles since medium shares the warning filter
  const totalFilters = 3;

  // Set filter display state
  const showAll = enabledCount === totalFilters;
  const showPartial = enabledCount > 0 && enabledCount < totalFilters;
  const showDefault = enabledCount === 0;

  vscode.commands.executeCommand("setContext", "greppy.showFilterAll", showAll);
  vscode.commands.executeCommand(
    "setContext",
    "greppy.showFilterPartial",
    showPartial
  );
  vscode.commands.executeCommand(
    "setContext",
    "greppy.showFilterDefault",
    showDefault
  );

  // Also update individual severity states for backward compatibility
  vscode.commands.executeCommand("setContext", "greppy.showInfo", showInfo);
  vscode.commands.executeCommand(
    "setContext",
    "greppy.showWarning",
    showWarning
  );
  vscode.commands.executeCommand(
    "setContext",
    "greppy.showCritical",
    showCritical
  );
}
