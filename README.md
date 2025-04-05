
<div align="center">
  <img src="/images/logo-alpha.png" alt="Greppy Logo" width="412px" height="412px">
</div>

Greppy is a continuous static analysis tool for Visual Studio Code with a focus on security. It enables you to define and run security-focused search patterns across your codebase using either ripgrep or weggli.

- [Features](#features)
- [Requirements](#requirements)
- [Extension Settings](#extension-settings)
  - [Pattern Configuration](#pattern-configuration)
- [Example Patterns](#example-patterns)
  - [Ripgrep Patterns](#ripgrep-patterns)
  - [Weggli Patterns](#weggli-patterns)
- [Usage](#usage)
- [Extension Development](#extension-development)
  - [Building and Packaging](#building-and-packaging)
  - [Running Tests](#running-tests)
  - [Installing the Extension](#installing-the-extension)
    - [From VSIX File](#from-vsix-file)
    - [For Development](#for-development)
  - [Troubleshooting](#troubleshooting)


## Features

- Define custom search patterns using ripgrep or weggli
- Organize findings by pattern with severity levels
- Click on findings to navigate directly to the corresponding code
- Automatic analysis of your workspace
- Support for C, C++, and any other language that can be analyzed with text patterns

## Requirements

- ripgrep (`rg`) must be installed for ripgrep patterns
- weggli must be installed for weggli patterns (optional)

You can install these tools using:

```bash
# For ripgrep
# macOS
brew install ripgrep

# Ubuntu/Debian
apt-get install ripgrep

# For weggli
cargo install weggli
```

## Extension Settings

This extension contributes the following settings:

* `greppy.patterns`: Array of pattern configurations to run against your codebase
* `greppy.ripgrepPath`: Path to the ripgrep executable (default: "rg")
* `greppy.weggliPath`: Path to the weggli executable (default: "weggli")

### Pattern Configuration

Each pattern in the `greppy.patterns` array should have the following structure:

```json
{
  "name": "Vulnerable Memcpy Usage",
  "description": "Detects potentially vulnerable memcpy calls",
  "tool": "weggli",
  "pattern": "{ _ $buf[_]; memcpy($buf,_,_); }",
  "options": ["-X"],
  "severity": "critical"
}
```

Available fields:

- `name`: Pattern name (displayed in results)
- `description`: Description of what the pattern checks for
- `tool`: Either "ripgrep" or "weggli"
- `pattern`: The search pattern for the specified tool
- `options`: (Optional) Array of command-line options to pass to the tool
- `severity`: Severity level - "info", "warning", or "critical"

## Example Patterns

### Ripgrep Patterns

```json
{
  "name": "Hard-coded Credentials",
  "description": "Finds hard-coded passwords and API keys",
  "tool": "ripgrep",
  "pattern": "(password|api.?key)\\s*=\\s*['\"](\\w|[[:punct:]]){5,}['\"]",
  "severity": "critical"
}
```

```json
{
  "name": "SQL Injection Risk",
  "description": "Detects potential SQL injection vulnerabilities",
  "tool": "ripgrep",
  "pattern": "execute\\(.*\\$.*\\)",
  "severity": "warning"
}
```

### Weggli Patterns

```json
{
  "name": "Vulnerable Buffer Operations",
  "description": "Finds stack buffer operations with potential overflow",
  "tool": "weggli",
  "pattern": "{ _ $buf[_]; $func($buf,_); }",
  "options": [],
  "severity": "critical"
}
```

```json
{
  "name": "Missing NULL Check",
  "description": "Finds pointer dereferences without NULL checks",
  "tool": "weggli",
  "pattern": "{ _* $p; not: if ($p == NULL) _; not: if ($p != NULL) _; *$p; }",
  "severity": "warning"
}
```

## Usage

1. Configure your patterns in VS Code settings
2. Open the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on macOS)
3. Run the "Greppy: Run Security Analysis" command
4. View results in the Greppy Results panel in the Explorer sidebar
5. Click on findings to navigate to the corresponding code

## Extension Development

### Building and Packaging

1. Clone this repository
   ```bash
   git clone https://github.com/your-username/greppy.git
   cd greppy
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Build the extension
   ```bash
   npm run package
   ```

4. Create a VSIX package
   ```bash
   # Install the vsce packaging tool if you don't have it
   npm install -g @vscode/vsce

   # Create the package
   vsce package
   ```
   This will generate a `greppy-0.0.1.vsix` file (or similar, depending on the version).

### Running Tests

Greppy has a comprehensive test suite to ensure the extension functions correctly. The tests cover the core functionality, such as filtering findings, the tree view display, and the decoration service.

1. Install test dependencies
   ```bash
   npm install
   ```

2. Compile the tests
   ```bash
   npm run compile-tests
   ```

3. Run the tests
   ```bash
   npm test
   ```

4. For development, you can watch for changes and automatically recompile tests
   ```bash
   npm run watch-tests
   ```

The test suite includes:
- Unit tests for the `DecoratorService` that verify finding filtering and ignore functionality
- Unit tests for the `GrepResultsProvider` that validate the tree view generation
- Integration tests that ensure the components work together correctly

If you're adding new features, please make sure to add corresponding tests to maintain code quality.

### Installing the Extension

#### From VSIX File
1. Open VS Code
2. Go to the Extensions view (Ctrl+Shift+X or Cmd+Shift+X on macOS)
3. Click on the "..." menu in the top right of the Extensions view
4. Select "Install from VSIX..."
5. Navigate to and select the `greppy-0.0.1.vsix` file

#### For Development
1. Open the project in VS Code
2. Press F5 to open a new window with the extension loaded
3. Run "Greppy: Run Security Analysis" to test the extension

### Troubleshooting

If you encounter an error like "Extension 'Mantiqo.greppy' not found":
1. Make sure you've correctly built and installed the extension as described above
2. Check that the `publisher` field in `package.json` matches the publisher name used in the error message
3. Try reloading VS Code after installation


