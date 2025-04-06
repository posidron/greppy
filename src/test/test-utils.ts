import * as sinon from "sinon";
import * as vscode from "vscode";
import { FindingResult } from "../models/types";
import { IdService } from "../services/id-service";

// Create a shared sandbox for all tests
export const sandbox = sinon.createSandbox();

// Track registered commands across all test files to prevent duplicates
const registeredCommands = new Set<string>();

// Initialize mocks that can be reused across test files
export function initializeTestEnvironment() {
  // Reset the sandbox before initializing
  sandbox.restore();

  // Clear registered commands
  registeredCommands.clear();

  // Mock IdService to prevent file system access
  sandbox.stub(IdService, "enhanceFinding").callsFake(async (finding) => {
    // Simply add a persistentId and return the finding
    return {
      ...finding,
      persistentId: "mock-persistent-id-" + finding.id,
      contextContent: "mock context content",
    };
  });

  // Stub the matching function to always return undefined (no match)
  sandbox.stub(IdService, "findMatchingIgnoredFinding").returns(undefined);

  return { sandbox };
}

// Create a FS mock to make decoratorService work without file operations
export class MockFileSystem {
  private static instance: MockFileSystem;
  private files: Map<string, string> = new Map();

  private constructor() {}

  public static getInstance(): MockFileSystem {
    if (!MockFileSystem.instance) {
      MockFileSystem.instance = new MockFileSystem();
    }
    return MockFileSystem.instance;
  }

  public existsSync(path: string): boolean {
    return this.files.has(path);
  }

  public readFileSync(path: string, encoding: string): string {
    return this.files.get(path) || "[]";
  }

  public writeFileSync(path: string, data: string): void {
    this.files.set(path, data);
  }

  public mkdirSync(path: { recursive: boolean }): void {
    // Do nothing, just mock the function
  }
}

// Mock VS Code objects without trying to replace VS Code directly
export class MockVSCode {
  // Static utilities
  public static createMockContext(): vscode.ExtensionContext {
    return {
      globalState: {
        get: sandbox.stub().returns([]),
        update: sandbox.stub().resolves(),
        setKeysForSync: sandbox.stub(),
      },
      workspaceState: {
        get: sandbox.stub(),
        update: sandbox.stub().resolves(),
        setKeysForSync: sandbox.stub(),
      },
      extensionPath: "/mock/extension/path",
      extensionUri: { fsPath: "/mock/extension/path" } as vscode.Uri,
      asAbsolutePath: (relativePath: string) =>
        `/mock/extension/path/${relativePath}`,
      storagePath: "/mock/storage/path",
      storageUri: { fsPath: "/mock/storage/path" } as vscode.Uri,
      globalStoragePath: "/mock/global/storage/path",
      globalStorageUri: { fsPath: "/mock/global/storage/path" } as vscode.Uri,
      logPath: "/mock/log/path",
      logUri: { fsPath: "/mock/log/path" } as vscode.Uri,
      subscriptions: [],
      extensionMode: vscode.ExtensionMode.Development,
      environmentVariableCollection: {} as vscode.EnvironmentVariableCollection,
      secrets: {} as vscode.SecretStorage,
      extension: {} as vscode.Extension<any>,
      languageModelAccessInformation:
        {} as vscode.LanguageModelAccessInformation,
    } as unknown as vscode.ExtensionContext;
  }

  // Create mock objects, but don't try to override the VS Code object directly
  public commands = {
    registerCommand: sandbox
      .stub()
      .callsFake((commandId: string, handler: any) => {
        // Don't register commands that are already registered in our test
        if (registeredCommands.has(commandId)) {
          console.log(`Command ${commandId} already registered, skipping`);
          return { dispose: () => {} };
        }

        // Track registered commands
        registeredCommands.add(commandId);
        return {
          dispose: () => {
            registeredCommands.delete(commandId);
          },
        };
      }),
    executeCommand: sandbox.stub().resolves(),
  };

  public workspace = {
    getConfiguration: () => ({
      get: (key: string, defaultValue: any) => {
        if (key === "showInfo") {
          return true;
        }
        if (key === "showWarning") {
          return true;
        }
        if (key === "showCritical") {
          return true;
        }
        return defaultValue;
      },
      update: sandbox.stub().resolves(),
    }),
    workspaceFolders: [
      { uri: { fsPath: "/test/workspace" }, name: "test", index: 0 },
    ],
    getWorkspaceFolder: sandbox.stub().returns({
      uri: { fsPath: "/test/workspace" },
      name: "test",
      index: 0,
    }),
    onDidChangeTextDocument: sandbox.stub().returns({ dispose: () => {} }),
    createFileSystemWatcher: sandbox.stub().returns({
      onDidChange: sandbox.stub().returns({ dispose: () => {} }),
      onDidCreate: sandbox.stub().returns({ dispose: () => {} }),
      onDidDelete: sandbox.stub().returns({ dispose: () => {} }),
      dispose: () => {},
    }),
  };

  public window = {
    createTextEditorDecorationType: sandbox.stub().returns({
      dispose: () => {},
      key: "mockDecoration",
    }),
    onDidChangeActiveTextEditor: sandbox.stub().returns({ dispose: () => {} }),
    activeTextEditor: {
      document: {
        uri: { fsPath: "/path/to/file.c" },
        lineAt: sandbox
          .stub()
          .returns({ text: "int main() { int a = b + c; }" }),
        lineCount: 10,
      },
      setDecorations: sandbox.stub(),
    },
    showInformationMessage: sandbox.stub().resolves(),
    showErrorMessage: sandbox.stub().resolves(),
    showWarningMessage: sandbox.stub().resolves(),
    createOutputChannel: sandbox.stub().returns({
      appendLine: sandbox.stub(),
      append: sandbox.stub(),
      show: sandbox.stub(),
      dispose: () => {},
    }),
    showQuickPick: sandbox.stub().resolves(),
    createTreeView: sandbox.stub().returns({
      onDidChangeVisibility: sandbox.stub().returns({ dispose: () => {} }),
      visible: true,
      dispose: () => {},
    }),
  };

  public languages = {
    registerHoverProvider: sandbox.stub().returns({ dispose: () => {} }),
  };

  public Uri = {
    parse: sandbox.stub().returns({ toString: () => "mock-uri" }),
    file: (path: string) => ({ fsPath: path, scheme: "file" }),
  };

  public ThemeColor = class MockThemeColor {
    constructor(id: string) {
      return { id };
    }
  };

  public Hover = class MockHover {
    constructor(contents: any, range?: vscode.Range) {
      return { contents, range };
    }
  };

  public Range = class MockRange {
    constructor(public start: vscode.Position, public end: vscode.Position) {}
  };

  public Position = class MockPosition {
    constructor(public line: number, public character: number) {}
  };

  public MarkdownString = class MockMarkdownString {
    constructor(public value?: string, public supportThemeIcons?: boolean) {}

    isTrusted = false;
    appendMarkdown(text: string): any {
      return this;
    }
  };

  public TreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  };

  // Instead of trying to modify vscode directly, this function sets up mocks
  // that can be passed to services to replace their calls to vscode APIs
  public override() {
    // Return no-op restore function
    return () => {};
  }

  // Reset registered commands
  public resetRegisteredCommands() {
    registeredCommands.clear();
  }
}

// Sample findings for testing
export const createMockFinding = (
  id: string,
  filePath: string,
  lineNumber: number
): FindingResult => {
  return {
    id,
    patternName: "Test Pattern",
    patternDescription: "Test description",
    tool: "ripgrep",
    severity: "warning",
    filePath,
    lineNumber,
    matchedContent: "Test matched content",
    codeIndicator: "c",
    timestamp: Date.now(),
  };
};
